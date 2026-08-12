// ============================================
// GROWX DATABASE OPERATIONS
// All queries use RLS-protected tables
// ============================================

const supabase = window.growxSupabase;

// ============================================
// PROFILE & BASIC DATA
// ============================================

/**
 * Get current member's profile
 */
async function getMemberProfile() {
  const user = getCurrentUser();
  if (!user) return null;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching profile:", error.message);
    return null;
  }
}

// ============================================
// BALANCE & LEDGER
// ============================================

/**
 * Get member's current balance
 * RLS ensures user can only see own balance
 */
async function getMemberBalance() {
  const user = getCurrentUser();
  if (!user) return 0;

  try {
    const { data, error } = await supabase
      .from("ledger")
      .select("balance")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    return data?.balance || 0;
  } catch (error) {
    console.error("Error fetching balance:", error.message);
    return 0;
  }
}

/**
 * Get full ledger history for member
 */
async function getLedgerHistory() {
  const user = getCurrentUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from("ledger_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching ledger:", error.message);
    return [];
  }
}

// ============================================
// PACKAGES & INVESTMENTS
// ============================================

/**
 * Get member's active packages
 */
async function getMemberPackages() {
  const user = getCurrentUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from("user_packages")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching packages:", error.message);
    return [];
  }
}

/**
 * Get available package templates
 */
