/* ============================================================================
   User layer — open passwordless household profiles (LOCAL, no server).

   HomeStock is a shared home-inventory app: profiles are NOT secure accounts,
   they simply pick "who is using the app" so each person's inventory, lists,
   monthly plans, barcode mappings, products, images and settings stay isolated
   by a stable userId. There are NO passwords, NO hashing, NO login attempts —
   tapping a profile enters immediately.

   Modular pieces (behind stable interfaces so a real backend could be added):
     - UserRepository    : CRUD for profile records (localStorage-backed)
     - ActiveUserManager : persist / restore the selected (active) profile
     - UserContext       : read-only accessor for the active user (window.CurrentUser)
     - UserMigration     : one-time, idempotent, interrupt-safe upgrade from the
                           old password-based records (strips credentials)
     - UserService       : orchestrates the above (window.Auth)

   The rest of the app depends only on window.Auth + window.CurrentUser and on
   the active userId — never on storage details.
   ============================================================================ */
(function () {
  'use strict';

  function newId() {
    return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- UserRepository (localStorage-backed; swap for a real backend later) ----
  // Records are stored under the same key as before so existing profiles (and
  // their stable ids → per-user data) are preserved across the upgrade.
  //   rec = { id, username, usernameLower, displayName, avatar, lang,
  //           createdAt, updatedAt }   (NO credentials)
  var USERS_KEY = 'pantry.auth.users.v2';
  var UserRepository = {
    _load: function () {
      try {
        var d = JSON.parse(localStorage.getItem(USERS_KEY) || 'null');
        if (d && d.users && d.byUsername) return d;
      } catch (e) {}
      return { users: {}, byUsername: {} };
    },
    _save: function (d) {
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(d));
      } catch (e) {}
    },
    getById: function (id) {
      return this._load().users[id] || null;
    },
    getByUsername: function (username) {
      var u = String(username || '').trim().toLowerCase();
      if (!u) return null;
      var d = this._load();
      var id = d.byUsername[u];
      return id ? d.users[id] || null : null;
    },
    all: function () {
      var d = this._load();
      return Object.keys(d.users)
        .map(function (k) {
          return d.users[k];
        })
        .sort(function (a, b) {
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
    },
    exists: function (username) {
      return !!this.getByUsername(username);
    },
    // Create an open profile (no password). Returns the record.
    create: function (opts) {
      var d = this._load();
      var username = String(opts.username || '').trim();
      var id = opts.id || newId();
      var now = new Date().toISOString();
      d.users[id] = {
        id: id,
        username: username,
        usernameLower: username.toLowerCase(),
        displayName: String(opts.displayName || username || '').trim(),
        avatar: opts.avatar || null,
        lang: opts.lang || null,
        createdAt: now,
        updatedAt: now,
      };
      if (username) d.byUsername[username.toLowerCase()] = id;
      this._save(d);
      return d.users[id];
    },
    // Update profile fields (never any credential — there are none).
    update: function (id, patch) {
      var d = this._load();
      var rec = d.users[id];
      if (!rec) return null;
      ['displayName', 'avatar', 'lang'].forEach(function (k) {
        if (patch && k in patch) rec[k] = patch[k];
      });
      rec.updatedAt = new Date().toISOString();
      this._save(d);
      return rec;
    },
    remove: function (id) {
      var d = this._load();
      var rec = d.users[id];
      if (!rec) return false;
      delete d.users[id];
      if (rec.usernameLower) delete d.byUsername[rec.usernameLower];
      this._save(d);
      return true;
    },
  };

  // Expose a profile (identical shape everywhere in the app).
  function sanitize(rec) {
    if (!rec) return null;
    return {
      id: rec.id,
      username: rec.username || '',
      displayName: rec.displayName || rec.username || '',
      avatar: rec.avatar || null,
      lang: rec.lang || null,
    };
  }

  // ---- ActiveUserManager (which profile is currently selected) ----
  var ACTIVE_KEY = 'pantry.auth.active.v1';
  var ActiveUserManager = {
    get: function () {
      try {
        var s = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
        return s && s.userId ? s.userId : null;
      } catch (e) {
        return null;
      }
    },
    set: function (userId) {
      try {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify({ userId: userId, at: Date.now() }));
      } catch (e) {}
    },
    touch: function () {
      var id = this.get();
      if (id) this.set(id);
    },
    clear: function () {
      try {
        localStorage.removeItem(ACTIVE_KEY);
      } catch (e) {}
    },
  };

  // ---- UserContext (read-only accessor; exposed as window.CurrentUser) ----
  var _current = null;
  var UserContext = {
    get: function () {
      return _current;
    },
    id: function () {
      return _current ? _current.id : null;
    },
    username: function () {
      return _current ? _current.username : null;
    },
    displayName: function () {
      return _current ? _current.displayName || _current.username : null;
    },
    avatar: function () {
      return _current ? _current.avatar : null;
    },
    initials: function () {
      var n = this.displayName() || '';
      var parts = n.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '?';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },
    language: function () {
      return window.I18N ? window.I18N.getLang() : _current && _current.lang;
    },
    _set: function (u) {
      _current = u;
    },
    _clear: function () {
      _current = null;
    },
  };

  // ---- UserMigration (password profiles -> open profiles; run once) ----
  // Idempotent + interrupt-safe: guarded by a versioned flag; strips `cred`
  // from every record (only after a successful rewrite) and removes obsolete
  // password-era keys. Stable ids are preserved so all per-user data stays
  // attached (inventory, lists, monthly plans, barcodes, products, images,
  // settings, language) — nothing is lost.
  var MIGRATION_FLAG = 'pantry.auth.passwordless.v1';
  var OLD_SESSION_KEY = 'pantry.auth.session.v2';
  var OLD_ATTEMPTS_KEY = 'pantry.auth.attempts.v1';
  var UserMigration = {
    done: function () {
      try {
        return localStorage.getItem(MIGRATION_FLAG) === '1';
      } catch (e) {
        return false;
      }
    },
    run: function () {
      if (this.done()) return false;
      var d = UserRepository._load();
      var changed = false;
      Object.keys(d.users).forEach(function (id) {
        var rec = d.users[id];
        if (rec && rec.cred) {
          delete rec.cred; // remove password hash/salt (only now, after read)
          rec.updatedAt = new Date().toISOString();
          changed = true;
        }
      });
      if (changed) UserRepository._save(d);
      // Drop obsolete password-era session + rate-limit state.
      try {
        localStorage.removeItem(OLD_SESSION_KEY);
        localStorage.removeItem(OLD_ATTEMPTS_KEY);
      } catch (e) {}
      try {
        localStorage.setItem(MIGRATION_FLAG, '1'); // checkpoint after success
      } catch (e) {}
      return true;
    },
  };

  // ---- UserService (orchestrator; the app's only user dependency) ----
  // Seed profiles preserved across the rebrand: Aviraz + a shared Guest.
  var DEMO_USERS = [
    { id: 'aviraz', username: 'aviraz', displayName: 'Aviraz' },
    { id: 'guest', username: 'guest', displayName: 'Guest' },
  ];

  function seed() {
    DEMO_USERS.forEach(function (u) {
      if (!UserRepository.getById(u.id) && !UserRepository.exists(u.username)) {
        UserRepository.create(u);
      }
    });
  }

  var UserService = {
    // Migrate old password profiles, then ensure demo profiles exist. Async for
    // interface symmetry (nothing here actually awaits, but callers use .then).
    init: function () {
      return Promise.resolve().then(function () {
        UserMigration.run();
        seed();
      });
    },

    listUsers: function () {
      return UserRepository.all().map(sanitize);
    },

    getUser: function (id) {
      return sanitize(UserRepository.getById(id));
    },

    // Enter a profile immediately (no password). Returns the sanitized user or
    // null if the id no longer exists.
    selectUser: function (id) {
      var rec = UserRepository.getById(id);
      if (!rec) return null;
      ActiveUserManager.set(rec.id);
      UserContext._set(sanitize(rec));
      return sanitize(rec);
    },

    // Create a new open profile. Resolves { ok:true, user } or
    // { ok:false, error:'empty'|'exists' }. Async for interface symmetry.
    createUser: function (opts) {
      opts = opts || {};
      var displayName = String(opts.displayName || '').trim();
      var username = String(opts.username || '').trim();
      if (!displayName) return Promise.resolve({ ok: false, error: 'empty' });
      // Prevent accidental duplicates when a username is provided.
      if (username && UserRepository.exists(username))
        return Promise.resolve({ ok: false, error: 'exists' });
      var rec = UserRepository.create({
        displayName: displayName,
        username: username,
        avatar: opts.avatar || null,
        lang: opts.lang || null,
      });
      return Promise.resolve({ ok: true, user: sanitize(rec) });
    },

    // Update any profile by id.
    updateUser: function (id, patch) {
      return sanitize(UserRepository.update(id, patch));
    },

    // Update the active profile (display name / avatar / lang) and refresh ctx.
    updateProfile: function (patch) {
      var id = UserContext.id();
      if (!id) return null;
      var s = sanitize(UserRepository.update(id, patch));
      if (s) UserContext._set(s);
      return s;
    },

    // Delete a profile record. The caller is responsible for deleting that
    // user's data (PantryDB.deleteUserData). The active profile cannot be
    // deleted (switch away first).
    deleteUser: function (id) {
      if (!id || id === UserContext.id()) return false;
      return UserRepository.remove(id);
    },

    // Restore the active profile on startup. Returns 'ok' | 'none'. If the
    // stored profile no longer exists, falls back to the picker.
    restore: function () {
      var id = ActiveUserManager.get();
      if (!id) return 'none';
      var rec = UserRepository.getById(id);
      if (!rec) {
        ActiveUserManager.clear();
        return 'none';
      }
      UserContext._set(sanitize(rec));
      return 'ok';
    },

    // Clear only the active selection (deletes NO data).
    logout: function () {
      ActiveUserManager.clear();
      UserContext._clear();
    },

    touchSession: function () {
      ActiveUserManager.touch();
    },

    isAuthenticated: function () {
      return !!UserContext.get();
    },

    // Testing hooks.
    _internals: {
      UserRepository: UserRepository,
      ActiveUserManager: ActiveUserManager,
      UserMigration: UserMigration,
    },
  };

  window.Auth = UserService;
  window.CurrentUser = UserContext;
})();
