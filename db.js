/* Client-side persistence via IndexedDB (no server).
   Exposed as global `PantryDB`. Falls back to localStorage if IndexedDB is
   unavailable.

   Per-user namespacing: call PantryDB.setUser(userId) right after login. Each
   user gets an isolated IndexedDB database ("pantry-tracker-u-<id>") plus
   per-user localStorage keys for the monthly log and fallbacks, so inventory,
   shopping/to-restock, monthly tracking, barcode mappings and settings are all
   independent between users. setUser(null) selects the legacy (pre-auth) space.

   Stores:
     items    — inventory records (keyPath id)
     barcodes — barcode -> product mapping / OFF lookup cache (keyPath barcode)
*/
(function () {
  'use strict';

  var BASE = 'pantry-tracker';
  var DB_VERSION = 2;
  var STORE = 'items';
  var BC_STORE = 'barcodes';

  var useIDB = typeof indexedDB !== 'undefined';

  // Namespaced identifiers — updated by setUser().
  var currentUser = null;
  var DB_NAME = BASE;
  var LS_KEY = 'pantry.items.fallback';
  var BC_LS_KEY = 'pantry.barcodes.fallback';
  var MONTHLY_KEY = 'pantry.monthly.v1';
  var dbPromise = null;

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
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(BC_STORE)) {
          db.createObjectStore(BC_STORE, { keyPath: 'barcode' });
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
      // On-device product image (compressed JPEG data URL); null → emoji.
      image: input.image || null,
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

  // ---- One-time migration of pre-auth (single-user) data into a user ----
  // Copies legacy items + monthly log + language into the target user's
  // namespace, but only if the target has no items yet. Idempotent via a flag.
  function migrateLegacyInto(userId) {
    var FLAG = 'pantry.legacyMigrated.v1';
    try {
      if (localStorage.getItem(FLAG)) return Promise.resolve(false);
    } catch (e) {}

    var legMonthly = null;
    var legLang = null;
    try {
      legMonthly = localStorage.getItem('pantry.monthly.v1');
      legLang = localStorage.getItem('pantry.lang');
    } catch (e) {}

    setUser(null); // legacy namespace
    return getAll()
      .then(function (legacyItems) {
        setUser(userId); // target namespace
        return getAll().then(function (targetItems) {
          var chain = Promise.resolve();
          if (
            (!targetItems || !targetItems.length) &&
            legacyItems &&
            legacyItems.length
          ) {
            legacyItems.forEach(function (it) {
              chain = chain.then(function () {
                return put(it);
              });
            });
          }
          return chain;
        });
      })
      .then(function () {
        try {
          var tMonthly = 'pantry.monthly.v1.' + userId;
          if (legMonthly && !localStorage.getItem(tMonthly))
            localStorage.setItem(tMonthly, legMonthly);
          var tLang = 'pantry.lang.' + userId;
          if (legLang && !localStorage.getItem(tLang))
            localStorage.setItem(tLang, legLang);
          localStorage.setItem(FLAG, '1');
        } catch (e) {}
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  window.PantryDB = {
    setUser: setUser,
    getAll: getAll,
    create: create,
    put: put,
    remove: remove,
    getBarcode: getBarcode,
    putBarcode: putBarcode,
    getMonthlyLog: getMonthlyLog,
    setMonthlyLog: setMonthlyLog,
    migrateLegacyInto: migrateLegacyInto,
  };
})();
