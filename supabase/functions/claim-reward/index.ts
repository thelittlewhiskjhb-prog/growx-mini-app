// ============================================
// SUPABASE EDGE FUNCTION: claim-reward
// Server-side reward claim with 24-hour enforcement
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    // Check authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401 }
      );
    }

    // Get JWT token
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401 }
      );
    }

    const body = await req.json();
    const { user_id, amount } = body;

    // Verify user is requesting their own reward
    if (user.id !== user_id) {
      return new Response(
        JSON.stringify({ error: "Cannot claim for other user" }),
        { status: 403 }
      );
    }

    // Get current ledger
    const { data: ledger, error: ledgerError } = await supabase
      .from("ledger")
      .select("*")
      .eq("id", user_id)
      .single();

    if (ledgerError || !ledger) {
      return new Response(
        JSON.stringify({ error: "Ledger not found" }),
        { status: 404 }
      );
    }

    // Check 24-hour restriction
    if (ledger.last_reward_claim) {
      const lastClaim = new Date(ledger.last_reward_claim);
      const now = new Date();
      const hoursSinceLastClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastClaim < 24) {
        return new Response(
          JSON.stringify({
            error: `Claim available in ${Math.ceil(24 - hoursSinceLastClaim)} hours`,
            can_claim: false,
          }),
          { status: 429 }
        );
      }
    }

    // Start transaction
    const now = new Date().toISOString();

    // 1. Update ledger with new balance and claim timestamp
    const newBalance = ledger.balance + amount;
    const { error: updateError } = await supabase
      .from("ledger")
      .update({
        balance: newBalance,
        last_reward_claim: now,
        total_claimed_rewards: ledger.total_claimed_rewards + amount,
        updated_at: now,
      })
      .eq("id", user_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update ledger", details: updateError }),
        { status: 500 }
      );
    }

    // 2. Record in reward_claims table
    const { error: claimError } = await supabase
      .from("reward_claims")
      .insert([
        {
          user_id: user_id,
          amount: amount,
          claimed_at: now,
        },
      ]);

    if (claimError) {
      console.error("Failed to record claim:", claimError);
    }

    // 3. Record in ledger_history for audit
    const { error: historyError } = await supabase
      .from("ledger_history")
      .insert([
        {
          user_id: user_id,
          transaction_type: "reward_claimed",
          amount: amount,
          balance_after: newBalance,
          details: { claimed_at: now },
        },
      ]);

    if (historyError) {
      console.error("Failed to record history:", historyError);
    }

    // 4. Log to audit trail
    await supabase.from("audit_log").insert([
      {
        user_id: user_id,
        action: "reward_claimed",
        details: { amount, balance_after: newBalance },
      },
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        amount: amount,
        new_balance: newBalance,
        claimed_at: now,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});
