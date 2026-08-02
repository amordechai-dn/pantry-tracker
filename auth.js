/* ============================================================================
   Authentication layer — modular, swappable, LOCAL-DEMO ONLY.

   ⚠️ SECURITY NOTE: This is a *local demo* auth system. It runs entirely in the
   browser with no server. Passwords are never stored in plaintext — they are
   salted and hashed with PBKDF2 (SHA-256, many iterations) via the Web Crypto
   API — but this is NOT production-secure: anyone with access to the device /
   browser storage can read all local data, and there is no server-side trust.
   Do not use for real credentials. It exists to gate the UI and namespace
   per-user data, and is intentionally structured so the demo pieces can be
   swapped for a real provider (Firebase/Supabase/OAuth/custom) without touching
   inventory / shopping / barcode / monthly logic.

   Abstractions (all behind stable interfaces):
     - CryptoHasher    : PBKDF2 salted hashing + verification (Web Crypto)
     - UserRepository  : CRUD for user records (localStorage-backed)
     - SessionManager  : create/restore/expire local sessions (sliding renewal)
     - RateLimiter     : throttle rapid repeated login attempts
     - CurrentUser     : read-only accessor for the authenticated user (context)
     - AuthService     : orchestrates the above (window.Auth)

   The rest of the app depends ONLY on window.Auth (AuthService) and
   window.CurrentUser — never on the demo storage details.
   ============================================================================ */
