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
      auth: {
        title: 'My Pantry',
        subtitle: 'Sign in to your pantry',
        username: 'Username',
        usernamePlaceholder: 'Enter your username',
        password: 'Password',
        passwordPlaceholder: 'Enter your password',
        login: 'Sign in',
        logout: 'Sign out',
        a11y: 'Account',
        demoHint: 'Demo: aviraz / aviraz · test / test',
        welcome: 'Welcome, {{name}}',
        loggedOut: 'Signed out',
        errorEmpty: 'Enter a username and password',
        errorUnknownUser: 'User not found',
        errorWrongPassword: 'Incorrect password',
        invalidCredentials: 'Invalid username or password.',
        tooManyAttempts: 'Too many attempts. Try again in {{seconds}}s.',
        sessionExpired: 'Your session expired. Please sign in again.',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        loggingIn: 'Signing in…',
        profile: 'Profile',
        displayName: 'Display name',
        preferredLanguage: 'Preferred language',
        addAvatar: 'Add photo',
        changeAvatar: 'Change photo',
        removeAvatar: 'Remove photo',
        save: 'Save',
        confirmLogoutTitle: 'Sign out?',
        confirmLogoutMsg: 'You can sign back in anytime. Your data stays on this device.',
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
      auth: {
        title: 'המזווה שלי',
        subtitle: 'התחברו למזווה שלכם',
        username: 'שם משתמש',
        usernamePlaceholder: 'הזינו שם משתמש',
        password: 'סיסמה',
        passwordPlaceholder: 'הזינו סיסמה',
        login: 'התחברות',
        logout: 'התנתקות',
        a11y: 'חשבון',
        demoHint: 'הדגמה: aviraz / aviraz · test / test',
        welcome: 'ברוך הבא, {{name}}',
        loggedOut: 'התנתקת',
        errorEmpty: 'הזינו שם משתמש וסיסמה',
        errorUnknownUser: 'המשתמש לא נמצא',
        errorWrongPassword: 'סיסמה שגויה',
        invalidCredentials: 'שם משתמש או סיסמה שגויים.',
        tooManyAttempts: 'יותר מדי ניסיונות. נסו שוב בעוד {{seconds}} שניות.',
        sessionExpired: 'תוקף ההתחברות פג. יש להתחבר מחדש.',
        showPassword: 'הצגת סיסמה',
        hidePassword: 'הסתרת סיסמה',
        loggingIn: 'מתחבר…',
        profile: 'פרופיל',
        displayName: 'שם תצוגה',
        preferredLanguage: 'שפה מועדפת',
        addAvatar: 'הוספת תמונה',
        changeAvatar: 'החלפת תמונה',
        removeAvatar: 'הסרת תמונה',
        save: 'שמירה',
        confirmLogoutTitle: 'להתנתק?',
        confirmLogoutMsg: 'ניתן להתחבר שוב בכל עת. הנתונים נשמרים במכשיר זה.',
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
  };
})();
