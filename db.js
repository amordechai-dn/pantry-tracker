/* Client-side persistence via IndexedDB (no server).
   Exposed as global `PantryDB`. Falls back to localStorage if IndexedDB is
   unavailable.

   Per-user namespacing: call PantryDB.setUser(userId) right after login. Each
   user gets an isolated IndexedDB database ("pantry-tracker-u-<id>") plus
   per-user localStorage keys for the monthly log and fallbacks, so inventory,
   shopping/to-restock, monthly tracking, barcode mappings and settings are all
   independent between users. setUser(null) selects the legacy (pre-auth) space.

   Stores:
     items    — inventory records (keyPath id); indexes: barcode, categoryId,
                location (enable direct lookups instead of full scans at scale)
     barcodes — barcode -> product mapping / OFF lookup cache (keyPath barcode)
     images   — de-duplicated product images keyed by SHA-256 content hash
                (keyPath hash): { hash, full, thumb }. Shared per user; items
                reference an image by imageHash so identical photos are stored
                once (dedup-on-write).
*/
(function () {
  'use strict';

  var BASE = 'pantry-tracker';
  var DB_VERSION = 3;
  var STORE = 'items';
  var BC_STORE = 'barcodes';
  var IMG_STORE = 'images';

  var useIDB = typeof indexedDB !== 'undefined';

  // Namespaced identifiers — updated by setUser().
  var currentUser = null;
  var DB_NAME = BASE;
  var LS_KEY = 'pantry.items.fallback';
  var BC_LS_KEY = 'pantry.barcodes.fallback';
  var IMG_LS_KEY = 'pantry.images.fallback';
  var MONTHLY_KEY = 'pantry.monthly.v1';
  var dbPromise = null;
  // When true (only during migration), unscoped access is temporarily allowed.
  var _bypass = false;

  // Repository-level scope enforcement: every user-owned read/write must run
  // under an authenticated user (set via setUser) unless we are migrating.
  function scoped() {
    return currentUser !== null || _bypass;
  }
  function scopeError() {
    return Promise.reject(new Error('PantryDB: no authenticated user scope'));
  }

  function suffix(id) {
    return id ? '-u-' + id : '';
  }
  function dot(id) {
    return id ? '.' + id : '';
  }

  // Switch the active data namespace (per logged-in user). Resets the cached
  // DB connection so the next operation targets the new database.
  function setUser(id) {
    currentUser = id || null;
    DB_NAME = BASE + suffix(currentUser);
    LS_KEY = 'pantry.items.fallback' + dot(currentUser);
    BC_LS_KEY = 'pantry.barcodes.fallback' + dot(currentUser);
    IMG_LS_KEY = 'pantry.images.fallback' + dot(currentUser);
    MONTHLY_KEY = 'pantry.monthly.v1' + dot(currentUser);
    dbPromise = null;
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    var name = DB_NAME;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(name, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        var upgradeTx = req.transaction; // versionchange tx (for existing stores)
        var itemsStore;
        if (!db.objectStoreNames.contains(STORE)) {
          itemsStore = db.createObjectStore(STORE, { keyPath: 'id' });
        } else {
          itemsStore = upgradeTx.objectStore(STORE);
        }
        // Indexes so lookups/filters use IndexedDB keys instead of scanning the
        // whole collection at scale (barcode lookup, category/location filters).
        if (itemsStore && !itemsStore.indexNames.contains('barcode')) {
          itemsStore.createIndex('barcode', 'barcode', { unique: false });
        }
        if (itemsStore && !itemsStore.indexNames.contains('categoryId')) {
          itemsStore.createIndex('categoryId', 'categoryId', { unique: false });
        }
        if (itemsStore && !itemsStore.indexNames.contains('location')) {
          itemsStore.createIndex('location', 'location', { unique: false });
        }
        if (!db.objectStoreNames.contains(BC_STORE)) {
          db.createObjectStore(BC_STORE, { keyPath: 'barcode' });
        }
        // De-duplicated image store, keyed by content hash (dedup-on-write).
        if (!db.objectStoreNames.contains(IMG_STORE)) {
          db.createObjectStore(IMG_STORE, { keyPath: 'hash' });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
    return dbPromise;
  }

  function tx(mode, storeName) {
    var s = storeName || STORE;
    return openDB().then(function (db) {
      return db.transaction(s, mode).objectStore(s);
    });
  }

  // ---- localStorage fallback ----
  function lsRead() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function lsWrite(arr) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function getAll() {
    if (!scoped()) return scopeError();
    if (!useIDB) {
      return Promise.resolve(
        lsRead().sort(function (a, b) {
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        })
      );
    }
    return tx('readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.getAll();
        req.onsuccess = function () {
          var arr = req.result || [];
          arr.sort(function (a, b) {
            return a.name.localeCompare(b.name, undefined, {
              sensitivity: 'base',
            });
          });
          resolve(arr);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function create(input) {
    if (!scoped()) return scopeError();
    var now = new Date().toISOString();
    var item = {
      id: newId(),
      name: (input.name || '').trim(),
      quantity: typeof input.quantity === 'number' ? input.quantity : 1,
      unit: input.unit || 'pcs',
      categoryId: input.categoryId || 'other',
      location: input.location || 'Fridge',
      note: input.note || null,
      // Specific item emoji (from the food DB); null → fall back to category.
      emoji: input.emoji || null,
      // Legacy inline image (data URL). Retained for backward compat but no
      // longer populated: images are deduped in the `images` store and
      // referenced via imageHash below.
      image: input.image || null,
      // Content-hash reference into the deduped per-user image store.
      imageHash: input.imageHash || null,
      // Desired amount / par level (target stock). 0 = not tracked.
      desiredAmount:
        typeof input.desiredAmount === 'number' ? input.desiredAmount : 0,
      // Reserved for future features:
      expiryDate: input.expiryDate || null,
      lowStockThreshold:
        typeof input.lowStockThreshold === 'number'
          ? input.lowStockThreshold
          : null,
      barcode: input.barcode || null,
      createdAt: now,
      updatedAt: now,
    };
    return put(item).then(function () {
      return item;
    });
  }

  function put(item) {
    if (!scoped()) return scopeError();
    item.updatedAt = new Date().toISOString();
    if (!useIDB) {
      var arr = lsRead();
      var idx = arr.findIndex(function (x) {
        return x.id === item.id;
      });
      if (idx >= 0) arr[idx] = item;
      else arr.push(item);
      lsWrite(arr);
      return Promise.resolve(item);
    }
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.put(item);
        req.onsuccess = function () {
          resolve(item);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function remove(id) {
    if (!scoped()) return scopeError();
    if (!useIDB) {
      lsWrite(
        lsRead().filter(function (x) {
          return x.id !== id;
        })
      );
      return Promise.resolve();
    }
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.delete(id);
        req.onsuccess = function () {
          resolve();
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  // ---- Barcode -> product mapping / OFF lookup cache (per user) ----
  function bcLsRead() {
    try {
      return JSON.parse(localStorage.getItem(BC_LS_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function bcLsWrite(map) {
    try {
      localStorage.setItem(BC_LS_KEY, JSON.stringify(map || {}));
    } catch (e) {}
  }

  function getBarcode(code) {
    if (!scoped()) return scopeError();
    if (!code) return Promise.resolve(null);
    code = String(code);
    if (!useIDB) {
      return Promise.resolve(bcLsRead()[code] || null);
    }
    return tx('readonly', BC_STORE).then(function (store) {
      return new Promise(function (resolve) {
        var req = store.get(code);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          resolve(null);
        };
      });
    });
  }

  function putBarcode(rec) {
    if (!scoped()) return scopeError();
    if (!rec || !rec.barcode) return Promise.resolve(null);
    rec.barcode = String(rec.barcode);
    rec.updatedAt = new Date().toISOString();
    if (!useIDB) {
      var map = bcLsRead();
      map[rec.barcode] = rec;
      bcLsWrite(map);
      return Promise.resolve(rec);
    }
    return tx('readwrite', BC_STORE).then(function (store) {
      return new Promise(function (resolve) {
        var req = store.put(rec);
        req.onsuccess = function () {
          resolve(rec);
        };
        req.onerror = function () {
          resolve(null);
        };
      });
    });
  }

  // ---- De-duplicated image store (per user, keyed by content hash) ----
  // Identical photos (same SHA-256) are stored exactly once; inventory items
  // reference an image via item.imageHash. Records: { hash, full, thumb }.
  function imgLsRead() {
    try {
      return JSON.parse(localStorage.getItem(IMG_LS_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function imgLsWrite(map) {
    try {
      localStorage.setItem(IMG_LS_KEY, JSON.stringify(map || {}));
    } catch (e) {}
  }

  function getAllImages() {
    if (!scoped()) return scopeError();
    if (!useIDB) {
      var map = imgLsRead();
      return Promise.resolve(
        Object.keys(map).map(function (k) {
          return map[k];
        })
      );
    }
    return tx('readonly', IMG_STORE).then(function (store) {
      return new Promise(function (resolve) {
        var req = store.getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          resolve([]);
        };
      });
    });
  }

  function getImage(hash) {
    if (!scoped()) return scopeError();
    if (!hash) return Promise.resolve(null);
    if (!useIDB) {
      return Promise.resolve(imgLsRead()[hash] || null);
    }
    return tx('readonly', IMG_STORE).then(function (store) {
      return new Promise(function (resolve) {
        var req = store.get(hash);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          resolve(null);
        };
      });
    });
  }

  function putImage(rec) {
    if (!scoped()) return scopeError();
    if (!rec || !rec.hash) return Promise.resolve(null);
    if (!useIDB) {
      var map = imgLsRead();
      // Dedup-on-write: only store once per hash.
      if (!map[rec.hash]) {
        map[rec.hash] = rec;
        imgLsWrite(map);
      }
      return Promise.resolve(rec);
    }
    return tx('readwrite', IMG_STORE).then(function (store) {
      return new Promise(function (resolve) {
        // put() keyed by hash overwrites identical content harmlessly (dedup).
        var req = store.put(rec);
        req.onsuccess = function () {
          resolve(rec);
        };
        req.onerror = function () {
          resolve(null);
        };
      });
    });
  }

  function deleteImage(hash) {
    if (!scoped()) return scopeError();
    if (!hash) return Promise.resolve();
    if (!useIDB) {
      var map = imgLsRead();
      if (map[hash]) {
        delete map[hash];
        imgLsWrite(map);
      }
      return Promise.resolve();
    }
    return tx('readwrite', IMG_STORE).then(function (store) {
      return new Promise(function (resolve) {
        var req = store.delete(hash);
        req.onsuccess = function () {
          resolve();
        };
        req.onerror = function () {
          resolve();
        };
      });
    });
  }

  // ---- Monthly restock log (on-device, keyed by YYYY-MM, per user) ----
  //   { "2026-08": { restocked: n, consumed: n, shortfall: [ {name,missing,have,target} ] } }
  function getMonthlyLog() {
    try {
      return JSON.parse(localStorage.getItem(MONTHLY_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function setMonthlyLog(obj) {
    try {
      localStorage.setItem(MONTHLY_KEY, JSON.stringify(obj || {}));
    } catch (e) {}
  }

  // ---- Delete ALL of a user's data (used by optional profile deletion) ----
  // Removes the per-user IndexedDB database and every per-user localStorage
  // key (inventory/barcodes/images fallbacks, monthly log, language, flags).
  // Never touches other users' namespaces. Resolves when done.
  function deleteUserData(userId) {
    if (!userId) return Promise.resolve();
    try {
      [
        'pantry.items.fallback.' + userId,
        'pantry.barcodes.fallback.' + userId,
        'pantry.images.fallback.' + userId,
        'pantry.monthly.v1.' + userId,
        'pantry.lang.' + userId,
        'pantry.imgmig.v1.' + userId,
      ].forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (e) {}
    if (!useIDB) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        var name = BASE + '-u-' + userId;
        if (DB_NAME === name) dbPromise = null; // drop any cached connection
        var req = indexedDB.deleteDatabase(name);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { resolve(); };
        req.onblocked = function () { resolve(); };
      } catch (e) {
        resolve();
      }
    });
  }

  // ---- Migration registry (versioned + checkpointed) ----
  // Records which migrations have completed so they run exactly once and are
  // safe across interrupted/partial runs. Stored as:
  //   pantry.migrations.v1 = { "<id>": { done:true, ts } }
  var MIGRATIONS_KEY = 'pantry.migrations.v1';
  function getMigrations() {
    try {
      return JSON.parse(localStorage.getItem(MIGRATIONS_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function hasMigration(id) {
    var m = getMigrations();
    return !!(m[id] && m[id].done);
  }
  function markMigration(id) {
    var m = getMigrations();
    m[id] = { done: true, ts: new Date().toISOString() };
    try {
      localStorage.setItem(MIGRATIONS_KEY, JSON.stringify(m));
    } catch (e) {}
  }

  // ---- One-time migration of pre-auth (single-user) data into a user ----
  // Copies legacy items + monthly log + language into the target user's
  // namespace. IDEMPOTENT and PARTIAL-SAFE: items are written by their existing
  // id (put overwrites, never duplicates), so re-running after an interruption
  // simply completes the copy. IDs and relationships are preserved. Guarded by
  // a versioned migration record (and honours the v1.4.0 flag if present).
  function migrateLegacyInto(userId) {
    var MIG_ID = 'legacy-into-user-v1';
    if (hasMigration(MIG_ID)) return Promise.resolve(false);

    var alreadyV14 = false;
    try {
      alreadyV14 = !!localStorage.getItem('pantry.legacyMigrated.v1');
    } catch (e) {}

    var legMonthly = null;
    var legLang = null;
    try {
      legMonthly = localStorage.getItem('pantry.monthly.v1');
      legLang = localStorage.getItem('pantry.lang');
    } catch (e) {}

    _bypass = true; // allow unscoped legacy read + target write during migration
    setUser(null); // legacy (pre-auth) namespace
    return getAll()
      .then(function (legacyItems) {
        setUser(userId); // target user namespace
        var chain = Promise.resolve();
        // Only copy items when this device hasn't already migrated in v1.4.0.
        // (If it had, the target already contains them.) id-based put = safe.
        if (!alreadyV14 && legacyItems && legacyItems.length) {
          legacyItems.forEach(function (it) {
            chain = chain.then(function () {
              return put(it);
            });
          });
        }
        return chain;
      })
      .then(function () {
        try {
          var tMonthly = 'pantry.monthly.v1.' + userId;
          if (legMonthly && !localStorage.getItem(tMonthly))
            localStorage.setItem(tMonthly, legMonthly);
          var tLang = 'pantry.lang.' + userId;
          if (legLang && !localStorage.getItem(tLang))
            localStorage.setItem(tLang, legLang);
          localStorage.setItem('pantry.legacyMigrated.v1', '1');
        } catch (e) {}
        markMigration(MIG_ID); // checkpoint only after success
        _bypass = false;
        return true;
      })
      .catch(function () {
        _bypass = false;
        return false;
      });
  }

  window.PantryDB = {
    setUser: setUser,
    currentUser: function () {
      return currentUser;
    },
    getAll: getAll,
    create: create,
    put: put,
    remove: remove,
    getBarcode: getBarcode,
    putBarcode: putBarcode,
    getAllImages: getAllImages,
    getImage: getImage,
    putImage: putImage,
    deleteImage: deleteImage,
    getMonthlyLog: getMonthlyLog,
    setMonthlyLog: setMonthlyLog,
    deleteUserData: deleteUserData,
    migrateLegacyInto: migrateLegacyInto,
    hasMigration: hasMigration,
    getMigrations: getMigrations,
  };
})();
