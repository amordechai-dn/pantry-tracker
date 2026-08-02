/* Client-side persistence via IndexedDB (no server).
   Exposed as global `PantryDB`. Falls back to localStorage if IndexedDB is
   unavailable. The `items` records intentionally carry future-feature fields
   (expiryDate, lowStockThreshold, barcode); only add/edit/delete is wired. */
(function () {
  'use strict';

  var DB_NAME = 'pantry-tracker';
  var DB_VERSION = 1;
  var STORE = 'items';
  var LS_KEY = 'pantry.items.fallback';

  var useIDB = typeof indexedDB !== 'undefined';
  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
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

  function tx(mode) {
    return openDB().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
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

  // ---- Monthly restock log (on-device, keyed by YYYY-MM) ----
  // Kept in localStorage as a small JSON blob:
  //   { "2026-08": { restocked: n, consumed: n, shortfall: [ {name,missing,have,target} ] } }
  var MONTHLY_KEY = 'pantry.monthly.v1';

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

  window.PantryDB = {
    getAll: getAll,
    create: create,
    put: put,
    remove: remove,
    getMonthlyLog: getMonthlyLog,
    setMonthlyLog: setMonthlyLog,
  };
})();
