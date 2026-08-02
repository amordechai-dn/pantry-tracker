/* Service worker: precache + cache-first, offline-capable, self-updating.
   Bump VERSION on every deploy to trigger an update for installed PWAs. */
var VERSION = 'v1.11.0';
var CACHE = 'pantry-' + VERSION;

// Critical-path assets for first paint + full offline. Kept lean: only what
// the app needs to boot and run offline. Runtime API responses (Open Food
// Facts lookups) are NOT cached here — they are persisted per-user in the
// IndexedDB `barcodes` store, so there is no duplicate/redundant caching.
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './i18n.js',
  './db.js',
  './auth.js',
  './app.js',
  './pwa.js',
  // Scanner library: precached so the lazy load (on first scanner open) still
  // resolves from cache offline, but it is NOT on the startup/parse path.
  './vendor/zxing.min.js',
  // Cross-device sync layer: precached so it resolves offline, but (like the
  // scanner) it is lazy-loaded only when a backend is configured + linked, so
  // it stays off the startup/parse path and the app is offline-first by default.
  './sync/homesync.js',
  './data/foods.js',
  './manifest.webmanifest',
  './icons/icon-16.png',
  './icons/icon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(ASSETS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== CACHE) return caches.delete(key);
            return null;
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req)
        .then(function (res) {
          return res;
        })
        .catch(function () {
          // Offline fallback for navigations.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return undefined;
        });
    })
  );
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
});
