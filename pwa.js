/* PWA glue: register the service worker, auto-update, and surface VERSION.
   Reloads exactly once when a new SW takes control (guarded). */
(function () {
  'use strict';

  // Fallback shown before the SW reports its authoritative VERSION.
  // Keep in sync with sw.js on deploy; the SW value overrides this at runtime.
  var FALLBACK_VERSION = 'v2.1.0';
  window.APP_VERSION = FALLBACK_VERSION;

  function setVersion(v) {
    window.APP_VERSION = v;
    var el = document.getElementById('version');
    if (el) el.textContent = v;
  }

  if (!('serviceWorker' in navigator)) return;

  // Reload once when the new SW takes over.
  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  // Receive broadcasts (e.g. version) from the SW.
  navigator.serviceWorker.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'VERSION' && e.data.version) {
      setVersion(e.data.version);
    }
  });

  function askVersion(sw) {
    if (!sw) return;
    try {
      var mc = new MessageChannel();
      mc.port1.onmessage = function (e) {
        if (e.data && e.data.version) setVersion(e.data.version);
      };
      sw.postMessage({ type: 'GET_VERSION' }, [mc.port2]);
    } catch (err) {
      /* ignore */
    }
  }

  // Ask a newly-installed waiting worker to activate immediately.
  function promote(sw) {
    if (sw && sw.state === 'installed' && navigator.serviceWorker.controller) {
      sw.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  function trackUpdates(reg) {
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    reg.addEventListener('updatefound', function () {
      var sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', function () {
        promote(sw);
      });
    });
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('./sw.js')
      .then(function (reg) {
        trackUpdates(reg);

        if (navigator.serviceWorker.controller) {
          askVersion(navigator.serviceWorker.controller);
        }
        navigator.serviceWorker.ready.then(function (r) {
          askVersion(r.active);
        });

        var update = function () {
          reg.update().catch(function () {});
        };
        window.addEventListener('focus', update);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') update();
        });
      })
      .catch(function (err) {
        console.warn('SW registration failed:', err);
      });
  });
})();
