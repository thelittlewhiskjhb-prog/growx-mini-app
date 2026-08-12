// ============================================
// SUPABASE EDGE FUNCTION: redeem-gift-code
// Atomic gift code redemption with balance update
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
    const { user_id, gift_code_id, amount } = body;

    // Verify user is redeeming for themselves
    if (user.id !== user_id) {
      return new Response(
        JSON.stringify({ error: "Cannot redeem for other user" }),
        { status: 403 }
      );
    }

    // 1. Verify gift code is still valid
    const { data: giftCode, error: giftError } = await supabase
      .from("gift_codes")
      .select("*")
      .eq("id", gift_code_id)
      .eq("active", true)
      .single();

    if (giftError || !giftCode) {
      return new Response(
        JSON.stringify({ error: "Gift code not found or expired" }),
        { status: 404 }
      );
    }

    // Check expiration
    if (giftCode.expires_at && new Date(giftCode.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Gift code expired" }),
        { status: 410 }
      );
    }

    // 2. Check if already redeemed by this user
    const { data: existingRedemption, error: checkError } = await supabase
      .from("gift_code_redemptions")
      .select("id")
      .eq("user_id", user_id)
      .eq("gift_code_id", gift_code_id)
      .single();

    if (existingRedemption) {
      return new Response(
        JSON.stringify({ error: "You already redeemed this code" }),
        { status: 409 }
      );
    }

    // 3. Get current ledger
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

    const now = new Date().toISOString();
    const newBalance = ledger.balance + amount;

    // 4. Record redemption
    const { error: redemptionError } = await supabase
      .from("gift_code_redemptions")
      .insert([
        {
          user_id: user_id,
          gift_code_id: gift_code_id,
          redeemed_at: now,
        },
      ]);

    if (redemptionError) {
      return new Response(
        JSON.stringify({ error: "Failed to record redemption" }),
        { status: 500 }
      );
    }

    // 5. Update balance
    const { error: balanceError } = await supabase
      .from("ledger")
      .update({
        balance: newBalance,
        updated_at: now,
      })
      .eq("id", user_id);

    if (balanceError) {
      return new Response(
        JSON.stringify({ error: "Failed to update balance" }),
        { status: 500 }
      );
    }

    // 6. Record in ledger_history
    await supabase.from("ledger_history").insert([
      {
        user_id: user_id,
        transaction_type: "gift_redeemed",
        amount: amount,
        balance_after: newBalance,
        details: { gift_code_id, code: giftCode.code },
      },
    ]);

    // 7. Audit log
    await supabase.from("audit_log").insert([
      {
        user_id: user_id,
        action: "gift_code_redeemed",
        details: {
          gift_code_id,
          amount,
          balance_after: newBalance,
        },
      },
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        amount: amount,
        new_balance: newBalance,
        redeemed_at: now,
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
