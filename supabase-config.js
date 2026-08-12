// ============================================
// GROWX SUPABASE CONFIGURATION
// Production - Anon Key Only
// ============================================
// Never put service_role_key here.
// Service-role operations are backend-only via Edge Functions.

const GROWX_SUPABASE_URL = "https://bqvksasquwtboslrrzz.supabase.co";
const GROWX_SUPABASE_ANON_KEY = "sb_publishable_dzfJbN-q5mKrx1EWow1a_g__-HXvhil";

if (!window.supabase) {
  console.error("Supabase client library not loaded. Ensure CDN script is loaded first.");
}

window.growxSupabase = window.supabase.createClient(
  GROWX_SUPABASE_URL,
  GROWX_SUPABASE_ANON_KEY
);
