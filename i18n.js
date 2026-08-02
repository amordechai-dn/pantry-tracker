/* Internationalization: English + native-quality Hebrew, with RTL handling.
   Exposed as a global `I18N` (no build step / modules to keep paths simple). */
(function () {
  'use strict';

  var dictionaries = {
    en: {
      app: { title: 'My Pantry', versionLabel: 'Version' },
      summary: {
        empty: 'Nothing tracked yet',
        items_one: '{{count}} item',
        items_other: '{{count}} items',
        locations_one: '{{count}} location',
        locations_other: '{{count}} locations',
        across: '{{items}} across {{locations}}',
      },
      locations: { Fridge: 'Fridge', Freezer: 'Freezer', Pantry: 'Pantry' },
      categories: {
        produce: 'Produce',
        fruit: 'Fruit',
        dairy: 'Dairy & Eggs',
        meat: 'Meat & Fish',
        bakery: 'Bakery',
        dry: 'Canned & Dry',
        frozen: 'Frozen',
        drinks: 'Drinks',
        snacks: 'Snacks',
        condiments: 'Condiments',
        other: 'Other',
      },
      units: {
        pcs: 'pcs',
        pack: 'pack',
        kg: 'kg',
        g: 'g',
        L: 'L',
        ml: 'ml',
        box: 'box',
        can: 'can',
      },
      card: { out: 'Out' },
      fab: { add: 'Add item' },
      empty: {
        title: 'Your pantry is empty',
        body: 'Tap the + button to add the first item and start tracking the food you have at home.',
      },
      form: {
        addTitle: 'Add item',
        editTitle: 'Edit item',
        name: 'Name',
        namePlaceholder: 'e.g. Milk, Eggs, Tomatoes',
        location: 'Location',
        category: 'Category',
        quantity: 'Quantity',
        unit: 'Unit',
        note: 'Note (optional)',
        notePlaceholder: 'Brand, size, reminder…',
        delete: 'Delete item',
        cancel: 'Cancel',
        save: 'Save changes',
        create: 'Add to pantry',
      },
      deleteConfirm: {
        title: 'Delete item',
        message: 'Remove “{{name}}” from your pantry?',
        cancel: 'Cancel',
        confirm: 'Delete',
      },
      language: {
        title: 'Language',
        a11y: 'Change language',
        english: 'English',
        hebrew: 'עברית',
      },
    },

    he: {
      app: { title: 'המזווה שלי', versionLabel: 'גרסה' },
      summary: {
        empty: 'עדיין לא הוספת פריטים',
        items_one: 'פריט אחד',
        items_other: '{{count}} פריטים',
        locations_one: 'מיקום אחד',
        locations_other: '{{count}} מיקומים',
        across: '{{items}} ב-{{locations}}',
      },
      locations: { Fridge: 'מקרר', Freezer: 'מקפיא', Pantry: 'מזווה' },
      categories: {
        produce: 'ירקות',
        fruit: 'פירות',
        dairy: 'מוצרי חלב וביצים',
        meat: 'בשר ודגים',
        bakery: 'מאפים',
        dry: 'שימורים ומוצרים יבשים',
        frozen: 'קפואים',
        drinks: 'משקאות',
        snacks: 'חטיפים',
        condiments: 'תבלינים ורטבים',
        other: 'אחר',
      },
      units: {
        pcs: 'יח׳',
        pack: 'חבילה',
        kg: 'ק״ג',
        g: 'גרם',
        L: 'ליטר',
        ml: 'מ״ל',
        box: 'קופסה',
        can: 'פחית',
      },
      card: { out: 'אזל' },
      fab: { add: 'הוספת פריט' },
      empty: {
        title: 'המזווה ריק',
        body: 'הקישו על כפתור ה־+ כדי להוסיף את הפריט הראשון ולהתחיל לעקוב אחר המזון שבבית.',
      },
      form: {
        addTitle: 'הוספת פריט',
        editTitle: 'עריכת פריט',
        name: 'שם',
        namePlaceholder: 'לדוגמה: חלב, ביצים, עגבניות',
        location: 'מיקום',
        category: 'קטגוריה',
        quantity: 'כמות',
        unit: 'יחידה',
        note: 'הערה (רשות)',
        notePlaceholder: 'מותג, גודל, תזכורת…',
        delete: 'מחיקת פריט',
        cancel: 'ביטול',
        save: 'שמירת שינויים',
        create: 'הוספה למזווה',
      },
      deleteConfirm: {
        title: 'מחיקת פריט',
        message: 'להסיר את ״{{name}}״ מהמזווה?',
        cancel: 'ביטול',
        confirm: 'מחיקה',
      },
      language: {
        title: 'שפה',
        a11y: 'שינוי שפה',
        english: 'English',
        hebrew: 'עברית',
      },
    },
  };

  var RTL_LANGS = ['he'];
  var STORAGE_KEY = 'pantry.lang';
  var lang = 'en';

  function isRtlLang(l) {
    return RTL_LANGS.indexOf(l) !== -1;
  }

  function detect() {
    try {
      var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
      if (nav.indexOf('he') === 0 || nav.indexOf('iw') === 0) return 'he';
    } catch (e) {}
    return 'en';
  }

  function lookup(l, path) {
    var parts = path.split('.');
    var cur = dictionaries[l];
    for (var i = 0; i < parts.length; i++) {
      if (cur && typeof cur === 'object' && parts[i] in cur) cur = cur[parts[i]];
      else return null;
    }
    return typeof cur === 'string' ? cur : null;
  }

  function t(path, vars) {
    var str = lookup(lang, path);
    if (str == null) str = lookup('en', path);
    if (str == null) return path;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        str = str.replace(new RegExp('{{' + k + '}}', 'g'), String(vars[k]));
      });
    }
    return str;
  }

  // Pluralized count helper: base like "summary.items".
  function tc(base, count) {
    var key = base + (count === 1 ? '_one' : '_other');
    return t(key, { count: count });
  }

  function applyDir() {
    var rtl = isRtlLang(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }

  function setLang(l) {
    if (l !== 'en' && l !== 'he') return;
    lang = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch (e) {}
    applyDir();
  }

  function init() {
    var stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (e) {}
    lang = stored === 'en' || stored === 'he' ? stored : detect();
    applyDir();
  }

  window.I18N = {
    t: t,
    tc: tc,
    setLang: setLang,
    getLang: function () {
      return lang;
    },
    isRTL: function () {
      return isRtlLang(lang);
    },
    init: init,
  };
})();
