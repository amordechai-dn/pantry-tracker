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
  function computeShortfall() {
    return items
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
  var restockSectionEl = null;

  // (Re)build the "To restock" section into its container.
  function renderRestockInto(container) {
    container.innerHTML = '';
    var shortfall = computeShortfall();
    if (!shortfall.length) return;
    container.appendChild(
      h(
        'div',
        { class: 'section-header' },
        h('span', { class: 'section-emoji', text: '🛒' }),
        h('span', { class: 'section-title', text: t('restock.title') }),
        h('span', { class: 'section-count', text: String(shortfall.length) })
      )
    );
    shortfall.forEach(function (s) {
      container.appendChild(renderRestockCard(itemById(s.id), s));
    });
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
    // Re-render whichever base screen is currently active.
    if (window.CurrentUser && window.CurrentUser.id()) renderMain();
    else renderPicker();
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
    var profileBtn = h(
      'button',
      {
        class: 'icon-btn profile-btn',
        'aria-label': t('auth.profile'),
        title: window.CurrentUser ? window.CurrentUser.displayName() : t('auth.profile'),
        onclick: openProfile,
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
        h('div', { class: 'header-btn-row' }, monthlyBtn, langBtn, profileBtn),
        h('span', { class: 'version', id: 'version', text: window.APP_VERSION || '' })
      )
    );
    root.appendChild(header);

    // Body
    if (total === 0) {
      root.appendChild(
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

      // "To restock" section — kept in its own container so quantity changes
      // can rebuild just this section without touching the rest of the list.
      cardRefs = {};
      restockSectionEl = h('div', { class: 'restock-section' });
      renderRestockInto(restockSectionEl);
      list.appendChild(restockSectionEl);

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
      root.appendChild(list);
    }

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
    // Targeted update: replace just this item's card (O(1)) and rebuild only
    // the "To restock" section (O(shortfall)), avoiding a full list re-render.
    var node = cardRefs[item.id];
    if (node && node.parentNode) {
      var fresh = renderCard(item);
      cardRefs[item.id] = fresh;
      node.parentNode.replaceChild(fresh, node);
      if (restockSectionEl) renderRestockInto(restockSectionEl);
    } else {
      renderMain(); // fallback if the list isn't currently built
    }
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

  function openScanner() {
    // No camera support → straight to manual entry (no need to load ZXing).
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      openForm(null, { prefill: {} });
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
        openForm(null, { prefill: {} });
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
    var reader = new ZXing.BrowserMultiFormatReader();
    var controls = null;

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
    var manualBtn = h(
      'button',
      {
        class: 'btn cancel',
        type: 'button',
        onclick: function () { close(); openForm(null, { prefill: {} }); },
      },
      t('scan.manual')
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
    function close() {
      if (closed) return;
      closed = true;
      stop();
      overlay.remove();
    }
    function flash() {
      frame.classList.add('hit');
      setTimeout(function () { frame.classList.remove('hit'); }, 320);
    }
    function hit() { flash(); scanFeedback(); }

    function startDecode() {
      reader
        .decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          video,
          function (result) { if (result) onCode(result.getText()); }
        )
        .then(function (c) { controls = c; })
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

    function resolveForSession(code) {
      resolveLocal(code).then(function (local) {
        if (local && local.source === 'inventory') {
          var it = local.item;
          addToSession({
            barcode: code, name: it.nameEn || it.name || '', he: it.nameHe || '',
            image: thumbImageFor(it), emoji: it.emoji,
            categoryId: it.categoryId, unit: it.unit, itemId: it.id, source: 'inventory',
          });
          return;
        }
        if (local && local.source === 'cache') {
          addToSession(local.product);
          return;
        }
        status.textContent = t('scan.looking');
        lookupOFF(code).then(function (off) {
          if (off && off.source === 'off') {
            window.PantryDB.putBarcode(off);
            addToSession(off);
          } else {
            if (off && off.offline) status.textContent = t('scan.offline');
            // Unknown/unreachable → placeholder entry; editable later in inventory.
            addToSession({ barcode: code, name: '', categoryId: 'other', unit: 'pcs' });
          }
        });
      });
    }

    function handleSingle(code) {
      resolveLocal(code).then(function (local) {
        if (local && local.source === 'inventory') {
          hit();
          openAddUnits(local.item, resume, closeSaved);
          return;
        }
        if (local && local.source === 'cache') {
          hit();
          openBarcodeProduct(
            { barcode: code, product: local.product, hint: t('scan.fromCatalog') },
            resume, closeSaved
          );
          return;
        }
        lookupOFF(code).then(function (off) {
          hit();
          if (off && off.source === 'off') {
            window.PantryDB.putBarcode(off);
            openBarcodeProduct(
              { barcode: code, product: off, hint: t('scan.fromOff') },
              resume, closeSaved
            );
          } else {
            showToast(off && off.offline ? t('scan.offline') : t('scan.offUnreachable'));
            openBarcodeProduct(
              { barcode: code, product: { barcode: code, categoryId: 'other', unit: 'pcs' }, isNew: true },
              resume, closeSaved
            );
          }
        });
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

  // ---- Profile picker (shown when no active user / on switch) ----
  // Open household profiles: tap to enter immediately, no password.
  function renderPicker() {
    if (!root) root = document.getElementById('root');
    Array.prototype.slice
      .call(document.querySelectorAll('.overlay, .toast'))
      .forEach(function (o) { o.remove(); });
    root.innerHTML = '';

    // Shared language toggle (also the default language for new profiles).
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

    var activeId = window.CurrentUser ? window.CurrentUser.id() : null;
    var users = window.Auth.listUsers();

    function pick(id) {
      var u = window.Auth.selectUser(id);
      if (!u) { renderPicker(); return; }
      enterApp().then(function () {
        showToast(t('auth.welcome', { name: window.CurrentUser.displayName() }));
      });
    }

    var grid = h('div', { class: 'user-grid' });
    users.forEach(function (u) {
      var av = u.avatar
        ? h('div', { class: 'avatar xl has-img' }, h('img', { class: 'avatar-img', src: u.avatar, alt: '' }))
        : h('div', { class: 'avatar xl', text: initialsOf(u.displayName || u.username) });
      grid.appendChild(
        h('div', { class: 'user-card' + (u.id === activeId ? ' active' : ''), onclick: function () { pick(u.id); } },
          u.id === activeId ? h('span', { class: 'user-active-badge', text: t('auth.activeUser') }) : null,
          h('button', {
            class: 'user-edit-btn', type: 'button', 'aria-label': t('auth.editUser'), title: t('auth.editUser'),
            onclick: function (e) { e.stopPropagation(); renderEditUser(u); },
          }, '✏️'),
          av,
          h('div', { class: 'user-card-name', dir: 'auto', text: u.displayName || u.username }),
          u.username ? h('div', { class: 'user-card-sub', text: '@' + u.username }) : null
        )
      );
    });
    // "Add user" card.
    grid.appendChild(
      h('div', { class: 'user-card user-add', onclick: function () { renderCreateUser(); } },
        h('div', { class: 'user-add-plus', text: '＋' }),
        h('div', { class: 'user-card-name', text: t('auth.addUser') })
      )
    );

    root.appendChild(
      h('div', { class: 'picker-screen' },
        h('img', { class: 'brand-logo', src: './icons/icon-192.png', alt: '' }),
        h('h1', { class: 'auth-title', text: t('app.title') }),
        h('p', { class: 'auth-subtitle', text: t('auth.chooseUser') }),
        langSel,
        grid
      )
    );
  }

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
          close();
          window.Auth.selectUser(res.user.id);
          enterApp().then(function () { showToast(t('auth.userCreated')); });
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
      renderPicker();
    }
    function del() {
      if (isActive) { showToast(t('auth.cannotDeleteActive')); return; }
      confirmDeleteUser(u, function () { close(); renderPicker(); });
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
      h('button', { class: 'btn ghost profile-switch', type: 'button', onclick: function () { close(); renderPicker(); } }, t('auth.switchUser')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn cancel', type: 'button', onclick: function () { close(); chooseAnother(); } }, t('auth.chooseAnother')),
        h('button', { class: 'btn save', type: 'button', onclick: save }, t('auth.save'))
      )
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    setTimeout(function () { nameInput.focus(); }, 50);
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
      });
  }

  // Clear only the active selection and return to the picker (deletes NO data).
  function chooseAnother() {
    window.Auth.logout();
    window.PantryDB.setUser(null); // drop data scope
    window.I18N.setUser(null); // back to the shared picker language
    items = [];
    renderPicker();
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

  function start() {
    window.I18N.init(); // shared language for the picker
    window.Auth.init() // migrate old password profiles -> open profiles; seed demos
      .then(function () { return seedGuestUserData(); })
      .then(function () {
        // One-time migration of any pre-auth data into the seeded 'aviraz' user.
        return window.PantryDB.migrateLegacyInto('aviraz');
      })
      .then(function () {
        var st = window.Auth.restore(); // 'ok' | 'none'
        if (st === 'ok') enterApp();
        else renderPicker();
      })
      .catch(function () {
        renderPicker();
      });
  }

  window.App = {
    start: start,
    renderMain: renderMain,
    // Pure, DOM-free helpers exposed for the automated logic harness.
    _internals: {
      detectLang: detectLang,
      resolveNames: resolveNames,
      localName: localName,
    },
  };
})();
