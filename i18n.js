/* Internationalization: English + native-quality Hebrew, with RTL handling.
   Exposed as a global `I18N` (no build step / modules to keep paths simple). */
(function () {
  'use strict';

  var dictionaries = {
    en: {
      app: { title: 'HomeStock', tagline: 'Smart Home Inventory', versionLabel: 'Version' },
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
        photo: 'Photo',
        addPhoto: 'Add photo',
        changePhoto: 'Change photo',
        removePhoto: 'Remove photo',
        imageError: "Couldn't load that image",
        location: 'Location',
        category: 'Category',
        quantity: 'Quantity',
        unit: 'Unit',
        desired: 'Desired amount (monthly target)',
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
      autocomplete: {
        suggestions: 'Suggestions',
        none: 'No matches',
      },
      restock: {
        title: 'To restock',
        missing: '{{missing}} missing (have {{have}} of {{target}})',
      },
      scan: {
        button: 'Scan product',
        fabHint: 'Scan',
        point: 'Point the camera at a product barcode',
        looking: 'Looking up product…',
        loading: 'Loading scanner…',
        loadError: "Couldn't load the scanner — enter the details",
        denied: 'Camera access was denied. You can add the item manually.',
        manual: 'Enter manually',
        added: 'Added “{{name}}”',
        notFound: 'Product not found — enter the details',
        undo: 'Undo',
        continuous: 'Continuous scan',
        detected: 'Detected {{code}}',
        foundLocal: 'Already in your pantry',
        fromCatalog: 'From your saved products',
        fromOff: 'Imported from Open Food Facts',
        offline: 'Offline — using saved products only',
        offUnreachable: "Couldn't reach the product database — enter the details",
        sessionTitle: 'Scanned',
        sessionEmpty: 'Scan a barcode to begin',
        addAll: 'Add all ({{count}})',
        committed: 'Added {{count}} products to your pantry',
        reviewTitle: 'Review product',
        newTitle: 'New product',
        barcode: 'Barcode',
        enName: 'English name',
        heName: 'Hebrew name',
        brand: 'Brand',
        size: 'Package size',
        nameRequired: 'Enter at least one name',
        addUnitsTitle: 'Add to pantry',
        inStock: 'In stock: {{qty}} {{unit}}',
        howMany: 'How many to add?',
        add: 'Add',
        save: 'Save',
        unknownName: 'Unknown product',
      },
      monthly: {
        button: 'Monthly restock',
        title: 'Monthly restock',
        month: 'Month',
        restocked: 'Restocked',
        consumed: 'Used',
        units: 'units',
        needs: 'To restock this month',
        none: 'Nothing to restock 🎉',
        empty: 'No data for this month yet',
      },
      language: {
        title: 'Language',
        a11y: 'Change language',
        english: 'English',
        hebrew: 'עברית',
      },
      a11y: {
        close: 'Close',
        increase: 'Increase',
        decrease: 'Decrease',
      },
      auth: {
        title: 'HomeStock',
        subtitle: 'Smart Home Inventory',
        a11y: 'Profile',
        chooseUser: 'Choose a profile',
        chooseUserSub: 'Tap a profile to continue',
        username: 'Username',
        usernameOptional: 'Username (optional)',
        usernamePlaceholder: 'e.g. alex',
        addUser: 'Add user',
        createUser: 'Create user',
        createUserTitle: 'Create profile',
        createButton: 'Create',
        editUser: 'Edit user',
        editUserTitle: 'Edit profile',
        switchUser: 'Switch user',
        chooseAnother: 'Choose another user',
        deleteUser: 'Delete user',
        activeUser: 'Active',
        displayName: 'Display name',
        displayNamePlaceholder: 'e.g. Alex',
        displayNameRequired: 'Enter a display name',
        usernameTaken: 'That username is already taken',
        preferredLanguage: 'Preferred language',
        profile: 'Profile',
        addAvatar: 'Add photo',
        changeAvatar: 'Change photo',
        removeAvatar: 'Remove photo',
        save: 'Save',
        welcome: 'Welcome, {{name}}',
        userCreated: 'User created successfully',
        userDeleted: 'User deleted successfully',
        confirmDeleteTitle: 'Delete this profile?',
        confirmDeleteMsg:
          'This permanently deletes {{name}} and ALL of their data (inventory, lists, plans, products, images). This cannot be undone.',
        cannotDeleteActive: 'Switch to another profile first to delete this one.',
        loggedOut: 'Signed out',
      },
    },

    he: {
      app: { title: 'HomeStock', tagline: 'ניהול מלאי חכם לבית', versionLabel: 'גרסה' },
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
        photo: 'תמונה',
        addPhoto: 'הוספת תמונה',
        changePhoto: 'החלפת תמונה',
        removePhoto: 'הסרת תמונה',
        imageError: 'לא ניתן לטעון את התמונה',
        location: 'מיקום',
        category: 'קטגוריה',
        quantity: 'כמות',
        unit: 'יחידה',
        desired: 'כמות רצויה (יעד חודשי)',
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
      autocomplete: {
        suggestions: 'הצעות',
        none: 'אין התאמות',
      },
      restock: {
        title: 'רשימת קניות',
        missing: 'חסר {{missing}} (יש {{have}} מתוך {{target}})',
      },
      scan: {
        button: 'סריקת מוצר',
        fabHint: 'סריקה',
        point: 'כוונו את המצלמה אל ברקוד המוצר',
        looking: 'מחפש מוצר…',
        loading: 'טוען סורק…',
        loadError: 'טעינת הסורק נכשלה — השלימו את הפרטים',
        denied: 'הגישה למצלמה נדחתה. ניתן להוסיף את הפריט באופן ידני.',
        manual: 'הזנה ידנית',
        added: 'נוסף ״{{name}}״',
        notFound: 'המוצר לא נמצא — השלימו את הפרטים',
        undo: 'ביטול',
        continuous: 'סריקה רציפה',
        detected: 'זוהה {{code}}',
        foundLocal: 'כבר קיים במזווה שלך',
        fromCatalog: 'מהמוצרים השמורים שלך',
        fromOff: 'יובא מ-Open Food Facts',
        offline: 'לא מקוון — שימוש במוצרים השמורים בלבד',
        offUnreachable: 'לא ניתן להגיע למאגר המוצרים — השלימו את הפרטים',
        sessionTitle: 'נסרקו',
        sessionEmpty: 'סרקו ברקוד כדי להתחיל',
        addAll: 'הוספת הכול ({{count}})',
        committed: 'נוספו {{count}} מוצרים למזווה שלך',
        reviewTitle: 'בדיקת מוצר',
        newTitle: 'מוצר חדש',
        barcode: 'ברקוד',
        enName: 'שם באנגלית',
        heName: 'שם בעברית',
        brand: 'מותג',
        size: 'גודל אריזה',
        nameRequired: 'יש להזין שם אחד לפחות',
        addUnitsTitle: 'הוספה למזווה',
        inStock: 'במלאי: {{qty}} {{unit}}',
        howMany: 'כמה להוסיף?',
        add: 'הוספה',
        save: 'שמירה',
        unknownName: 'מוצר לא ידוע',
      },
      monthly: {
        button: 'מעקב חודשי',
        title: 'מעקב חודשי',
        month: 'חודש',
        restocked: 'נרכש',
        consumed: 'נצרך',
        units: 'יח׳',
        needs: 'לרכישה החודש',
        none: 'אין מה לרכוש 🎉',
        empty: 'אין נתונים לחודש זה עדיין',
      },
      language: {
        title: 'שפה',
        a11y: 'שינוי שפה',
        english: 'English',
        hebrew: 'עברית',
      },
      a11y: {
        close: 'סגירה',
        increase: 'הוספה',
        decrease: 'הפחתה',
      },
      auth: {
        title: 'HomeStock',
        subtitle: 'ניהול מלאי חכם לבית',
        a11y: 'פרופיל',
        chooseUser: 'בחרו פרופיל',
        chooseUserSub: 'הקישו על פרופיל כדי להמשיך',
        username: 'שם משתמש',
        usernameOptional: 'שם משתמש (אופציונלי)',
        usernamePlaceholder: 'לדוגמה: alex',
        addUser: 'הוספת משתמש',
        createUser: 'יצירת משתמש',
        createUserTitle: 'יצירת פרופיל',
        createButton: 'יצירה',
        editUser: 'עריכת משתמש',
        editUserTitle: 'עריכת פרופיל',
        switchUser: 'החלפת משתמש',
        chooseAnother: 'בחירת משתמש אחר',
        deleteUser: 'מחיקת משתמש',
        activeUser: 'פעיל',
        displayName: 'שם תצוגה',
        displayNamePlaceholder: 'לדוגמה: אלכס',
        displayNameRequired: 'הזינו שם תצוגה',
        usernameTaken: 'שם המשתמש כבר תפוס',
        preferredLanguage: 'שפה מועדפת',
        profile: 'פרופיל',
        addAvatar: 'הוספת תמונה',
        changeAvatar: 'החלפת תמונה',
        removeAvatar: 'הסרת תמונה',
        save: 'שמירה',
        welcome: 'ברוכים הבאים, {{name}}',
        userCreated: 'המשתמש נוצר בהצלחה',
        userDeleted: 'המשתמש נמחק בהצלחה',
        confirmDeleteTitle: 'למחוק פרופיל זה?',
        confirmDeleteMsg:
          'פעולה זו תמחק לצמיתות את {{name}} ואת כל הנתונים שלו (מלאי, רשימות, תוכניות, מוצרים, תמונות). לא ניתן לשחזר.',
        cannotDeleteActive: 'עברו לפרופיל אחר תחילה כדי למחוק פרופיל זה.',
        loggedOut: 'התנתקת',
      },
    },
  };

  var RTL_LANGS = ['he'];
  var STORAGE_BASE = 'pantry.lang';
  var storageKey = STORAGE_BASE; // per-user key set via setUser()
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
      localStorage.setItem(storageKey, l);
    } catch (e) {}
    applyDir();
  }

  function init() {
    var stored = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch (e) {}
    lang = stored === 'en' || stored === 'he' ? stored : detect();
    applyDir();
  }

  // Namespace language settings per logged-in user (independent per user).
  // Loads that user's stored language if any; otherwise keeps the current one.
  // Pass null/undefined to return to the shared (pre-login) key.
  function setUser(id) {
    storageKey = STORAGE_BASE + (id ? '.' + id : '');
    var stored = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch (e) {}
    if (stored === 'en' || stored === 'he') lang = stored;
    applyDir();
  }

  window.I18N = {
    t: t,
    tc: tc,
    setLang: setLang,
    setUser: setUser,
    getLang: function () {
      return lang;
    },
    isRTL: function () {
      return isRtlLang(lang);
    },
    init: init,
    // Exposed for the automated harness's EN/HE key-parity check.
    _dicts: dictionaries,
  };
})();