(function () {
  'use strict';

  // ---- Web Crypto handles (browser: crypto.*, Node harness: globalThis.crypto) ----
  var _crypto =
    typeof crypto !== 'undefined' && crypto.subtle
      ? crypto
      : typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle
      ? globalThis.crypto
      : typeof crypto !== 'undefined'
      ? crypto
      : null;
  var subtle = _crypto && _crypto.subtle ? _crypto.subtle : null;

  function randomBytes(n) {
    var a = new Uint8Array(n);
    if (_crypto && _crypto.getRandomValues) _crypto.getRandomValues(a);
    else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); // last resort
    return a;
  }
  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      s += h.length < 2 ? '0' + h : h;
    }
    return s;
  }
  function fromHex(hex) {
    var a = new Uint8Array(hex.length / 2);
    for (var i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
    return a;
  }
  // Length-safe comparison of two hex digests (avoids trivial early-exit).
  function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length)
      return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }
  // Non-crypto fallback ONLY if Web Crypto is unavailable (marked in cred.algo).
  function weakHex(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // ---- CryptoHasher ----
  var PBKDF2_ITERS = 150000;
  var CryptoHasher = {
    algo: subtle ? 'PBKDF2-SHA256' : 'weak-fallback',
    deriveHex: function (password, saltBytes, iters) {
      if (subtle) {
        var enc = new TextEncoder();
        return subtle
          .importKey('raw', enc.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits'])
          .then(function (km) {
            return subtle.deriveBits(
              { name: 'PBKDF2', salt: saltBytes, iterations: iters, hash: 'SHA-256' },
              km,
              256
            );
          })
          .then(function (bits) {
            return toHex(new Uint8Array(bits));
          });
      }
      return Promise.resolve(weakHex(String(password) + toHex(saltBytes)));
    },
    // Returns a credential object { algo, iterations, salt, hash }. No plaintext.
    hash: function (password) {
      var salt = randomBytes(16);
      var iters = subtle ? PBKDF2_ITERS : 1;
      var self = this;
      return this.deriveHex(password, salt, iters).then(function (hex) {
        return { algo: self.algo, iterations: iters, salt: toHex(salt), hash: hex };
      });
    },
    verify: function (password, cred) {
      if (!cred || !cred.salt || !cred.hash) return Promise.resolve(false);
      return this.deriveHex(password, fromHex(cred.salt), cred.iterations || 1).then(function (hex) {
        return safeEqual(hex, cred.hash);
      });
    },
  };

  // ---- UserRepository (localStorage-backed; swap this for a real backend) ----
  // Shape: { users: { <id>: rec }, byUsername: { <lower>: <id> } }
  //   rec = { id, username, usernameLower, displayName, avatar, lang,
  //           cred: { algo, iterations, salt, hash }, createdAt, updatedAt }
  var USERS_KEY = 'pantry.auth.users.v2';
  var UserRepository = {
    _load: function () {
      try {
        var d = JSON.parse(localStorage.getItem(USERS_KEY) || 'null');
        if (d && d.users && d.byUsername) return d;
      } catch (e) {}
      return { users: {}, byUsername: {} };
    },
    _save: function (d) {
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(d));
      } catch (e) {}
    },
    getById: function (id) {
      return this._load().users[id] || null;
    },
    getByUsername: function (username) {
      var d = this._load();
      var id = d.byUsername[String(username || '').trim().toLowerCase()];
      return id ? d.users[id] || null : null;
    },
    all: function () {
      var d = this._load();
      return Object.keys(d.users).map(function (k) {
        return d.users[k];
      });
    },
    exists: function (username) {
      return !!this.getByUsername(username);
    },
    // Create a user (hashes the password, discards plaintext). Async.
    create: function (opts) {
      var self = this;
      var username = String(opts.username || '').trim();
      var id = opts.id || 'u_' + toHex(randomBytes(8));
      return CryptoHasher.hash(opts.password).then(function (cred) {
        var d = self._load();
        var now = new Date().toISOString();
        d.users[id] = {
          id: id,
          username: username,
          usernameLower: username.toLowerCase(),
          displayName: opts.displayName || username,
          avatar: opts.avatar || null,
          lang: opts.lang || null,
          cred: cred,
          createdAt: now,
          updatedAt: now,
        };
        d.byUsername[username.toLowerCase()] = id;
        self._save(d);
        // opts.password intentionally goes out of scope here (not retained).
        return d.users[id];
      });
    },
    // Update non-credential profile fields.
    update: function (id, patch) {
      var d = this._load();
      var rec = d.users[id];
      if (!rec) return null;
      ['displayName', 'avatar', 'lang'].forEach(function (k) {
        if (patch && k in patch) rec[k] = patch[k];
      });
      rec.updatedAt = new Date().toISOString();
      this._save(d);
      return rec;
    },
  };

  // Strip credentials before exposing a user anywhere in the app.
  function sanitize(rec) {
    if (!rec) return null;
    return {
      id: rec.id,
      username: rec.username,
      displayName: rec.displayName || rec.username,
      avatar: rec.avatar || null,
      lang: rec.lang || null,
    };
  }

  // ---- SessionManager (local session with expiry + sliding renewal) ----
  var SESSION_KEY = 'pantry.auth.session.v2';
  var TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  var SessionManager = {
    _read: function () {
      try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      } catch (e) {
        return null;
      }
    },
    _write: function (s) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      } catch (e) {}
    },
    start: function (userId, username) {
      var now = Date.now();
      this._write({ userId: userId, username: username, issuedAt: now, expiresAt: now + TTL_MS });
    },
    // Returns the session, { expired:true }, or null. Slides expiry forward.
    restore: function () {
      var s = this._read();
      if (!s || !s.userId) return null;
      if (Date.now() > s.expiresAt) {
        this.clear();
        return { expired: true };
      }
      s.expiresAt = Date.now() + TTL_MS; // sliding renewal
      this._write(s);
      return s;
    },
    touch: function () {
      var s = this._read();
      if (s && s.userId && Date.now() <= s.expiresAt) {
        s.expiresAt = Date.now() + TTL_MS;
        this._write(s);
      }
    },
    clear: function () {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (e) {}
    },
  };

  // ---- RateLimiter (throttle rapid repeated login attempts) ----
  var ATTEMPTS_KEY = 'pantry.auth.attempts.v1';
  var MAX_ATTEMPTS = 5;
  var WINDOW_MS = 60 * 1000;
  var LOCK_MS = 30 * 1000;
  var RateLimiter = {
    _read: function () {
      try {
        return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}') || {};
      } catch (e) {
        return {};
      }
    },
    _write: function (m) {
      try {
        localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(m));
      } catch (e) {}
    },
    lockRemaining: function (username) {
      var e = this._read()[String(username || '').toLowerCase()];
      if (e && e.lockUntil && Date.now() < e.lockUntil) return e.lockUntil - Date.now();
      return 0;
    },
    recordFailure: function (username) {
      var m = this._read();
      var k = String(username || '').toLowerCase();
      var e = m[k] || { count: 0, first: Date.now() };
      if (Date.now() - e.first > WINDOW_MS) e = { count: 0, first: Date.now() };
      e.count++;
      if (e.count >= MAX_ATTEMPTS) {
        e.lockUntil = Date.now() + LOCK_MS;
        e.count = 0;
        e.first = Date.now();
      }
      m[k] = e;
      this._write(m);
    },
    clear: function (username) {
      var m = this._read();
      delete m[String(username || '').toLowerCase()];
      this._write(m);
    },
  };

  // ---- CurrentUser (read-only context accessor used across the app) ----
  var _current = null;
  var CurrentUser = {
    get: function () {
      return _current;
    },
    id: function () {
      return _current ? _current.id : null;
    },
    username: function () {
      return _current ? _current.username : null;
    },
    displayName: function () {
      return _current ? _current.displayName || _current.username : null;
    },
    avatar: function () {
      return _current ? _current.avatar : null;
    },
    initials: function () {
      var n = this.displayName() || '';
      var parts = n.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '?';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },
    language: function () {
      return window.I18N ? window.I18N.getLang() : _current && _current.lang;
    },
    _set: function (u) {
      _current = u;
    },
    _clear: function () {
      _current = null;
    },
  };

  // ---- AuthService (orchestrator; the app's only auth dependency) ----
  var DEMO_USERS = [
    { id: 'aviraz', username: 'aviraz', password: 'aviraz', displayName: 'Aviraz' },
    { id: 'test', username: 'test', password: 'test', displayName: 'Test User' },
  ];

  function seed() {
    // Idempotent: create each demo user only if missing (never duplicates).
    var chain = Promise.resolve();
    DEMO_USERS.forEach(function (u) {
      chain = chain.then(function () {
        if (UserRepository.exists(u.username)) return null;
        return UserRepository.create(u);
      });
    });
    return chain;
  }

  var AuthService = {
    // Async — seeds demo users with salted hashes on first startup.
    init: function () {
      return seed();
    },

    // Async login. Resolves { ok:true, user } or
    // { ok:false, error:'invalid'|'locked'|'empty', wait? }. Uses a generic
    // error and always runs a hash verification to avoid user enumeration.
    login: function (username, password) {
      username = String(username || '').trim();
      if (!username || password == null || password === '')
        return Promise.resolve({ ok: false, error: 'empty' });
      var lock = RateLimiter.lockRemaining(username);
      if (lock > 0)
        return Promise.resolve({ ok: false, error: 'locked', wait: Math.ceil(lock / 1000) });
      var user = UserRepository.getByUsername(username);
      var cred = user ? user.cred : null;
      return CryptoHasher.verify(password, cred).then(function (okHash) {
        if (user && okHash) {
          RateLimiter.clear(username);
          SessionManager.start(user.id, user.username);
          CurrentUser._set(sanitize(user));
          return { ok: true, user: sanitize(user) };
        }
        RateLimiter.recordFailure(username);
        var lr = RateLimiter.lockRemaining(username);
        if (lr > 0) return { ok: false, error: 'locked', wait: Math.ceil(lr / 1000) };
        return { ok: false, error: 'invalid' };
      });
    },

    logout: function () {
      SessionManager.clear();
      CurrentUser._clear();
    },

    // Restore a persisted session on startup. Returns 'ok' | 'expired' | 'none'.
    restore: function () {
      var s = SessionManager.restore();
      if (!s) return 'none';
      if (s.expired) return 'expired';
      var user = UserRepository.getById(s.userId);
      if (!user) {
        SessionManager.clear();
        return 'none';
      }
      CurrentUser._set(sanitize(user));
      return 'ok';
    },

    touchSession: function () {
      SessionManager.touch();
    },

    isAuthenticated: function () {
      return !!CurrentUser.get();
    },

    listUsers: function () {
      return UserRepository.all().map(sanitize);
    },

    getUser: function (id) {
      return sanitize(UserRepository.getById(id));
    },

    // Update the current user's profile (display name / avatar / lang). Never
    // touches credentials. Returns the sanitized, refreshed user.
    updateProfile: function (patch) {
      var id = CurrentUser.id();
      if (!id) return null;
      var rec = UserRepository.update(id, patch);
      var s = sanitize(rec);
      CurrentUser._set(s);
      return s;
    },

    // Optional public registration hook (not wired into the demo UI).
    register: function (opts) {
      if (UserRepository.exists(opts.username))
        return Promise.resolve({ ok: false, error: 'exists' });
      return UserRepository.create(opts).then(function (rec) {
        return { ok: true, user: sanitize(rec) };
      });
    },

    // Testing hooks (not used by the app).
    _internals: {
      CryptoHasher: CryptoHasher,
      UserRepository: UserRepository,
      SessionManager: SessionManager,
      RateLimiter: RateLimiter,
      cryptoAvailable: !!subtle,
    },
  };

  window.Auth = AuthService;
  window.CurrentUser = CurrentUser;
})();
