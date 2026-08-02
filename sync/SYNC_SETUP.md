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

## 4. Grab your credentials
1. Go to **Project Settings → API**.
2. Copy the **Project URL** (e.g. `https://abcd1234.supabase.co`).
3. Copy the **anon / public** key (a long JWT). 
   - ⚠️ **Never** copy the `service_role` key — it must never touch the frontend.

## 5. Paste credentials into HomeStock
1. Open HomeStock → **Settings ⚙️ → Sync**.
2. Tap **Backend settings**, paste the Project URL and anon key, and save.
   - (Alternatively, fill `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `config.js`
     before deploying. Values entered in Settings override `config.js`.)

## 6. Link your devices
- **First device:** in Settings → Sync tap **Enable sync on this device**. This
  signs in anonymously, creates your household (cloud identity), and uploads your
  existing local data.
- **This device's link code** is now shown. To add another device:
  1. On the **first device** tap **Link another device** to reveal a code + URL.
  2. On the **new device**, first paste the same URL + anon key (step 5), then in
     Settings → Sync choose **Link this device**, and paste the code (or open the
     link URL). Both devices now share the same cloud profile.
- **Regenerate token** invalidates all outstanding link codes.

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
- [ ] Create a Supabase project.
- [ ] Enable **Anonymous sign-ins** in Authentication.
- [ ] Run `sync/schema.sql` in the SQL Editor.
- [ ] Copy **Project URL** + **anon/public** key from Settings → API.
- [ ] In HomeStock: Settings → Sync → **Backend settings** → paste + save.
- [ ] Tap **Enable sync on this device** on your main device.
- [ ] On other devices: paste URL+key, then **Link this device** with the code/URL.
