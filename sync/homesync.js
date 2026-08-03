/* HomeStock cross-device sync layer (lazy-loaded).
 *
 * This whole file stays DORMANT until the app has a Supabase URL + anon key AND
 * a linked cloud identity. app.js only loads it in that case. It attaches a
 * single `HomeSync` object to the global scope and is also `require()`-able from
 * Node (for the pure-logic unit tests), so it must not touch `document`,
 * `window`-only APIs, IndexedDB, etc. at load time.
 *
 * Modules (UI never calls the backend directly — it goes through SyncManager):
 *   - SyncQueue        offline-persisted, coalescing FIFO mutation queue
 *   - ConflictResolver pure merge/last-write/dedup/quantity logic (testable)
 *   - Migration        pure local→cloud upload planner (idempotent)
 *   - DeviceLink       crypto-random link tokens + link URL helpers
 *   - CloudRepository  thin PostgREST + GoTrue (anonymous auth) fetch client
 *   - SyncManager      event-driven orchestration (no continuous polling)
 */
(function (global) {
  'use strict';

  // ------------------------------------------------------------------ utils --
  function nowIso() {
    return new Date().toISOString();
  }

  function getCrypto() {
    if (global.crypto && global.crypto.getRandomValues) return global.crypto;
    try {
      // Node < 20 exposes webcrypto under require('crypto').
      // eslint-disable-next-line global-require
      var nodeCrypto = require('crypto');
      if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.getRandomValues) {
        return nodeCrypto.webcrypto;
      }
    } catch (e) {
      /* not Node */
    }
    return null;
  }

  function bytesToB64Url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var b64;
    if (typeof global.btoa === 'function') b64 = global.btoa(bin);
    else b64 = Buffer.from(bytes).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // ---------------------------------------------------------- configuration --
  // Pure predicate — used everywhere to keep sync dormant when unconfigured.
  function isConfigured(cfg) {
    return !!(cfg && cfg.url && cfg.anonKey);
  }

  // --------------------------------------------------------------- identity --
  // Identity is ALWAYS the backend user UUID, never the display name. Two local
  // profiles with the same name but different cloudUserId are different people.
  function isSameIdentity(a, b) {
    if (!a || !b) return false;
    if (!a.cloudUserId || !b.cloudUserId) return false;
    return a.cloudUserId === b.cloudUserId;
  }

  // ------------------------------------------------------------- SyncQueue ---
  // storage: any { getItem(k), setItem(k,v) } (localStorage or a stub).
  // Ops: { table, opType:'upsert'|'delete', recordId, payload, ts, seq }.
  function SyncQueue(storage, key) {
    this.storage = storage;
    this.key = key || 'pantry.sync.queue';
    this._seqCounter = 0;
    this.items = this._load();
    // Restore the seq high-water mark so ordering survives reloads.
    for (var i = 0; i < this.items.length; i++) {
      if (this.items[i].seq >= this._seqCounter) {
        this._seqCounter = this.items[i].seq + 1;
      }
    }
  }
  SyncQueue.prototype._load = function () {
    try {
      var raw = this.storage.getItem(this.key);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  };
  SyncQueue.prototype._save = function () {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.items));
    } catch (e) {
      /* storage full / unavailable — keep in-memory copy */
    }
  };
  // Enqueue a mutation. Consecutive changes to the SAME (table, recordId) are
  // coalesced so we only ever ship the latest state of a record (a delete
  // supersedes any pending upsert). This keeps the queue O(distinct records).
  SyncQueue.prototype.enqueue = function (op) {
    if (!op || !op.table || !op.recordId) return null;
    op.opType = op.opType || 'upsert';
    op.ts = op.ts || Date.now();
    var idx = -1;
    for (var i = 0; i < this.items.length; i++) {
      if (
        this.items[i].table === op.table &&
        this.items[i].recordId === op.recordId
      ) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      // Keep FIFO position of the earliest pending op, update to latest content.
      var existing = this.items[idx];
      existing.opType = op.opType;
      existing.payload = op.payload;
      existing.ts = op.ts;
      this._save();
      return existing;
    }
    op.seq = this._seqCounter++;
    this.items.push(op);
    this._save();
    return op;
  };
  SyncQueue.prototype.size = function () {
    return this.items.length;
  };
  SyncQueue.prototype.peekAll = function () {
    return this.items.slice();
  };
  SyncQueue.prototype.clear = function () {
    this.items = [];
    this._save();
  };
  // Remove and return the head op (used by the resilient push loop so a single
  // permanently-rejected op can be dropped without wedging the whole queue).
  SyncQueue.prototype.removeFirst = function () {
    var op = this.items.shift();
    this._save();
    return op;
  };
  // Flush in FIFO order. sendFn(op) -> Promise. On the first failure we stop and
  // KEEP the failed op (and everything after it) so nothing is lost while
  // offline; resolves with the list of ops that were sent successfully.
  SyncQueue.prototype.flush = function (sendFn) {
    var self = this;
    var processed = [];
    function step() {
      if (!self.items.length) return Promise.resolve(processed);
      var op = self.items[0];
      return Promise.resolve()
        .then(function () {
          return sendFn(op);
        })
        .then(function () {
          self.items.shift();
          self._save();
          processed.push(op);
          return step();
        })
        .catch(function () {
          // Stop on first failure; preserve remaining queue (offline-safe).
          return processed;
        });
    }
    return step();
  };

  // -------------------------------------------------------- ConflictResolver -
  // All pure. No network, no storage, no side effects.
  var ConflictResolver = {
    // Timestamp helper — tolerant of ISO strings, epoch ms, or missing values.
    _ts: function (rec) {
      if (!rec) return 0;
      var v = rec.updatedAt != null ? rec.updatedAt : rec.updated_at;
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      var t = Date.parse(v);
      return isNaN(t) ? 0 : t;
    },

    // Last-write-wins between two versions of the SAME record id.
    resolveRecord: function (local, remote) {
      if (!local) return remote || null;
      if (!remote) return local || null;
      return this._ts(remote) > this._ts(local) ? remote : local;
    },

    // Merge two lists keyed by stable `id`; per-record last-write-wins.
    mergeById: function (localList, remoteList) {
      var byId = {};
      var order = [];
      function absorb(list) {
        (list || []).forEach(function (rec) {
          if (!rec || rec.id == null) return;
          var id = rec.id;
          if (!(id in byId)) {
            order.push(id);
            byId[id] = rec;
          } else {
            byId[id] = ConflictResolver.resolveRecord(byId[id], rec);
          }
        });
      }
      absorb(localList);
      absorb(remoteList);
      return order.map(function (id) {
        return byId[id];
      });
    },

    // Normalized product identity: prefer barcode, else normalized name.
    normalizeName: function (s) {
      return String(s == null ? '' : s)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    },
    productKey: function (p) {
      if (!p) return '';
      if (p.barcode) return 'bc:' + String(p.barcode);
      var name = p.nameEn || p.name || p.nameHe || '';
      return 'nm:' + this.normalizeName(name);
    },
    // Collapse duplicate products (same barcode / normalized name), keeping the
    // newest version. Does not duplicate identical products.
    dedupeProducts: function (list) {
      var byKey = {};
      var order = [];
      var self = this;
      (list || []).forEach(function (p) {
        var key = self.productKey(p);
        if (!key) return;
        if (!(key in byKey)) {
          order.push(key);
          byKey[key] = p;
        } else {
          byKey[key] = self.resolveRecord(byKey[key], p);
        }
      });
      return order.map(function (key) {
        return byKey[key];
      });
    },

    // Quantity conflict: both sides diverged from the last-synced base AND
    // disagree with each other. If either side still equals base, the other
    // side's change simply wins (no dialog needed).
    isQuantityConflict: function (base, localVal, remoteVal) {
      if (localVal === remoteVal) return false;
      if (localVal === base) return false; // only remote changed
      if (remoteVal === base) return false; // only local changed
      return true; // both changed differently
    },
    // The four dialog outcomes. `manualVal` is only used for 'manual'.
    resolveQuantity: function (choice, localVal, remoteVal, manualVal) {
      switch (choice) {
        case 'local':
          return localVal;
        case 'cloud':
          return remoteVal;
        case 'add':
          return (Number(localVal) || 0) + (Number(remoteVal) || 0);
        case 'manual':
          return Number(manualVal) || 0;
        default:
          return localVal;
      }
    },
  };

  // -------------------------------------------------------------- Migration --
  // Pure planner for local→cloud upload. Idempotent: given the migration state
  // (which record ids were already confirmed uploaded), it never re-plans them
  // and never returns duplicates. It NEVER mutates or deletes local data — it
  // only returns a plan; the caller deletes nothing (offline-first keeps local).
  var Migration = {
    STATE_KEY: 'pantry.sync.migration',
    emptyState: function () {
      return { version: 1, uploaded: {}, completedAt: null };
    },
    // localItems: [{id, ...}]. state.uploaded: { id: true }.
    planUploads: function (localItems, state) {
      state = state || this.emptyState();
      var uploaded = state.uploaded || {};
      var seen = {};
      var plan = [];
      (localItems || []).forEach(function (rec) {
        if (!rec || rec.id == null) return;
        var id = rec.id;
        if (uploaded[id]) return; // already confirmed uploaded — idempotent
        if (seen[id]) return; // no duplicates within one plan
        seen[id] = true;
        plan.push(rec);
      });
      return plan;
    },
    // Fold a confirmed upload back into state (call ONLY after the cloud write
    // succeeded). Returns a new state object.
    markUploaded: function (state, ids) {
      state = state || this.emptyState();
      var uploaded = {};
      var k;
      for (k in state.uploaded) if (state.uploaded[k]) uploaded[k] = true;
      (ids || []).forEach(function (id) {
        uploaded[id] = true;
      });
      return { version: state.version || 1, uploaded: uploaded, completedAt: state.completedAt };
    },
    isComplete: function (localItems, state) {
      return this.planUploads(localItems, state).length === 0;
    },
  };

  // ------------------------------------------------------------- DeviceLink --
  var DeviceLink = {
    // Crypto-random, URL-safe token (default 256 bits of entropy). Never logged.
    generateToken: function (nBytes) {
      var c = getCrypto();
      if (!c) throw new Error('secure RNG unavailable');
      var arr = new Uint8Array(nBytes || 32);
      c.getRandomValues(arr);
      return bytesToB64Url(arr);
    },
    // Optional client-side hash (server also hashes via pgcrypto). Async.
    hashToken: function (token) {
      var c = getCrypto();
      if (!c || !c.subtle) return Promise.resolve(null);
      var enc =
        typeof TextEncoder !== 'undefined'
          ? new TextEncoder().encode(token)
          : Buffer.from(token, 'utf8');
      return c.subtle.digest('SHA-256', enc).then(function (buf) {
        var b = new Uint8Array(buf);
        var hex = '';
        for (var i = 0; i < b.length; i++) {
          hex += ('0' + b[i].toString(16)).slice(-2);
        }
        return hex;
      });
    },
    // Shareable deep link. baseUrl e.g. location.origin + path.
    buildLinkUrl: function (baseUrl, token) {
      var sep = baseUrl.indexOf('#') >= 0 ? '&' : '#';
      return baseUrl + sep + 'link=' + encodeURIComponent(token);
    },
    parseLinkUrl: function (url) {
      var m = /[#&?]link=([^&]+)/.exec(String(url || ''));
      return m ? decodeURIComponent(m[1]) : null;
    },
  };

  // -------------------------------------------------------- CloudRepository --
  // Thin PostgREST + GoTrue client. Anonymous auth: each device signs in
  // anonymously (its own auth.uid()); household membership (shared user_id) is
  // established via the redeem_link_token RPC. RLS does the real enforcement.
  //
  // NOTE: the exact GoTrue/PostgREST request shapes below are best-effort and
  // must be verified against a live Supabase project (see SYNC_SETUP.md). This
  // class is never exercised unless the app is configured AND linked.
  function CloudRepository(cfg, session) {
    this.url = String(cfg.url).replace(/\/+$/, '');
    this.anonKey = cfg.anonKey;
    this.session = session || null; // { access_token, refresh_token, user }
  }
  CloudRepository.prototype._authToken = function () {
    return (this.session && this.session.access_token) || this.anonKey;
  };
  CloudRepository.prototype._headers = function (extra) {
    var h = {
      apikey: this.anonKey,
      Authorization: 'Bearer ' + this._authToken(),
      'Content-Type': 'application/json',
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  };
  // Low-level request. On a 401/403 (typically an EXPIRED anonymous JWT) it
  // transparently refreshes the session ONCE via the refresh_token and retries,
  // so a stale token on re-login never surfaces as a "Sync error". Auth
  // endpoints themselves are never auto-refreshed (avoids recursion).
  CloudRepository.prototype._fetch = function (path, opts, _retried) {
    var self = this;
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch unavailable'));
    }
    var isAuthPath = path.indexOf('/auth/v1/') === 0;
    return fetch(this.url + path, opts).then(function (res) {
      if (
        (res.status === 401 || res.status === 403) &&
        !_retried &&
        !isAuthPath &&
        self.session &&
        self.session.refresh_token
      ) {
        return self.refreshSession().then(
          function () {
            if (opts && opts.headers && opts.headers.Authorization) {
              opts.headers.Authorization = 'Bearer ' + self._authToken();
            }
            return self._fetch(path, opts, true);
          },
          function () {
            // Refresh failed — report the original auth error (transient).
            var e = new Error('HTTP ' + res.status + ': auth refresh failed');
            e.status = res.status;
            throw e;
          }
        );
      }
      if (!res.ok) {
        return res.text().then(function (t) {
          var e = new Error('HTTP ' + res.status + ': ' + t);
          e.status = res.status;
          throw e;
        });
      }
      var ct = res.headers.get('content-type') || '';
      return ct.indexOf('application/json') >= 0 ? res.json() : res.text();
    });
  };
  // --- auth ---
  CloudRepository.prototype.signInAnonymously = function () {
    var self = this;
    return this._fetch('/auth/v1/signup', {
      method: 'POST',
      headers: { apikey: this.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    }).then(function (out) {
      self.session = out;
      return out;
    });
  };
  CloudRepository.prototype.refreshSession = function () {
    var self = this;
    if (!this.session || !this.session.refresh_token) {
      return Promise.reject(new Error('no refresh token'));
    }
    return this._fetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: this.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.session.refresh_token }),
    }).then(function (out) {
      self.session = out;
      // Let the app persist the refreshed tokens so they survive reloads.
      if (typeof self.onSession === 'function') {
        try { self.onSession(out); } catch (e) {}
      }
      return out;
    });
  };
  // --- device linking (RPCs, defined in schema.sql) ---
  CloudRepository.prototype.createHousehold = function () {
    return this._fetch('/rest/v1/rpc/create_household', {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({}),
    }); // returns household uuid
  };
  CloudRepository.prototype.createLinkToken = function (token, expiresMinutes) {
    return this._fetch('/rest/v1/rpc/create_link_token', {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        p_token: token,
        p_expires_minutes: expiresMinutes || 60,
      }),
    });
  };
  CloudRepository.prototype.redeemLinkToken = function (token) {
    return this._fetch('/rest/v1/rpc/redeem_link_token', {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ p_token: token }),
    }); // returns household uuid
  };
  CloudRepository.prototype.revokeLinkTokens = function () {
    return this._fetch('/rest/v1/rpc/revoke_link_tokens', {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({}),
    });
  };
  // --- data (PostgREST) ---
  CloudRepository.prototype.upsert = function (table, rows) {
    return this._fetch('/rest/v1/' + table, {
      method: 'POST',
      headers: this._headers({
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    });
  };
  CloudRepository.prototype.delete = function (table, id) {
    return this._fetch('/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: this._headers({ Prefer: 'return=minimal' }),
    });
  };
  CloudRepository.prototype.selectSince = function (table, userId, sinceIso) {
    var q =
      '/rest/v1/' +
      table +
      '?user_id=eq.' +
      encodeURIComponent(userId) +
      '&select=*';
    if (sinceIso) q += '&updated_at=gte.' + encodeURIComponent(sinceIso);
    return this._fetch(q, { method: 'GET', headers: this._headers() });
  };

  // ------------------------------------------------------------ SyncManager --
  // Event-driven (no continuous polling). Fully defensive — every public entry
  // is wrapped so a backend/network problem can never break normal app use.
  var STATUS = {
    DISABLED: 'disabled',
    IDLE: 'idle',
    SYNCING: 'syncing',
    OFFLINE: 'offline',
    CONFLICT: 'conflict',
    ERROR: 'error',
  };
  function SyncManager(opts) {
    opts = opts || {};
    this.cfg = opts.cfg;
    this.repo = opts.repo; // CloudRepository
    this.queue = opts.queue; // SyncQueue
    this.storage = opts.storage || (global.localStorage || null);
    this.onStatus = opts.onStatus || function () {};
    this.getUserId = opts.getUserId || function () { return null; };
    this.debounceMs = opts.debounceMs || 1500;
    // Lightweight periodic pull while the app is active + online (0 disables).
    this.pullIntervalMs = opts.pullIntervalMs != null ? opts.pullIntervalMs : 25000;
    this.status = STATUS.IDLE;
    this.lastSyncAt = null;
    this.lastError = null;
    this.pendingConflicts = [];
    this._timer = null;
    this._interval = null;
    this._boundHandlers = null;
    this._syncing = false;
  }
  // Categorize a failed request: permanent client errors (bad row/route) must
  // NOT wedge the queue or flip the whole sync to "error"; transient ones
  // (offline, 5xx, auth-after-failed-refresh) should stop and be retried later.
  function isPermanentError(err) {
    var s = err && err.status;
    return s === 400 || s === 404 || s === 409 || s === 422;
  }
  SyncManager.prototype._setStatus = function (s) {
    this.status = s;
    try {
      this.onStatus(s, this);
    } catch (e) {
      /* never throw into the app */
    }
  };
  SyncManager.prototype._online = function () {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  };
  SyncManager.prototype.start = function () {
    if (this._boundHandlers || typeof global.addEventListener !== 'function') {
      // Even if we cannot attach listeners (Node), we still allow manual sync.
      this._setStatus(this._online() ? STATUS.IDLE : STATUS.OFFLINE);
      return;
    }
    var self = this;
    var onWake = function () {
      if (self._online()) self.scheduleSync(0);
    };
    var onOnline = function () {
      self.scheduleSync(0);
    };
    var onOffline = function () {
      self._setStatus(STATUS.OFFLINE);
    };
    this._boundHandlers = { onWake: onWake, onOnline: onOnline, onOffline: onOffline };
    global.addEventListener('online', onOnline);
    global.addEventListener('offline', onOffline);
    global.addEventListener('focus', onWake);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) onWake();
      });
    }
    this._setStatus(this._online() ? STATUS.IDLE : STATUS.OFFLINE);
    // Lightweight periodic pull so a device "updates by itself" when another
    // device changed data — only fires when online and the tab is visible.
    if (this.pullIntervalMs > 0 && typeof setInterval === 'function') {
      this._interval = setInterval(function () {
        if (!self._online()) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        self.scheduleSync(0);
      }, this.pullIntervalMs);
    }
    this.scheduleSync(0);
  };
  SyncManager.prototype.stop = function () {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    if (!this._boundHandlers || typeof global.removeEventListener !== 'function') {
      this._boundHandlers = null;
      return;
    }
    var h = this._boundHandlers;
    global.removeEventListener('online', h.onOnline);
    global.removeEventListener('offline', h.onOffline);
    global.removeEventListener('focus', h.onWake);
    this._boundHandlers = null;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  };
  // Called after every local mutation: persist to queue + debounce a push.
  SyncManager.prototype.notifyLocalMutation = function (op) {
    if (this.queue) this.queue.enqueue(op);
    this.scheduleSync(this.debounceMs);
  };
  SyncManager.prototype.scheduleSync = function (delay) {
    var self = this;
    if (typeof setTimeout !== 'function') return;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(function () {
      self._timer = null;
      self.syncNow();
    }, delay || 0);
  };
  // Push queued mutations then pull remote deltas. Never rejects.
  SyncManager.prototype.syncNow = function () {
    var self = this;
    if (this._syncing) return Promise.resolve(false);
    if (!this._online()) {
      this._setStatus(STATUS.OFFLINE);
      return Promise.resolve(false);
    }
    this._syncing = true;
    this._setStatus(STATUS.SYNCING);
    return Promise.resolve()
      .then(function () {
        return self._push();
      })
      .then(function () {
        if (typeof self.onPull === 'function') return self.onPull();
        return null;
      })
      .then(function () {
        self.lastSyncAt = nowIso();
        self.lastError = null;
        if (self.storage) {
          try {
            self.storage.setItem('pantry.sync.lastAt', self.lastSyncAt);
          } catch (e) {}
        }
        self._setStatus(
          self.pendingConflicts.length ? STATUS.CONFLICT : STATUS.IDLE
        );
        return true;
      })
      .catch(function (err) {
        self.lastError = err || null;
        self._setStatus(self._online() ? STATUS.ERROR : STATUS.OFFLINE);
        return false;
      })
      .then(function (r) {
        self._syncing = false;
        return r;
      });
  };
  // Resilient push: process the queue in FIFO order. A permanently-rejected op
  // (bad row/route — 4xx) is DROPPED so it can't wedge the queue or error every
  // future sync; a transient failure (offline/5xx/auth) STOPS and keeps the
  // remaining queue for a later retry (offline-first).
  SyncManager.prototype._push = function () {
    var self = this;
    if (!this.queue || !this.repo) return Promise.resolve();
    function send(op) {
      if (op.opType === 'delete') return self.repo.delete(op.table, op.recordId);
      return self.repo.upsert(op.table, op.payload);
    }
    function step() {
      var items = self.queue.peekAll();
      if (!items.length) return Promise.resolve();
      var op = items[0];
      return send(op).then(
        function () {
          self.queue.removeFirst();
          return step();
        },
        function (err) {
          if (isPermanentError(err)) {
            // Poison op: record it, drop it, keep going with the rest.
            self.lastError = err;
            self.queue.removeFirst();
            return step();
          }
          throw err; // transient -> stop; remaining queue is preserved
        }
      );
    }
    return step();
  };

  // ---------------------------------------------------------------- exports --
  var HomeSync = {
    STATUS: STATUS,
    isConfigured: isConfigured,
    isSameIdentity: isSameIdentity,
    SyncQueue: SyncQueue,
    ConflictResolver: ConflictResolver,
    Migration: Migration,
    DeviceLink: DeviceLink,
    CloudRepository: CloudRepository,
    SyncManager: SyncManager,
    _util: { bytesToB64Url: bytesToB64Url, nowIso: nowIso },
  };

  global.HomeSync = HomeSync;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HomeSync;
  }
})(
  typeof self !== 'undefined'
    ? self
    : typeof window !== 'undefined'
    ? window
    : globalThis
);
