// ============================================
// SUPABASE EDGE FUNCTION: admin-record-allocation
// Admin-only function to credit member balance
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

    // 1. Verify user is admin
    const { data: adminProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || adminProfile?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403 }
      );
    }

    const body = await req.json();
    const { member_id, amount, tx_reference, admin_id } = body;

    // 2. Validate inputs
    if (!member_id || !amount || !tx_reference) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Amount must be positive" }),
        { status: 400 }
      );
    }

    // 3. Get member profile
    const { data: memberProfile, error: memberError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", member_id)
      .single();

    if (memberError || !memberProfile) {
      return new Response(
        JSON.stringify({ error: "Member not found" }),
        { status: 404 }
      );
    }

    // 4. Get current ledger
    const { data: ledger, error: ledgerError } = await supabase
      .from("ledger")
      .select("*")
      .eq("id", member_id)
      .single();

    if (ledgerError || !ledger) {
      return new Response(
        JSON.stringify({ error: "Ledger not found" }),
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    const newBalance = ledger.balance + amount;

    // 5. Update ledger
    const { error: updateError } = await supabase
      .from("ledger")
      .update({
        balance: newBalance,
        updated_at: now,
      })
      .eq("id", member_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update balance" }),
        { status: 500 }
      );
    }

    // 6. Record in ledger_history
    const { error: historyError } = await supabase
      .from("ledger_history")
      .insert([
        {
          user_id: member_id,
          transaction_type: "allocation",
          amount: amount,
          balance_after: newBalance,
          details: {
            tx_reference: tx_reference,
            admin_id: admin_id,
            member_phone: memberProfile.phone,
            member_code: memberProfile.client_code,
          },
        },
      ]);

    if (historyError) {
      console.error("Failed to record history:", historyError);
    }

    // 7. Audit log (critical for compliance)
    const { error: auditError } = await supabase
      .from("audit_log")
      .insert([
        {
          user_id: admin_id,
          action: "admin_allocation",
          details: {
            member_id: member_id,
            member_phone: memberProfile.phone,
            member_code: memberProfile.client_code,
            amount: amount,
            tx_reference: tx_reference,
            new_balance: newBalance,
            timestamp: now,
          },
        },
      ]);

    if (auditError) {
      console.error("Failed to record audit:", auditError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        member: memberProfile.client_code,
        amount: amount,
        new_balance: newBalance,
        transaction_reference: tx_reference,
        recorded_at: now,
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
