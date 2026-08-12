// ============================================
// GROWX DATABASE OPERATIONS MODULE
// Secure Supabase queries with RLS
// ============================================

const supabase = window.growxSupabase;

/**
 * Get member profile
 */
async function getMemberProfile() {
  const user = getCurrentUser();
  if (!user) return null;

  try {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching profile:', error.message);
    return null;
  }
}

/**
 * Get member balance (from RLS-protected table)
 */
async function getMemberBalance() {
  const user = getCurrentUser();
  if (!user) return 0;

  try {
    const { data, error } = await supabase
      .from('members')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data?.balance || 0;
  } catch (error) {
    console.error('Error fetching balance:', error.message);
    return 0;
  }
}

/**
 * Get member packages
 */
async function getMemberPackages() {
  const user = getCurrentUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from('packages')
      .select('*')
      .eq('member_id', user.id)
      .eq('active', true);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching packages:', error.message);
    return [];
  }
}

/**
 * Add package for member
 */
async function addMemberPackage(amount, dailyReward) {
  const user = getCurrentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { data, error } = await supabase
      .from('packages')
      .insert([
        {
          member_id: user.id,
          amount: amount,
          daily_reward: dailyReward,
          active: true,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;

    // Log activity
    await logActivity(user.id, 'package_added', { amount, dailyReward });

    return { success: true, data };
  } catch (error) {
    console.error('Error adding package:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get total daily reward
 */
async function getTotalDailyReward() {
  const user = getCurrentUser();
  if (!user) return 0;

  try {
    const { data, error } = await supabase
      .from('packages')
      .select('daily_reward')
      .eq('member_id', user.id)
      .eq('active', true);

    if (error) throw error;

    return data?.reduce((sum, pkg) => sum + (pkg.daily_reward || 0), 0) || 0;
  } catch (error) {
    console.error('Error calculating daily reward:', error.message);
    return 0;
  }
}

/**
 * Claim daily reward (24-hour cooldown)
 */
async function claimDailyReward() {
  const user = getCurrentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    // Check last claim time
    const { data: lastClaim } = await supabase
      .from('reward_claims')
      .select('claimed_at')
      .eq('member_id', user.id)
      .order('claimed_at', { ascending: false })
      .limit(1)
      .single();

    if (lastClaim) {
      const lastClaimTime = new Date(lastClaim.claimed_at);
      const now = new Date();
      const hoursSinceLastClaim = (now - lastClaimTime) / (1000 * 60 * 60);

      if (hoursSinceLastClaim < 24) {
        return { 
          success: false, 
          error: `Claim available in ${Math.ceil(24 - hoursSinceLastClaim)} hours` 
        };
      }
    }

    // Get daily reward amount
    const dailyReward = await getTotalDailyReward();
    if (dailyReward <= 0) {
      return { success: false, error: 'No active packages' };
    }

    // Record reward claim
    const { error: claimError } = await supabase
      .from('reward_claims')
      .insert([
        {
          member_id: user.id,
          amount: dailyReward,
          claimed_at: new Date().toISOString()
        }
      ]);

    if (claimError) throw claimError;

    // Update member balance
    const currentBalance = await getMemberBalance();
    const { error: balanceError } = await supabase
      .from('members')
      .update({ balance: currentBalance + dailyReward })
      .eq('id', user.id);

    if (balanceError) throw balanceError;

    // Log activity
    await logActivity(user.id, 'reward_claimed', { amount: dailyReward });

    return { success: true, amount: dailyReward };
  } catch (error) {
    console.error('Error claiming reward:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Request withdrawal
 */
async function requestWithdrawal(amount, usdtAddress) {
  const user = getCurrentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    if (!usdtAddress || amount <= 0) {
      return { success: false, error: 'Invalid amount or address' };
    }

    // Check balance
    const balance = await getMemberBalance();
    if (balance < amount) {
      return { success: false, error: 'Insufficient balance' };
    }

    // Create withdrawal request
    const { data, error } = await supabase
      .from('withdrawals')
      .insert([
        {
          member_id: user.id,
          amount: amount,
          usdt_address: usdtAddress,
          status: 'pending',
          requested_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;

    // Deduct from balance immediately (admin approves later)
    await supabase
      .from('members')
      .update({ balance: balance - amount })
      .eq('id', user.id);

    // Log activity
    await logActivity(user.id, 'withdrawal_requested', { amount, address: usdtAddress });

    return { success: true, data };
  } catch (error) {
    console.error('Error requesting withdrawal:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get withdrawal history
 */
async function getWithdrawalHistory() {
  const user = getCurrentUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('member_id', user.id)
      .order('requested_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching withdrawals:', error.message);
    return [];
  }
}

/**
 * Get activity history
 */
async function getActivityHistory() {
  const user = getCurrentUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('member_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching activity:', error.message);
    return [];
  }
}

/**
 * Log activity (internal)
 */
async function logActivity(memberId, actionType, details = {}) {
  try {
    await supabase
      .from('activity_log')
      .insert([
        {
          member_id: memberId,
          action_type: actionType,
          details: details,
          created_at: new Date().toISOString()
        }
      ]);
  } catch (error) {
    console.warn('Activity log error:', error.message);
  }
}

/**
 * Redeem gift code
 */
async function redeemGiftCode(code) {
  const user = getCurrentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    // Fetch gift code details
    const { data: giftCode, error: giftError } = await supabase
      .from('gift_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('active', true)
      .single();

    if (giftError || !giftCode) {
      return { success: false, error: 'Invalid or expired gift code' };
    }

    // Check if already used
    const { data: used } = await supabase
      .from('gift_code_usage')
      .select('id')
      .eq('member_id', user.id)
      .eq('gift_code_id', giftCode.id)
      .single();

    if (used) {
      return { success: false, error: 'Gift code already used' };
    }

    // Record usage
    await supabase
      .from('gift_code_usage')
      .insert([{
        member_id: user.id,
        gift_code_id: giftCode.id,
        used_at: new Date().toISOString()
      }]);

    // Add reward
    const balance = await getMemberBalance();
    await supabase
      .from('members')
      .update({ balance: balance + giftCode.reward_amount })
      .eq('id', user.id);

    // Log activity
    await logActivity(user.id, 'gift_code_redeemed', { code, reward: giftCode.reward_amount });

    return { success: true, reward: giftCode.reward_amount };
  } catch (error) {
    console.error('Error redeeming gift code:', error.message);
    return { success: false, error: error.message };
  }
}
