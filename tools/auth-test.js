/* Automated logic harness for the passwordless open-profile system + per-user
   storage. Runs on Node using the localStorage-fallback path of db.js. No
   browser required.

   Run: node tools/auth-test.js   (exit code 0 = all pass)

   NOTE: This exercises logic only. Camera, RTL visuals, real IndexedDB and the
   canvas image pipeline are covered by manual verification. */
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

  console.log('\n============================');
  console.log('PASS ' + pass + '  FAIL ' + fail);
  console.log('============================');
  if (fail) process.exit(1);
})().catch(function (e) {
  console.error('HARNESS ERROR', e);
  process.exit(1);
});
