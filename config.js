/* HomeStock runtime backend config (placeholder).
 *
 * Leave these BLANK to keep the app 100% offline-first with cloud sync DORMANT
 * (no network, no errors). To enable Supabase sync you can either:
 *   (a) enter the values in the app: Settings → Sync → "Backend settings", which
 *       persists them to localStorage and OVERRIDES this file, or
 *   (b) fill them in here before deploying.
 *
 * SECURITY: the anon/public key is the ONLY key that belongs in the frontend.
 * NEVER put a service_role key or any secret here — RLS + the anon key are what
 * keep data safe (see sync/schema.sql).
 */
window.HOMESTOCK_CONFIG = window.HOMESTOCK_CONFIG || {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
