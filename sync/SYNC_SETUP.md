# HomeStock cross-device sync — Supabase setup

HomeStock works fully offline with **no** backend. Cloud sync is **dormant**
until you stand up a free Supabase project and paste its URL + anon key into the
app. Follow these steps once; then any number of devices can share one profile.

---

## 1. Create the Supabase project
1. Go to <https://supabase.com> → sign in → **New project**.
2. Pick a name, a strong database password (you won't need it in the app), and a
   region close to you. Wait for provisioning to finish (~1–2 min).

## 2. Enable anonymous sign-in
1. In the project: **Authentication → Providers** (or **Sign In / Up**).
2. Enable **Anonymous sign-ins** and save.
   - This lets each device get its own JWT (`auth.uid()`) with no password.

## 3. Create the schema + security
1. Open **SQL Editor → New query**.
2. Paste the entire contents of [`sync/schema.sql`](./schema.sql) and click
   **Run**. This creates every table, all indexes, Row-Level Security policies,
   and the device-linking functions.
3. You should see "Success. No rows returned".

> Already ran an older copy of this file? Just run it again — it's idempotent
> (`create ... if not exists` / `create or replace`). The current version fixes
> the device-link functions to find `digest()` in Supabase's `extensions`
> schema, which the link tokens depend on.

## 4. Grab your credentials
1. Go to **Project Settings → API**.
2. Copy the **Project URL** (e.g. `https://abcd1234.supabase.co`).
3. Copy the **anon / public** key (a long JWT). 
   - ⚠️ **Never** copy the `service_role` key — it must never touch the frontend.

## 5. Credentials are BAKED IN (zero-config per device)
The project URL + anon (publishable) key are shipped in `config.js`, so **every
device that opens HomeStock is already configured** — no manual entry. Settings
→ Sync → **Advanced: backend settings** is an optional override only (prefilled
from the baked values), and can be ignored for normal use.

> To change the baked backend, edit `SUPABASE_URL` / `SUPABASE_ANON_KEY` in
> `config.js` and redeploy. If they are blanked, the app just runs offline-first
> with sync dormant.

## 6. Link your devices (one tap / QR)
- **First device:** Settings → Sync → **Enable sync on this device**. This signs
  in anonymously, creates your household (cloud identity), and uploads local data.
- **Add another device:**
  1. On the first device tap **Link another device** — it shows a **QR code**, a
     short code, and a deep-link URL.
  2. On the new device, either **scan/open the QR or URL** (it auto-joins the same
     household — no typing), or paste the short code into **Link this device**.
- **Regenerate token** invalidates all outstanding link codes/QRs.

---

## Security notes
- The **anon key is the only key in the frontend.** It is safe to ship because
  **Row-Level Security** (from `schema.sql`) means a device can only read/write
  rows belonging to a household it has joined.
- **Link tokens** are 256-bit crypto-random, stored server-side only as a
  SHA-256 digest, short-lived, and never logged. Regenerate them any time.
- Identity is the **household UUID**, never a display name. Two profiles with the
  same name but different households stay completely separate.

## WHAT THE USER MUST DO (checklist)
One-time backend setup (already done for this deployment — credentials are baked
into `config.js`):
- [ ] Create a Supabase project.
- [ ] Enable **Anonymous sign-ins** in Authentication.
- [ ] Run `sync/schema.sql` in the SQL Editor.
- [ ] Put the **Project URL** + **anon/publishable** key into `config.js` and deploy.

Per device (zero / one tap):
- [ ] Just open HomeStock — it's already configured.
- [ ] Main device: Settings → Sync → **Enable sync on this device**.
- [ ] Other devices: **scan the QR / open the link** (auto-joins), or paste the code.
