# Pantry Tracker 🌿 (PWA)

A fully client-side **Progressive Web App** to track the food and groceries you
have at home — grouped by where you store it (Fridge / Freezer / Pantry). No
server, no accounts, works **offline**, and **auto-updates** when a new version
is deployed. Built with plain HTML/CSS/JS (no framework, no build step, no
CDNs).

**Live app:** https://amordechai-dn.github.io/pantry-tracker/

## Features

- Add / edit / delete food items (name, location, category, quantity + unit, note).
- Clean card list grouped by **Fridge / Freezer / Pantry** with per-section counts.
- Emoji category icons, **+/- quantity steppers**, and an **"Out"** badge at zero.
- Floating **+** button, friendly empty state, modern rounded-card design.
- **English / Hebrew** with full **RTL** layout (native-quality Hebrew).
- Data stored on-device in **IndexedDB** (localStorage fallback).
- Installable PWA with offline support and automatic updates.

The data model keeps reserved fields (`expiryDate`, `lowStockThreshold`,
`barcode`) for future features; only add/edit/delete is wired today.

## Files

```
index.html              App shell
styles.css              Design (logical properties → RTL-safe)
i18n.js                 English + Hebrew strings, RTL handling
db.js                   IndexedDB persistence (localStorage fallback)
app.js                  UI + CRUD + modals
pwa.js                  SW registration, auto-update, version label
sw.js                   Service worker (precache, cache-first, VERSION)
manifest.webmanifest    PWA manifest (relative paths)
icons/                  192 / 512 / 180 PNG icons
tools/generate-icons.js Regenerates the PNG icons (pure Node)
```

## Install on your phone

- **iPhone (Safari):** open the link → Share → **Add to Home Screen**.
- **Android (Chrome):** open the link → menu (⋮) → **Install app** / **Add to Home Screen**.

Launch it from the home screen icon for a full-screen, offline app.

## Updating the app (auto-update workflow)

1. Edit any file(s).
2. **Bump `VERSION`** in `sw.js` (e.g. `v1.0.0` → `v1.0.1`).
3. `git add -A && git commit -m "..." && git push`.
4. GitHub Pages rebuilds (~1 minute).
5. Installed PWAs detect the new service worker on next focus/open, activate it,
   and reload once automatically. The version label in the header reflects the
   new `VERSION`.

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080/
```
