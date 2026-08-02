/* Automated logic harness for the passwordless open-profile system, per-user
   storage, AND the bilingual (EN/HE) product-name system. Runs on Node using
   the localStorage-fallback path of db.js. No browser required.

   Run: node tools/auth-test.js   (exit code 0 = all pass)

   Bilingual coverage: language detection, resolveNames (catalog pick +
   catalog-enriched typed names), localName language-aware display + graceful
   fallback (dual / single-side / legacy-only), loss-free idempotent name
   migration with no duplicates, db.create name persistence, and full deep
   EN/HE i18n key parity.

   NOTE: This exercises logic only. Camera, RTL visuals, immediate re-render,
   state preservation, real IndexedDB and the canvas image pipeline are covered
   by the manual verification checklist. */
'use strict';

// ---- Minimal browser-ish stubs ----
var elStub = {
  lang: '',
  dir: '',
  setAttribute: function () {},
  classList: { add: function () {}, remove: function () {}, toggle: function () {} },
  style: {},
};
global.document = { documentElement: elStub, body: elStub };
// navigator is a read-only global in modern Node; override with a writable stub.
Object.defineProperty(global, 'navigator', {
  value: { language: 'en', onLine: true },
  configurable: true,
  writable: true,
});
var _store = {};
global.localStorage = {
  getItem: function (k) { return k in _store ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; },
};
global.window = {};
// foods.js assigns to `self`; app.js reads `window.FOODS`. In the browser
// self === window, so mirror that here for the localization helpers.
global.self = global.window;

// ---- Seed an OLD password-format profile store (v2, WITH credentials) so we
//      can verify the one-time passwordless migration strips them safely. ----
_store['pantry.auth.users.v2'] = JSON.stringify({
  users: {
    aviraz: {
      id: 'aviraz', username: 'aviraz', usernameLower: 'aviraz', displayName: 'Aviraz',
      avatar: null, lang: null,
      cred: { algo: 'PBKDF2-SHA256', iterations: 150000, salt: 'a'.repeat(32), hash: 'b'.repeat(64) },
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    },
    test: {
      id: 'test', username: 'test', usernameLower: 'test', displayName: 'Test User',
      avatar: null, lang: null,
      cred: { algo: 'weak-fallback', iterations: 1, salt: 'cccc', hash: 'dddd' },
      createdAt: '2020-01-02T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z',
    },
  },
  byUsername: { aviraz: 'aviraz', test: 'test' },
});
// Obsolete password-era session + rate-limit state (should be cleaned up).
_store['pantry.auth.session.v2'] = JSON.stringify({ userId: 'aviraz', expiresAt: Date.now() + 1e9 });
_store['pantry.auth.attempts.v1'] = JSON.stringify({ aviraz: { count: 3, first: Date.now() } });

// ---- Seed pre-auth (v1.3.0-style) legacy data BEFORE loading modules ----
_store['pantry.items.fallback'] = JSON.stringify([
  { id: 'legacy1', name: 'Legacy Milk', quantity: 2, unit: 'L', categoryId: 'dairy', location: 'Fridge', desiredAmount: 3, barcode: '111', emoji: '🥛', image: null },
  { id: 'legacy2', name: 'Legacy Eggs', quantity: 6, unit: 'pcs', categoryId: 'dairy', location: 'Fridge', desiredAmount: 12, barcode: '222', emoji: '🥚', image: null },
]);
_store['pantry.monthly.v1'] = JSON.stringify({ '2026-08': { restocked: 5, consumed: 1, shortfall: [] } });
_store['pantry.lang'] = 'he';

// ---- Load app modules (order matches index.html) ----
require('../i18n.js');
require('../db.js');
require('../auth.js');
require('../data/foods.js'); // sets self.FOODS (=> window.FOODS)
window.FOODS = self.FOODS;
require('../app.js'); // exposes window.App._internals (DOM-free helpers)
var Auth = global.window.Auth;
var CurrentUser = global.window.CurrentUser;
var DB = global.window.PantryDB;
var I18N = global.window.I18N;
var AppI = global.window.App._internals;

// ---- tiny assert framework ----
var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 FAIL: ' + name); }
}
async function rejects(name, fn) {
  try { await fn(); ok(name + ' (should reject)', false); }
  catch (e) { ok(name, true); }
}

