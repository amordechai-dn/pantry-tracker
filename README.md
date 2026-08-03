# HomeStock 🏠✅ — Smart Home Inventory

An **offline-first Progressive Web App** for tracking the food you keep at home —
grouped by where you store it (**Fridge / Freezer / Pantry**), with barcode
scanning, a separate shopping list, bilingual **English / Hebrew** (full RTL),
passwordless multi-user profiles, and optional **cross-device cloud sync**.

Built with **plain HTML/CSS/JS** — no framework, no build step, no CDNs. It works
100% offline and **auto-updates** whenever a new version is deployed.

**Live app:** <https://amordechai-dn.github.io/pantry-tracker/>

**Current version:** `v2.0.1`

> The GitHub Pages repo/URL keeps the historical `pantry-tracker` name so
> installed apps and on-device data keep working; the product is **HomeStock**.

---

## Features

### Inventory
- Add / edit / delete items with **name, location, category, quantity + unit, note**.
- Cards grouped by **Fridge / Freezer / Pantry** with per-section counts.
- **+/- quantity steppers** and an **"Out"** badge at zero.
- **Category emoji** icons (item-specific emoji falls back to its category).
- **Desired amounts (par levels)** per item and **monthly restock tracking**.

### Product images (on-device)
- Photos are **compressed on-device** (WebP when supported), stored as a small
  **thumbnail + full** variant, and **de-duplicated by content hash** — identical
  photos are stored once and referenced by `imageHash`.

### Smart naming
- **Autocomplete catalog** from a local **bilingual food database** (EN/HE names
  + aliases) that also suggests the right **emoji** and category/unit.
- Items carry **bilingual names** (`nameEn` / `nameHe`); display picks the side
  matching the current language and falls back gracefully.

### Barcode scanning 📷
- **Camera scanning** with a resilient **continuous decode loop** (rear camera,
  formats **EAN-13 / UPC-A / UPC-E / EAN-8**, `TRY_HARDER`), plus **manual
  barcode entry**.
- **Continuous-scan session:** toggle ON to batch many products (with a short
  duplicate cooldown) and commit them all with one tap; OFF scans a single item
  then stops.
- Detection feedback (frame flash, beep, vibrate, detected-number badge) and a
  **dev debug overlay** (`?debug=1`) showing decoder-running / frames-processed.
- Barcodes are resolved to a product **name/image** via the free **Open Food
  Facts** API (the only online-dependent step) and **cached per-user** so repeat
  scans work offline.

### Shopping list (separate feature)
- A **standalone model** — *not* derived from inventory.
- **Add to list**, mark **purchased → add straight into inventory**, and
  **low-stock suggestions** based on desired amounts.
- Responsive: a **sticky side panel** on desktop, a full page on mobile.

### Profiles & multi-user
- **Passwordless open profiles** — tap to enter, no login. Each profile keeps an
  isolated inventory, shopping list, monthly plans, barcode mappings, products,
  images and settings.
- **Switch User** (fast profile switch) vs **Manage Users** (create/edit/delete)
  are separate flows; the active profile is remembered across reopens.

### Cross-device cloud sync (optional)
- **Offline-first** and **dormant by default**; powered by **Supabase**.
- **Anonymous auth** (each device gets its own JWT) with **Row-Level Security**;
  a **household** UUID is the shared identity.
- **Zero-config**: backend URL + anon key are **baked into `config.js`**, so a
  device is ready on first open (an optional advanced override exists).
- **Device linking** via **QR code / deep link / short code** (crypto-random,
  digest-only, short-lived tokens).
- Auto-sync: **push-on-change** (debounced), **pull on focus / reconnect** and a
  lightweight **periodic pull**, with **last-write-wins** conflict resolution and
  a **conflict dialog** for quantity clashes.

### Platform
- **Bilingual EN/HE** with full **RTL** layout (CSS logical properties).
- **Installable PWA** with **offline support** and **automatic updates**.
- **Responsive** across phones → desktop; green / dark-blue brand theme.

---

## Tech stack

- **Frontend:** vanilla **HTML / CSS / JavaScript** — no framework, no bundler,
  no CDNs. CSS uses logical properties for RTL safety.
- **Local storage:** **IndexedDB** (per-user database), with a **localStorage
  fallback**; monthly log and settings in per-user localStorage keys.
- **Service worker:** precache + cache-first, offline navigation, self-updating.
- **Backend (optional):** **Supabase** — Postgres + **GoTrue** anonymous auth +
  **PostgREST** REST API + **Row-Level Security**.
