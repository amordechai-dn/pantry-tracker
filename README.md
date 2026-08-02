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
- **Light-blue theme** (icons + manifest colors match).
- **Barcode scanning** (📷) that auto-adds items via the camera.
- **Desired amounts (par levels)**, a **"To restock"** list, and **monthly tracking**.

## Barcode scanning (📷)

Tap the camera button to scan a product barcode (EAN-13 / UPC-A, etc.) using the
device camera. The scanner library (`vendor/zxing.min.js`, from
[`@zxing/library`](https://github.com/zxing-js/library)) is **vendored locally**
— no CDN.

- The barcode is resolved to a product **name** via the free **Open Food Facts**
  API. **This is the only part that needs the internet** — everything else works
  fully offline.
- **Online + found:** the item is **auto-added** (name, a derived category,
  quantity 1, location Pantry, barcode saved) and a toast with **Undo** appears.
- **Offline or not found:** the add/edit form opens **prefilled with the
  barcode** so you can type the name manually. It never blocks or crashes
  offline.
- Camera permission denial is handled with a clear message + a manual-entry
  button. Repeated identical scans are debounced (3s) and each add is confirmed.

## Desired amounts, "To restock" & monthly tracking

- Each item has an optional **Desired amount** (par level / monthly target),
  editable in the add/edit form. `0` means "not tracked". Existing records are
  migrated safely (treated as `0`).
- A **"To restock"** section lists every item **below** its desired amount,
  showing how many are missing, e.g. *"Milk — 2 missing (have 1 of 3)"*. It
  updates live as quantities change; items at/above target don't appear.
- **Monthly tracking** (📅, keyed by `YYYY-MM`, stored on-device): for each
  month we keep
  - **Restocked** — the sum of quantity increases that month (stepper **+**,
    the restock **+**, and newly added / scanned items),
  - **Used** — the sum of quantity decreases (stepper **−**),
  - **Shortfall** — a snapshot of what was below par.

  The 📅 view has a **month selector**: the current month shows a live shortfall;
  past months show the stored snapshot plus that month's restocked/used totals.
  This is a deliberately simple interpretation of "monthly tracking" — see the
  note below if you'd like different behavior.

> Data model note: the reserved `expiryDate`, `lowStockThreshold`, and `barcode`
> fields remain; a new `desiredAmount` field powers par levels, and `barcode` is
> now populated by the scanner.

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
vendor/zxing.min.js     Vendored barcode scanner (@zxing/library UMD, no CDN)
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
