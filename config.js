/* HomeStock runtime backend config (BAKED DEFAULTS).
 *
 * These are the app's default Supabase credentials, shipped so every device is
 * already configured — no manual entry needed. Settings → Sync → "Backend
 * settings" is an OPTIONAL advanced override (persisted to localStorage, takes
 * precedence over these defaults); it is prefilled from these values.
 *
 * SECURITY: SUPABASE_ANON_KEY is the anon / publishable key. It is a PUBLIC
 * client key by design — the ONLY key that belongs in a frontend. All data
 * access is gated by Row-Level Security (see sync/schema.sql), so shipping it
 * in the repo is safe. NEVER put a service_role (or any secret) key here.
 *
 * If these are ever blanked, the app simply falls back to sync being DORMANT
 * and keeps working 100% offline-first (no errors).
 */
window.HOMESTOCK_CONFIG = window.HOMESTOCK_CONFIG || {
  SUPABASE_URL: 'https://skmiqgwfoulfwgskliuo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_6HB11kWdSAz0PyQo92JpLA_5yzviIl0',
};