async function getAvailablePackages() {
  try {
    const { data, error } = await supabase
      .from("packages")
      .select("*")
      .eq("active", true)
      .order("amount", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching available packages:", error.message);
    return [];
  }
}

/**
 * Calculate total daily reward from active packages
 */
async function getTotalDailyReward() {
  const packages = await getMemberPackages();
  return packages.reduce((sum, pkg) => sum + (pkg.daily_reward_amount || 0), 0);
}

/**
 * Add package for member
 * (In real deployment: this would require admin approval or payment verification)
 */
async function addMemberPackage(packageId) {
  const user = getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    // Fetch package template
    const { data: pkg, error: pkgError } = await supabase
      .from("packages")
      .select("*")
      .eq("id", packageId)
      .single();

    if (pkgError || !pkg) throw new Error("Package not found");

    // Create user package entry
    const { data, error } = await supabase.from("user_packages").insert([
      {
        user_id: user.id,
        package_id: packageId,
        amount: pkg.amount,
        daily_reward_amount: pkg.daily_reward_amount,
        status: "active",
        created_at: new Date().toISOString()
      }
    ]);

    if (error) throw error;

    // Log activity
    await logActivity(user.id, "package_added", {
      package_id: packageId,
      amount: pkg.amount
    });

    return { success: true, data };
  } catch (error) {
    console.error("Error adding package:", error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// DAILY REWARDS
// ============================================

/**
 * Check if member can claim reward (24-hour enforcement)
 * Server-side check via database, not localStorage
 */
async function canClaimReward() {
  const user = getCurrentUser();
  if (!user) return { can_claim: false, reason: "Not authenticated" };

  try {
    const { data, error } = await supabase
      .from("ledger")
      .select("last_reward_claim")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    if (!data?.last_reward_claim) {
      return { can_claim: true, reason: "Never claimed" };
    }

    const lastClaim = new Date(data.last_reward_claim);
    const now = new Date();
    const hoursSinceLastClaim = (now - lastClaim) / (1000 * 60 * 60);

    if (hoursSinceLastClaim >= 24) {
      return { can_claim: true, reason: "24 hours passed" };
    }

    const hoursRemaining = 24 - hoursSinceLastClaim;
    return { can_claim: false, reason: `Claim again in ${Math.ceil(hoursRemaining)} hours` };
  } catch (error) {
    console.error("Error checking reward eligibility:", error.message);
    return { can_claim: false, reason: "Error checking eligibility" };
  }
}

/**
 * Claim daily reward
 * Server enforces 24-hour restriction
 */
async function claimDailyReward() {
  const user = getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    // Check eligibility
    const eligible = await canClaimReward();
    if (!eligible.can_claim) {
      return { success: false, error: eligible.reason };
    }

    // Get daily reward amount
    const dailyReward = await getTotalDailyReward();
    if (dailyReward <= 0) {
      return { success: false, error: "No active packages" };
    }

    // Call edge function or use RLS-protected procedure to claim reward
    // This ensures atomicity and server-side enforcement
    const { data, error } = await supabase.functions.invoke("claim-reward", {
      body: { user_id: user.id, amount: dailyReward }
    });

    if (error) throw error;

    return { success: true, amount: dailyReward, data };
  } catch (error) {
    console.error("Error claiming reward:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get reward claim history
 */
async function getRewardClaimHistory() {
  const user = getCurrentUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from("reward_claims")
      .select("*")
      .eq("user_id", user.id)
      .order("claimed_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching reward history:", error.message);
    return [];
  }
}

// ============================================
// WITHDRAWALS
// ============================================

/**
 * Request USDT withdrawal
 * Initial status: PROCESSING (admin must review)
 */
async function requestWithdrawal(amount, usdtAddress) {
  const user = getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    if (!usdtAddress || amount <= 0) {
      return { success: false, error: "Invalid amount or USDT address" };
    }

    if (!/^T[1-9A-HJ-NP-Z]{25}$/.test(usdtAddress)) {
      return { success: false, error: "Invalid TRON address format" };
    }

    // Check balance
    const balance = await getMemberBalance();
    if (balance < amount) {
      return { success: false, error: "Insufficient balance" };
    }

    // Create withdrawal request
    const { data, error } = await supabase.from("withdrawals").insert([
      {
        user_id: user.id,
        amount: amount,
        usdt_address: usdtAddress,
        status: "PROCESSING",
        requested_at: new Date().toISOString()
      }
    ]);

    if (error) throw error;

    // Log activity
    await logActivity(user.id, "withdrawal_requested", {
      amount: amount,
      address: usdtAddress
    });

    return { success: true, data };
  } catch (error) {
    console.error("Error requesting withdrawal:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get member's withdrawal history
 */
async function getWithdrawalHistory() {
  const user = getCurrentUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching withdrawals:", error.message);
    return [];
  }
}

// ============================================
// GIFT CODES
// ============================================

/**
 * Redeem gift code
 */
async function redeemGiftCode(code) {
  const user = getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    const codeUpper = code.toUpperCase().trim();

    // Fetch gift code
    const { data: giftCode, error: giftError } = await supabase
      .from("gift_codes")
      .select("*")
      .eq("code", codeUpper)
      .eq("active", true)
      .single();

    if (giftError || !giftCode) {
      return { success: false, error: "Invalid or expired gift code" };
    }

    // Check expiration
    if (giftCode.expires_at && new Date(giftCode.expires_at) < new Date()) {
      return { success: false, error: "Gift code expired" };
    }

    // Check if already used by this user
    const { data: used, error: usedError } = await supabase
      .from("gift_code_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("gift_code_id", giftCode.id)
      .single();

    if (!usedError && used) {
      return { success: false, error: "You already redeemed this code" };
    }

    // Record usage
    await supabase.from("gift_code_redemptions").insert([
      {
        user_id: user.id,
        gift_code_id: giftCode.id,
        redeemed_at: new Date().toISOString()
      }
    ]);

    // Update user balance via edge function for atomicity
    const { data, error } = await supabase.functions.invoke("redeem-gift-code", {
      body: { user_id: user.id, gift_code_id: giftCode.id, amount: giftCode.reward_amount }
    });

    if (error) throw error;

    return { success: true, reward: giftCode.reward_amount };
  } catch (error) {
    console.error("Error redeeming gift code:", error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * (Admin) Search for member by phone or client code
 */
async function adminSearchMember(query) {
  const user = getCurrentUser();
  if (!isAdmin()) return { success: false, error: "Admin access required" };

  try {
    const { data, error } = await supabase
      .from("admin_member_search")
      .select("*")
      .or(
        `phone.ilike.%${query}%,client_code.ilike.%${query}%`
      )
      .limit(10);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Admin search error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * (Admin) Get member details
 */
async function adminGetMemberDetails(userId) {
  const user = getCurrentUser();
  if (!isAdmin()) return { success: false, error: "Admin access required" };

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError) throw profileError;

    const { data: ledger, error: ledgerError } = await supabase
      .from("ledger")
      .select("*")
      .eq("id", userId)
      .single();

    if (ledgerError) throw ledgerError;

    const { data: packages, error: pkgError } = await supabase
      .from("user_packages")
      .select("*")
      .eq("user_id", userId);

    if (pkgError) throw pkgError;

    return { success: true, data: { profile, ledger, packages } };
  } catch (error) {
    console.error("Admin get member error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * (Admin) Get pending withdrawals
 */
async function adminGetPendingWithdrawals() {
  const user = getCurrentUser();
  if (!isAdmin()) return { success: false, error: "Admin access required" };

  try {
    const { data, error } = await supabase
      .from("admin_pending_withdrawals")
      .select("*")
      .order("requested_at", { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Admin get withdrawals error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * (Admin) Record allocation / manual credit
 * Calls edge function for server-side validation
 */
async function adminRecordAllocation(memberId, amount, txReference) {
  const user = getCurrentUser();
  if (!isAdmin()) return { success: false, error: "Admin access required" };

  try {
    if (!amount || amount <= 0) {
      return { success: false, error: "Invalid amount" };
    }

    const { data, error } = await supabase.functions.invoke(
      "admin-record-allocation",
      {
        body: {
          member_id: memberId,
          amount: amount,
          tx_reference: txReference,
          admin_id: user.id
        }
      }
    );

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Admin allocation error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Log activity (internal helper)
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