- **Vendored libraries (local, no CDN):** [`@zxing/library`](https://github.com/zxing-js/library)
  for barcode decoding and a small **QR-code generator** for device linking.
- **Hosting:** **GitHub Pages** (static).

---

## Run locally

No build step — just serve the folder:

```bash
cd pantry-pwa
python3 -m http.server 8080
# open http://localhost:8080/
```

Run the logic test harness (Node, no browser):

```bash
node tools/auth-test.js   # exit 0 = all pass
```

---

## Deploy / update workflow

Deployment is just a git push to the Pages repo:

1. Edit file(s).
2. **Bump `VERSION`** in `sw.js` (and the `FALLBACK_VERSION` in `pwa.js`) —
   *only when app assets change*; docs-only changes need no bump.
3. `git add -A && git commit -m "..." && git push`.
4. **GitHub Pages** rebuilds (~1 minute).
5. Installed PWAs detect the new service worker on next focus/open, activate it,
   and reload **once** automatically. The header version label reflects the new
   `VERSION`.

---

## Cloud sync setup

Full click-by-click guide: **[`sync/SYNC_SETUP.md`](./sync/SYNC_SETUP.md)**. In short:

1. Create a free **Supabase** project.
2. **Authentication → Providers:** enable **Anonymous sign-ins**.
3. **SQL Editor:** run the entire **[`sync/schema.sql`](./sync/schema.sql)**
   (idempotent — creates tables, indexes, RLS policies, and device-link RPCs).
4. Paste the **Project URL + anon key** into `config.js` (already baked for this
   deployment) — or use the in-app advanced override.
5. On a device: **Settings → Sync → Enable sync**; add more devices by
   **scanning the QR / opening the link** (auto-joins the household).

The **anon key is the only key in the frontend** and is safe to ship — all access
is gated by Row-Level Security.

---

## Project layout

```
index.html            App shell + script order
styles.css            Design system (logical properties → RTL-safe), responsive
config.js             Baked Supabase URL + anon key (public by design)
i18n.js               English + Hebrew strings + RTL handling
data/foods.js         Local bilingual food database (autocomplete + emoji)
db.js                 Per-user IndexedDB persistence (localStorage fallback)
auth.js               Passwordless profiles (repository / active user / migration)
app.js                UI, CRUD, modals, scanner, shopping list, sync glue
pwa.js                Service-worker registration + auto-update + version label
sw.js                 Service worker (precache, cache-first, VERSION)
manifest.webmanifest  PWA manifest (icons + maskable, relative paths)
sync/homesync.js      Cross-device sync engine (lazy-loaded, dormant by default)
sync/schema.sql       Supabase schema + indexes + RLS + device-link RPCs
sync/SYNC_SETUP.md    Supabase setup walkthrough
vendor/zxing.min.js   Vendored barcode scanner (@zxing/library UMD)
vendor/qrcode.js      Vendored QR generator (device linking)
tools/auth-test.js    Node logic harness (profiles, storage, i18n, decode proof)
tools/generate-*.js   Regenerate icons / food database (pure Node)
icons/                16–512 PNG icons + maskable + Apple touch icon
docs/HOW_IT_WORKS.md  Architecture & how-it-works reference
```

For a deeper dive into architecture, data model, and the sync engine, see
**[`docs/HOW_IT_WORKS.md`](./docs/HOW_IT_WORKS.md)**.

---

## Install on your phone

- **iPhone (Safari):** open the link → Share → **Add to Home Screen**.
- **Android (Chrome):** open the link → menu (⋮) → **Install app**.

Launch it from the home-screen icon for a full-screen, offline app.

---

## Version history (highlights)

| Version | Highlights |
| --- | --- |
| **v2.0.1** | Barcode scanner fix: resilient own decode loop, detection feedback, timeout tips, debug overlay |
| **v2.0.0** | Polished responsive header/toolbar + app-wide responsive layout (cloud-sync milestone) |
| **v1.15.0** | Shopping List as a separate, independent feature/model |
| **v1.14.0** | Fixed stale-JWT sync error + full auto-sync |
| **v1.13.0** | Responsive Shopping List (desktop side panel / mobile page) |
| **v1.12.0** | Zero-config baked backend + QR/URL device linking |
| **v1.11.0** | Dormant-by-default Supabase cross-device sync |
| **v1.10.0** | Switch User vs Manage Users separation |
| **v1.9.0** | Scanner fixes + manual barcode entry |
