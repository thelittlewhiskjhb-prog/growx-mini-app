// ============================================
// GROWX AUTHENTICATION MODULE
// Phone + 4-Digit PIN Authentication
// ============================================

const supabase = window.growxSupabase;

// Store current user session
let currentUser = null;
let currentSession = null;

/**
 * Register new member with phone + 4-digit PIN
 * @param {string} phone - Phone number
 * @param {string} pin - 4-digit PIN (stored as password)
 * @returns {Promise<{success: boolean, error?: string, user?: object}>}
 */
async function registerMember(phone, pin) {
  try {
    // Validate inputs
    if (!phone || !pin || !/^\d{4}$/.test(pin)) {
      return { success: false, error: "Enter cellphone and 4-digit PIN." };
    }

    // Create auth user with phone as username, PIN as password
    // Using phone+pin hash as temporary email (Supabase requirement)
    const tempEmail = `${phone.replace(/\D/g, '').slice(-6)}.${Date.now()}@growx.local`;
    
    const { data, error } = await supabase.auth.signUp({
      email: tempEmail,
      password: pin,
      options: {
        data: {
          phone: phone,
          pin_hash: await hashPin(pin)
        }
      }
    });

    if (error) throw error;

    // Create member record in public.members table
    if (data.user) {
      const { error: insertError } = await supabase
        .from('members')
        .insert([
          {
            id: data.user.id,
            phone: phone,
            pin_hash: await hashPin(pin),
            client_code: generateClientCode(),
            balance: 0,
            created_at: new Date().toISOString(),
            last_login: null
          }
        ]);

      if (insertError) {
        // Clean up auth user if member insert fails
        await supabase.auth.admin.deleteUser(data.user.id);
        throw insertError;
      }
    }

    return { success: true, user: data.user };
  } catch (error) {
    console.error('Registration error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Login member with phone + 4-digit PIN
 * @param {string} phone - Phone number
 * @param {string} pin - 4-digit PIN
 * @returns {Promise<{success: boolean, error?: string, user?: object, session?: object}>}
 */
async function loginMember(phone, pin) {
  try {
    if (!phone || !pin || !/^\d{4}$/.test(pin)) {
      return { success: false, error: "Enter cellphone and 4-digit PIN." };
    }

    // Fetch member by phone
    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .select('id, pin_hash')
      .eq('phone', phone)
      .single();

    if (memberError || !memberData) {
      return { success: false, error: "Member not found." };
    }

    // Verify PIN hash
    const pinValid = await verifyPin(pin, memberData.pin_hash);
    if (!pinValid) {
      return { success: false, error: "Invalid PIN." };
    }

    // Sign in with email/password (phone auth via email)
    // Get the member's auth email from auth.users
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    const authUser = users.find(u => u.user_metadata?.phone === phone);

    if (!authUser) {
      return { success: false, error: "Auth user not found." };
    }

    // Use Supabase session directly via user ID
    const { data: { session }, error: sessionError } = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: pin
    });

    if (sessionError || !session) {
      return { success: false, error: "Login failed." };
    }

    // Update last login
    await supabase
      .from('members')
      .update({ last_login: new Date().toISOString() })
      .eq('id', memberData.id);

    currentUser = memberData;
    currentSession = session;

    return { success: true, user: memberData, session };
  } catch (error) {
    console.error('Login error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Logout current member
 */
async function logoutMember() {
  try {
    await supabase.auth.signOut();
    currentUser = null;
    currentSession = null;
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error.message);
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
 * Simple PIN hashing (use bcrypt in production)
 */
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'growx_salt_key');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify PIN against hash
 */
async function verifyPin(pin, hash) {
  const calculatedHash = await hashPin(pin);
  return calculatedHash === hash;
}

/**
 * Generate unique 6-character client code
 */
function generateClientCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Listen for auth state changes
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    currentSession = session;
    // Fetch member data
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('id', session.user.id)
      .single();
    currentUser = data;
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    currentSession = null;
  }
});