(async function run() {
  console.log('PASSWORDLESS PROFILES + PER-USER STORAGE HARNESS');

  // 1) Migration: password profiles -> open profiles (once, idempotent, safe)
  console.log('\n[migration to passwordless]');
  await Auth.init(); // runs UserMigration + seeds demo profiles
  var repo = Auth._internals.UserRepository;
  ok('aviraz credential removed', !('cred' in (repo.getById('aviraz') || {})));
  ok('test credential removed', !('cred' in (repo.getById('test') || {})));
  ok('no "cred" anywhere in store', (_store['pantry.auth.users.v2'] || '').indexOf('"cred"') === -1);
  ok('no PBKDF2/hash residue in store', (_store['pantry.auth.users.v2'] || '').indexOf('PBKDF2') === -1);
  ok('old session cleared', localStorage.getItem('pantry.auth.session.v2') === null);
  ok('old attempts cleared', localStorage.getItem('pantry.auth.attempts.v1') === null);
  ok('migration checkpoint recorded', Auth._internals.UserMigration.done() === true);
  ok('migration is idempotent (no-op on re-run)', Auth._internals.UserMigration.run() === false);

  // 2) Preserved + seeded profiles
  console.log('\n[profiles preserved + seeded]');
  var names = Auth.listUsers().map(function (u) { return u.id; }).sort();
  ok('Aviraz + Guest + Test all present', names.join(',') === 'aviraz,guest,test');
  ok('aviraz has stable id "aviraz"', Auth.getUser('aviraz').id === 'aviraz');
  ok('aviraz keeps display name', Auth.getUser('aviraz').displayName === 'Aviraz');
  ok('guest profile seeded', !!Auth.getUser('guest'));
  ok('sanitized profile exposes no cred', !('cred' in Auth.getUser('aviraz')));
  ok('re-init does not duplicate profiles', (await Auth.init(), Auth.listUsers().length === 3));

  // 3) Selecting a profile loads the correct (migrated) data
  console.log('\n[select profile -> data]');
  var migrated = await DB.migrateLegacyInto('aviraz');
  ok('legacy migration runs once (true)', migrated === true);
  var sel = Auth.selectUser('aviraz');
  ok('selectUser returns the user (no password)', !!sel && sel.id === 'aviraz');
  ok('active user is aviraz', CurrentUser.id() === 'aviraz');
  DB.setUser(CurrentUser.id());
  var avInv = await DB.getAll();
  ok('selecting aviraz loads its data (2 legacy items)', avInv.length === 2);
  ok('preserves original ids', avInv.some(function (x) { return x.id === 'legacy1'; }));
  ok('per-user language preserved (he)', _store['pantry.lang.aviraz'] === 'he');

  // 4) Refresh restores the active user
  console.log('\n[restore active user]');
  CurrentUser._clear(); // simulate a page reload (in-memory context lost)
  ok('restore -> ok', Auth.restore() === 'ok');
  ok('restored active user is aviraz', CurrentUser.id() === 'aviraz');

  // 5) Create user (display name required; username dedupe)
  console.log('\n[create user]');
  var created = await Auth.createUser({ displayName: 'Dana', username: 'dana', lang: 'en' });
  ok('create user succeeds', created.ok === true && !!created.user.id);
  var danaId = created.user.id;
  ok('new user appears in list', Auth.listUsers().some(function (u) { return u.id === danaId; }));
  var dup = await Auth.createUser({ displayName: 'Dana II', username: 'dana' });
  ok('duplicate username prevented', dup.ok === false && dup.error === 'exists');
  var empty = await Auth.createUser({ displayName: '   ' });
  ok('display name required', empty.ok === false && empty.error === 'empty');

  // 6) New-user isolation + switching changes the active data scope
  console.log('\n[isolation + switching]');
  Auth.selectUser(danaId); DB.setUser(CurrentUser.id());
  ok('new user starts empty', (await DB.getAll()).length === 0);
  await DB.create({ name: 'Dana Milk', quantity: 1, unit: 'L', categoryId: 'dairy', location: 'Fridge' });
  ok('dana now has 1 item', (await DB.getAll()).length === 1);
  Auth.selectUser('aviraz'); DB.setUser(CurrentUser.id());
  ok('switching back to aviraz shows its 2 items', (await DB.getAll()).length === 2);
  ok('aviraz cannot see dana data', !(await DB.getAll()).some(function (x) { return x.name === 'Dana Milk'; }));

  // 7) Scope enforcement at the data layer (no active user)
  console.log('\n[scope enforcement]');
  DB.setUser(null);
  await rejects('getAll rejects with no user scope', function () { return DB.getAll(); });
  await rejects('create rejects with no user scope', function () { return DB.create({ name: 'x' }); });

  // 8) Delete user (guarded) + data removal
  console.log('\n[delete user]');
  Auth.selectUser('aviraz'); // aviraz active
  ok('cannot delete the ACTIVE profile', Auth.deleteUser('aviraz') === false);
  var delOk = Auth.deleteUser(danaId);
  await DB.deleteUserData(danaId);
  ok('delete removes the profile record', delOk === true && !Auth.listUsers().some(function (u) { return u.id === danaId; }));
  DB.setUser(danaId);
  ok("deleted user's data is cleared", (await DB.getAll()).length === 0);

  // 9) Logout returns to the picker (clears active only, no data loss)
  console.log('\n[logout -> picker]');
  Auth.selectUser('aviraz'); DB.setUser('aviraz');
  Auth.logout();
  ok('logout clears the active selection', Auth.isAuthenticated() === false);
  ok('restore after logout -> none', Auth.restore() === 'none');
  DB.setUser('aviraz');
  ok('aviraz data still intact after logout (2)', (await DB.getAll()).length === 2);

  // 10) i18n keys present in EN + HE (new passwordless strings)
  console.log('\n[i18n]');
  ['auth.chooseUser', 'auth.addUser', 'auth.createUser', 'auth.switchUser', 'auth.editUser',
   'auth.deleteUser', 'auth.save', 'auth.displayName', 'auth.preferredLanguage', 'auth.userCreated',
   'auth.userDeleted', 'auth.confirmDeleteTitle', 'auth.confirmDeleteMsg', 'auth.chooseAnother',
   'auth.activeUser', 'form.cancel', 'app.tagline'].forEach(function (k) {
    I18N.setLang('en'); var en = I18N.t(k, { name: 'X' });
    I18N.setLang('he'); var he = I18N.t(k, { name: 'X' });
    ok(k + ' (en+he present, non-key)', en !== k && he !== k && en !== he);
  });

  // 11) No password logic remains on the public API
  console.log('\n[no password logic]');
  ok('Auth.login removed', typeof Auth.login === 'undefined');
  ok('no rate limiter exposed', !Auth._internals.RateLimiter);
  ok('no crypto hasher exposed', !Auth._internals.CryptoHasher);

  // 12) Bilingual product names: language detection
  console.log('\n[bilingual: language detection]');
  ok('detects Hebrew text', AppI.detectLang('חלב') === 'he');
  ok('detects Latin text as en', AppI.detectLang('Milk') === 'en');
  ok('mixed (has Hebrew) -> he', AppI.detectLang('Milk חלב') === 'he');
  ok('empty/undefined -> en (safe default)', AppI.detectLang('') === 'en' && AppI.detectLang(undefined) === 'en');
  ok('digits/barcode -> en', AppI.detectLang('7290000000001') === 'en');

  // 13) resolveNames: catalog pick preserved; typed enriched; unknown -> fallback
  console.log('\n[bilingual: resolveNames]');
  var rPick = AppI.resolveNames('Ground Beef', 'Ground Beef', 'בשר טחון');
  ok('catalog pair is preserved verbatim', rPick.nameEn === 'Ground Beef' && rPick.nameHe === 'בשר טחון');
  var rHe = AppI.resolveNames('חלב', null, null);
  ok('typed Hebrew fills nameHe', rHe.nameHe === 'חלב');
  ok('typed Hebrew enriches nameEn from catalog', rHe.nameEn === 'Milk');
  var rEn = AppI.resolveNames('Milk', null, null);
  ok('typed English fills nameEn', rEn.nameEn === 'Milk');
  ok('typed English enriches nameHe from catalog', rEn.nameHe === 'חלב');
  var rUnknown = AppI.resolveNames('Zorblax Widget', null, null);
  ok('unknown English fills only nameEn (other null for fallback)', rUnknown.nameEn === 'Zorblax Widget' && rUnknown.nameHe === null);
  var rEmpty = AppI.resolveNames('', null, null);
  ok('empty typed -> both null', rEmpty.nameEn === null && rEmpty.nameHe === null);

  // 14) localName: language-aware display + graceful fallback
  console.log('\n[bilingual: localName fallback]');
  var dual = { name: 'Milk', nameEn: 'Milk', nameHe: 'חלב' };
  I18N.setLang('he'); ok('he UI shows Hebrew name', AppI.localName(dual) === 'חלב');
  I18N.setLang('en'); ok('en UI shows English name', AppI.localName(dual) === 'Milk');
  var onlyHe = { name: 'חלב', nameEn: null, nameHe: 'חלב' };
  I18N.setLang('en'); ok('en UI falls back to Hebrew when no English', AppI.localName(onlyHe) === 'חלב');
  var legacy = { name: 'Legacy Milk' }; // pre-migration item (no nameEn/nameHe)
  I18N.setLang('he'); ok('legacy-only renders in he (fallback)', AppI.localName(legacy) === 'Legacy Milk');
  I18N.setLang('en'); ok('legacy-only renders in en (fallback)', AppI.localName(legacy) === 'Legacy Milk');
  ok('null/empty object -> empty string', AppI.localName(null) === '' && AppI.localName({}) === '');
  // Scan-session/barcode shape uses {name(en), he}
  var sess = { name: 'Milk', he: 'חלב' };
  I18N.setLang('he'); ok('session entry resolves he via .he', AppI.localName(sess) === 'חלב');
  I18N.setLang('en'); ok('session entry resolves en via .name', AppI.localName(sess) === 'Milk');

  // 15) Name migration: idempotent, loss-free, no duplicates
  console.log('\n[bilingual: name migration]');
  // Simulate the enterApp migration predicate + transform on a legacy set.
  var invSet = [
    { id: 'm1', name: 'Milk' },              // English legacy -> enrich he
    { id: 'm2', name: 'חלב' },               // Hebrew legacy  -> enrich en
    { id: 'm3', name: 'Ground Beef', nameEn: 'Ground Beef', nameHe: 'בשר טחון' }, // already bilingual
  ];
  function needsMigration(i) { return !i.nameEn && !i.nameHe && i.name; }
  var pending1 = invSet.filter(needsMigration);
  ok('only legacy items are pending (2 of 3)', pending1.length === 2);
  pending1.forEach(function (it) {
    var r = AppI.resolveNames(it.name, null, null);
    it.nameEn = r.nameEn; it.nameHe = r.nameHe;
  });
  ok('legacy name is preserved (loss-free)', invSet[0].name === 'Milk' && invSet[1].name === 'חלב');
  ok('English legacy gained Hebrew', invSet[0].nameEn === 'Milk' && invSet[0].nameHe === 'חלב');
  ok('Hebrew legacy gained English', invSet[1].nameHe === 'חלב' && invSet[1].nameEn === 'Milk');
  ok('already-bilingual item untouched', invSet[2].nameEn === 'Ground Beef' && invSet[2].nameHe === 'בשר טחון');
  ok('re-run is a no-op (idempotent, no duplicates)', invSet.filter(needsMigration).length === 0 && invSet.length === 3);

  // 16) Item schema carries both names through db.create
  console.log('\n[bilingual: db schema]');
  Auth.selectUser('aviraz'); DB.setUser(CurrentUser.id());
  var createdItem = await DB.create({ name: 'Milk', nameEn: 'Milk', nameHe: 'חלב', quantity: 1, unit: 'L', categoryId: 'dairy', location: 'Fridge' });
  ok('create persists nameEn', createdItem.nameEn === 'Milk');
  ok('create persists nameHe', createdItem.nameHe === 'חלב');
  var createdLegacy = await DB.create({ name: 'Salt', quantity: 1, unit: 'pack', categoryId: 'dry', location: 'Pantry' });
  ok('create defaults missing names to null (fallback)', createdLegacy.nameEn === null && createdLegacy.nameHe === null);

  // 17) Full EN/HE i18n key parity (deep) + new keys present
  console.log('\n[i18n: full EN/HE parity]');
  function flatten(obj, prefix, out) {
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      var key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object') flatten(v, key, out);
      else out[key] = true;
    });
    return out;
  }
  var dicts = I18N._dicts;
  var enKeys = Object.keys(flatten(dicts.en, '', {})).sort();
  var heKeys = Object.keys(flatten(dicts.he, '', {})).sort();
  var missingInHe = enKeys.filter(function (k) { return heKeys.indexOf(k) === -1; });
  var missingInEn = heKeys.filter(function (k) { return enKeys.indexOf(k) === -1; });
  ok('every EN key exists in HE (' + missingInHe.length + ' missing)', missingInHe.length === 0);
  ok('every HE key exists in EN (' + missingInEn.length + ' missing)', missingInEn.length === 0);
  if (missingInHe.length) console.log('    missing in he:', missingInHe.join(', '));
  if (missingInEn.length) console.log('    missing in en:', missingInEn.join(', '));
  ['a11y.close', 'a11y.increase', 'a11y.decrease'].forEach(function (k) {
    I18N.setLang('en'); var en = I18N.t(k);
    I18N.setLang('he'); var he = I18N.t(k);
    ok(k + ' (en+he present, non-key)', en !== k && he !== k);
  });

  // 18) Shared barcode lookup pipeline (camera + manual entry funnel here)
  console.log('\n[scanner: ONE shared lookup pipeline]');
  ok('lookupBarcode exposed as the single shared entry point', typeof AppI.lookupBarcode === 'function');
  Auth.selectUser('aviraz'); DB.setUser(CurrentUser.id());

  // (a) LOCAL hit via saved barcode mapping (per-user barcode store)
  await DB.putBarcode({ barcode: '111LOCAL', name: 'Cached Cola', he: 'קולה', categoryId: 'drinks', unit: 'L', source: 'user' });
  var rCache = await AppI.lookupBarcode('111LOCAL');
  ok('local saved mapping -> source "cache"', rCache.source === 'cache' && rCache.product.name === 'Cached Cola');

  // (b) OFF online hit (stubbed fetch; no image url so no canvas needed)
  var offCalls = 0;
  global.fetch = function () {
    offCalls++;
    return Promise.resolve({ ok: true, json: function () {
      return Promise.resolve({ status: 1, product: {
        product_name_en: 'Test Product', product_name_he: 'מוצר בדיקה',
        brands: 'BrandX', categories_tags: ['en:beverages'], quantity: '1L',
      }});
    }});
  };
  navigator.onLine = true;
  var rOff = await AppI.lookupBarcode('7290116537351'); // the reported barcode
  ok('OFF online lookup -> source "off"', rOff.source === 'off' && rOff.product.name === 'Test Product');
  ok('7290116537351 resolves through the shared pipeline', rOff.product.barcode === '7290116537351');
  ok('OFF result is cached locally for next time', !!(await DB.getBarcode('7290116537351')));
  var beforeCalls = offCalls;
  var rAgain = await AppI.lookupBarcode('7290116537351');
  ok('after first OFF hit -> "cache" with NO extra fetch', rAgain.source === 'cache' && offCalls === beforeCalls);

  // (c) Online NOT FOUND -> create-new fallback, barcode prefilled
  global.fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ status: 0 }); } }); };
  var rNew = await AppI.lookupBarcode('000NOTFOUND');
  ok('online not-found -> source "new" (create fallback)', rNew.source === 'new');
  ok('create fallback prefills the barcode', rNew.product.barcode === '000NOTFOUND');

  // (d) OFFLINE -> offline new-product case (barcode prefilled, no fetch)
  navigator.onLine = false;
  var rOffline = await AppI.lookupBarcode('999OFFLINE');
  ok('offline -> source "offline" (barcode prefilled)', rOffline.source === 'offline' && rOffline.product.barcode === '999OFFLINE');
  navigator.onLine = true;

  // Manual entry and camera single-scan both call AppI.lookupBarcode above and
  // then the shared openBarcodeResult router, so identical barcodes yield
  // identical routing. (DOM dialogs are covered by manual verification.)

  // 19) New scanner/manual strings present in EN + HE
  console.log('\n[scanner: i18n strings]');
  ['scan.manualBarcode', 'scan.manualBarcodeTitle', 'scan.manualBarcodeLabel',
   'scan.manualBarcodePlaceholder', 'scan.manualBarcodeSubmit',
   'scan.debug.title', 'scan.debug.camera', 'scan.debug.formats',
   'scan.debug.fps', 'scan.debug.last', 'scan.debug.attempts', 'scan.debug.status'].forEach(function (k) {
    I18N.setLang('en'); var en = I18N.t(k);
    I18N.setLang('he'); var he = I18N.t(k);
    ok(k + ' (en+he present, non-key, distinct)', en !== k && he !== k && en !== he);
  });

  console.log('\n============================');
  console.log('PASS ' + pass + '  FAIL ' + fail);
  console.log('============================');
  if (fail) process.exit(1);
})().catch(function (e) {
  console.error('HARNESS ERROR', e);
  process.exit(1);
});
