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

  // ---- State ----
  var items = [];
  var root;

  function load() {
    return window.PantryDB.getAll().then(function (arr) {
      // Normalize legacy records that predate desiredAmount.
      items = arr.map(function (i) {
        if (typeof i.desiredAmount !== 'number') i.desiredAmount = 0;
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
        h('div', { class: 'header-btn-row' }, monthlyBtn, langBtn),
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
      h('div', { class: 'badge', text: categoryEmoji(item.categoryId) }),
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
      h('div', { class: 'badge', text: categoryEmoji(item.categoryId) }),
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

    // Name
    var nameInput = h('input', {
      class: 'input',
      type: 'text',
      value: state.name,
      placeholder: t('form.namePlaceholder'),
    });
    body.appendChild(h('label', { class: 'field-label', text: t('form.name') }));
    body.appendChild(nameInput);

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
      var payload = {
        name: name,
        quantity: state.quantity,
        unit: state.unit,
        categoryId: state.categoryId,
        location: state.location,
        note: noteInput.value.trim() || null,
        desiredAmount: state.desiredAmount,
        barcode: state.barcode,
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
  function openLang() {
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
              renderMain();
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
          ul.appendChild(
            h(
              'div',
              { class: 'monthly-item' },
              h('span', { class: 'monthly-item-name', text: s.name }),
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

  // ---- Barcode scanner ----
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

    var overlay = h('div', { class: 'overlay scanner center' });
    var video = h('video', { class: 'scan-video' });
    video.setAttribute('playsinline', 'true');
    video.setAttribute('muted', 'true');
    video.setAttribute('autoplay', 'true');

    var status = h('div', { class: 'scan-status', text: t('scan.point') });
    var reader = new ZXing.BrowserMultiFormatReader();
    var controls = null;
    var done = false;
    var lastCode = null;
    var lastTime = 0;

    function stop() {
      try {
        if (controls) controls.stop();
      } catch (e) {}
      try {
        if (reader.reset) reader.reset();
      } catch (e) {}
    }
    function close() {
      stop();
      overlay.remove();
    }

    var manualBtn = h(
      'button',
      {
        class: 'btn cancel',
        type: 'button',
        onclick: function () {
          close();
          openForm(null, { prefill: {} });
        },
      },
      t('scan.manual')
    );
    var cancelBtn = h(
      'button',
      { class: 'btn cancel', type: 'button', onclick: close },
      t('form.cancel')
    );

    var panel = h(
      'div',
      { class: 'scan-panel' },
      h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-reticle' })),
      status,
      h('div', { class: 'actions' }, cancelBtn, manualBtn)
    );
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function onCode(code) {
      var now = Date.now();
      if (done) return;
      if (code === lastCode && now - lastTime < 3000) return;
      lastCode = code;
      lastTime = now;
      done = true;
      stop();
      status.textContent = t('scan.looking');
      resolveProduct(code, {
        close: function () {
          overlay.remove();
        },
      });
    }

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video,
        function (result) {
          if (result) onCode(result.getText());
        }
      )
      .then(function (c) {
        controls = c;
      })
      .catch(function () {
        // Permission denied or no camera.
        status.textContent = t('scan.denied');
        status.classList.add('error');
      });
  }

  function resolveProduct(code, ctx) {
    function fallbackToForm(showNotFound) {
      ctx.close();
      if (showNotFound) showToast(t('scan.notFound'));
      openForm(null, { prefill: { barcode: code } });
    }

    if (!navigator.onLine) {
      fallbackToForm(false);
      return;
    }

    var url =
      'https://world.openfoodfacts.org/api/v2/product/' +
      encodeURIComponent(code) +
      '.json?fields=product_name,product_name_en,generic_name,brands,categories_tags';

    fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var p = d && d.product;
        var name =
          p && (p.product_name || p.product_name_en || p.generic_name);
        if (d && d.status === 1 && name && name.trim()) {
          var cat = deriveCategory(p.categories_tags);
          window.PantryDB.create({
            name: name.trim(),
            quantity: 1,
            unit: 'pcs',
            categoryId: cat,
            location: 'Pantry',
            barcode: code,
          }).then(function (item) {
            recordDelta(item.quantity);
            ctx.close();
            refresh().then(function () {
              showToast(t('scan.added', { name: item.name }), function () {
                window.PantryDB.remove(item.id).then(function () {
                  recordDelta(-item.quantity);
                  refresh();
                });
              });
            });
          });
        } else {
          fallbackToForm(true);
        }
      })
      .catch(function () {
        fallbackToForm(false);
      });
  }

  // ---- Boot ----
  function start() {
    window.I18N.init();
    load().then(function () {
      recomputeShortfall();
      renderMain();
    });
  }

  window.App = { start: start, renderMain: renderMain };
})();
