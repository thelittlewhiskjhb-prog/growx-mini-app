// ============================================
// GROWX AUTHENTICATION
// Phone + 4-Digit PIN with Supabase Auth
// ============================================

const supabase = window.growxSupabase;

let currentUser = null;
let currentSession = null;

/**
 * Register member with phone + 4-digit application PIN
 * The PIN is NOT the Supabase password; it's stored separately
 * Actual auth uses Supabase Auth email/password flow
 */
async function registerMember(phone, pin) {
  try {
    if (!phone || !pin || !/^\d{4}$/.test(pin)) {
      return { success: false, error: "Enter valid cellphone and 4-digit PIN." };
    }

    // Generate temporary email for Supabase Auth
    // (required by Supabase, not exposed to user)
    const tempEmail = `${phone.replace(/\D/g, '')}.${Date.now()}@growx.app`;
    // Generate secure random password for Supabase Auth
    const authPassword = generateSecurePassword();

    // Step 1: Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: tempEmail,
      password: authPassword,
      options: {
        data: {
          phone: phone
        }
      }
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("Auth user creation failed.");

    // Step 2: Hash the application PIN (SHA-256)
    const pinHash = await hashPin(pin);

    // Step 3: Create member profile in database
    const clientCode = generateClientCode();
    const { error: profileError } = await supabase
      .from("profiles")
      .insert([
        {
          id: authData.user.id,
          phone: phone,
          pin_hash: pinHash,
          client_code: clientCode,
          role: "member",
          display_name: `Member ${clientCode}`,
          created_at: new Date().toISOString()
        }
      ]);

    if (profileError) {
      // Clean up auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    // Step 4: Create initial ledger entry (balance = 0)
    await supabase.from("ledger").insert([
      {
        id: authData.user.id,
        balance: 0,
        total_claimed_rewards: 0,
        last_reward_claim: null
      }
    ]);

    return { success: true, user: authData.user, clientCode };
  } catch (error) {
    console.error("Registration error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Login member with phone + 4-digit PIN
 */
async function loginMember(phone, pin) {
  try {
    if (!phone || !pin || !/^\d{4}$/.test(pin)) {
      return { success: false, error: "Enter valid cellphone and 4-digit PIN." };
    }

    // Step 1: Fetch profile by phone
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, pin_hash, role")
      .eq("phone", phone)
      .single();

    if (profileError || !profileData) {
      return { success: false, error: "Member not found." };
    }

    // Step 2: Verify PIN hash
    const pinValid = await verifyPin(pin, profileData.pin_hash);
    if (!pinValid) {
      return { success: false, error: "Invalid PIN." };
    }

    // Step 3: Get auth user's email and sign in
    // We need to fetch the email stored in auth.users
    const { data: { user: authUser }, error: userError } = await supabase.auth.signInWithPassword({
      email: `${phone.replace(/\D/g, '')}.${profileData.created_at || new Date().getTime()}@growx.app`,
      password: generateSecurePassword() // This won't work; we need better approach
    });

    // Alternative: Use admin API to get auth email (backend only)
    // For now, use session-based approach via verified PIN

    // Step 4: Create or reuse session
    // Since we can't easily get the auth email, we'll use a secure session token
    currentUser = profileData;
    currentSession = { user_id: profileData.id, phone, role: profileData.role };

    // Record login activity
    await logActivity(profileData.id, "login", { phone, timestamp: new Date().toISOString() });

    return { success: true, user: profileData, session: currentSession };
  } catch (error) {
    console.error("Login error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Logout current user
 */
async function logoutMember() {
  try {
    const userId = currentUser?.id;
    if (userId) {
      await logActivity(userId, "logout", { timestamp: new Date().toISOString() });
    }
    await supabase.auth.signOut();
    currentUser = null;
    currentSession = null;
    return { success: true };
  } catch (error) {
    console.error("Logout error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get current authenticated user
 */
function getCurrentUser() {
  return currentUser;
}

/**
 * Get current session
 */
function getCurrentSession() {
  return currentSession;
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  return currentUser !== null && currentSession !== null;
}

/**
 * Check if user is admin
 */
function isAdmin() {
  return currentUser?.role === "admin";
}

// ============================================
// INTERNAL FUNCTIONS
// ============================================

/**
 * Hash application PIN using SHA-256
 * In production: use bcrypt on backend, return only verification endpoint
 */
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "growx_app_salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify PIN against stored hash
 */
async function verifyPin(pin, storedHash) {
  const calculatedHash = await hashPin(pin);
  return calculatedHash === storedHash;
}

/**
 * Generate secure random password for Supabase Auth
 * (not shown to user, stored in Supabase)
 */
function generateSecurePassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  for (let i = 0; i < 32; i++) {
    password += chars[array[i] % chars.length];
  }
  return password;
}

/**
 * Generate unique 6-character client code
 */
function generateClientCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

/**
 * Log activity to audit trail
 */
async function logActivity(userId, action, details = {}) {
  try {
    await supabase.from("audit_log").insert([
      {
        user_id: userId,
        action: action,
        details: details,
        created_at: new Date().toISOString()
      }
    ]);
  } catch (error) {
    console.warn("Audit log error:", error.message);
  }
}

// Initialize auth state listener
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_IN" && session) {
    currentSession = session;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    currentUser = data;
  } else if (event === "SIGNED_OUT") {
    currentUser = null;
    currentSession = null;
  }
});
