// ============================================
// GROWX SUPABASE CONFIGURATION
// Anon key only - NO service role keys exposed
// ============================================

const GROWX_SUPABASE_URL = "https://bqvksasquwtboslrrzz.supabase.co";
const GROWX_SUPABASE_ANON_KEY = "sb_publishable_dzfJbN-q5mKrx1EWow1a_g__-HXvhil";

window.growxSupabase = window.supabase.createClient(
  GROWX_SUPABASE_URL,
  GROWX_SUPABASE_ANON_KEY
);

// Export for use in other modules
const { createClient } = window.supabase;
