# HomeStock 🏠✅ — Smart Home Inventory (PWA)

A fully client-side **Progressive Web App** to track what you have at home —
grouped by where you store it (Fridge / Freezer / Pantry). No server, works
**offline**, and **auto-updates** when a new version is deployed. Built with
plain HTML/CSS/JS (no framework, no build step, no CDNs).

**Live app:** https://amordechai-dn.github.io/pantry-tracker/

> The GitHub Pages repo/URL keeps the historical `pantry-tracker` name so
> installed apps and on-device data keep working; the product is **HomeStock**.

## Features

- **Open household profiles** — pick who's using the app from a simple user
  picker (no passwords). Each profile keeps its own isolated inventory, lists,
  monthly plans, barcode mappings, products, images and settings.
- Add / edit / delete food items (name, location, category, quantity + unit, note).
- Clean card list grouped by **Fridge / Freezer / Pantry** with per-section counts.
- Emoji category icons, **+/- quantity steppers**, and an **"Out"** badge at zero.
- Floating **+** button, friendly empty state, modern rounded-card design.
- **English / Hebrew** with full **RTL** layout (native-quality Hebrew).
- Data stored on-device in **IndexedDB** (localStorage fallback).
- Installable PWA with offline support and automatic updates.
- **Green / dark-blue brand theme** (icons + manifest colors match).
- **Barcode scanning** (📷) that auto-adds items via the camera. The scanner
  library is **lazy-loaded** on first use to keep startup fast.
- Product **images** are compressed on-device (WebP when supported), stored as a
  small thumbnail + full variant, and **de-duplicated** by content hash.
- **Desired amounts (par levels)**, a **"To restock"** list, and **monthly tracking**.
- **Name autocomplete with automatic emoji** from a local bilingual food database.

## Profiles (passwordless)

HomeStock is a shared home app, so profiles are **open** — tapping a profile
enters immediately, no password. You can create profiles (display name required;
username, avatar and preferred language optional), switch between them, edit
them, and optionally delete a profile (with an explicit confirmation that all of
that profile's data will be removed). The active profile is remembered across
reopens; everything works fully offline.

Per-user data stays isolated by a **stable userId** enforced at the data layer
(`pantry-tracker-u-<id>` IndexedDB database per user — the storage namespace is
intentionally unchanged so existing data keeps working across the rebrand).

## Barcode scanning (📷)

Tap the camera button to scan a product barcode (EAN-13 / UPC-A, etc.). The
scanner library (`vendor/zxing.min.js`, from
[`@zxing/library`](https://github.com/zxing-js/library)) is **vendored locally**
(no CDN) and **lazy-loaded on first scanner open** — it's precached by the
service worker so it still works offline.

- The barcode is resolved to a product **name** via the free **Open Food Facts**
  API. **This is the only part that needs the internet** — everything else works
  fully offline.
- Results are cached per-user so repeat scans work offline afterwards.

## Files

```
index.html              App shell
styles.css              Design (logical properties → RTL-safe)
i18n.js                 English + Hebrew strings, RTL handling
db.js                   IndexedDB persistence (localStorage fallback)
auth.js                 Open passwordless profiles (UserRepository / ActiveUser / migration)
app.js                  UI + CRUD + modals + profile picker
pwa.js                  SW registration, auto-update, version label
sw.js                   Service worker (precache, cache-first, VERSION)
manifest.webmanifest    PWA manifest (relative paths, full icon set + maskable)
vendor/zxing.min.js     Vendored barcode scanner (@zxing/library UMD, no CDN)
data/foods.js           Local bilingual food database (autocomplete + emoji)
icons/                  16–512 PNG icons + maskable variants + Apple touch icon
tools/generate-icons.js Regenerates all PNG icons (pure Node, no deps)
tools/generate-foods.js Regenerates the food database
tools/auth-test.js      Node logic harness for profiles + per-user storage
```

## Install on your phone

- **iPhone (Safari):** open the link → Share → **Add to Home Screen**.
- **Android (Chrome):** open the link → menu (⋮) → **Install app** / **Add to Home Screen**.

Launch it from the home screen icon for a full-screen, offline app.

## Updating the app (auto-update workflow)

1. Edit any file(s).
2. **Bump `VERSION`** in `sw.js` (e.g. `v1.6.0` → `v1.7.0`).
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
