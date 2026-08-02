/* Demo authentication layer (global `Auth`).

   ⚠️ DEMO ONLY — NOT REAL SECURITY. Credentials live in localStorage on the
   device and the "hash" below is a trivial non-cryptographic digest. This
   exists purely to namespace per-user data and gate the UI. The module is kept
   deliberately small and behind a stable interface (init/login/logout/
   currentUser/…) so it can later be swapped for a real auth service without
   touching the rest of the app.

   Users:   pantry.auth.users.v1   = { "<lower>": { username, pass } }
   Session: pantry.auth.session.v1 = "<username>"
*/
(function () {
  'use strict';

  var USERS_KEY = 'pantry.auth.users.v1';
  var SESSION_KEY = 'pantry.auth.session.v1';

  function readUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function writeUsers(u) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(u || {}));
    } catch (e) {}
  }

  // Trivial, NON-cryptographic digest. Do not mistake this for security.
  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return String(h);
  }
  function digest(key, password) {
    return hash(key + ':' + String(password == null ? '' : password));
  }

  function addUser(username, password) {
    username = (username || '').trim();
    if (!username) return false;
    var key = username.toLowerCase();
    var u = readUsers();
    u[key] = { username: username, pass: digest(key, password) };
    writeUsers(u);
    return true;
  }

  // Seed demo users on first startup (idempotent).
  function seed() {
    var u = readUsers();
    if (!u['aviraz']) addUser('aviraz', 'aviraz');
    if (!u['guest']) addUser('guest', 'guest');
  }

  function login(username, password) {
    var key = (username || '').trim().toLowerCase();
    if (!key || password == null || password === '')
      return { ok: false, error: 'empty' };
    var rec = readUsers()[key];
    if (!rec) return { ok: false, error: 'unknownUser' };
    if (rec.pass !== digest(key, password))
      return { ok: false, error: 'wrongPassword' };
    setSession(rec.username);
    return { ok: true, username: rec.username };
  }

  function setSession(username) {
    try {
      localStorage.setItem(SESSION_KEY, username);
    } catch (e) {}
  }

  function currentUser() {
    try {
      var s = localStorage.getItem(SESSION_KEY);
      if (!s) return null;
      return readUsers()[s.toLowerCase()] ? s : null;
    } catch (e) {
      return null;
    }
  }

  function logout() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function listUsers() {
    var u = readUsers();
    return Object.keys(u).map(function (k) {
      return u[k].username;
    });
  }

  function init() {
    seed();
  }

  window.Auth = {
    init: init,
    seed: seed,
    login: login,
    logout: logout,
    setSession: setSession,
    currentUser: currentUser,
    listUsers: listUsers,
    addUser: addUser,
  };
})();
