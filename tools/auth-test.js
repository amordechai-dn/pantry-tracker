/* Automated logic harness for the multi-user auth + per-user storage system.
   Runs on Node using the localStorage-fallback path of db.js and the real
   Web Crypto API (globalThis.crypto) used by auth.js. No browser required.

   Run: node tools/auth-test.js   (exit code 0 = all pass)

   NOTE: This exercises logic only. Camera, RTL visuals, and real IndexedDB are
   covered by the manual verification checklist in the report. */
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
var Auth = global.window.Auth;
var CurrentUser = global.window.CurrentUser;
var DB = global.window.PantryDB;
var I18N = global.window.I18N;

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
  console.log('AUTH + PER-USER STORAGE HARNESS');

  // 1) Demo-user init + salted hashing, no plaintext
  console.log('\n[init & hashing]');
  await Auth.init();
  ok('crypto (Web Crypto/PBKDF2) available', Auth._internals.cryptoAvailable === true);
  var users = Auth.listUsers().map(function (u) { return u.username; }).sort();
  ok('seeds aviraz + test', users.join(',') === 'aviraz,test');
  ok('aviraz has stable id "aviraz"', !!Auth.getUser('aviraz') && Auth.getUser('aviraz').id === 'aviraz');
  ok('display name Aviraz', Auth.getUser('aviraz').displayName === 'Aviraz');
  var rawUsers = JSON.parse(_store['pantry.auth.users.v2']);
  var avizCred = rawUsers.users['aviraz'].cred;
  ok('stores salted PBKDF2 hash (algo)', avizCred.algo === 'PBKDF2-SHA256');
  ok('has per-user salt', typeof avizCred.salt === 'string' && avizCred.salt.length >= 16);
  ok('has derived hash', typeof avizCred.hash === 'string' && avizCred.hash.length >= 32);
  ok('no plaintext "password" field stored', JSON.stringify(rawUsers).indexOf('"password"') === -1);
  ok('sanitized user exposes no cred', !('cred' in Auth.getUser('aviraz')));

  // 2) Duplicate-seed prevention
  console.log('\n[idempotent seeding]');
  await Auth.init();
  ok('re-init does not duplicate users', Auth.listUsers().length === 2);

  // 3) Password hashing + verification (unit)
  console.log('\n[password hash/verify]');
  var cred = await Auth._internals.CryptoHasher.hash('correct horse');
  ok('verify correct password', (await Auth._internals.CryptoHasher.verify('correct horse', cred)) === true);
  ok('reject wrong password', (await Auth._internals.CryptoHasher.verify('wrong', cred)) === false);
  ok('unique salts per hash', cred.salt !== (await Auth._internals.CryptoHasher.hash('correct horse')).salt);

  // 4) Login success / failure (generic error)
  console.log('\n[login]');
  var good = await Auth.login('aviraz', 'aviraz');
  ok('login ok (aviraz/aviraz)', good.ok === true && good.user.id === 'aviraz');
  ok('CurrentUser set after login', CurrentUser.id() === 'aviraz');
  ok('isAuthenticated true', Auth.isAuthenticated() === true);
  Auth.logout();
  var badPw = await Auth.login('aviraz', 'nope');
  ok('wrong password -> generic invalid', badPw.ok === false && badPw.error === 'invalid');
  var badUser = await Auth.login('ghost', 'whatever');
  ok('unknown user -> same generic invalid', badUser.ok === false && badUser.error === 'invalid');
  var empty = await Auth.login('aviraz', '');
  ok('empty -> empty error', empty.ok === false && empty.error === 'empty');

  // 5) Rate limiting / throttling
  console.log('\n[rate limiting]');
  Auth._internals.RateLimiter.clear('aviraz');
  var locked = null;
  for (var i = 0; i < 6; i++) locked = await Auth.login('aviraz', 'bad' + i);
  ok('locks after repeated failures', locked.error === 'locked' && typeof locked.wait === 'number');
  ok('correct password still blocked while locked', (await Auth.login('aviraz', 'aviraz')).error === 'locked');
  Auth._internals.RateLimiter.clear('aviraz');
  ok('unlocks after clear (window reset)', (await Auth.login('aviraz', 'aviraz')).ok === true);

  // 6) Offline login (no network dependency)
  console.log('\n[offline login]');
  Auth.logout();
  global.navigator.onLine = false;
  var offline = await Auth.login('aviraz', 'aviraz');
  ok('login works offline', offline.ok === true);
  global.navigator.onLine = true;

  // 7) Session restore / refresh / logout / expiry
  console.log('\n[session]');
  ok('restore after "refresh" -> ok', Auth.restore() === 'ok' && CurrentUser.id() === 'aviraz');
  Auth.logout();
  ok('logout clears session', Auth.restore() === 'none' && CurrentUser.get() === null);
  ok('unauthorized route (no current user)', Auth.isAuthenticated() === false);
  // craft an expired session
  await Auth.login('aviraz', 'aviraz');
  var sess = JSON.parse(_store['pantry.auth.session.v2']);
  sess.expiresAt = Date.now() - 1000;
  _store['pantry.auth.session.v2'] = JSON.stringify(sess);
  Auth.logout(); // clear in-memory current so restore is the source of truth
  _store['pantry.auth.session.v2'] = JSON.stringify(sess); // logout removed it; re-set expired
  ok('expired session -> expired', Auth.restore() === 'expired');

  // 8) Migration of legacy data into aviraz (idempotent, id-preserving)
  console.log('\n[migration]');
  var migrated = await DB.migrateLegacyInto('aviraz');
  ok('migration runs once (returns true)', migrated === true);
  ok('migration checkpoint recorded', DB.hasMigration('legacy-into-user-v1') === true);
  DB.setUser('aviraz');
  var avInv = await DB.getAll();
  ok('legacy items migrated into aviraz (2)', avInv.length === 2);
  ok('preserves original ids', avInv.some(function (x) { return x.id === 'legacy1'; }));
  ok('per-user monthly log copied', !!_store['pantry.monthly.v1.aviraz']);
  ok('per-user language copied (he)', _store['pantry.lang.aviraz'] === 'he');
  var again = await DB.migrateLegacyInto('aviraz');
  ok('re-migration is a no-op (false)', again === false);
  DB.setUser('aviraz');
  ok('no duplicate items after re-run', (await DB.getAll()).length === 2);

  // 9) User data isolation
  console.log('\n[data isolation]');
  DB.setUser('test');
  await DB.create({ name: 'Test Coffee', quantity: 1, unit: 'g', categoryId: 'drinks', location: 'Pantry' });
  var testInv = await DB.getAll();
  ok('test user has its own inventory', testInv.some(function (x) { return x.name === 'Test Coffee'; }));
  DB.setUser('aviraz');
  var avInv2 = await DB.getAll();
  ok('aviraz cannot see test data', !avInv2.some(function (x) { return x.name === 'Test Coffee'; }));
  ok('aviraz inventory unchanged (2)', avInv2.length === 2);

  // 10) Barcode mappings scoped per user
  console.log('\n[barcode scoping]');
  DB.setUser('test');
  await DB.putBarcode({ barcode: '999', name: 'Test-only', categoryId: 'dry', unit: 'pack' });
  ok('test can read its own barcode', (await DB.getBarcode('999')) !== null);
  DB.setUser('aviraz');
  ok('aviraz cannot read test barcode', (await DB.getBarcode('999')) === null);

  // 11) Repository-level scope enforcement
  console.log('\n[scope enforcement]');
  DB.setUser(null);
  await rejects('getAll rejects with no user scope', function () { return DB.getAll(); });
  await rejects('create rejects with no user scope', function () { return DB.create({ name: 'x' }); });
  await rejects('getBarcode rejects with no user scope', function () { return DB.getBarcode('1'); });

  // 12) Switching between two users
  console.log('\n[user switching]');
  var t = await Auth.login('test', 'test');
  ok('login test', t.ok && CurrentUser.id() === 'test');
  DB.setUser(CurrentUser.id());
  ok('scoped inventory = test', (await DB.getAll()).some(function (x) { return x.name === 'Test Coffee'; }));
  var a = await Auth.login('aviraz', 'aviraz');
  ok('switch to aviraz', a.ok && CurrentUser.id() === 'aviraz');
  DB.setUser(CurrentUser.id());
  ok('scoped inventory = aviraz', (await DB.getAll()).some(function (x) { return x.id === 'legacy1'; }));

  // 13) i18n keys present in EN + HE
  console.log('\n[i18n]');
  ['auth.invalidCredentials', 'auth.tooManyAttempts', 'auth.showPassword', 'auth.profile',
   'auth.displayName', 'auth.sessionExpired', 'auth.confirmLogoutMsg', 'auth.loggingIn'].forEach(function (k) {
    I18N.setLang('en'); var en = I18N.t(k, { seconds: 9 });
    I18N.setLang('he'); var he = I18N.t(k, { seconds: 9 });
    ok(k + ' (en+he present, non-key)', en !== k && he !== k && en !== he);
  });

  console.log('\n============================');
  console.log('PASS ' + pass + '  FAIL ' + fail);
  console.log('============================');
  if (fail) process.exit(1);
})().catch(function (e) {
  console.error('HARNESS ERROR', e);
  process.exit(1);
});
