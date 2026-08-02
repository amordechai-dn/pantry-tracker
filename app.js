/* Pantry Tracker — vanilla client-side app logic. Global `App`. */
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
    if (item && item.image) {
      var img = h('img', {
        class: 'thumb-img',
        src: item.image,
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

  // Downscale + compress an uploaded image entirely on-device. Produces a
  // small JPEG data URL (max 256px on the long edge) suitable for IndexedDB.
  // Calls cb(dataUrl) on success or cb(null) on any failure.
  function processImage(file, cb) {
    var MAX = 256;
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
        try {
          var scale = Math.min(1, MAX / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var hgt = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = hgt;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, hgt);
          cb(canvas.toDataURL('image/jpeg', 0.7));
        } catch (e) {
          cb(null);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // ---- Reusable form controls (shared by add/edit form + scanner dialogs) ----

  // On-device photo control. `state` is mutated in place (state.image); the
  // placeholder falls back to state.emoji or the category emoji.
  function photoControl(state) {
    var fileInput = h('input', { class: 'photo-file', type: 'file', accept: 'image/*' });
    var row = h('div', { class: 'photo-row' });
    function render() {
      row.innerHTML = '';
      var tile = state.image
        ? h(
            'div',
            { class: 'photo-preview has-img' },
            h('img', { class: 'thumb-img loaded', src: state.image, alt: '' })
          )
        : h(
            'div',
            { class: 'photo-preview' },
            h('span', { text: state.emoji || categoryEmoji(state.categoryId) })
          );
      var addBtn = h(
        'button',
        { class: 'btn ghost', type: 'button', onclick: function () { fileInput.click(); } },
        state.image ? t('form.changePhoto') : t('form.addPhoto')
      );
      var rm = state.image
        ? h(
            'button',
            {
              class: 'btn ghost danger',
              type: 'button',
              onclick: function () { state.image = null; render(); },
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
      processImage(f, function (dataUrl) {
        if (dataUrl) { state.image = dataUrl; render(); }
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
    return window.PantryDB.getAll().then(function (arr) {
      // Normalize legacy records that predate desiredAmount.
      items = arr.map(function (i) {
        if (typeof i.desiredAmount !== 'number') i.desiredAmount = 0;
        if (typeof i.image === 'undefined') i.image = null; // migrate legacy
        return i;
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

  // ---- Rendering (main screen) ----
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
        onclick: openLang,
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
    var logoutBtn = h(
      'button',
      {
        class: 'icon-btn',
        'aria-label': t('auth.logout'),
        title: t('auth.logout'),
        onclick: doLogout,
      },
      '🚪'
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
        h('div', { class: 'header-btn-row' }, monthlyBtn, langBtn, logoutBtn),
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

      // "To restock" section (items below their desired amount).
      var shortfall = computeShortfall();
      if (shortfall.length > 0) {
        list.appendChild(
          h(
            'div',
            { class: 'section-header' },
            h('span', { class: 'section-emoji', text: '🛒' }),
            h('span', { class: 'section-title', text: t('restock.title') }),
            h('span', { class: 'section-count', text: String(shortfall.length) })
          )
        );
        shortfall.forEach(function (s) {
          var item = itemById(s.id);
          list.appendChild(renderRestockCard(item, s));
        });
      }

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
          list.appendChild(renderCard(item));
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
          'aria-label': '-',
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
          'aria-label': '+',
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
        h('div', { class: 'card-name', text: item.name }),
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
        h('div', { class: 'card-name', text: item.name }),
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
          'aria-label': '+',
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
    window.PantryDB.put(item);
    if (real) recordDelta(real);
    recomputeShortfall();
    renderMain();
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
    var state = {
      name: editing ? existing.name : prefill.name || '',
      quantity: editing ? existing.quantity : 1,
      unit: editing ? existing.unit : 'pcs',
      categoryId: editing ? existing.categoryId : prefill.categoryId || 'other',
      location: editing ? existing.location : prefill.location || 'Pantry',
      note: editing ? existing.note || '' : '',
      desiredAmount: editing ? existing.desiredAmount || 0 : 0,
      barcode: editing ? existing.barcode || null : prefill.barcode || null,
      emoji: editing ? existing.emoji || null : prefill.emoji || null,
      image: editing ? existing.image || null : prefill.image || null,
    };

    var overlay = h('div', { class: 'overlay' });
    var sheet = h('div', { class: 'sheet' });

    function close() {
      overlay.remove();
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
        h('button', { class: 'sheet-close', 'aria-label': 'X', onclick: close }, '✕')
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
            h('span', { class: 'ac-name', text: foodLabel(f) })
          )
        );
      });
    }

    var acTimer;
    nameInput.addEventListener('input', function () {
      state.name = nameInput.value;
      state.emoji = null; // typing invalidates a previously chosen emoji
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
      var payload = {
        name: name,
        quantity: state.quantity,
        unit: state.unit,
        categoryId: state.categoryId,
        location: state.location,
        note: noteInput.value.trim() || null,
        desiredAmount: state.desiredAmount,
        barcode: state.barcode,
        emoji: emoji || null,
        image: state.image || null,
      };
      var p;
      if (editing) {
        Object.keys(payload).forEach(function (k) {
          existing[k] = payload[k];
        });
        p = window.PantryDB.put(existing);
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
        text: t('deleteConfirm.message', { name: item.name }),
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
            if (window.I18N.getLang() !== code) {
              window.I18N.setLang(code);
              (rerender || renderMain)();
            }
            close();
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
  function openMonthly() {
    recomputeShortfall();
    var log = window.PantryDB.getMonthlyLog();
    var current = ym();
    var keys = Object.keys(log);
    if (keys.indexOf(current) === -1) keys.push(current);
    keys.sort().reverse();

    var overlay = h('div', { class: 'overlay center' });
    function close() {
      overlay.remove();
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
                h('span', { class: 'monthly-item-name', text: s.name })
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
        h('button', { class: 'sheet-close', onclick: close, 'aria-label': 'X' }, '✕')
      ),
      h('label', { class: 'field-label', text: t('monthly.month') }),
      select,
      content
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    renderContent(current);
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
            // canvas is not tainted and export succeeds.
            processImage(blob, function (dataUrl) { resolve(dataUrl || null); });
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
    if (window.I18N.getLang() === 'he') return p.he || p.name || t('scan.unknownName');
    return p.name || p.he || t('scan.unknownName');
  }

  function openScanner() {
    // No camera / library support → straight to manual entry.
    if (
      typeof ZXing === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      openForm(null, { prefill: {} });
      return;
    }

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
              h('span', { class: 'scan-row-name', text: scanDisplayName(e) }),
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
            barcode: code, name: it.name, image: it.image, emoji: it.emoji,
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
          return window.PantryDB.create({
            name: nm, quantity: e.count, unit: e.unit, categoryId: e.categoryId,
            location: 'Pantry', barcode: e.barcode, emoji: e.emoji, image: e.image || null,
          }).then(function (item) {
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
        h('button', { class: 'sheet-close', 'aria-label': 'X', onclick: function () { close(false); } }, '✕')
      ),
      h('div', { class: 'scan-hero' },
        itemThumb(item),
        h('div', { class: 'scan-hero-info' },
          h('div', { class: 'scan-hero-name', text: item.name }),
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
      image: product.image || null,
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
        h('button', { class: 'sheet-close', 'aria-label': 'X', onclick: function () { close(false); } }, '✕')
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
    var enInput = h('input', { class: 'input', type: 'text', value: st.en, placeholder: t('form.namePlaceholder'), autocomplete: 'off' });
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
      var existing = itemByBarcode(barcode);
      var p;
      if (existing) {
        existing.quantity += st.qty;
        if (st.image) existing.image = st.image;
        p = window.PantryDB.put(existing).then(function () { recordDelta(st.qty); });
      } else {
        p = window.PantryDB.create({
          name: primary, quantity: st.qty, unit: st.unit, categoryId: st.categoryId,
          location: 'Pantry', barcode: barcode, emoji: emoji || null, image: st.image || null,
        }).then(function (item) { recordDelta(item.quantity); });
      }
      p.then(function () {
        window.PantryDB.putBarcode({
          barcode: barcode, name: en, he: he, categoryId: st.categoryId,
          unit: st.unit, image: st.image || null, emoji: emoji || null,
          brand: product.brand || '', size: product.size || '',
          source: opts.isNew ? 'user' : product.source || 'off',
        });
        close(true);
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

  // ---- Login screen (shown when no user is signed in) ----
  function renderLogin() {
    if (!root) root = document.getElementById('root');
    // Clear any leftover overlays/sheets and the main UI.
    Array.prototype.slice
      .call(document.querySelectorAll('.overlay, .toast'))
      .forEach(function (o) { o.remove(); });
    root.innerHTML = '';

    var langBtn = h(
      'button',
      {
        class: 'lang-btn',
        'aria-label': t('language.a11y'),
        onclick: function () { openLang(renderLogin); },
      },
      '🌐 ' + (window.I18N.getLang() === 'he' ? 'עב' : 'EN')
    );

    var userInput = h('input', {
      class: 'input', type: 'text', placeholder: t('auth.usernamePlaceholder'),
      autocomplete: 'username', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    });
    var passInput = h('input', {
      class: 'input', type: 'password', placeholder: t('auth.passwordPlaceholder'),
      autocomplete: 'current-password',
    });
    var errEl = h('div', { class: 'auth-error', style: 'display:none' });

    function submit() {
      var res = window.Auth.login(userInput.value, passInput.value);
      if (res.ok) {
        enterApp(res.username).then(function () {
          showToast(t('auth.welcome', { name: res.username }));
        });
        return;
      }
      var key =
        res.error === 'unknownUser' ? 'auth.errorUnknownUser'
        : res.error === 'wrongPassword' ? 'auth.errorWrongPassword'
        : 'auth.errorEmpty';
      errEl.textContent = t(key);
      errEl.style.display = 'block';
      (res.error === 'wrongPassword' ? passInput : userInput).classList.add('error');
    }

    [userInput, passInput].forEach(function (inp) {
      inp.addEventListener('input', function () {
        errEl.style.display = 'none';
        inp.classList.remove('error');
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submit();
      });
    });

    var card = h(
      'div',
      { class: 'auth-card' },
      h('div', { class: 'auth-top' }, langBtn),
      h('div', { class: 'auth-logo', text: '🧺' }),
      h('h1', { class: 'auth-title', text: t('auth.title') }),
      h('p', { class: 'auth-subtitle', text: t('auth.subtitle') }),
      h('label', { class: 'field-label', text: t('auth.username') }),
      userInput,
      h('label', { class: 'field-label', text: t('auth.password') }),
      passInput,
      errEl,
      h('button', { class: 'btn save auth-submit', type: 'button', onclick: submit }, t('auth.login')),
      h('p', { class: 'auth-hint', text: t('auth.demoHint') })
    );
    root.appendChild(h('div', { class: 'auth-screen' }, card));
    setTimeout(function () { userInput.focus(); }, 50);
  }

  // ---- Auth / boot ----
  function enterApp(username) {
    window.PantryDB.setUser(username);
    window.I18N.setUser(username); // load this user's language preference
    return load().then(function () {
      recomputeShortfall();
      renderMain();
    });
  }

  function doLogout() {
    window.Auth.logout();
    window.PantryDB.setUser(null);
    window.I18N.setUser(null);
    items = [];
    renderLogin();
    showToast(t('auth.loggedOut'));
  }

  function start() {
    window.Auth.init(); // seed demo users (aviraz/aviraz, guest/guest)
    window.I18N.init(); // shared language for the login screen
    // One-time migration of any pre-auth data into the seeded 'aviraz' user.
    window.PantryDB.migrateLegacyInto('aviraz').then(function () {
      var user = window.Auth.currentUser();
      if (user) enterApp(user);
      else renderLogin();
    });
  }

  window.App = { start: start, renderMain: renderMain };
})();
