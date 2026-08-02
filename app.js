/* HomeStock — Smart Home Inventory. Vanilla client-side app logic. Global `App`. */
(function () {
  'use strict';

  var t = window.I18N.t;
  var tc = window.I18N.tc;

  // ---- Static data ----
  var CATEGORIES = [
    { id: 'produce', emoji: '🥦' },
    { id: 'fruit', emoji: '🍎' },
    { id: 'dairy', emoji: '🧀' },
    { id: 'meat', emoji: '🥩' },
    { id: 'bakery', emoji: '🍞' },
    { id: 'dry', emoji: '🥫' },
    { id: 'frozen', emoji: '🧊' },
    { id: 'drinks', emoji: '🥤' },
    { id: 'snacks', emoji: '🍫' },
    { id: 'condiments', emoji: '🧂' },
    { id: 'other', emoji: '🍽️' },
  ];
  var LOCATIONS = [
    { id: 'Fridge', emoji: '🧊' },
    { id: 'Freezer', emoji: '❄️' },
    { id: 'Pantry', emoji: '🗄️' },
  ];
  var UNITS = ['pcs', 'pack', 'kg', 'g', 'L', 'ml', 'box', 'can'];

  function categoryEmoji(id) {
    for (var i = 0; i < CATEGORIES.length; i++)
      if (CATEGORIES[i].id === id) return CATEGORIES[i].emoji;
    return '🍽️';
  }

  // Emoji shown for an item: its specific emoji, else its category emoji.
  function itemEmoji(item) {
    return item.emoji || categoryEmoji(item.categoryId);
  }

  // Rounded visual for an item everywhere it appears: its on-device image if
  // present, otherwise the emoji placeholder. Never yields a broken image.
  function itemThumb(item, extraClass) {
    var cls = 'badge' + (extraClass ? ' ' + extraClass : '');
    var src = thumbImageFor(item);
    if (src) {
      var img = h('img', {
        class: 'thumb-img',
        src: src,
        alt: '',
        loading: 'lazy',
      });
      img.addEventListener('load', function () {
        img.classList.add('loaded');
      });
      return h('div', { class: cls + ' has-img' }, img);
    }
    return h('div', { class: cls, text: itemEmoji(item || {}) });
  }

  // Current user's avatar (image) or an initials tile. Used in header/profile.
  function avatarEl(extraClass) {
    var cls = 'avatar' + (extraClass ? ' ' + extraClass : '');
    var av = window.CurrentUser && window.CurrentUser.avatar();
    if (av) {
      return h('div', { class: cls + ' has-img' }, h('img', { class: 'avatar-img', src: av, alt: '' }));
    }
    return h('div', { class: cls, text: window.CurrentUser ? window.CurrentUser.initials() : '?' });
  }

  // ---- Local food database (autocomplete + emoji assignment) ----
  var FOODS = window.FOODS || [];

  // Precompute a lowercased search index per entry: [name, he, ...aliases].
  // Enables fast start-of-word matching across both languages + synonyms.
  FOODS.forEach(function (f) {
    var terms = [f.name.toLowerCase()];
    if (f.he) terms.push(f.he.toLowerCase());
    (f.aliases || []).forEach(function (a) {
      if (a) terms.push(String(a).toLowerCase());
    });
    f._s = terms;
  });

  function foodLabel(f) {
    return window.I18N.getLang() === 'he' && f.he ? f.he : f.name;
  }

  // ---- Language-aware naming ----
  // Detect the primary language of a free-text string by scanning for Hebrew
  // codepoints (U+0590–U+05FF). Anything without Hebrew letters is treated as
  // English (the app's only other language).
  function detectLang(str) {
    return /[\u0590-\u05FF]/.test(String(str || '')) ? 'he' : 'en';
  }

  // Resolve the display name of any name-bearing object (inventory item,
  // scan-session entry, barcode record, or monthly-shortfall snapshot) for the
  // active UI language, gracefully falling back across the multilingual fields
  // and the legacy single `name`. Fields recognised: nameHe/nameEn (items),
  // he/name (session + barcode + catalog).
  function localName(o) {
    if (!o) return '';
    if (window.I18N.getLang() === 'he')
      return o.nameHe || o.he || o.nameEn || o.name || '';
    return o.nameEn || o.name || o.nameHe || o.he || '';
  }
  // Alias kept expressive at call sites that operate on inventory items.
  var itemName = localName;

  // Given a typed/entered name plus any known bilingual pair (e.g. from a
  // catalog pick), produce the {nameEn, nameHe} to persist. When the pair is
  // unknown, detect the typed language, fill that side, and best-effort enrich
  // the other side from the bundled foods catalog. Never fabricates a bad
  // translation — the opposite side is left null for fallback if unknown.
  function resolveNames(typed, knownEn, knownHe) {
    typed = (typed || '').trim();
    var en = (knownEn || '').trim();
    var he = (knownHe || '').trim();
    if (en || he) return { nameEn: en || null, nameHe: he || null };
    if (!typed) return { nameEn: null, nameHe: null };
    var m = foodMatch(typed);
    if (detectLang(typed) === 'he') {
      return { nameHe: typed, nameEn: m && m.name ? m.name : null };
    }
    return { nameEn: typed, nameHe: m && m.he ? m.he : null };
  }

  // Best score for a query against an entry's search terms.
  // 0 = exact, 1 = starts-with, 2 = contains, -1 = no match.
  function scoreFood(f, q) {
    var best = -1;
    var terms = f._s;
    for (var i = 0; i < terms.length; i++) {
      var s = terms[i];
      var sc;
      if (s === q) sc = 0;
      else if (s.indexOf(q) === 0) sc = 1;
      else if (s.indexOf(q) !== -1) sc = 2;
      else continue;
      if (best === -1 || sc < best) best = sc;
      if (best === 0) break;
    }
    return best;
  }

  // Ranked matches for the autocomplete dropdown (EN + HE + aliases).
  function foodSearch(query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return [];
    var res = [];
    for (var i = 0; i < FOODS.length; i++) {
      var sc = scoreFood(FOODS[i], q);
      if (sc >= 0) res.push({ f: FOODS[i], score: sc });
    }
    res.sort(function (a, b) {
      return a.score - b.score || a.f.name.localeCompare(b.f.name);
    });
    return res.slice(0, 8).map(function (r) {
      return r.f;
    });
  }

  // Best-effort exact/prefix match used to auto-assign emoji/unit on save.
  function foodMatch(name) {
    var q = (name || '').trim().toLowerCase();
    if (!q) return null;
    var prefix = null;
    for (var i = 0; i < FOODS.length; i++) {
      var sc = scoreFood(FOODS[i], q);
      if (sc === 0) return FOODS[i];
      if (sc === 1 && !prefix) prefix = FOODS[i];
    }
    return prefix;
  }

  // Map Open Food Facts category tags to our category ids.
  function deriveCategory(tags) {
    var s = (tags || []).join(' ').toLowerCase();
    var rules = [
      ['dairy', ['dairies', 'dairy', 'milk', 'cheese', 'yogurt', 'egg']],
      ['meat', ['meat', 'fish', 'seafood', 'poultry', 'chicken', 'beef']],
      ['frozen', ['frozen']],
      ['drinks', ['beverage', 'drink', 'water', 'soda', 'juice', 'coffee', 'tea']],
      ['snacks', ['snack', 'chocolate', 'biscuit', 'confection', 'candy', 'sweet', 'chips', 'crisp']],
      ['bakery', ['bread', 'bakery', 'pastr', 'viennoiser']],
      ['fruit', ['fruit']],
      ['produce', ['vegetable', 'legume', 'salad']],
      ['dry', ['canned', 'tinned', 'cereal', 'pasta', 'rice', 'grocer', 'flour']],
      ['condiments', ['sauce', 'condiment', 'spice', 'seasoning', 'oil']],
    ];
    for (var i = 0; i < rules.length; i++) {
      var kws = rules[i][1];
      for (var j = 0; j < kws.length; j++) {
        if (s.indexOf(kws[j]) !== -1) return rules[i][0];
      }
    }
    return 'other';
  }

  // ---- tiny DOM helper ----
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function')
        el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      var list = Array.isArray(c) ? c : [c];
      list.forEach(function (child) {
        if (child == null) return;
        el.appendChild(
          typeof child === 'string' ? document.createTextNode(child) : child
        );
      });
    }
    return el;
  }

  function formatQty(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  // ---- Image pipeline (on-device compression, WebP-preferred, deduped) ----
  // Two resolutions are produced per image: a FULL variant for detail/edit and
  // a small THUMB variant for lists/cards. Encoding prefers WebP when the
  // browser supports it (much smaller than JPEG at equal quality) and falls
  // back to JPEG otherwise. Nothing leaves the device.
  var IMG_FULL_MAX = 512; // long-edge px for detail/edit resolution
  var IMG_THUMB_MAX = 96; // long-edge px for list/card resolution

  // Feature-detect WebP canvas export once and cache the result.
  var _webpOk = null;
  function webpSupported() {
    if (_webpOk !== null) return _webpOk;
    try {
      var c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      _webpOk = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {
      _webpOk = false;
    }
    return _webpOk;
  }

  function encodeCanvas(canvas, quality) {
    if (webpSupported()) {
      var w = canvas.toDataURL('image/webp', quality);
      if (w.indexOf('data:image/webp') === 0) return w;
    }
    return canvas.toDataURL('image/jpeg', quality);
  }

  function scaleToCanvas(img, max) {
    var scale = Math.min(1, max / Math.max(img.width, img.height));
    var w = Math.max(1, Math.round(img.width * scale));
    var hgt = Math.max(1, Math.round(img.height * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hgt;
    canvas.getContext('2d').drawImage(img, 0, 0, w, hgt);
    return canvas;
  }

  // Produce { full, thumb } data URLs from a loaded <img>. Returns null on error.
  function variantsFromImage(img) {
    try {
      return {
        full: encodeCanvas(scaleToCanvas(img, IMG_FULL_MAX), 0.72),
        thumb: encodeCanvas(scaleToCanvas(img, IMG_THUMB_MAX), 0.7),
      };
    } catch (e) {
      return null;
    }
  }

  // Compress an uploaded File/Blob entirely on-device. Calls cb({full,thumb})
  // on success or cb(null) on any failure.
  function processImage(file, cb) {
    var reader = new FileReader();
    reader.onerror = function () {
      cb(null);
    };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () {
        cb(null);
      };
      img.onload = function () {
        cb(variantsFromImage(img));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // Derive { full, thumb } from an existing data URL (used by the OFF/scanner
  // paths and the one-time inline-image migration). cb(null) on failure.
  function variantsFromDataUrl(dataUrl, cb) {
    if (!dataUrl) return cb(null);
    var img = new Image();
    img.onerror = function () {
      cb(null);
    };
    img.onload = function () {
      cb(variantsFromImage(img));
    };
    img.src = dataUrl;
  }

  // ---- Content-hash image de-duplication (per-user, shared image store) ----
  // Images are keyed by the SHA-256 of their full data URL, so an identical
  // photo used by many items is stored exactly once (dedup-on-write). Items
  // reference an image via item.imageHash. An in-memory map mirrors the store
  // so cards/lists render synchronously without per-item async reads.
  var imageMap = {}; // hash -> { hash, full, thumb }

  function sha256Hex(str) {
    try {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        var bytes = new TextEncoder().encode(str);
        return window.crypto.subtle
          .digest('SHA-256', bytes)
          .then(function (buf) {
            var arr = Array.prototype.slice.call(new Uint8Array(buf));
            return arr
              .map(function (b) {
                return b.toString(16).padStart(2, '0');
              })
              .join('');
          });
      }
    } catch (e) {}
    // Deterministic non-crypto fallback (still fine for dedup keying).
    var h = 5381;
    var i = str.length;
    while (i) h = (h * 33) ^ str.charCodeAt(--i);
    return Promise.resolve('f' + (h >>> 0).toString(16));
  }

  // Store a { full, thumb } pair de-duplicated by content hash; return the hash.
  function storeImagePair(pair) {
    if (!pair || !pair.full) return Promise.resolve(null);
    return sha256Hex(pair.full).then(function (hash) {
      if (imageMap[hash]) return hash; // already stored (dedup-on-write)
      var rec = { hash: hash, full: pair.full, thumb: pair.thumb || pair.full };
      imageMap[hash] = rec;
      return window.PantryDB.putImage(rec).then(function () {
        return hash;
      });
    });
  }

  // Persist an image given only a FULL data URL: derive a thumb, then dedup.
  function persistFullImage(full) {
    if (!full) return Promise.resolve(null);
    return new Promise(function (resolve) {
      variantsFromDataUrl(full, function (pair) {
        if (!pair) return resolve(null);
        storeImagePair(pair).then(resolve);
      });
    });
  }

  // Release an image when no remaining item references it (refcount-by-scan GC).
  function releaseImage(hash) {
    if (!hash) return Promise.resolve();
    var stillUsed = items.some(function (it) {
      return it.imageHash === hash;
    });
    if (stillUsed) return Promise.resolve();
    delete imageMap[hash];
    return window.PantryDB.deleteImage(hash);
  }

  // Resolve display sources for an item: hashed store first, then any legacy
  // inline image (pre-migration / scanner-session entries that carry .image).
  function fullImageFor(item) {
    if (!item) return null;
    if (item.imageHash && imageMap[item.imageHash])
      return imageMap[item.imageHash].full;
    return item.image || null;
  }
  function thumbImageFor(item) {
    if (!item) return null;
    if (item.imageHash && imageMap[item.imageHash]) {
      var r = imageMap[item.imageHash];
      return r.thumb || r.full;
    }
    return item.image || null;
  }

  // One-time migration: move any legacy inline item.image into the deduped
  // image store, set item.imageHash, and drop the inline copy. Per-user flag,
  // idempotent, and safe if interrupted (re-runs only over items still inline).
  function migrateInlineImages() {
    var uid = window.CurrentUser && window.CurrentUser.id();
    if (!uid) return Promise.resolve();
    var FLAG = 'pantry.imgmig.v1.' + uid;
    try {
      if (localStorage.getItem(FLAG)) return Promise.resolve();
    } catch (e) {}
    var pending = items.filter(function (i) {
      return i.image && !i.imageHash;
    });
    if (!pending.length) {
      try {
        localStorage.setItem(FLAG, '1');
      } catch (e) {}
      return Promise.resolve();
    }
    var chain = Promise.resolve();
    pending.forEach(function (it) {
      chain = chain.then(function () {
        return persistFullImage(it.image).then(function (hash) {
          // Only drop the inline copy once it is safely deduped — never lose it.
          if (!hash) return;
          it.imageHash = hash;
          it.image = null;
          return window.PantryDB.put(it);
        });
      });
    });
    return chain.then(function () {
      try {
        localStorage.setItem(FLAG, '1');
      } catch (e) {}
    });
  }

  // One-time migration: give legacy single-`name` items a bilingual pair.
  // Detects the language of the existing name, fills that side, and best-effort
  // enriches the other side from the bundled foods catalog. The legacy `name`
  // is always preserved (render fallback), so this is loss-free. Per-user flag,
  // idempotent, and interrupt-safe (only re-processes items still missing both
  // localized names).
  function migrateItemNames() {
    var uid = window.CurrentUser && window.CurrentUser.id();
    if (!uid) return Promise.resolve();
    var FLAG = 'pantry.namemig.v1.' + uid;
    try {
      if (localStorage.getItem(FLAG)) return Promise.resolve();
    } catch (e) {}
    var pending = items.filter(function (i) {
      return !i.nameEn && !i.nameHe && i.name;
    });
    if (!pending.length) {
      try {
        localStorage.setItem(FLAG, '1');
      } catch (e) {}
      return Promise.resolve();
    }
    var chain = Promise.resolve();
    pending.forEach(function (it) {
      chain = chain.then(function () {
        var resolved = resolveNames(it.name, null, null);
        // Never blank out the legacy name; only add the localized fields.
        it.nameEn = resolved.nameEn;
        it.nameHe = resolved.nameHe;
        return window.PantryDB.put(it);
      });
    });
    return chain.then(function () {
      try {
        localStorage.setItem(FLAG, '1');
      } catch (e) {}
    });
  }

  // ---- Lazy scanner library loader (ZXing, ~336KB) ----
  // Loaded only on first scanner open — kept off the startup/parse path. The
  // service worker precaches vendor/zxing.min.js, so this resolves from cache
  // offline too. Debounced via a single shared promise so it loads once.
  var zxingPromise = null;
  function loadZXing() {
    if (typeof ZXing !== 'undefined') return Promise.resolve(ZXing);
    if (zxingPromise) return zxingPromise;
    zxingPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = './vendor/zxing.min.js';
      s.async = true;
      s.onload = function () {
        if (typeof ZXing !== 'undefined') resolve(ZXing);
        else {
          zxingPromise = null;
          reject(new Error('ZXing unavailable after load'));
        }
      };
      s.onerror = function () {
        zxingPromise = null; // allow a retry on the next scanner open
        reject(new Error('Failed to load scanner library'));
      };
      document.head.appendChild(s);
    });
    return zxingPromise;
  }

  // ---- Reusable form controls (shared by add/edit form + scanner dialogs) ----

  // On-device photo control. `state` is mutated in place (state.imageFull /
  // state.imageThumb); the placeholder falls back to state.emoji or category.
  function photoControl(state) {
    var fileInput = h('input', { class: 'photo-file', type: 'file', accept: 'image/*' });
    var row = h('div', { class: 'photo-row' });
    function render() {
      row.innerHTML = '';
      var preview = state.imageThumb || state.imageFull;
      var tile = preview
        ? h(
            'div',
            { class: 'photo-preview has-img' },
            h('img', { class: 'thumb-img loaded', src: preview, alt: '' })
          )
        : h(
            'div',
            { class: 'photo-preview' },
            h('span', { text: state.emoji || categoryEmoji(state.categoryId) })
          );
      var addBtn = h(
        'button',
        { class: 'btn ghost', type: 'button', onclick: function () { fileInput.click(); } },
        preview ? t('form.changePhoto') : t('form.addPhoto')
      );
      var rm = preview
        ? h(
            'button',
            {
              class: 'btn ghost danger',
              type: 'button',
              onclick: function () { state.imageFull = null; state.imageThumb = null; render(); },
            },
            t('form.removePhoto')
          )
        : null;
      row.appendChild(tile);
      row.appendChild(h('div', { class: 'photo-actions' }, addBtn, rm));
    }
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      processImage(f, function (pair) {
        if (pair) { state.imageFull = pair.full; state.imageThumb = pair.thumb; render(); }
        else showToast(t('form.imageError'));
        fileInput.value = '';
      });
    });
    render();
    return { row: row, input: fileInput, render: render };
  }

  // A min-1 quantity stepper bound to get/set accessors.
  function stepperBox(get, set) {
    var val = h('span', { class: 'qty', text: formatQty(get()) });
    function upd() { val.textContent = formatQty(get()); }
    return h(
      'div',
      { class: 'qty-box' },
      h(
        'div',
        { class: 'stepper' },
        h('button', { class: 'step-btn', type: 'button', onclick: function () { set(Math.max(1, get() - 1)); upd(); } }, '−'),
        h('div', { class: 'step-value' }, val),
        h('button', { class: 'step-btn primary', type: 'button', onclick: function () { set(get() + 1); upd(); } }, '+')
      )
    );
  }

  // Category selection chips bound to get/set accessors.
  function categoryChips(get, set) {
    var chips = h('div', { class: 'chips' });
    CATEGORIES.forEach(function (cat) {
      chips.appendChild(
        h(
          'button',
          {
            class: 'chip' + (get() === cat.id ? ' active' : ''),
            type: 'button',
            onclick: function () {
              set(cat.id);
              Array.prototype.forEach.call(chips.children, function (c, idx) {
                c.className = 'chip' + (CATEGORIES[idx].id === cat.id ? ' active' : '');
              });
            },
          },
          h('span', { text: cat.emoji }),
          h('span', { text: t('categories.' + cat.id) })
        )
      );
    });
    return chips;
  }

  // Unit selection chips bound to get/set accessors.
  function unitChipsBox(get, set) {
    var chips = h('div', { class: 'chips' });
    UNITS.forEach(function (u) {
      chips.appendChild(
        h(
          'button',
          {
            class: 'chip unit' + (get() === u ? ' active' : ''),
            type: 'button',
            onclick: function () {
              set(u);
              Array.prototype.forEach.call(chips.children, function (c, idx) {
                c.className = 'chip unit' + (UNITS[idx] === u ? ' active' : '');
              });
            },
          },
          t('units.' + u)
        )
      );
    });
    return chips;
  }

  // ---- State ----
  var items = [];
  var root;

  function load() {
    return window.PantryDB.getAll()
      .then(function (arr) {
        // Normalize legacy records that predate desiredAmount.
        items = arr.map(function (i) {
          if (typeof i.desiredAmount !== 'number') i.desiredAmount = 0;
          if (typeof i.image === 'undefined') i.image = null; // migrate legacy
          return i;
        });
      })
      .then(function () {
        // Hydrate the in-memory image cache so cards render synchronously.
        return window.PantryDB.getAllImages();
      })
      .then(function (imgs) {
        imageMap = {};
        (imgs || []).forEach(function (r) {
          if (r && r.hash) imageMap[r.hash] = r;
        });
      });
  }

  // ================= Monthly restock tracking =================
  // A lightweight per-month log keyed by YYYY-MM:
  //   restocked = sum of quantity increases (stepper +, restock +, new items)
  //   consumed  = sum of quantity decreases (stepper -)
  //   shortfall = snapshot of items below their desired amount (par level)
  function ym(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function monthEntry(log, key) {
    if (!log[key]) log[key] = { restocked: 0, consumed: 0, shortfall: [] };
    if (typeof log[key].restocked !== 'number') log[key].restocked = 0;
    if (typeof log[key].consumed !== 'number') log[key].consumed = 0;
    if (!Array.isArray(log[key].shortfall)) log[key].shortfall = [];
    return log[key];
  }
  function recordDelta(delta) {
    if (!delta) return;
    var log = window.PantryDB.getMonthlyLog();
    var e = monthEntry(log, ym());
    if (delta > 0) e.restocked += delta;
    else e.consumed += -delta;
    window.PantryDB.setMonthlyLog(log);
  }
  function computeShortfall(src) {
    return (src || items)
      .filter(function (i) {
        return (i.desiredAmount || 0) > 0 && i.quantity < i.desiredAmount;
      })
      .map(function (i) {
        return {
          id: i.id,
          name: i.name,
          // Snapshot both names so past months render correctly in either
          // language even after the item is edited or removed.
          nameEn: i.nameEn || null,
          nameHe: i.nameHe || null,
          emoji: itemEmoji(i),
          missing: i.desiredAmount - i.quantity,
          have: i.quantity,
          target: i.desiredAmount,
        };
      });
  }
  function recomputeShortfall() {
    var log = window.PantryDB.getMonthlyLog();
    var e = monthEntry(log, ym());
    e.shortfall = computeShortfall();
    window.PantryDB.setMonthlyLog(log);
  }

  // Targeted-render caches: the DOM node per item id + the "To restock" section
  // container. A quantity change updates only the affected card (O(1)) and
  // rebuilds just the restock section (O(shortfall)) instead of re-rendering
  // the entire list (O(n)) on every tap.
  var cardRefs = {};

  // ---- Responsive layout / shared Shopping List ----
  // The "To restock" list (items below their target) IS the Shopping List. It
  // is rendered by ONE shared renderer (renderShoppingList) used in two modes:
  //   - 'sidebar' : desktop side panel next to inventory (>= BREAKPOINT)
  //   - 'page'    : mobile dedicated full-width page (< BREAKPOINT)
  // Only one instance is ever mounted at a time (tracked by shoppingListEl).
  var BREAKPOINT = 1024;
  var mqWide = null; // cached MediaQueryList
  var shoppingListEl = null; // the currently-mounted shared list container
  var shoppingListMode = null; // 'sidebar' | 'page'
  var currentView = 'inventory'; // mobile page selection ('inventory'|'shopping')
  var SHOP_COLLAPSE_KEY = 'pantry.shoppingPanel.collapsed';

  // Pure breakpoint mapping (space-based, no user-agent sniffing) — testable.
  function layoutModeForWidth(w) {
    return w >= BREAKPOINT ? 'sidebar' : 'page';
  }
  function isWide() {
    if (!mqWide && typeof window.matchMedia === 'function') {
      mqWide = window.matchMedia('(min-width: ' + BREAKPOINT + 'px)');
    }
    return mqWide ? mqWide.matches : false;
  }
  function shopCollapsed() {
    try {
      return localStorage.getItem(SHOP_COLLAPSE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }
  function setShopCollapsed(v) {
    try {
      localStorage.setItem(SHOP_COLLAPSE_KEY, v ? '1' : '0');
    } catch (e) {}
  }

  // THE single shared Shopping List renderer (both sidebar + page modes).
  function renderShoppingList(container, mode) {
    shoppingListEl = container;
    shoppingListMode = mode;
    container.innerHTML = '';
    var collapsed = mode === 'sidebar' && shopCollapsed();
    var shortfall = computeShortfall();

    var head = h(
      'div',
      { class: 'shopping-head' },
      h('span', { class: 'shopping-emoji', 'aria-hidden': 'true', text: '🛒' }),
      h('h2', { class: 'shopping-title', text: t('shopping.title') }),
      h('span', { class: 'section-count', text: String(shortfall.length) })
    );
    if (mode === 'sidebar') {
      head.appendChild(
        h(
          'button',
          {
            class: 'shopping-collapse',
            type: 'button',
            'aria-label': collapsed ? t('shopping.expand') : t('shopping.collapse'),
            title: collapsed ? t('shopping.expand') : t('shopping.collapse'),
            onclick: function () {
              setShopCollapsed(!collapsed);
              var panel = document.querySelector('.shopping-panel');
              if (panel) panel.classList.toggle('collapsed', shopCollapsed());
              renderShoppingList(container, mode);
            },
          },
          collapsed ? '»' : '«'
        )
      );
    }
    container.appendChild(head);
    if (collapsed) return; // header-only when collapsed

    // Add-item control — reuses the existing add form (no second implementation).
    container.appendChild(
      h(
        'button',
        {
          class: 'btn ghost shopping-add',
          type: 'button',
          onclick: function () { openForm(null); },
        },
        '＋ ' + t('shopping.addItem')
      )
    );

    if (!shortfall.length) {
      container.appendChild(
        h(
          'div',
          { class: 'shopping-empty' },
          h('div', { class: 'shopping-empty-emoji', 'aria-hidden': 'true', text: '🎉' }),
          h('div', { class: 'shopping-empty-text', text: t('shopping.empty') })
        )
      );
      return;
    }
    var listWrap = h('div', { class: 'shopping-items' });
    shortfall.forEach(function (s) {
      listWrap.appendChild(renderShoppingRow(itemById(s.id), s));
    });
    container.appendChild(listWrap);
  }

  // One row of the shared Shopping List. Reuses inventory item data + actions.
  function renderShoppingRow(item, s) {
    var unit = t('units.' + item.unit);
    var checkbox = h('input', {
      type: 'checkbox',
      class: 'shopping-check',
      'aria-label': t('shopping.markRestocked'),
    });
    checkbox.addEventListener('change', function () { completeRestock(item); });
    var quick = h(
      'button',
      {
        class: 'step-btn primary',
        'aria-label': t('a11y.increase'),
        onclick: function (e) { e.stopPropagation(); changeQty(item, 1); },
      },
      '+'
    );
    var remove = h(
      'button',
      {
        class: 'shopping-remove',
        'aria-label': t('shopping.remove'),
        title: t('shopping.remove'),
        onclick: function (e) { e.stopPropagation(); removeFromShopping(item); },
      },
      '✕'
    );
    return h(
      'div',
      {
        class: 'card shopping-row',
        onclick: function () { openForm(item); },
      },
      checkbox,
      itemThumb(item),
      h(
        'div',
        { class: 'card-info' },
        h('div', { class: 'card-name', dir: 'auto', text: itemName(item) }),
        h('div', {
          class: 'card-meta',
          text: t('shopping.need', { missing: formatQty(s.missing), unit: unit }),
        })
      ),
      remove,
      quick
    );
  }

  // Mark an item as restocked from the shopping list: fill it up to its target.
  function completeRestock(item) {
    var target = item.desiredAmount || 0;
    if (target <= item.quantity) return;
    var delta = target - item.quantity;
    item.quantity = target;
    window.PantryDB.put(item);
    recordDelta(delta);
    recomputeShortfall();
    refreshAfterMutation(item);
  }

  // Remove an item from the shopping list without buying: lower its target to
  // the current quantity so it is no longer "below target". Reversible via undo.
  function removeFromShopping(item) {
    var prevTarget = item.desiredAmount;
    item.desiredAmount = item.quantity;
    window.PantryDB.put(item);
    recomputeShortfall();
    refreshAfterMutation(item);
    showToast(t('shopping.removed'), function () {
      item.desiredAmount = prevTarget;
      window.PantryDB.put(item);
      recomputeShortfall();
      refreshAfterMutation(item);
    });
  }

  // Re-render the current base screen (mobile page vs. inventory+panel) without
  // reloading data — used on breakpoint crossing and language change.
  function renderCurrentView() {
    if (currentView === 'shopping' && !isWide()) renderShopping();
    else renderMain();
  }

  // After a data mutation: update the affected inventory card (if mounted) and
  // the shared shopping list (if mounted). One list instance, one data source.
  function refreshAfterMutation(item) {
    var updatedCard = false;
    if (item) {
      var node = cardRefs[item.id];
      if (node && node.parentNode) {
        var fresh = renderCard(item);
        cardRefs[item.id] = fresh;
        node.parentNode.replaceChild(fresh, node);
        updatedCard = true;
      }
    }
    var updatedShop = false;
    if (shoppingListEl && shoppingListEl.parentNode) {
      renderShoppingList(shoppingListEl, shoppingListMode);
      updatedShop = true;
    }
    if (!updatedCard && !updatedShop) renderCurrentView();
  }

  // Shopping List nav. Desktop: focus/expand the in-place side panel (no
  // navigation away from inventory). Mobile: open the dedicated page.
  function openShopping() {
    if (isWide()) {
      currentView = 'inventory';
      var panel = document.querySelector('.shopping-panel');
      if (panel) {
        if (shopCollapsed()) {
          setShopCollapsed(false);
          panel.classList.remove('collapsed');
          if (shoppingListEl) renderShoppingList(shoppingListEl, shoppingListMode);
        }
        panel.classList.add('flash');
        try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
        setTimeout(function () { panel.classList.remove('flash'); }, 1200);
      }
    } else {
      currentView = 'shopping';
      renderShopping();
    }
  }

  // Mobile dedicated Shopping List page (same shared renderer, 'page' mode).
  function renderShopping() {
    if (!root) root = document.getElementById('root');
    currentView = 'shopping';
    root.innerHTML = '';
    root.appendChild(
      screenTopBar(t('shopping.title'), function () {
        currentView = 'inventory';
        renderMain();
      })
    );
    var page = h('div', { class: 'shopping-page' });
    renderShoppingList(page, 'page');
    root.appendChild(page);
    // Keep the quick Add affordance available on the page too.
    root.appendChild(
      h(
        'button',
        {
          class: 'fab',
          'aria-label': t('fab.add'),
          onclick: function () { openForm(null); },
        },
        '+'
      )
    );
  }

  // ---- Rendering (main screen) ----
  // Reopener for the top-most state-preserving modal. Each such dialog sets
  // this to a closure that re-creates itself with a snapshot of its in-progress
  // state, and restores the previous value on close (so nested dialogs unwind
  // correctly). On a language change we re-run it after the base re-render so
  // the open dialog comes back translated with its state intact.
  var reopenTop = null;

  // Immediate, full, no-refresh re-render of the entire visible UI in the new
  // language. Preserves: which base screen is shown (picker vs. inventory),
  // the active user, scroll position, and any open state-preserving dialog.
  function changeLanguage(l) {
    if (l !== 'en' && l !== 'he') return;
    if (window.I18N.getLang() === l) return;
    var reopen = reopenTop; // capture before overlays are torn down
    var y = window.scrollY || 0;
    window.I18N.setLang(l); // updates <html lang/dir> + persists per user
    // Tear down existing overlays/toasts; tracked dialogs are rebuilt below.
    Array.prototype.slice
      .call(document.querySelectorAll('.overlay, .toast'))
      .forEach(function (o) {
        o.remove();
      });
    reopenTop = null;
    // Re-render whichever base screen is currently active (inventory+panel,
    // the mobile Shopping page, or the picker).
    if (window.CurrentUser && window.CurrentUser.id()) renderCurrentView();
    else renderSwitchUser();
    try {
      window.scrollTo(0, y);
    } catch (e) {}
    if (reopen) reopen(); // bring back the open dialog, translated + stateful
  }

  function renderMain() {
    if (!root) root = document.getElementById('root');
    root.innerHTML = '';

    var sections = LOCATIONS.map(function (loc) {
      return {
        loc: loc,
        data: items.filter(function (i) {
          return i.location === loc.id;
        }),
      };
    }).filter(function (s) {
      return s.data.length > 0;
    });

    var total = items.length;
    var subtitle =
      total === 0
        ? t('summary.empty')
        : t('summary.across', {
            items: tc('summary.items', total),
            locations: tc('summary.locations', sections.length),
          });

    // Header
    var langBtn = h(
      'button',
      {
        class: 'lang-btn',
        'aria-label': t('language.a11y'),
        // Wrap so the click event isn't passed as the re-render callback.
        onclick: function () { openLang(renderMain); },
      },
      '🌐 ' + (window.I18N.getLang() === 'he' ? 'עב' : 'EN')
    );
    var monthlyBtn = h(
      'button',
      {
        class: 'icon-btn',
        'aria-label': t('monthly.button'),
        title: t('monthly.button'),
        onclick: openMonthly,
      },
      '📅'
    );
    // Shopping List entry point. Desktop: focus/expand the side panel in place.
    // Mobile: open the dedicated Shopping List page.
    var shoppingBtn = h(
      'button',
      {
        class: 'icon-btn',
        'aria-label': t('shopping.title'),
        title: t('shopping.title'),
        onclick: openShopping,
      },
      '🛒'
    );
    var settingsBtn = h(
      'button',
      {
        class: 'icon-btn',
        'aria-label': t('settings.a11y'),
        title: t('settings.title'),
        onclick: openSettings,
      },
      '⚙️'
    );
    // Subtle sync-status indicator. Only present when a backend is configured —
    // otherwise sync is fully dormant and nothing is shown.
    var syncBtn = syncConfigured()
      ? h(
          'button',
          {
            class: 'icon-btn sync-indicator',
            id: 'sync-indicator',
            'aria-label': t('sync.a11y'),
            title: t('sync.title'),
            onclick: openSyncSettings,
          },
          syncStatusGlyph(syncMgr ? syncMgr.status : 'idle')
        )
      : null;

    // Header avatar is now a pure ONE-TAP entry to the Switch User screen.
    var profileBtn = h(
      'button',
      {
        class: 'icon-btn profile-btn',
        'aria-label': t('auth.switchUser'),
        title: t('auth.switchUser'),
        onclick: renderSwitchUser,
      },
      avatarEl('sm')
    );

    var header = h(
      'header',
      { class: 'header' },
      h(
        'div',
        { class: 'header-text' },
        h('h1', { class: 'title', text: t('app.title') }),
        h('p', { class: 'subtitle', text: subtitle })
      ),
      h(
        'div',
        { class: 'header-actions' },
        h('div', { class: 'header-btn-row' }, monthlyBtn, shoppingBtn, langBtn, syncBtn, settingsBtn, profileBtn),
        h('span', { class: 'version', id: 'version', text: window.APP_VERSION || '' })
      )
    );
    root.appendChild(header);

    // Body: responsive two-column layout. The grid collapses to a single column
    // below the breakpoint (CSS), and the side panel is only mounted on wide
    // screens — on narrow screens the Shopping List lives on its own page.
    var layout = h('div', { class: 'main-layout' });
    var content = h('div', { class: 'content-col' });

    if (total === 0) {
      content.appendChild(
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'empty-emoji', text: '🧺' }),
          h('div', { class: 'empty-title', text: t('empty.title') }),
          h('div', { class: 'empty-body', text: t('empty.body') })
        )
      );
    } else {
      var list = h('div', { class: 'list' });
      cardRefs = {};
      sections.forEach(function (s) {
        list.appendChild(
          h(
            'div',
            { class: 'section-header' },
            h('span', { class: 'section-emoji', text: s.loc.emoji }),
            h('span', {
              class: 'section-title',
              text: t('locations.' + s.loc.id),
            }),
            h('span', { class: 'section-count', text: String(s.data.length) })
          )
        );
        s.data.forEach(function (item) {
          var card = renderCard(item);
          cardRefs[item.id] = card; // for targeted qty updates
          list.appendChild(card);
        });
      });
      content.appendChild(list);
    }
    layout.appendChild(content);

    // Desktop: mount the ONE shared Shopping List as a sticky side panel.
    // Mobile: leave it unmounted here (it opens as a dedicated page instead).
    if (isWide()) {
      var aside = h('aside', {
        class: 'shopping-panel' + (shopCollapsed() ? ' collapsed' : ''),
      });
      var inner = h('div', { class: 'shopping-panel-inner' });
      renderShoppingList(inner, 'sidebar');
      aside.appendChild(inner);
      layout.appendChild(aside);
    } else {
      shoppingListEl = null;
      shoppingListMode = null;
    }
    root.appendChild(layout);

    // Floating actions: Scan (above) + Add.
    root.appendChild(
      h(
        'button',
        {
          class: 'fab scan',
          'aria-label': t('scan.button'),
          title: t('scan.button'),
          onclick: openScanner,
        },
        '📷'
      )
    );
    root.appendChild(
      h(
        'button',
        {
          class: 'fab',
          'aria-label': t('fab.add'),
          onclick: function () {
            openForm(null);
          },
        },
        '+'
      )
    );
  }

  function itemById(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function renderCard(item) {
    var isOut = item.quantity <= 0;
    var unitLabel = t('units.' + item.unit);

    var stepper = h(
      'div',
      { class: 'stepper' },
      h(
        'button',
        {
          class: 'step-btn' + (item.quantity <= 0 ? ' disabled' : ''),
          'aria-label': t('a11y.decrease'),
          onclick: function (e) {
            e.stopPropagation();
            changeQty(item, -1);
          },
        },
        '−'
      ),
      h(
        'div',
        { class: 'step-value' },
        h('span', { class: 'qty', text: formatQty(item.quantity) }),
        h('span', { class: 'qty-unit', text: unitLabel })
      ),
      h(
        'button',
        {
          class: 'step-btn primary',
          'aria-label': t('a11y.increase'),
          onclick: function (e) {
            e.stopPropagation();
            changeQty(item, 1);
          },
        },
        '+'
      )
    );

    var meta = h(
      'div',
      { class: 'card-meta' },
      h('span', { text: t('categories.' + item.categoryId) }),
      (item.desiredAmount || 0) > 0
        ? h('span', { class: 'target-pill', text: '🎯 ' + formatQty(item.desiredAmount) })
        : null,
      isOut ? h('span', { class: 'out-pill', text: t('card.out') }) : null
    );

    return h(
      'div',
      {
        class: 'card',
        onclick: function () {
          openForm(item);
        },
      },
      itemThumb(item),
      h(
        'div',
        { class: 'card-info' },
        h('div', { class: 'card-name', dir: 'auto', text: itemName(item) }),
        meta
      ),
      stepper
    );
  }

  function renderRestockCard(item, s) {
    return h(
      'div',
      {
        class: 'card restock-card',
        onclick: function () {
          openForm(item);
        },
      },
      itemThumb(item),
      h(
        'div',
        { class: 'card-info' },
        h('div', { class: 'card-name', dir: 'auto', text: itemName(item) }),
        h('div', {
          class: 'card-meta',
          text: t('restock.missing', {
            missing: formatQty(s.missing),
            have: formatQty(s.have),
            target: formatQty(s.target),
          }),
        })
      ),
      h(
        'button',
        {
          class: 'step-btn primary big',
          'aria-label': t('a11y.increase'),
          onclick: function (e) {
            e.stopPropagation();
            changeQty(item, 1);
          },
        },
        '+'
      )
    );
  }

  // ---- Actions ----
  function changeQty(item, delta) {
    var before = item.quantity;
    item.quantity = Math.max(0, item.quantity + delta);
    var real = item.quantity - before;
    if (!real) return; // e.g. minus at 0 — nothing to persist or re-render
    window.PantryDB.put(item);
    recordDelta(real);
    recomputeShortfall();
    // Targeted update: refresh just the affected inventory card (O(1)) and the
    // mounted shared Shopping List (O(shortfall)) — never a full re-render.
    refreshAfterMutation(item);
  }

  function refresh() {
    return load().then(function () {
      recomputeShortfall();
      renderMain();
    });
  }

  // ---- Add / Edit form (modal) ----
  function openForm(existing, opts) {
    opts = opts || {};
    var prefill = opts.prefill || {};
    var editing = !!existing;
    // A language change re-opens this dialog with a live snapshot via
    // opts.stateOverride, preserving in-progress edits.
    var state = opts.stateOverride || {
      // Display name shown in the input: the active-language name for an
      // existing item, else the prefill.
      name: editing ? itemName(existing) : prefill.name || '',
      // Bilingual pair carried through save (null when unknown → fallback).
      nameEn: editing ? existing.nameEn || null : prefill.nameEn || null,
      nameHe: editing ? existing.nameHe || null : prefill.nameHe || null,
      quantity: editing ? existing.quantity : 1,
      unit: editing ? existing.unit : 'pcs',
      categoryId: editing ? existing.categoryId : prefill.categoryId || 'other',
      location: editing ? existing.location : prefill.location || 'Pantry',
      note: editing ? existing.note || '' : '',
      desiredAmount: editing ? existing.desiredAmount || 0 : 0,
      barcode: editing ? existing.barcode || null : prefill.barcode || null,
      emoji: editing ? existing.emoji || null : prefill.emoji || null,
      // Deduped image: full for detail/edit, thumb for the preview tile.
      imageFull: editing ? fullImageFor(existing) : prefill.imageFull || prefill.image || null,
      imageThumb: editing ? thumbImageFor(existing) : prefill.imageThumb || prefill.image || null,
    };

    var overlay = h('div', { class: 'overlay' });
    var sheet = h('div', { class: 'sheet' });

    // Register a state-preserving reopener so a mid-edit language change brings
    // the dialog back translated with current values intact.
    var prevReopen = reopenTop;
    var myReopen = function () {
      openForm(existing, {
        prefill: prefill,
        stateOverride: {
          name: nameInput.value,
          nameEn: state.nameEn,
          nameHe: state.nameHe,
          quantity: state.quantity,
          unit: state.unit,
          categoryId: state.categoryId,
          location: state.location,
          note: noteInput.value,
          desiredAmount: state.desiredAmount,
          barcode: state.barcode,
          emoji: state.emoji,
          imageFull: state.imageFull,
          imageThumb: state.imageThumb,
        },
      });
    };
    reopenTop = myReopen;

    function close() {
      overlay.remove();
      if (reopenTop === myReopen) reopenTop = prevReopen;
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    sheet.appendChild(h('div', { class: 'grabber' }));
    sheet.appendChild(
      h(
        'div',
        { class: 'sheet-header' },
        h('h2', {
          class: 'sheet-title',
          text: editing ? t('form.editTitle') : t('form.addTitle'),
        }),
        h('button', { class: 'sheet-close', 'aria-label': t('a11y.close'), onclick: close }, '✕')
      )
    );

    var body = h('div', { class: 'sheet-body' });

    // Photo — on-device image with emoji placeholder fallback.
    body.appendChild(h('label', { class: 'field-label', text: t('form.photo') }));
    var photo = photoControl(state);
    function renderPhoto() {
      photo.render();
    }
    body.appendChild(photo.row);
    body.appendChild(photo.input);

    // Name + autocomplete
    var nameInput = h('input', {
      class: 'input',
      type: 'text',
      dir: 'auto',
      value: state.name,
      placeholder: t('form.namePlaceholder'),
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
    });
    var acBox = h('div', { class: 'ac-box', style: 'display:none' });
    var suggestions = [];
    var activeIdx = -1;

    // Applies a chosen food: fills name, emoji, category, and default unit.
    function applyFood(f) {
      nameInput.value = foodLabel(f);
      state.name = nameInput.value;
      // Catalog picks carry a known bilingual pair — store both sides.
      state.nameEn = f.name || null;
      state.nameHe = f.he || null;
      state.emoji = f.emoji || null;
      if (f.category) {
        state.categoryId = f.category;
        Array.prototype.forEach.call(chips.children, function (c, idx) {
          c.className =
            'chip' + (CATEGORIES[idx].id === f.category ? ' active' : '');
        });
      }
      if (f.unit && UNITS.indexOf(f.unit) !== -1) {
        state.unit = f.unit;
        if (qtyUnit) qtyUnit.textContent = t('units.' + f.unit);
        if (unitChips)
          Array.prototype.forEach.call(unitChips.children, function (c, idx) {
            c.className = 'chip unit' + (UNITS[idx] === f.unit ? ' active' : '');
          });
      }
      renderPhoto();
      closeAc();
    }

    function closeAc() {
      suggestions = [];
      activeIdx = -1;
      acBox.style.display = 'none';
      acBox.innerHTML = '';
    }

    function renderAc() {
      acBox.innerHTML = '';
      var q = nameInput.value.trim();
      if (!q) {
        acBox.style.display = 'none';
        return;
      }
      suggestions = foodSearch(q);
      if (!suggestions.length) {
        // Only show a "no matches" hint once the query is meaningful.
        if (q.length >= 2) {
          acBox.style.display = 'block';
          acBox.appendChild(h('div', { class: 'ac-none', text: t('autocomplete.none') }));
        } else {
          acBox.style.display = 'none';
        }
        return;
      }
      acBox.style.display = 'block';
      acBox.appendChild(
        h('div', { class: 'ac-head', text: t('autocomplete.suggestions') })
      );
      suggestions.forEach(function (f, idx) {
        acBox.appendChild(
          h(
            'div',
            {
              class: 'ac-item' + (idx === activeIdx ? ' active' : ''),
              // Use mousedown/touchstart so it fires before input blur.
              onmousedown: function (e) {
                e.preventDefault();
                applyFood(f);
              },
            },
            h('span', { class: 'ac-emoji', text: f.emoji }),
            h('span', { class: 'ac-name', dir: 'auto', text: foodLabel(f) })
          )
        );
      });
    }

    var acTimer;
    nameInput.addEventListener('input', function () {
      state.name = nameInput.value;
      state.emoji = null; // typing invalidates a previously chosen emoji
      // Manual edits invalidate a previously chosen catalog pair; the correct
      // bilingual pair is recomputed from the typed text on save.
      state.nameEn = null;
      state.nameHe = null;
      nameInput.classList.remove('error');
      clearTimeout(acTimer);
      acTimer = setTimeout(renderAc, 120);
    });
    nameInput.addEventListener('keydown', function (e) {
      if (acBox.style.display === 'none' || !suggestions.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % suggestions.length;
        renderAc();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + suggestions.length) % suggestions.length;
        renderAc();
      } else if (e.key === 'Enter') {
        if (activeIdx >= 0) {
          e.preventDefault();
          applyFood(suggestions[activeIdx]);
        }
      } else if (e.key === 'Escape') {
        closeAc();
      }
    });
    nameInput.addEventListener('blur', function () {
      setTimeout(closeAc, 150);
    });

    body.appendChild(h('label', { class: 'field-label', text: t('form.name') }));
    body.appendChild(nameInput);
    body.appendChild(acBox);

    // Location segmented
    body.appendChild(
      h('label', { class: 'field-label', text: t('form.location') })
    );
    var seg = h('div', { class: 'segment' });
    LOCATIONS.forEach(function (loc) {
      seg.appendChild(
        h(
          'button',
          {
            class: 'segment-item' + (state.location === loc.id ? ' active' : ''),
            type: 'button',
            onclick: function () {
              state.location = loc.id;
              Array.prototype.forEach.call(seg.children, function (c, idx) {
                c.className =
                  'segment-item' +
                  (LOCATIONS[idx].id === loc.id ? ' active' : '');
              });
            },
          },
          h('span', { text: loc.emoji }),
          h('span', { text: t('locations.' + loc.id) })
        )
      );
    });
    body.appendChild(seg);

    // Category chips
    body.appendChild(
      h('label', { class: 'field-label', text: t('form.category') })
    );
    var chips = h('div', { class: 'chips' });
    CATEGORIES.forEach(function (cat) {
      chips.appendChild(
        h(
          'button',
          {
            class: 'chip' + (state.categoryId === cat.id ? ' active' : ''),
            type: 'button',
            onclick: function () {
              state.categoryId = cat.id;
              Array.prototype.forEach.call(chips.children, function (c, idx) {
                c.className =
                  'chip' + (CATEGORIES[idx].id === cat.id ? ' active' : '');
              });
              renderPhoto(); // placeholder emoji tracks the category
            },
          },
          h('span', { text: cat.emoji }),
          h('span', { text: t('categories.' + cat.id) })
        )
      );
    });
    body.appendChild(chips);

    // Quantity stepper
    body.appendChild(
      h('label', { class: 'field-label', text: t('form.quantity') })
    );
    var qtyVal = h('span', { class: 'qty', text: formatQty(state.quantity) });
    var qtyUnit = h('span', { class: 'qty-unit', text: t('units.' + state.unit) });
    body.appendChild(
      h(
        'div',
        { class: 'qty-box' },
        h(
          'div',
          { class: 'stepper' },
          h(
            'button',
            {
              class: 'step-btn',
              type: 'button',
              onclick: function () {
                state.quantity = Math.max(0, state.quantity - 1);
                qtyVal.textContent = formatQty(state.quantity);
              },
            },
            '−'
          ),
          h('div', { class: 'step-value' }, qtyVal, qtyUnit),
          h(
            'button',
            {
              class: 'step-btn primary',
              type: 'button',
              onclick: function () {
                state.quantity = state.quantity + 1;
                qtyVal.textContent = formatQty(state.quantity);
              },
            },
            '+'
          )
        )
      )
    );

    // Unit chips
    var unitChips = h('div', { class: 'chips' });
    UNITS.forEach(function (u) {
      unitChips.appendChild(
        h(
          'button',
          {
            class: 'chip unit' + (state.unit === u ? ' active' : ''),
            type: 'button',
            onclick: function () {
              state.unit = u;
              qtyUnit.textContent = t('units.' + u);
              Array.prototype.forEach.call(unitChips.children, function (c, idx) {
                c.className = 'chip unit' + (UNITS[idx] === u ? ' active' : '');
              });
            },
          },
          t('units.' + u)
        )
      );
    });
    body.appendChild(unitChips);

    // Desired amount (par level / monthly target)
    body.appendChild(
      h('label', { class: 'field-label', text: t('form.desired') })
    );
    var desVal = h('span', { class: 'qty', text: formatQty(state.desiredAmount) });
    body.appendChild(
      h(
        'div',
        { class: 'qty-box' },
        h(
          'div',
          { class: 'stepper' },
          h(
            'button',
            {
              class: 'step-btn',
              type: 'button',
              onclick: function () {
                state.desiredAmount = Math.max(0, state.desiredAmount - 1);
                desVal.textContent = formatQty(state.desiredAmount);
              },
            },
            '−'
          ),
          h('div', { class: 'step-value' }, desVal),
          h(
            'button',
            {
              class: 'step-btn primary',
              type: 'button',
              onclick: function () {
                state.desiredAmount = state.desiredAmount + 1;
                desVal.textContent = formatQty(state.desiredAmount);
              },
            },
            '+'
          )
        )
      )
    );

    // Note
    body.appendChild(h('label', { class: 'field-label', text: t('form.note') }));
    var noteInput = h('textarea', {
      class: 'input note',
      placeholder: t('form.notePlaceholder'),
    });
    noteInput.value = state.note;
    body.appendChild(noteInput);

    if (editing) {
      body.appendChild(
        h(
          'button',
          {
            class: 'delete-btn',
            type: 'button',
            onclick: function () {
              confirmDelete(existing, close);
            },
          },
          t('form.delete')
        )
      );
    }

    sheet.appendChild(body);

    function save() {
      var name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        nameInput.classList.add('error');
        return;
      }
      // Best-effort emoji when the user didn't pick a suggestion.
      var emoji = state.emoji;
      if (!emoji) {
        var m = foodMatch(name);
        if (m) {
          emoji = m.emoji;
          if (state.categoryId === 'other' && m.category)
            state.categoryId = m.category;
        }
      }
      // Resolve the bilingual pair: use the catalog pick if still valid,
      // otherwise detect the typed language and enrich from the catalog.
      var names = resolveNames(name, state.nameEn, state.nameHe);
      function finalize(imageHash) {
        var payload = {
          name: name,
          nameEn: names.nameEn,
          nameHe: names.nameHe,
          quantity: state.quantity,
          unit: state.unit,
          categoryId: state.categoryId,
          location: state.location,
          note: noteInput.value.trim() || null,
          desiredAmount: state.desiredAmount,
          barcode: state.barcode,
          emoji: emoji || null,
          imageHash: imageHash || null,
        };
        var p;
        if (editing) {
          var prevHash = existing.imageHash || null;
          Object.keys(payload).forEach(function (k) {
            existing[k] = payload[k];
          });
          existing.image = null; // drop any legacy inline copy
          p = window.PantryDB.put(existing).then(function () {
            // GC the previous image if this was its last reference.
            if (prevHash && prevHash !== imageHash) return releaseImage(prevHash);
          });
        } else {
          p = window.PantryDB.create(payload).then(function (item) {
            // Adding a new item counts as restocking that quantity.
            if (item.quantity) recordDelta(item.quantity);
            return item;
          });
        }
        p.then(function () {
          close();
          refresh();
        });
      }

      // Persist the (possibly new/unchanged) image first, deduped by hash.
      if (state.imageFull) {
        storeImagePair({ full: state.imageFull, thumb: state.imageThumb }).then(finalize);
      } else {
        finalize(null);
      }
    }

    sheet.appendChild(
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          { class: 'btn cancel', type: 'button', onclick: close },
          t('form.cancel')
        ),
        h(
          'button',
          { class: 'btn save', type: 'button', onclick: save },
          editing ? t('form.save') : t('form.create')
        )
      )
    );

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    if (!editing && !state.name)
      setTimeout(function () {
        nameInput.focus();
      }, 50);
  }

  // ---- Delete confirm ----
  function confirmDelete(item, afterClose) {
    var overlay = h('div', { class: 'overlay center' });
    function close() {
      overlay.remove();
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    var dialog = h(
      'div',
      { class: 'dialog' },
      h('h2', { class: 'dialog-title', text: t('deleteConfirm.title') }),
      h('p', {
        class: 'dialog-msg',
        text: t('deleteConfirm.message', { name: itemName(item) }),
      }),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          { class: 'btn cancel', type: 'button', onclick: close },
          t('deleteConfirm.cancel')
        ),
        h(
          'button',
          {
            class: 'btn danger',
            type: 'button',
            onclick: function () {
              window.PantryDB.remove(item.id).then(function () {
                close();
                if (afterClose) afterClose();
                refresh();
              });
            },
          },
          t('deleteConfirm.confirm')
        )
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  // ---- Language modal ----
  function openLang(rerender) {
    var overlay = h('div', { class: 'overlay center' });
    function close() {
      overlay.remove();
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    function optionRow(code, label, flag) {
      var active = window.I18N.getLang() === code;
      return h(
        'button',
        {
          class: 'lang-row' + (active ? ' active' : ''),
          type: 'button',
          onclick: function () {
            close();
            // Full re-render (base screen + any open dialog) in the new lang.
            // `rerender` is kept for backward compat but changeLanguage already
            // re-renders the active base screen.
            changeLanguage(code);
          },
        },
        h('span', { class: 'flag', text: flag }),
        h('span', { class: 'lang-name', text: label }),
        active ? h('span', { class: 'check', text: '✓' }) : null
      );
    }

    var dialog = h(
      'div',
      { class: 'dialog' },
      h('h2', { class: 'dialog-title', text: t('language.title') }),
      optionRow('en', 'English', '🇬🇧'),
      optionRow('he', 'עברית', '🇮🇱')
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  // ---- Monthly restock view ----
  function openMonthly(opts) {
    opts = opts || {};
    recomputeShortfall();
    var log = window.PantryDB.getMonthlyLog();
    var current = ym();
    var keys = Object.keys(log);
    if (keys.indexOf(current) === -1) keys.push(current);
    keys.sort().reverse();

    var overlay = h('div', { class: 'overlay center' });
    // Reopen preserving the selected month across a language change.
    var prevReopen = reopenTop;
    var myReopen = function () {
      openMonthly({ month: select.value });
    };
    reopenTop = myReopen;
    function close() {
      overlay.remove();
      if (reopenTop === myReopen) reopenTop = prevReopen;
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    var content = h('div', { class: 'monthly-content' });

    function monthLabel(key) {
      var parts = key.split('-');
      var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
      try {
        return d.toLocaleDateString(window.I18N.getLang() === 'he' ? 'he' : 'en', {
          month: 'long',
          year: 'numeric',
        });
      } catch (e) {
        return key;
      }
    }

    function renderContent(key) {
      content.innerHTML = '';
      var e = log[key] || { restocked: 0, consumed: 0, shortfall: [] };
      // For the current month, show a live shortfall.
      var shortfall = key === current ? computeShortfall() : e.shortfall || [];

      content.appendChild(
        h(
          'div',
          { class: 'stat-row' },
          h(
            'div',
            { class: 'stat' },
            h('div', { class: 'stat-num', text: formatQty(e.restocked || 0) }),
            h('div', { class: 'stat-label', text: t('monthly.restocked') })
          ),
          h(
            'div',
            { class: 'stat' },
            h('div', { class: 'stat-num', text: formatQty(e.consumed || 0) }),
            h('div', { class: 'stat-label', text: t('monthly.consumed') })
          )
        )
      );

      content.appendChild(
        h('div', { class: 'monthly-needs-title', text: t('monthly.needs') })
      );
      if (!shortfall.length) {
        content.appendChild(h('div', { class: 'monthly-empty', text: t('monthly.none') }));
      } else {
        var ul = h('div', { class: 'monthly-list' });
        shortfall.forEach(function (s) {
          // Use the live item's thumb when available, else the snapshot emoji.
          var live = itemById(s.id);
          var thumb = live
            ? itemThumb(live, 'sm')
            : h('div', { class: 'badge sm', text: s.emoji || '🍽️' });
          ul.appendChild(
            h(
              'div',
              { class: 'monthly-item' },
              h(
                'div',
                { class: 'monthly-item-main' },
                thumb,
                h('span', { class: 'monthly-item-name', dir: 'auto', text: localName(s) })
              ),
              h('span', {
                class: 'monthly-item-miss',
                text: t('restock.missing', {
                  missing: formatQty(s.missing),
                  have: formatQty(s.have),
                  target: formatQty(s.target),
                }),
              })
            )
          );
        });
        content.appendChild(ul);
      }
    }

    var select = h('select', {
      class: 'month-select',
      onchange: function (e) {
        renderContent(e.target.value);
      },
    });
    keys.forEach(function (k) {
      select.appendChild(h('option', { value: k, text: monthLabel(k) }));
    });

    var dialog = h(
      'div',
      { class: 'dialog monthly-dialog' },
      h(
        'div',
        { class: 'sheet-header' },
        h('h2', { class: 'dialog-title', text: t('monthly.title') }),
        h('button', { class: 'sheet-close', onclick: close, 'aria-label': t('a11y.close') }, '✕')
      ),
      h('label', { class: 'field-label', text: t('monthly.month') }),
      select,
      content
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    var initial = opts.month && keys.indexOf(opts.month) !== -1 ? opts.month : current;
    select.value = initial;
    renderContent(initial);
  }

  // ---- Toast ----
  function showToast(message, undoFn) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var toast = h('div', { class: 'toast' }, h('span', { text: message }));
    var timer;
    function dismiss() {
      clearTimeout(timer);
      toast.remove();
    }
    if (undoFn) {
      toast.appendChild(
        h(
          'button',
          {
            class: 'toast-undo',
            onclick: function () {
              dismiss();
              undoFn();
            },
          },
          t('scan.undo')
        )
      );
    }
    document.body.appendChild(toast);
    timer = setTimeout(dismiss, 6000);
  }

  // ================= Smart barcode scanner =================

  // Find an existing inventory item that already carries this barcode.
  function itemByBarcode(code) {
    code = String(code || '');
    for (var i = 0; i < items.length; i++)
      if (items[i].barcode && String(items[i].barcode) === code) return items[i];
    return null;
  }

  // Success feedback: short vibration + a soft WebAudio beep (no asset needed).
  var audioCtx = null;
  function scanFeedback() {
    try {
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (e) {}
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.05;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      setTimeout(function () { try { o.stop(); } catch (e) {} }, 110);
    } catch (e) {}
  }

  // Fetch + compress a remote (Open Food Facts) image to a local data URL so it
  // works offline afterwards. Resolves null on any failure (never a broken img).
  function fetchImageLocal(url) {
    return new Promise(function (resolve) {
      if (!url) return resolve(null);
      try {
        fetch(url)
          .then(function (r) { return r.ok ? r.blob() : null; })
          .then(function (blob) {
            if (!blob) return resolve(null);
            // processImage accepts any Blob; the data URL is same-origin so the
            // canvas is not tainted and export succeeds. We keep the full
            // variant here; the thumb is derived when it is persisted/deduped.
            processImage(blob, function (pair) { resolve(pair ? pair.full : null); });
          })
          .catch(function () { resolve(null); });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Local-first lookup: an existing inventory item, then the per-user
  // barcode->product cache/mapping. Resolves null when nothing local matches.
  function resolveLocal(code) {
    var item = itemByBarcode(code);
    if (item) return Promise.resolve({ source: 'inventory', item: item });
    return window.PantryDB.getBarcode(code).then(function (rec) {
      return rec ? { source: 'cache', product: rec } : null;
    });
  }

  // External Open Food Facts lookup. Returns a product object (source 'off'),
  // { offline:true }, { error:true }, or null (found nothing usable).
  function lookupOFF(code) {
    if (!navigator.onLine) return Promise.resolve({ offline: true });
    var url =
      'https://world.openfoodfacts.org/api/v2/product/' +
      encodeURIComponent(code) +
      '.json?fields=product_name,product_name_en,product_name_he,generic_name,' +
      'brands,categories_tags,image_front_small_url,image_small_url,image_front_url,quantity';
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var p = d && d.product;
        if (!p || d.status !== 1) return null;
        var name = p.product_name_en || p.product_name || p.generic_name || '';
        var he = p.product_name_he || '';
        if (!name.trim() && !he.trim()) return null;
        var cat = deriveCategory(p.categories_tags);
        var fm = foodMatch(name || he);
        if (fm && cat === 'other' && fm.category) cat = fm.category;
        var imgUrl =
          p.image_front_small_url || p.image_small_url || p.image_front_url || '';
        return fetchImageLocal(imgUrl).then(function (img) {
          return {
            barcode: String(code),
            name: name.trim(),
            he: he.trim(),
            brand: (p.brands || '').split(',')[0].trim() || '',
            size: (p.quantity || '').trim(),
            categoryId: cat,
            unit: fm && fm.unit ? fm.unit : 'pcs',
            emoji: fm ? fm.emoji : null,
            image: img,
            source: 'off',
          };
        });
      })
      .catch(function () { return { error: true }; });
  }

  function scanDisplayName(p) {
    return localName(p) || t('scan.unknownName');
  }

  // ---- Shared barcode lookup pipeline ----
  // THE single source of truth used by BOTH camera detection (single + session)
  // and manual barcode entry. Given a raw barcode, it resolves, in order:
  //   1) an existing inventory item carrying that barcode        -> 'inventory'
  //   2) the per-user saved barcode->product mapping / cache      -> 'cache'
  //   3) an Open Food Facts online lookup (cached on success)     -> 'off'
  //   4) otherwise a create-new-product fallback (barcode filled) -> 'new'
  //      ('offline' is a distinct new-product case with no network)
  // Never rejects; always resolves to a normalized { source, ... } descriptor.
  function lookupBarcode(code) {
    code = String(code || '').trim();
    return resolveLocal(code).then(function (local) {
      if (local && local.source === 'inventory')
        return { source: 'inventory', item: local.item };
      if (local && local.source === 'cache')
        return { source: 'cache', product: local.product };
      return lookupOFF(code).then(function (off) {
        if (off && off.source === 'off') {
          window.PantryDB.putBarcode(off); // cache for next time (any path)
          return { source: 'off', product: off };
        }
        var blank = { barcode: code, categoryId: 'other', unit: 'pcs' };
        if (off && off.offline) return { source: 'offline', product: blank };
        // Online but not found, or the DB was unreachable -> create new.
        return { source: 'new', product: blank, reason: off && off.error ? 'unreachable' : 'notfound' };
      });
    });
  }

  // Shared UI router: turn a lookupBarcode() result into the correct dialog.
  // Identical for camera single-scan and manual entry, so both paths behave the
  // same for the same barcode. onCancel/onSaved wire the calling flow.
  function openBarcodeResult(res, code, onCancel, onSaved) {
    if (res.source === 'inventory') { openAddUnits(res.item, onCancel, onSaved); return; }
    if (res.source === 'cache') {
      openBarcodeProduct({ barcode: code, product: res.product, hint: t('scan.fromCatalog') }, onCancel, onSaved);
      return;
    }
    if (res.source === 'off') {
      openBarcodeProduct({ barcode: code, product: res.product, hint: t('scan.fromOff') }, onCancel, onSaved);
      return;
    }
    // offline / new (not found / unreachable) -> create new, barcode prefilled.
    if (res.source === 'offline') showToast(t('scan.offline'));
    else if (res.reason === 'unreachable') showToast(t('scan.offUnreachable'));
    else showToast(t('scan.notFound'));
    openBarcodeProduct({ barcode: code, product: res.product, isNew: true }, onCancel, onSaved);
  }

  // ---- Manual barcode entry (type or paste) ----
  // Uses the SAME lookupBarcode + openBarcodeResult pipeline as the camera.
  function openManualBarcode(handlers) {
    handlers = handlers || {};
    var overlay = h('div', { class: 'overlay center' });
    function close() { overlay.remove(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) { close(); if (handlers.onCancel) handlers.onCancel(); } });

    var input = h('input', {
      class: 'input',
      type: 'text',
      inputmode: 'numeric',
      dir: 'ltr', // barcodes are always LTR digit strings, even in RTL UI
      autocomplete: 'off',
      placeholder: t('scan.manualBarcodePlaceholder'),
      'aria-label': t('scan.manualBarcodeTitle'),
    });
    var status = h('div', { class: 'scan-status', text: '' });

    function submit() {
      var code = input.value.replace(/\s+/g, '').trim();
      if (!code) { input.classList.add('error'); input.focus(); return; }
      status.textContent = t('scan.looking');
      lookupBarcode(code).then(function (res) {
        close();
        openBarcodeResult(res, code, handlers.onCancel, handlers.onSaved);
      });
    }
    input.addEventListener('input', function () { input.classList.remove('error'); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

    var dialog = h(
      'div',
      { class: 'dialog' },
      h('div', { class: 'sheet-header' },
        h('h2', { class: 'dialog-title', text: t('scan.manualBarcodeTitle') }),
        h('button', { class: 'sheet-close', 'aria-label': t('a11y.close'), onclick: function () { close(); if (handlers.onCancel) handlers.onCancel(); } }, '✕')
      ),
      h('label', { class: 'field-label', text: t('scan.manualBarcodeLabel') }),
      input,
      status,
      h('div', { class: 'actions' },
        h('button', { class: 'btn cancel', type: 'button', onclick: function () { close(); if (handlers.onCancel) handlers.onCancel(); } }, t('form.cancel')),
        h('button', { class: 'btn save', type: 'button', onclick: submit }, t('scan.manualBarcodeSubmit'))
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    setTimeout(function () { input.focus(); }, 50);
  }

  function openScanner() {
    // No camera support → manual barcode entry (no need to load ZXing).
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      openManualBarcode({ onSaved: function () { refresh(); } });
      return;
    }
    // Lazy-load the scanner library on first open, showing a small loading
    // indicator. If it fails (e.g. offline before it was ever cached), fall
    // back to manual entry. Debounced via loadZXing's shared promise.
    if (typeof ZXing !== 'undefined') {
      startScanner();
      return;
    }
    var aborted = false;
    var loader = h(
      'div',
      { class: 'overlay scanner center' },
      h(
        'div',
        { class: 'scan-loading' },
        h('div', { class: 'scan-spinner' }),
        h('div', { class: 'scan-loading-text', text: t('scan.loading') })
      )
    );
    loader.addEventListener('click', function (e) {
      if (e.target === loader) { aborted = true; loader.remove(); }
    });
    document.body.appendChild(loader);
    loadZXing()
      .then(function () {
        if (loader.parentNode) loader.remove();
        if (!aborted) startScanner();
      })
      .catch(function () {
        if (loader.parentNode) loader.remove();
        if (aborted) return;
        showToast(t('scan.loadError'));
        openManualBarcode({ onSaved: function () { refresh(); } });
      });
  }

  // Builds and runs the camera scanner UI. Assumes ZXing is loaded.
  function startScanner() {
    var continuous = false;
    var session = []; // grouped entries: {barcode,name,he,image,emoji,categoryId,unit,count,itemId,source}
    var byKey = {};
    var busy = false; // gate reads while a single-scan dialog is open
    var lastCode = null;
    var lastTime = 0;
    var closed = false;

    // Restrict to the 1D retail product symbologies (much more robust than
    // "try every format") and enable TRY_HARDER so slightly rotated / lower
    // quality codes still decode. This is the key fix for real EAN-13 codes
    // like 7290116537351 that failed under the default (all-format, no
    // try-harder, 2 fps) configuration.
    var SCAN_FORMATS = [
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.EAN_8,
    ];
    var hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, SCAN_FORMATS);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    // 2nd arg = ms between decode attempts. 80ms ≈ 12 attempts/sec (was 500 =
    // 2/sec), so a code in view is found far faster.
    var reader = new ZXing.BrowserMultiFormatReader(hints, 80);
    var controls = null;

    // Dev-only debug telemetry (see maybeAttachDebug). Cheap counters kept
    // regardless; the panel is only rendered when the debug flag is on.
    var dbg = { attempts: 0, lastAttempts: 0, fps: 0, lastCode: '-', w: 0, h: 0 };
    var dbgTimer = null;
    var dbgEls = null;

    var overlay = h('div', { class: 'overlay scanner center' });
    var video = h('video', { class: 'scan-video' });
    video.setAttribute('playsinline', 'true');
    video.setAttribute('muted', 'true');
    video.setAttribute('autoplay', 'true');
    var frame = h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-reticle' }));
    var status = h('div', { class: 'scan-status', text: t('scan.point') });

    var toggleInput = h('input', { type: 'checkbox', class: 'scan-toggle-input' });
    toggleInput.addEventListener('change', function () {
      continuous = toggleInput.checked;
      renderSession();
    });
    var toggle = h(
      'label',
      { class: 'scan-toggle' },
      toggleInput,
      h('span', { class: 'scan-switch' }),
      h('span', { class: 'scan-toggle-label', text: t('scan.continuous') })
    );

    var sessionBox = h('div', { class: 'scan-session' });
    var addAllBtn = h(
      'button',
      { class: 'btn save', type: 'button', onclick: commitSession },
      t('scan.addAll', { count: 0 })
    );
    // Secondary action: type/paste a barcode. Pauses the live camera decode
    // while the dialog is open, then runs the SAME shared lookup pipeline.
    var manualBtn = h(
      'button',
      {
        class: 'btn cancel',
        type: 'button',
        onclick: function () {
          stop();
          openManualBarcode({ onCancel: resume, onSaved: closeSaved });
        },
      },
      t('scan.manualBarcode')
    );
    var cancelBtn = h(
      'button',
      { class: 'btn cancel', type: 'button', onclick: function () { close(); } },
      t('form.cancel')
    );

    var panel = h(
      'div',
      { class: 'scan-panel' },
      frame,
      toggle,
      status,
      sessionBox,
      h('div', { class: 'actions' }, cancelBtn, manualBtn)
    );
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function stop() {
      try { if (controls) controls.stop(); } catch (e) {}
      try { if (reader.reset) reader.reset(); } catch (e) {}
    }

    // ---- Dev-only debug panel ----
    // Enabled via localStorage 'pantry.debug'==='1' or a ?debug=1 URL param.
    // Surfaces camera resolution, active decoder formats, live FPS (decode
    // attempts/sec), the last detected barcode, total attempts, and status.
    function debugOn() {
      try {
        return localStorage.getItem('pantry.debug') === '1' ||
          /[?&]debug=1/.test(location.search || '');
      } catch (e) { return false; }
    }
    function maybeAttachDebug() {
      if (!debugOn()) return;
      function row(label) {
        var val = h('span', { class: 'scan-debug-val', text: '-' });
        panel.appendChild(h('div', { class: 'scan-debug-row' },
          h('span', { class: 'scan-debug-label', text: label }), val));
        return val;
      }
      var box = h('div', { class: 'scan-debug' });
      panel.appendChild(box);
      panel.appendChild(h('div', { class: 'scan-debug-title', text: t('scan.debug.title') }));
      dbgEls = {
        camera: row(t('scan.debug.camera')),
        formats: row(t('scan.debug.formats')),
        fps: row(t('scan.debug.fps')),
        last: row(t('scan.debug.last')),
        attempts: row(t('scan.debug.attempts')),
        status: row(t('scan.debug.status')),
      };
      dbgEls.formats.textContent = 'EAN-13, UPC-A, UPC-E, EAN-8';
      dbgTimer = setInterval(function () {
        dbg.fps = dbg.attempts - dbg.lastAttempts; // updated once/sec
        dbg.lastAttempts = dbg.attempts;
        dbgEls.camera.textContent = dbg.w && dbg.h ? dbg.w + '×' + dbg.h : '-';
        dbgEls.fps.textContent = String(dbg.fps);
        dbgEls.last.textContent = dbg.lastCode;
        dbgEls.attempts.textContent = String(dbg.attempts);
        dbgEls.status.textContent = (status.textContent || '').slice(0, 40);
      }, 1000);
    }
    function close() {
      if (closed) return;
      closed = true;
      if (dbgTimer) { clearInterval(dbgTimer); dbgTimer = null; }
      stop();
      overlay.remove();
    }
    function flash() {
      frame.classList.add('hit');
      setTimeout(function () { frame.classList.remove('hit'); }, 320);
    }
    function hit() { flash(); scanFeedback(); }

    // Best-effort post-start camera tuning: continuous autofocus (where the
    // device/browser exposes it) and reading back the actual resolution for the
    // debug panel. Unsupported constraints are silently ignored — never fatal.
    function applyAdvancedCamera() {
      try {
        var stream = video.srcObject;
        var track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
        if (!track) return;
        var caps = track.getCapabilities ? track.getCapabilities() : {};
        var adv = [];
        if (caps.focusMode && caps.focusMode.indexOf('continuous') !== -1)
          adv.push({ focusMode: 'continuous' });
        if (adv.length && track.applyConstraints)
          track.applyConstraints({ advanced: adv }).catch(function () {});
        var s = track.getSettings ? track.getSettings() : {};
        dbg.w = s.width || 0;
        dbg.h = s.height || 0;
      } catch (e) {}
    }

    function startDecode() {
      // Request the REAR camera at the highest practical resolution. `ideal`
      // keeps it best-effort so devices that can't hit 1080p still start.
      var constraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      reader
        .decodeFromConstraints(constraints, video, function (result) {
          dbg.attempts++; // counts every decode attempt (found or not)
          if (result) { dbg.lastCode = result.getText(); onCode(result.getText()); }
        })
        .then(function (c) {
          controls = c;
          applyAdvancedCamera();
        })
        .catch(function () {
          status.textContent = t('scan.denied');
          status.classList.add('error');
        });
    }
    function resume() {
      if (closed) return;
      busy = false;
      lastCode = null;
      status.classList.remove('error');
      status.textContent = t('scan.point');
      startDecode();
    }

    function renderSession() {
      sessionBox.innerHTML = '';
      if (!continuous) {
        sessionBox.style.display = 'none';
        if (addAllBtn.parentNode) addAllBtn.parentNode.removeChild(addAllBtn);
        return;
      }
      sessionBox.style.display = 'block';
      sessionBox.appendChild(h('div', { class: 'scan-session-title', text: t('scan.sessionTitle') }));
      if (!session.length) {
        sessionBox.appendChild(h('div', { class: 'scan-session-empty', text: t('scan.sessionEmpty') }));
      } else {
        var list = h('div', { class: 'scan-session-list' });
        session.forEach(function (e) {
          list.appendChild(
            h(
              'div',
              { class: 'scan-row' },
              itemThumb(e, 'sm'),
              h('span', { class: 'scan-row-name', dir: 'auto', text: scanDisplayName(e) }),
              h('span', { class: 'scan-row-count', text: '×' + e.count })
            )
          );
        });
        sessionBox.appendChild(list);
      }
      var total = session.reduce(function (n, e) { return n + e.count; }, 0);
      addAllBtn.textContent = t('scan.addAll', { count: total });
      if (session.length) {
        if (!addAllBtn.parentNode) panel.insertBefore(addAllBtn, panel.lastChild);
      } else if (addAllBtn.parentNode) {
        addAllBtn.parentNode.removeChild(addAllBtn);
      }
    }

    function addToSession(prod) {
      var e = byKey[prod.barcode];
      if (e) {
        e.count += 1;
      } else {
        e = {
          barcode: prod.barcode,
          name: prod.name || '',
          he: prod.he || '',
          image: prod.image || null,
          emoji: prod.emoji || null,
          categoryId: prod.categoryId || 'other',
          unit: prod.unit || 'pcs',
          count: 1,
          itemId: prod.itemId || null,
          source: prod.source || 'user',
        };
        byKey[prod.barcode] = e;
        session.push(e);
      }
      hit();
      status.textContent = t('scan.detected', { code: prod.barcode });
      renderSession();
    }

    // Continuous-mode: resolve via the shared pipeline, then add to the batch
    // session (rather than opening a dialog).
    function resolveForSession(code) {
      status.textContent = t('scan.looking');
      lookupBarcode(code).then(function (res) {
        if (res.source === 'inventory') {
          var it = res.item;
          addToSession({
            barcode: code, name: it.nameEn || it.name || '', he: it.nameHe || '',
            image: thumbImageFor(it), emoji: it.emoji,
            categoryId: it.categoryId, unit: it.unit, itemId: it.id, source: 'inventory',
          });
          return;
        }
        if (res.source === 'cache' || res.source === 'off') {
          addToSession(res.product);
          return;
        }
        if (res.source === 'offline') status.textContent = t('scan.offline');
        // Unknown/unreachable → placeholder entry; editable later in inventory.
        addToSession({ barcode: code, name: '', categoryId: 'other', unit: 'pcs' });
      });
    }

    // Single-scan: resolve via the shared pipeline, then route to the same
    // dialogs that manual entry uses. resume() re-arms the camera on cancel;
    // closeSaved() closes the scanner + refreshes on success.
    function handleSingle(code) {
      lookupBarcode(code).then(function (res) {
        hit();
        openBarcodeResult(res, code, resume, closeSaved);
      });
    }

    // Called by single-scan dialogs on success (auto-close scanner + refresh).
    function closeSaved() {
      close();
      refresh();
    }

    function onCode(code) {
      var now = Date.now();
      if (closed) return;
      if (code === lastCode && now - lastTime < 2500) return; // debounce dupes
      lastCode = code;
      lastTime = now;
      if (continuous) {
        resolveForSession(code);
      } else {
        if (busy) return;
        busy = true;
        stop();
        status.textContent = t('scan.looking');
        handleSingle(code);
      }
    }

    function commitSession() {
      var entries = session.slice();
      if (!entries.length) { close(); return; }
      var total = entries.reduce(function (n, e) { return n + e.count; }, 0);
      var chain = Promise.resolve();
      entries.forEach(function (e) {
        chain = chain.then(function () {
          var existing = e.itemId ? itemById(e.itemId) : itemByBarcode(e.barcode);
          if (existing) {
            existing.quantity += e.count;
            return window.PantryDB.put(existing).then(function () { recordDelta(e.count); });
          }
          var nm = e.name || e.he || t('scan.unknownName');
          // Dedup the image into the shared store first, then reference by hash.
          return persistFullImage(e.image)
            .then(function (imageHash) {
              return window.PantryDB.create({
                name: nm, nameEn: e.name || null, nameHe: e.he || null,
                quantity: e.count, unit: e.unit, categoryId: e.categoryId,
                location: 'Pantry', barcode: e.barcode, emoji: e.emoji, imageHash: imageHash || null,
              });
            })
            .then(function (item) {
              recordDelta(item.quantity);
              return window.PantryDB.putBarcode({
                barcode: e.barcode, name: e.name || '', he: e.he || '',
                categoryId: e.categoryId, unit: e.unit, image: e.image || null,
                emoji: e.emoji || null, source: e.source || 'user',
              });
            });
        });
      });
      chain.then(function () {
        close();
        refresh().then(function () { showToast(t('scan.committed', { count: total })); });
      });
    }

    renderSession();
    maybeAttachDebug();
    startDecode();
  }

  // Known product already in inventory: choose how many units to add, then
  // increment the existing item (no duplicate). onCancel/onSaved handle flow.
  function openAddUnits(item, onCancel, onSaved) {
    var qty = 1;
    var overlay = h('div', { class: 'overlay center' });
    function close(saved) {
      overlay.remove();
      if (saved) { if (onSaved) onSaved(); }
      else if (onCancel) onCancel();
    }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });

    var dialog = h(
      'div',
      { class: 'dialog' },
      h('div', { class: 'sheet-header' },
        h('h2', { class: 'dialog-title', text: t('scan.addUnitsTitle') }),
        h('button', { class: 'sheet-close', 'aria-label': t('a11y.close'), onclick: function () { close(false); } }, '✕')
      ),
      h('div', { class: 'scan-hero' },
        itemThumb(item),
        h('div', { class: 'scan-hero-info' },
          h('div', { class: 'scan-hero-name', dir: 'auto', text: itemName(item) }),
          h('div', { class: 'scan-hero-sub', text: t('scan.inStock', { qty: formatQty(item.quantity), unit: t('units.' + item.unit) }) })
        )
      ),
      h('label', { class: 'field-label', text: t('scan.howMany') }),
      stepperBox(function () { return qty; }, function (v) { qty = v; }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn cancel', type: 'button', onclick: function () { close(false); } }, t('form.cancel')),
        h('button', {
          class: 'btn save', type: 'button',
          onclick: function () {
            item.quantity += qty;
            window.PantryDB.put(item).then(function () {
              recordDelta(qty);
              close(true);
            });
          },
        }, t('scan.add'))
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  // Review (OFF import / cached) or create-new (unknown) product dialog. Saves
  // an inventory item and caches the barcode->product mapping for next time.
  function openBarcodeProduct(opts, onCancel, onSaved) {
    var product = opts.product || {};
    var barcode = String(opts.barcode || product.barcode || '');
    var st = {
      en: product.name || '',
      he: product.he || '',
      categoryId: product.categoryId || 'other',
      unit: product.unit || 'pcs',
      qty: 1,
      emoji: product.emoji || null,
      // Full image from OFF/cache; thumb (if any) is set when a photo is picked.
      imageFull: product.image || null,
      imageThumb: null,
    };

    var overlay = h('div', { class: 'overlay' });
    var sheet = h('div', { class: 'sheet' });
    function close(saved) {
      overlay.remove();
      if (saved) { if (onSaved) onSaved(); }
      else if (onCancel) onCancel();
    }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });

    sheet.appendChild(h('div', { class: 'grabber' }));
    sheet.appendChild(
      h('div', { class: 'sheet-header' },
        h('h2', { class: 'sheet-title', text: opts.isNew ? t('scan.newTitle') : t('scan.reviewTitle') }),
        h('button', { class: 'sheet-close', 'aria-label': t('a11y.close'), onclick: function () { close(false); } }, '✕')
      )
    );
    var body = h('div', { class: 'sheet-body' });

    if (opts.hint) body.appendChild(h('div', { class: 'scan-hint', text: opts.hint }));

    // Photo
    body.appendChild(h('label', { class: 'field-label', text: t('form.photo') }));
    var photo = photoControl(st);
    body.appendChild(photo.row);
    body.appendChild(photo.input);

    // Barcode (read-only)
    body.appendChild(h('label', { class: 'field-label', text: t('scan.barcode') }));
    var bcInput = h('input', { class: 'input', type: 'text', value: barcode, readonly: 'readonly' });
    body.appendChild(bcInput);

    // Names (English + Hebrew)
    body.appendChild(h('label', { class: 'field-label', text: t('scan.enName') }));
    var enInput = h('input', { class: 'input', type: 'text', dir: 'auto', value: st.en, placeholder: t('form.namePlaceholder'), autocomplete: 'off' });
    body.appendChild(enInput);
    body.appendChild(h('label', { class: 'field-label', text: t('scan.heName') }));
    var heInput = h('input', { class: 'input', type: 'text', value: st.he, dir: 'rtl', autocomplete: 'off' });
    body.appendChild(heInput);

    if (product.brand)
      body.appendChild(h('div', { class: 'scan-meta', text: t('scan.brand') + ': ' + product.brand + (product.size ? ' · ' + product.size : '') }));

    // Category + unit + quantity
    body.appendChild(h('label', { class: 'field-label', text: t('form.category') }));
    body.appendChild(categoryChips(function () { return st.categoryId; }, function (v) { st.categoryId = v; photo.render(); }));
    body.appendChild(h('label', { class: 'field-label', text: t('form.unit') }));
    body.appendChild(unitChipsBox(function () { return st.unit; }, function (v) { st.unit = v; }));
    body.appendChild(h('label', { class: 'field-label', text: t('form.quantity') }));
    body.appendChild(stepperBox(function () { return st.qty; }, function (v) { st.qty = v; }));

    sheet.appendChild(body);

    function save() {
      var en = enInput.value.trim();
      var he = heInput.value.trim();
      if (!en && !he) {
        (en ? enInput : heInput).classList.add('error');
        showToast(t('scan.nameRequired'));
        return;
      }
      var primary = window.I18N.getLang() === 'he' ? he || en : en || he;
      var emoji = st.emoji;
      if (!emoji) {
        var m = foodMatch(en || he);
        if (m) emoji = m.emoji;
      }
      // Dedup the image into the shared store first (prefer an explicit thumb
      // from a user upload; otherwise derive one from the full image).
      var imgP = st.imageThumb
        ? storeImagePair({ full: st.imageFull, thumb: st.imageThumb })
        : persistFullImage(st.imageFull);
      imgP.then(function (imageHash) {
        var existing = itemByBarcode(barcode);
        var p;
        if (existing) {
          existing.quantity += st.qty;
          var prevHash = existing.imageHash || null;
          if (imageHash) { existing.imageHash = imageHash; existing.image = null; }
          p = window.PantryDB.put(existing).then(function () {
            recordDelta(st.qty);
            if (imageHash && prevHash && prevHash !== imageHash) return releaseImage(prevHash);
          });
        } else {
          p = window.PantryDB.create({
            name: primary, nameEn: en || null, nameHe: he || null,
            quantity: st.qty, unit: st.unit, categoryId: st.categoryId,
            location: 'Pantry', barcode: barcode, emoji: emoji || null, imageHash: imageHash || null,
          }).then(function (item) { recordDelta(item.quantity); });
        }
        p.then(function () {
          window.PantryDB.putBarcode({
            barcode: barcode, name: en, he: he, categoryId: st.categoryId,
            unit: st.unit, image: st.imageFull || null, emoji: emoji || null,
            brand: product.brand || '', size: product.size || '',
            source: opts.isNew ? 'user' : product.source || 'off',
          });
          close(true);
        });
      });
    }

    sheet.appendChild(
      h('div', { class: 'actions' },
        h('button', { class: 'btn cancel', type: 'button', onclick: function () { close(false); } }, t('form.cancel')),
        h('button', { class: 'btn save', type: 'button', onclick: save }, t('scan.save'))
      )
    );

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
  }

  // ---- Shared helpers for the passwordless profile UI ----
  function initialsOf(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Reusable avatar picker bound to state.avatar (a data URL or null). The
  // placeholder shows initials via getInitials(). Used by create/edit/profile.
  function avatarControl(state, getInitials) {
    var box = h('div', { class: 'profile-avatar' });
    var fileInput = h('input', { class: 'photo-file', type: 'file', accept: 'image/*' });
    function render() {
      box.innerHTML = '';
      var tile = state.avatar
        ? h('div', { class: 'avatar lg has-img' }, h('img', { class: 'avatar-img', src: state.avatar, alt: '' }))
        : h('div', { class: 'avatar lg', text: getInitials() });
      var addBtn = h('button', { class: 'btn ghost', type: 'button', onclick: function () { fileInput.click(); } },
        state.avatar ? t('auth.changeAvatar') : t('auth.addAvatar'));
      var rm = state.avatar
        ? h('button', { class: 'btn ghost danger', type: 'button', onclick: function () { state.avatar = null; render(); } }, t('auth.removeAvatar'))
        : null;
      box.appendChild(tile);
      box.appendChild(h('div', { class: 'photo-actions', style: 'justify-content:center' }, addBtn, rm));
    }
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      processImage(f, function (pair) {
        if (pair) { state.avatar = pair.thumb || pair.full; render(); }
        else showToast(t('form.imageError'));
        fileInput.value = '';
      });
    });
    render();
    return { box: box, input: fileInput, rerender: render };
  }

  // Local EN/עברית segmented control bound to a mutable `state.lang`.
  // Optional onChange(lang) fires on selection — used by the profile dialog to
  // switch the live UI immediately; omitted for new/edit-user forms where the
  // choice is only that profile's stored preference.
  function langSegment(state, onChange) {
    var box = h('div', { class: 'segment' });
    function render() {
      box.innerHTML = '';
      [['en', 'English'], ['he', 'עברית']].forEach(function (p) {
        box.appendChild(h('button', {
          class: 'segment-item' + (state.lang === p[0] ? ' active' : ''),
          type: 'button',
          onclick: function () {
            state.lang = p[0];
            render();
            if (onChange) onChange(p[0]);
          },
        }, p[1]));
      });
    }
    render();
    return box;
  }

  // Clear the base screen (remove any overlays/toasts + wipe root).
  function resetRoot() {
    if (!root) root = document.getElementById('root');
    Array.prototype.slice
      .call(document.querySelectorAll('.overlay, .toast'))
      .forEach(function (o) { o.remove(); });
    root.innerHTML = '';
  }

  // A minimal in-app screen top bar with a Back button (RTL-safe: text label,
  // no directional glyph) and a title.
  function screenTopBar(title, onBack) {
    return h('div', { class: 'screen-topbar' },
      h('button', { class: 'btn ghost back-btn', type: 'button', onclick: onBack }, t('auth.back')),
      h('h2', { class: 'screen-topbar-title', text: title })
    );
  }

  // Large avatar tile for the user cards.
  function userAvatarTile(u) {
    return u.avatar
      ? h('div', { class: 'avatar xl has-img' }, h('img', { class: 'avatar-img', src: u.avatar, alt: '' }))
      : h('div', { class: 'avatar xl', text: initialsOf(u.displayName || u.username) });
  }

  // ---- SWITCH USER screen (one-tap, no editing) ----
  // Shown at boot (no active user) and from the header avatar. Tapping a
  // profile switches to it immediately and returns to the app. This screen has
  // NO create/edit/delete affordances — management lives in Manage Users.
  function renderSwitchUser() {
    resetRoot();
    var activeId = window.CurrentUser ? window.CurrentUser.id() : null;
    var users = window.Auth.listUsers();

    function pick(id) {
      // Fast path: tapping the already-active profile just returns to the app
      // with NO database reload (its data is already in memory).
      if (activeId && id === activeId) { renderMain(); return; }
      var u = window.Auth.selectUser(id);
      if (!u) { renderSwitchUser(); return; }
      // enterApp() loads ONLY the selected user's scope (per-user IndexedDB).
      enterApp().then(function () {
        showToast(t('auth.welcome', { name: window.CurrentUser.displayName() }));
      });
    }

    // Shared language toggle (also the default language for new profiles). Kept
    // because it is a language control, not a user-management action.
    var langSel = h('div', { class: 'segment auth-lang' });
    [['en', 'English'], ['he', 'עברית']].forEach(function (pair) {
      langSel.appendChild(
        h('button', {
          class: 'segment-item' + (window.I18N.getLang() === pair[0] ? ' active' : ''),
          type: 'button',
          onclick: function () { changeLanguage(pair[0]); },
        }, pair[1])
      );
    });

    var grid = h('div', { class: 'user-grid' });
    users.forEach(function (u) {
      grid.appendChild(
        h('div', { class: 'user-card' + (u.id === activeId ? ' active' : ''), onclick: function () { pick(u.id); } },
          u.id === activeId ? h('span', { class: 'user-active-badge', text: t('auth.activeUser') }) : null,
          userAvatarTile(u),
          h('div', { class: 'user-card-name', dir: 'auto', text: u.displayName || u.username }),
          u.username ? h('div', { class: 'user-card-sub', text: '@' + u.username }) : null
        )
      );
    });

    root.appendChild(
      h('div', { class: 'picker-screen' },
        // Back to the app only when there is an active session to return to.
        activeId ? screenTopBar(t('auth.switchUser'), function () { renderMain(); }) : null,
        activeId ? null : h('img', { class: 'brand-logo', src: './icons/icon-192.png', alt: '' }),
        activeId ? null : h('h1', { class: 'auth-title', text: t('app.title') }),
        h('p', { class: 'auth-subtitle', text: activeId ? t('auth.switchUserSub') : t('auth.chooseUser') }),
        langSel,
        grid
      )
    );
  }

  // ---- MANAGE USERS screen (the ONLY place for create/edit/delete) ----
  // Reached from Settings -> Manage Users. Tapping a card EDITS that profile
  // (never switches); the add card creates one. Switching is not possible here.
  function renderManageUsers() {
    resetRoot();
    var activeId = window.CurrentUser ? window.CurrentUser.id() : null;
    var users = window.Auth.listUsers();

    var grid = h('div', { class: 'user-grid' });
    users.forEach(function (u) {
      grid.appendChild(
        h('div', { class: 'user-card manage', onclick: function () { renderEditUser(u); } },
          u.id === activeId ? h('span', { class: 'user-active-badge', text: t('auth.activeUser') }) : null,
          h('span', { class: 'user-edit-hint', 'aria-hidden': 'true', text: '✏️' }),
          userAvatarTile(u),
          h('div', { class: 'user-card-name', dir: 'auto', text: u.displayName || u.username }),
          u.username ? h('div', { class: 'user-card-sub', text: '@' + u.username }) : null
        )
      );
    });
    // "Add user" card — creation lives only here.
    grid.appendChild(
      h('div', { class: 'user-card user-add', onclick: function () { renderCreateUser(); } },
        h('div', { class: 'user-add-plus', text: '＋' }),
        h('div', { class: 'user-card-name', text: t('auth.addUser') })
      )
    );

    root.appendChild(
      h('div', { class: 'picker-screen' },
        screenTopBar(t('auth.manageUsers'), function () { renderMain(); }),
        h('p', { class: 'auth-subtitle', text: t('auth.manageUsersSub') }),
        grid
      )
    );
  }

  // Back-compat alias: any legacy caller lands on the fast Switch User screen.
  var renderPicker = renderSwitchUser;

  // ---- Create profile ----
  function renderCreateUser() {
    var overlay = h('div', { class: 'overlay center' });
    function close() { overlay.remove(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var state = { avatar: null, lang: window.I18N.getLang() };
    var nameInput = h('input', { class: 'input', type: 'text', dir: 'auto', placeholder: t('auth.displayNamePlaceholder'), 'aria-label': t('auth.displayName') });
    var userInput = h('input', {
      class: 'input', type: 'text', placeholder: t('auth.usernamePlaceholder'), 'aria-label': t('auth.username'),
      autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    });
    var avc = avatarControl(state, function () { return initialsOf(nameInput.value); });
    nameInput.addEventListener('input', function () { nameInput.classList.remove('error'); avc.rerender(); });
    var langBox = langSegment(state);
    var errEl = h('div', { class: 'auth-error', style: 'display:none' });

    function create() {
      var dn = nameInput.value.trim();
      if (!dn) {
        nameInput.classList.add('error');
        errEl.textContent = t('auth.displayNameRequired');
        errEl.style.display = 'block';
        nameInput.focus();
        return;
      }
      window.Auth.createUser({ displayName: dn, username: userInput.value.trim(), avatar: state.avatar, lang: state.lang })
        .then(function (res) {
          if (!res.ok) {
            errEl.textContent = res.error === 'exists' ? t('auth.usernameTaken') : t('auth.displayNameRequired');
            errEl.style.display = 'block';
            return;
          }
          // Management context: create the profile but do NOT switch to it.
          // Switching is a separate, one-tap action on the Switch User screen.
          close();
          renderManageUsers();
          showToast(t('auth.userCreated'));
        });
    }

    var dialog = h('div', { class: 'dialog profile-dialog' },
      h('div', { class: 'sheet-header' },
        h('h2', { class: 'dialog-title', text: t('auth.createUserTitle') }),
        h('button', { class: 'sheet-close', 'aria-label': t('a11y.close'), onclick: close }, '✕')
      ),
      avc.box, avc.input,
      h('label', { class: 'field-label', text: t('auth.displayName') }), nameInput,
      h('label', { class: 'field-label', text: t('auth.usernameOptional') }), userInput,
      h('label', { class: 'field-label', text: t('auth.preferredLanguage') }), langBox,
      errEl,
      h('div', { class: 'actions' },
        h('button', { class: 'btn cancel', type: 'button', onclick: close }, t('form.cancel')),
        h('button', { class: 'btn save', type: 'button', onclick: create }, t('auth.createButton'))
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    setTimeout(function () { nameInput.focus(); }, 50);
  }

  // ---- Edit / delete a profile (from the picker) ----
  function renderEditUser(u) {
    var overlay = h('div', { class: 'overlay center' });
    function close() { overlay.remove(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var isActive = !!(window.CurrentUser && window.CurrentUser.id() === u.id);
    var state = { avatar: u.avatar || null, lang: u.lang || window.I18N.getLang() };
    var nameInput = h('input', { class: 'input', type: 'text', dir: 'auto', value: u.displayName || u.username || '', 'aria-label': t('auth.displayName') });
    var avc = avatarControl(state, function () { return initialsOf(nameInput.value); });
    nameInput.addEventListener('input', function () { avc.rerender(); });
    var langBox = langSegment(state);

    function save() {
      var dn = nameInput.value.trim() || u.username || u.displayName || '';
      window.Auth.updateUser(u.id, { displayName: dn, avatar: state.avatar, lang: state.lang });
      if (isActive) {
        window.Auth.updateProfile({ displayName: dn, avatar: state.avatar, lang: state.lang });
        if (window.I18N.getLang() !== state.lang) window.I18N.setLang(state.lang);
      }
      close();
      renderManageUsers();
    }
    function del() {
      if (isActive) { showToast(t('auth.cannotDeleteActive')); return; }
      confirmDeleteUser(u, function () { close(); renderManageUsers(); });
    }

    var dialog = h('div', { class: 'dialog profile-dialog' },
      h('div', { class: 'sheet-header' },
        h('h2', { class: 'dialog-title', text: t('auth.editUserTitle') }),
        h('button', { class: 'sheet-close', 'aria-label': t('a11y.close'), onclick: close }, '✕')
      ),
      avc.box, avc.input,
      h('label', { class: 'field-label', text: t('auth.displayName') }), nameInput,
      u.username ? h('label', { class: 'field-label', text: t('auth.username') }) : null,
      u.username ? h('div', { class: 'profile-username', text: '@' + u.username }) : null,
      h('label', { class: 'field-label', text: t('auth.preferredLanguage') }), langBox,
      h('div', { class: 'actions' },
        h('button', { class: 'btn danger' + (isActive ? ' disabled' : ''), type: 'button', onclick: del }, t('auth.deleteUser')),
        h('button', { class: 'btn save', type: 'button', onclick: save }, t('auth.save'))
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  // Explicit destructive confirmation before deleting a profile + its data.
  function confirmDeleteUser(u, onDone) {
    var overlay = h('div', { class: 'overlay center' });
    function close() { overlay.remove(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    var name = u.displayName || u.username || '';
    var dialog = h('div', { class: 'dialog' },
      h('h2', { class: 'dialog-title', text: t('auth.confirmDeleteTitle') }),
      h('p', { class: 'dialog-msg', text: t('auth.confirmDeleteMsg', { name: name }) }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn cancel', type: 'button', onclick: close }, t('form.cancel')),
        h('button', {
          class: 'btn danger', type: 'button',
          onclick: function () {
            window.Auth.deleteUser(u.id);
            window.PantryDB.deleteUserData(u.id).then(function () {
              close();
              showToast(t('auth.userDeleted'));
              if (onDone) onDone();
            });
          },
        }, t('auth.deleteUser'))
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  // ---- Active-user profile (edit self, switch, choose another) ----
  function openProfile(opts) {
    opts = opts || {};
    var cu = window.CurrentUser;
    var overlay = h('div', { class: 'overlay center' });

    // State-preserving reopener for a live language switch from within.
    var prevReopen = reopenTop;
    var myReopen = function () {
      openProfile({ displayName: nameInput.value, avatar: state.avatar });
    };
    reopenTop = myReopen;
    function close() {
      overlay.remove();
      if (reopenTop === myReopen) reopenTop = prevReopen;
    }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var state = {
      avatar: opts.avatar !== undefined ? opts.avatar : cu.avatar(),
      lang: window.I18N.getLang(),
    };
    var nameInput = h('input', { class: 'input', type: 'text', dir: 'auto', value: opts.displayName != null ? opts.displayName : cu.displayName() || '', 'aria-label': t('auth.displayName') });
    var avc = avatarControl(state, function () { return initialsOf(nameInput.value) || cu.initials(); });
    nameInput.addEventListener('input', function () { avc.rerender(); });
    // Tapping a language switches the whole UI immediately AND persists it as
    // this profile's preference; changeLanguage reopens this dialog translated.
    var langBox = langSegment(state, function (l) {
      window.Auth.updateProfile({ lang: l });
      changeLanguage(l);
    });

    function save() {
      var dn = nameInput.value.trim() || cu.username() || cu.displayName();
      window.Auth.updateProfile({ displayName: dn, avatar: state.avatar, lang: state.lang });
      if (window.I18N.getLang() !== state.lang) window.I18N.setLang(state.lang);
      renderMain();
      close();
    }

    var dialog = h(
      'div',
      { class: 'dialog profile-dialog' },
      h('div', { class: 'sheet-header' },
        h('h2', { class: 'dialog-title', text: t('auth.profile') }),
        h('button', { class: 'sheet-close', 'aria-label': t('a11y.close'), onclick: close }, '✕')
      ),
      avc.box,
      avc.input,
      h('label', { class: 'field-label', text: t('auth.displayName') }),
      nameInput,
      cu.username() ? h('label', { class: 'field-label', text: t('auth.username') }) : null,
      cu.username() ? h('div', { class: 'profile-username', text: '@' + cu.username() }) : null,
      h('label', { class: 'field-label', text: t('auth.preferredLanguage') }),
      langBox,
      h('div', { class: 'actions' },
        h('button', { class: 'btn cancel', type: 'button', onclick: close }, t('form.cancel')),
        h('button', { class: 'btn save', type: 'button', onclick: save }, t('auth.save'))
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    setTimeout(function () { nameInput.focus(); }, 50);
  }

  // ---- Settings (gear) ----
  // Home for account + app management: edit profile, Switch User, Manage Users
  // (the only place for create/edit/delete), language, and sign-out. Keeping
  // these here frees the header avatar to be a pure one-tap Switch User entry.
  // ============================ Cross-device sync ============================
  // DORMANT by default. Nothing here touches the network unless the app has a
  // Supabase URL + anon key AND this profile is linked to a cloud identity.
  var SYNC_URL_KEY = 'pantry.sync.url';
  var SYNC_ANON_KEY = 'pantry.sync.anonKey';
  var syncMgr = null; // HomeSync.SyncManager instance (when active)
  var homeSyncPromise = null; // lazy-load promise for sync/homesync.js
  var qrPromise = null; // lazy-load promise for vendor/qrcode.js
  var suppressSyncHook = false; // guard so remote-applied writes don't re-queue
  var pendingLinkToken = null; // a #link= token captured at startup (auto-join)

  // Parse a device-link token from the current URL (#link= or ?link=).
  function parseLinkToken() {
    try {
      var m =
        /[#&?]link=([^&]+)/.exec(location.hash || '') ||
        /[?&]link=([^&]+)/.exec(location.search || '');
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) {
      return null;
    }
  }
  // Remove the link token from the URL so it isn't re-processed or shared.
  function cleanLinkUrl() {
    try {
      if (!history.replaceState) return;
      var search = (location.search || '').replace(/([?&])link=[^&]*/, '$1').replace(/[?&]$/, '');
      var hash = (location.hash || '').replace(/([#&])link=[^&]*/, '$1').replace(/[#&]$/, '');
      if (hash === '#') hash = '';
      history.replaceState(null, '', location.pathname + search + hash);
    } catch (e) {}
  }

  // Effective config: Settings (localStorage) overrides config.js. Pure read.
  function syncGetConfig() {
    var url = '';
    var anon = '';
    try {
      url = localStorage.getItem(SYNC_URL_KEY) || '';
      anon = localStorage.getItem(SYNC_ANON_KEY) || '';
    } catch (e) {}
    var c = window.HOMESTOCK_CONFIG || {};
    if (!url) url = c.SUPABASE_URL || '';
    if (!anon) anon = c.SUPABASE_ANON_KEY || '';
    return { url: String(url).trim(), anonKey: String(anon).trim() };
  }
  function syncConfigured() {
    var c = syncGetConfig();
    return !!(c.url && c.anonKey);
  }
  // Per-profile link state (cloud identity + anonymous session + device id).
  function syncStateKey() {
    var id = window.CurrentUser && window.CurrentUser.id() ? window.CurrentUser.id() : 'anon';
    return 'pantry.sync.state.' + id;
  }
  function syncLoadState() {
    try {
      return JSON.parse(localStorage.getItem(syncStateKey()) || 'null') || {};
    } catch (e) {
      return {};
    }
  }
  function syncSaveState(s) {
    try {
      localStorage.setItem(syncStateKey(), JSON.stringify(s || {}));
    } catch (e) {}
  }
  function syncLinked() {
    var s = syncLoadState();
    return !!(s && s.cloudUserId && s.session);
  }

  function loadHomeSync() {
    if (typeof window.HomeSync !== 'undefined' && window.HomeSync) {
      return Promise.resolve(window.HomeSync);
    }
    if (homeSyncPromise) return homeSyncPromise;
    homeSyncPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = './sync/homesync.js';
      s.async = true;
      s.onload = function () {
        if (window.HomeSync) resolve(window.HomeSync);
        else {
          homeSyncPromise = null;
          reject(new Error('HomeSync unavailable after load'));
        }
      };
      s.onerror = function () {
        homeSyncPromise = null;
        reject(new Error('Failed to load sync layer'));
      };
      document.head.appendChild(s);
    });
    return homeSyncPromise;
  }

  // ---- local <-> cloud record mapping ----
  function cloudTableFor(localTable) {
    if (localTable === 'inventoryItems') return 'inventory_items';
    if (localTable === 'barcodeMappings') return 'barcode_mappings';
    return localTable;
  }
  function mapItemToCloud(rec, uid) {
    return {
      id: rec.id,
      user_id: uid,
      product_id: rec.productId || null,
      barcode: rec.barcode || null,
      name: rec.name || null,
      name_en: rec.nameEn || null,
      name_he: rec.nameHe || null,
      quantity: typeof rec.quantity === 'number' ? rec.quantity : null,
      image_hash: rec.imageHash || null,
      data: rec,
      updated_at: rec.updatedAt || new Date().toISOString(),
    };
  }
  function mapBarcodeToCloud(rec, uid) {
    return {
      id: String(rec.barcode),
      user_id: uid,
      barcode: String(rec.barcode),
      product_id: rec.productId || null,
      data: rec,
      updated_at: rec.updatedAt || new Date().toISOString(),
    };
  }
  function cloudRowToItem(row) {
    var d = (row && row.data) || {};
    d.id = row.id;
    if (row.updated_at) d.updatedAt = row.updated_at;
    if (typeof row.quantity === 'number') d.quantity = row.quantity;
    return d;
  }

  // Boot sync ONLY if configured + linked. Safe to call anytime; no-ops when
  // dormant. Registers the DB mutation hook and starts the SyncManager.
  function syncBoot() {
    if (syncMgr) return; // already running
    if (!syncConfigured() || !syncLinked()) return; // dormant
    loadHomeSync()
      .then(function (HS) {
        var cfg = syncGetConfig();
        var st = syncLoadState();
        var repo = new HS.CloudRepository(cfg, st.session);
        var queue = new HS.SyncQueue(localStorage, 'pantry.sync.queue.' + st.cloudUserId);
        syncMgr = new HS.SyncManager({
          cfg: cfg,
          repo: repo,
          queue: queue,
          storage: localStorage,
          getUserId: function () { return st.cloudUserId; },
          onStatus: function (s) { updateSyncIndicator(s); },
        });
        syncMgr.onPull = function () { return syncPull(HS, repo, st); };
        // Capture local mutations -> queue + debounced push (unless we are the
        // ones applying a remote change).
        window.PantryDB.onMutation(function (m) {
          if (!syncMgr || suppressSyncHook) return;
          var payload =
            m.table === 'inventoryItems'
              ? mapItemToCloud(m.record, st.cloudUserId)
              : m.table === 'barcodeMappings'
              ? mapBarcodeToCloud(m.record, st.cloudUserId)
              : Object.assign({}, m.record, { user_id: st.cloudUserId });
          var recordId = m.record && (m.record.id || m.record.barcode);
          syncMgr.notifyLocalMutation({
            table: cloudTableFor(m.table),
            opType: m.opType,
            recordId: recordId,
            payload: payload,
          });
        });
        syncMgr.start();
        updateSyncIndicator(syncMgr.status);
      })
      .catch(function () {
        /* stay offline-first; sync just stays dormant */
      });
  }

  // Pull remote inventory deltas and merge (last-write-wins) into local IDB.
  // Remote-applied writes are guarded so they don't re-enter the sync queue.
  function syncPull(HS, repo, st) {
    var since = null;
    try { since = localStorage.getItem('pantry.sync.lastAt'); } catch (e) {}
    return repo.selectSince('inventory_items', st.cloudUserId, since).then(function (rows) {
      if (!rows || !rows.length) return null;
      return window.PantryDB.getAll().then(function (localItems) {
        var localById = {};
        localItems.forEach(function (x) { localById[x.id] = x; });
        var chain = Promise.resolve();
        rows.map(cloudRowToItem).forEach(function (r) {
          var winner = HS.ConflictResolver.resolveRecord(localById[r.id], r);
          if (winner === r) {
            chain = chain.then(function () {
              suppressSyncHook = true;
              return window.PantryDB.put(r).then(
                function () { suppressSyncHook = false; },
                function () { suppressSyncHook = false; }
              );
            });
          }
        });
        return chain.then(function () { recomputeShortfall(); renderMain(); });
      });
    });
  }

  // First device: anonymous sign-in, create household, migrate local data up.
  function syncEnableFirstDevice() {
    return loadHomeSync().then(function (HS) {
      var cfg = syncGetConfig();
      var repo = new HS.CloudRepository(cfg);
      return repo.signInAnonymously().then(function () {
        return repo.createHousehold().then(function (hid) {
          var st = {
            cloudUserId: hid,
            session: repo.session,
            deviceId: HS.DeviceLink.generateToken(8),
          };
          syncSaveState(st);
          return syncMigrateLocal(HS, repo, st).then(function () {
            syncBoot();
            return st;
          });
        });
      });
    });
  }

  // Other devices: anonymous sign-in, redeem a link code to join the household.
  function syncLinkThisDevice(code) {
    return loadHomeSync().then(function (HS) {
      var cfg = syncGetConfig();
      var repo = new HS.CloudRepository(cfg);
      return repo.signInAnonymously().then(function () {
        return repo.redeemLinkToken(String(code).trim()).then(function (hid) {
          var st = {
            cloudUserId: hid,
            session: repo.session,
            deviceId: HS.DeviceLink.generateToken(8),
          };
          syncSaveState(st);
          syncBoot();
          return st;
        });
      });
    });
  }

  // Auto-join from a #link= token (opened link / scanned QR). Reuses the same
  // redeem_link_token flow — no manual code entry. Backend config is baked, so
  // the token is all that's needed. No-op when unconfigured.
  function syncAutoRedeem(token) {
    if (!token || !syncConfigured()) return Promise.resolve(false);
    return loadHomeSync()
      .then(function (HS) {
        var cfg = syncGetConfig();
        var st = syncLoadState();
        var repo = new HS.CloudRepository(cfg, st.session);
        var ensure = st.session ? Promise.resolve() : repo.signInAnonymously();
        return ensure.then(function () {
          return repo.redeemLinkToken(String(token).trim()).then(function (hid) {
            syncSaveState({
              cloudUserId: hid,
              session: repo.session,
              deviceId: st.deviceId || HS.DeviceLink.generateToken(8),
            });
            syncBoot();
            if (typeof showToast === 'function') showToast(t('sync.linkedOk'));
            renderMain();
            return true;
          });
        });
      })
      .catch(function () {
        if (typeof showToast === 'function') showToast(t('sync.errLink'));
        return false;
      });
  }

  // Lazy-load the vendored (local, no-CDN) QR generator.
  function loadQR() {
    if (window.QRCodeMini) return Promise.resolve(window.QRCodeMini);
    if (qrPromise) return qrPromise;
    qrPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = './vendor/qrcode.js';
      s.async = true;
      s.onload = function () {
        if (window.QRCodeMini) resolve(window.QRCodeMini);
        else {
          qrPromise = null;
          reject(new Error('QR generator unavailable'));
        }
      };
      s.onerror = function () {
        qrPromise = null;
        reject(new Error('Failed to load QR generator'));
      };
      document.head.appendChild(s);
    });
    return qrPromise;
  }

  // Existing member: mint a fresh crypto-random link token for another device.
  function syncCreateLinkCode() {
    return loadHomeSync().then(function (HS) {
      var st = syncLoadState();
      var repo = new HS.CloudRepository(syncGetConfig(), st.session);
      var token = HS.DeviceLink.generateToken();
      return repo.createLinkToken(token, 60).then(function () { return token; });
    });
  }

  // Idempotent local -> cloud upload. Never deletes local data.
  function syncMigrationStateKey() {
    var s = syncLoadState();
    return 'pantry.sync.migration.' + (s.cloudUserId || 'none');
  }
  function syncMigrateLocal(HS, repo, st) {
    var key = 'pantry.sync.migration.' + st.cloudUserId;
    var state;
    try { state = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
    state = state || HS.Migration.emptyState();
    return window.PantryDB.getAll().then(function (items) {
      var plan = HS.Migration.planUploads(items, state);
      if (!plan.length) return null;
      var rows = plan.map(function (r) { return mapItemToCloud(r, st.cloudUserId); });
      return repo.upsert('inventory_items', rows).then(function () {
        var next = HS.Migration.markUploaded(
          state,
          plan.map(function (r) { return r.id; })
        );
        try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) {}
      });
    });
  }

  function syncDisconnect() {
    if (syncMgr && syncMgr.stop) syncMgr.stop();
    syncMgr = null;
    window.PantryDB.onMutation(null);
    try {
      localStorage.removeItem(syncStateKey());
    } catch (e) {}
  }

  // Subtle header status indicator (only present when sync is configured).
  function syncStatusGlyph(status) {
    switch (status) {
      case 'syncing': return '🔄';
      case 'offline': return '📴';
      case 'conflict': return '⚠️';
      case 'error': return '⚠️';
      default: return '☁️'; // idle / synced
    }
  }
  function updateSyncIndicator(status) {
    var el = document.getElementById('sync-indicator');
    if (!el) return;
    el.textContent = syncStatusGlyph(status);
    var label = t('sync.status.' + (status || 'idle')) || t('sync.title');
    el.setAttribute('title', label);
    el.setAttribute('aria-label', t('sync.a11y') + ': ' + label);
  }

  function openSyncSettings() {
    var overlay = h('div', { class: 'overlay center' });
    var prevReopen = reopenTop;
    var myReopen = function () { openSyncSettings(); };
    reopenTop = myReopen;
    function close() {
      overlay.remove();
      if (reopenTop === myReopen) reopenTop = prevReopen;
    }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var body = h('div', { class: 'sync-body' });

    function note(msg, cls) {
      return h('p', { class: 'sync-note ' + (cls || ''), dir: 'auto', text: msg });
    }
    function btn(label, cls, onClick) {
      return h('button', { class: 'btn ' + (cls || 'ghost'), type: 'button', onclick: onClick }, label);
    }

    function rebuild() {
      body.innerHTML = '';
      var configured = syncConfigured();
      var linked = syncLinked();

      if (!configured) {
        body.appendChild(note(t('sync.dormantNote')));
      }

      // Status + last sync (when linked).
      if (linked) {
        var status = syncMgr ? syncMgr.status : 'idle';
        var lastAt = null;
        try { lastAt = localStorage.getItem('pantry.sync.lastAt'); } catch (e) {}
        body.appendChild(
          h('div', { class: 'sync-status-row' },
            h('span', { class: 'sync-status-glyph', text: syncStatusGlyph(status) }),
            h('span', { class: 'sync-status-text', text: t('sync.status.' + status) })
          )
        );
        body.appendChild(
          h('p', { class: 'sync-note', text: t('sync.lastSync') + ': ' + (lastAt ? new Date(lastAt).toLocaleString() : t('sync.never')) })
        );
        body.appendChild(btn(t('sync.syncNow'), 'save', function () {
          if (syncMgr) syncMgr.scheduleSync(0);
        }));

        // Link another device -> reveal code + URL.
        var linkArea = h('div', { class: 'sync-link-area' });
        body.appendChild(btn(t('sync.linkAnother'), 'ghost', function () {
          linkArea.innerHTML = '';
          linkArea.appendChild(note('…'));
          syncCreateLinkCode().then(function (token) {
            linkArea.innerHTML = '';
            var base = location.origin + location.pathname;
            var url = window.HomeSync
              ? window.HomeSync.DeviceLink.buildLinkUrl(base, token)
              : base + '#link=' + encodeURIComponent(token);
            // QR of the deep link — scan on another device to auto-join.
            linkArea.appendChild(h('p', { class: 'sync-note', text: t('sync.scanToJoin') }));
            var qrWrap = h('div', { class: 'sync-qr' });
            var canvas = h('canvas', { 'aria-label': t('sync.linkUrl') });
            qrWrap.appendChild(canvas);
            linkArea.appendChild(qrWrap);
            loadQR()
              .then(function (QR) { QR.toCanvas(canvas, url, { scale: 5, border: 3 }); })
              .catch(function () { qrWrap.remove(); });
            var codeField = h('input', { class: 'input mono', type: 'text', readonly: 'readonly', value: token, dir: 'ltr' });
            var urlField = h('input', { class: 'input mono', type: 'text', readonly: 'readonly', value: url, dir: 'ltr' });
            linkArea.appendChild(h('label', { class: 'field-label', text: t('sync.linkCode') }));
            linkArea.appendChild(codeField);
            linkArea.appendChild(btn(t('sync.copy'), 'ghost', function () {
              try { navigator.clipboard.writeText(url); } catch (e) {}
            }));
            linkArea.appendChild(h('label', { class: 'field-label', text: t('sync.linkUrl') }));
            linkArea.appendChild(urlField);
          }).catch(function () {
            linkArea.innerHTML = '';
            linkArea.appendChild(note(t('sync.errGeneric'), 'sync-error'));
          });
        }));
        body.appendChild(linkArea);

        body.appendChild(btn(t('sync.regenerate'), 'ghost', function () {
          var st = syncLoadState();
          loadHomeSync().then(function (HS) {
            var repo = new HS.CloudRepository(syncGetConfig(), st.session);
            return repo.revokeLinkTokens();
          }).then(function () {
            showToast(t('sync.regenerated'));
          }).catch(function () { showToast(t('sync.errGeneric')); });
        }));

        body.appendChild(btn(t('sync.disconnect'), 'danger', function () {
          if (window.confirm(t('sync.disconnectConfirm'))) {
            syncDisconnect();
            showToast(t('sync.disconnected'));
            close();
            renderMain();
          }
        }));
      } else if (configured) {
        // Configured but not yet linked on this profile.
        body.appendChild(btn(t('sync.enable'), 'save', function () {
          body.appendChild(note(t('sync.enabling')));
          syncEnableFirstDevice().then(function () {
            close();
            renderMain();
            openSyncSettings();
          }).catch(function () {
            body.appendChild(note(t('sync.errGeneric'), 'sync-error'));
          });
        }));

        var codeInput = h('input', { class: 'input', type: 'text', placeholder: t('sync.codePlaceholder'), dir: 'ltr' });
        body.appendChild(h('label', { class: 'field-label', text: t('sync.enterCode') }));
        body.appendChild(codeInput);
        body.appendChild(btn(t('sync.linkThisDevice'), 'ghost', function () {
          var code = codeInput.value.trim();
          if (!code) return;
          syncLinkThisDevice(code).then(function () {
            close();
            renderMain();
            openSyncSettings();
          }).catch(function () {
            body.appendChild(note(t('sync.errLink'), 'sync-error'));
          });
        }));
      }

      // Backend override (URL + anon key) — ADVANCED + optional, tucked away in
      // a collapsed disclosure. Prefilled from the baked config; not needed for
      // normal use (every device ships already configured via config.js).
      var cfg = syncGetConfig();
      var urlInput = h('input', { class: 'input', type: 'url', value: cfg.url, placeholder: 'https://xxxx.supabase.co', dir: 'ltr' });
      var anonInput = h('input', { class: 'input mono', type: 'text', value: cfg.anonKey, placeholder: 'sb_publishable_… / eyJhbGci…', dir: 'ltr' });
      var advanced = h('details', { class: 'sync-advanced' },
        h('summary', { text: t('sync.backendSettings') }),
        h('p', { class: 'sync-note', text: t('sync.backendSettingsSub') }),
        h('label', { class: 'field-label', text: t('sync.supabaseUrl') }),
        urlInput,
        h('label', { class: 'field-label', text: t('sync.anonKey') }),
        anonInput,
        h('p', { class: 'sync-note', text: t('sync.anonKeyHint') }),
        btn(t('sync.save'), 'save', function () {
          try {
            localStorage.setItem(SYNC_URL_KEY, urlInput.value.trim());
            localStorage.setItem(SYNC_ANON_KEY, anonInput.value.trim());
          } catch (e) {}
          showToast(t('sync.saved'));
          rebuild();
        })
      );
      body.appendChild(advanced);
    }

    var dialog = h('div', { class: 'dialog settings-dialog' },
      h('div', { class: 'sheet-header' },
        h('h2', { class: 'dialog-title', text: t('sync.title') }),
        h('button', { class: 'sheet-close', 'aria-label': t('a11y.close'), onclick: close }, '✕')
      ),
      h('p', { class: 'sync-subtitle', text: t('sync.subtitle') }),
      body
    );
    rebuild();
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  function openSettings() {
    var cu = window.CurrentUser;
    var overlay = h('div', { class: 'overlay center' });

    // Reopen (translated) after a live language change, like the other dialogs.
    var prevReopen = reopenTop;
    var myReopen = function () { openSettings(); };
    reopenTop = myReopen;
    function close() {
      overlay.remove();
      if (reopenTop === myReopen) reopenTop = prevReopen;
    }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var state = { lang: window.I18N.getLang() };
    var langBox = langSegment(state, function (l) {
      window.Auth.updateProfile({ lang: l });
      changeLanguage(l);
    });

    function row(label, sub, onClick) {
      return h('button', { class: 'settings-row', type: 'button', onclick: onClick },
        h('span', { class: 'settings-row-main' },
          h('span', { class: 'settings-row-label', dir: 'auto', text: label }),
          sub ? h('span', { class: 'settings-row-sub', text: sub }) : null
        ),
        h('span', { class: 'settings-row-chevron', 'aria-hidden': 'true', text: '›' })
      );
    }

    var dialog = h('div', { class: 'dialog settings-dialog' },
      h('div', { class: 'sheet-header' },
        h('h2', { class: 'dialog-title', text: t('settings.title') }),
        h('button', { class: 'sheet-close', 'aria-label': t('a11y.close'), onclick: close }, '✕')
      ),
      h('div', { class: 'settings-account' },
        avatarEl('lg'),
        h('div', { class: 'settings-account-info' },
          h('div', { class: 'settings-account-name', dir: 'auto', text: cu ? cu.displayName() : '' }),
          cu && cu.username() ? h('div', { class: 'settings-account-sub', text: '@' + cu.username() }) : null
        )
      ),
      row(t('settings.editProfile'), null, function () { close(); openProfile(); }),
      row(t('auth.switchUser'), t('auth.switchUserSub'), function () { close(); renderSwitchUser(); }),
      row(t('auth.manageUsers'), t('auth.manageUsersSub'), function () { close(); renderManageUsers(); }),
      row(t('settings.sync'), t('settings.syncSub'), function () { close(); openSyncSettings(); }),
      h('label', { class: 'field-label', text: t('auth.preferredLanguage') }),
      langBox,
      h('button', { class: 'btn ghost', type: 'button', onclick: function () { close(); chooseAnother(); } }, t('auth.chooseAnother')),
      h('div', { class: 'settings-version', text: t('app.versionLabel') + ' ' + (window.APP_VERSION || '') })
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  // ---- Auth / boot ----
  function enterApp() {
    var uid = window.CurrentUser.id();
    window.PantryDB.setUser(uid); // scope all data access to this user id
    window.I18N.setUser(uid); // load this user's language preference
    window.Auth.touchSession();
    return load()
      .then(function () {
        // One-time: fold any legacy inline images into the deduped image store.
        return migrateInlineImages();
      })
      .then(function () {
        // One-time: give legacy single-name items a bilingual name pair.
        return migrateItemNames();
      })
      .then(function () {
        recomputeShortfall();
        renderMain();
        // Wake cross-device sync ONLY if configured + linked (else dormant).
        syncBoot();
        // If we arrived via a device-link URL / QR, auto-join now.
        if (pendingLinkToken) {
          var tk = pendingLinkToken;
          pendingLinkToken = null;
          syncAutoRedeem(tk);
        }
      });
  }

  // Clear only the active selection and return to the picker (deletes NO data).
  function chooseAnother() {
    window.Auth.logout();
    window.PantryDB.setUser(null); // drop data scope
    window.I18N.setUser(null); // back to the shared picker language
    items = [];
    renderSwitchUser();
  }

  // Seed the shared Guest profile's inventory with distinct sample data so
  // per-user isolation is visibly demonstrable. Runs once (flag-guarded).
  function seedGuestUserData() {
    var FLAG = 'pantry.seed.guest.v1';
    try {
      if (localStorage.getItem(FLAG)) return Promise.resolve();
    } catch (e) {}
    if (!window.Auth.getUser('guest')) return Promise.resolve();
    window.PantryDB.setUser('guest');
    return window.PantryDB.getAll().then(function (existing) {
      var chain = Promise.resolve();
      if (!existing || !existing.length) {
        [
          { name: 'Coffee', quantity: 1, unit: 'g', categoryId: 'drinks', location: 'Pantry', emoji: '☕', desiredAmount: 2 },
          { name: 'Pasta', quantity: 3, unit: 'pack', categoryId: 'dry', location: 'Pantry', emoji: '🍝', desiredAmount: 4 },
          { name: 'Bananas', quantity: 0, unit: 'kg', categoryId: 'fruit', location: 'Pantry', emoji: '🍌', desiredAmount: 1 },
          { name: 'Orange juice', quantity: 1, unit: 'L', categoryId: 'drinks', location: 'Fridge', emoji: '🧃' },
        ].forEach(function (s) {
          chain = chain.then(function () { return window.PantryDB.create(s); });
        });
      }
      return chain.then(function () {
        try { localStorage.setItem(FLAG, '1'); } catch (e) {}
        window.PantryDB.setUser(null);
      });
    });
  }

  // Re-render on breakpoint crossing (space-based, via CSS matchMedia — NOT
  // user-agent). Uses in-memory data, so inventory is never reloaded and the
  // active user / current view is preserved. Fires only when the ~1024px line
  // is crossed, not on every resize.
  function watchBreakpoint() {
    if (typeof window.matchMedia !== 'function') return;
    mqWide = window.matchMedia('(min-width: ' + BREAKPOINT + 'px)');
    var onChange = function () {
      if (window.CurrentUser && window.CurrentUser.id()) renderCurrentView();
    };
    if (mqWide.addEventListener) mqWide.addEventListener('change', onChange);
    else if (mqWide.addListener) mqWide.addListener(onChange); // older Safari
  }

  function start() {
    window.I18N.init(); // shared language for the picker
    watchBreakpoint();
    // Capture a device-link token from the URL (opened link / scanned QR) and
    // scrub it from the address bar; it is redeemed once a profile is active.
    pendingLinkToken = parseLinkToken();
    if (pendingLinkToken) cleanLinkUrl();
    window.Auth.init() // migrate old password profiles -> open profiles; seed demos
      .then(function () { return seedGuestUserData(); })
      .then(function () {
        // One-time migration of any pre-auth data into the seeded 'aviraz' user.
        return window.PantryDB.migrateLegacyInto('aviraz');
      })
      .then(function () {
        var st = window.Auth.restore(); // 'ok' | 'none'
        if (st === 'ok') enterApp();
        else renderSwitchUser();
      })
      .catch(function () {
        renderSwitchUser();
      });
  }

  window.App = {
    start: start,
    renderMain: renderMain,
    // Two DISTINCT screens: fast one-tap switching vs. full CRUD management.
    renderSwitchUser: renderSwitchUser,
    renderManageUsers: renderManageUsers,
    // Pure, DOM-free helpers exposed for the automated logic harness.
    _internals: {
      detectLang: detectLang,
      resolveNames: resolveNames,
      localName: localName,
      // THE single shared barcode lookup used by camera + manual entry.
      lookupBarcode: lookupBarcode,
      // Sync gating (dormant-by-default) — exposed for the logic harness.
      syncGetConfig: syncGetConfig,
      syncConfigured: syncConfigured,
      cloudTableFor: cloudTableFor,
      mapItemToCloud: mapItemToCloud,
      parseLinkToken: parseLinkToken,
      syncAutoRedeem: syncAutoRedeem,
      // Responsive Shopping List — one shared renderer + pure breakpoint logic.
      renderShoppingList: renderShoppingList,
      layoutModeForWidth: layoutModeForWidth,
      computeShortfall: computeShortfall,
      BREAKPOINT: BREAKPOINT,
    },
  };
})();
