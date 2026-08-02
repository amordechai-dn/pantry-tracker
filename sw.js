/* Service worker: precache + cache-first, offline-capable, self-updating.
   Bump VERSION on every deploy to trigger an update for installed PWAs. */
var VERSION = 'v1.2.0';
var CACHE = 'pantry-' + VERSION;

var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './i18n.js',
  './db.js',
  './app.js',
  './pwa.js',
  './vendor/zxing.min.js',
  './data/foods.js',
  './manifest.webmanifest',
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
