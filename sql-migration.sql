-- ============================================
-- GROWX DATABASE SCHEMA & ROW LEVEL SECURITY
-- PostgreSQL Migration for Supabase
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABLES
-- ============================================

-- Members table (core user data)
CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone VARCHAR(20) UNIQUE NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  client_code VARCHAR(6) UNIQUE NOT NULL,
  balance DECIMAL(18, 2) DEFAULT 0.00 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Packages table (user's active packages)
CREATE TABLE IF NOT EXISTS public.packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL,
  daily_reward DECIMAL(18, 2) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Reward claims table (daily reward tracking)
CREATE TABLE IF NOT EXISTS public.reward_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT now()
);

-- Withdrawals table (USDT withdrawal requests)
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL,
  usdt_address VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, completed, rejected
  requested_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  admin_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Activity log table (audit trail)
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Gift codes table (admin-managed)
CREATE TABLE IF NOT EXISTS public.gift_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  reward_amount DECIMAL(18, 2) NOT NULL,
  active BOOLEAN DEFAULT true,
  max_uses INT DEFAULT 1,
  current_uses INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Gift code usage tracking
CREATE TABLE IF NOT EXISTS public.gift_code_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  gift_code_id UUID NOT NULL REFERENCES public.gift_codes(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, gift_code_id)
);

-- Recharge requests table
CREATE TABLE IF NOT EXISTS public.recharge_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL,
  transaction_reference VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, verified, approved, rejected
  requested_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  admin_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES FOR PERFORMANCE (10,000+ users)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_members_phone ON public.members(phone);
CREATE INDEX IF NOT EXISTS idx_members_client_code ON public.members(client_code);
CREATE INDEX IF NOT EXISTS idx_packages_member_id ON public.packages(member_id);
CREATE INDEX IF NOT EXISTS idx_packages_active ON public.packages(active);
CREATE INDEX IF NOT EXISTS idx_reward_claims_member_id ON public.reward_claims(member_id);
CREATE INDEX IF NOT EXISTS idx_reward_claims_claimed_at ON public.reward_claims(claimed_at);
CREATE INDEX IF NOT EXISTS idx_withdrawals_member_id ON public.withdrawals(member_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_activity_log_member_id ON public.activity_log(member_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_gift_codes_code ON public.gift_codes(code);
CREATE INDEX IF NOT EXISTS idx_recharge_requests_member_id ON public.recharge_requests(member_id);
CREATE INDEX IF NOT EXISTS idx_recharge_requests_status ON public.recharge_requests(status);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Users can only access their own data
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_code_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharge_requests ENABLE ROW LEVEL SECURITY;

-- MEMBERS TABLE POLICIES
-- Users can only view/update their own profile
CREATE POLICY "members_own_profile_select" ON public.members
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "members_own_profile_update" ON public.members
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- PACKAGES TABLE POLICIES
-- Users can only view their own packages
CREATE POLICY "packages_own_select" ON public.packages
  FOR SELECT USING (member_id = auth.uid());

-- Users can only insert packages for themselves
CREATE POLICY "packages_own_insert" ON public.packages
  FOR INSERT WITH CHECK (member_id = auth.uid());

-- Users can only update their own packages
CREATE POLICY "packages_own_update" ON public.packages
  FOR UPDATE USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

-- REWARD CLAIMS TABLE POLICIES
-- Users can only view their own reward claims
CREATE POLICY "reward_claims_own_select" ON public.reward_claims
  FOR SELECT USING (member_id = auth.uid());

-- Users can only claim their own rewards
CREATE POLICY "reward_claims_own_insert" ON public.reward_claims
  FOR INSERT WITH CHECK (member_id = auth.uid());

-- WITHDRAWALS TABLE POLICIES
-- Users can only view their own withdrawals
CREATE POLICY "withdrawals_own_select" ON public.withdrawals
  FOR SELECT USING (member_id = auth.uid());

-- Users can only create their own withdrawal requests
CREATE POLICY "withdrawals_own_insert" ON public.withdrawals
  FOR INSERT WITH CHECK (member_id = auth.uid());

-- Users cannot update their own withdrawals (admin-only)
-- No UPDATE policy = users cannot modify

-- ACTIVITY LOG POLICIES
-- Users can only view their own activity
CREATE POLICY "activity_log_own_select" ON public.activity_log
  FOR SELECT USING (member_id = auth.uid());

-- Activity log inserts are server-only (no direct insert from client)
CREATE POLICY "activity_log_server_insert" ON public.activity_log
  FOR INSERT WITH CHECK (false); -- Disabled for client

-- GIFT CODES POLICIES
-- Everyone can view active gift codes (metadata only)
CREATE POLICY "gift_codes_public_select" ON public.gift_codes
  FOR SELECT USING (active = true);

-- GIFT CODE USAGE POLICIES
-- Users can only view their own usage
CREATE POLICY "gift_code_usage_own_select" ON public.gift_code_usage
  FOR SELECT USING (member_id = auth.uid());

-- Users can only record their own usage
CREATE POLICY "gift_code_usage_own_insert" ON public.gift_code_usage
  FOR INSERT WITH CHECK (member_id = auth.uid());

-- RECHARGE REQUESTS POLICIES
-- Users can only view their own recharge requests
CREATE POLICY "recharge_requests_own_select" ON public.recharge_requests
  FOR SELECT USING (member_id = auth.uid());

-- Users can only create their own recharge requests
CREATE POLICY "recharge_requests_own_insert" ON public.recharge_requests
  FOR INSERT WITH CHECK (member_id = auth.uid());

-- Users cannot update their own recharge requests (admin-only)

-- ============================================
-- ADMIN BYPASS VIEWS (for backend/admin)
-- Create views that bypass RLS when using service-role key
-- ============================================

-- Admin view: All withdrawals (use service-role key only)
CREATE OR REPLACE VIEW admin_withdrawals_pending AS
SELECT w.*, m.phone, m.client_code
FROM withdrawals w
JOIN members m ON w.member_id = m.id
WHERE w.status = 'pending'
ORDER BY w.requested_at ASC;

-- Admin view: All recharge requests
CREATE OR REPLACE VIEW admin_recharge_requests AS
SELECT r.*, m.phone, m.client_code
FROM recharge_requests r
JOIN members m ON r.member_id = m.id
WHERE r.status = 'pending'
ORDER BY r.requested_at ASC;

-- ============================================
-- EXAMPLE: Admin Function (service-role key only)
-- ============================================

CREATE OR REPLACE FUNCTION approve_withdrawal(
  withdrawal_id UUID,
  transaction_hash VARCHAR
)
RETURNS JSON AS $$
BEGIN
  UPDATE withdrawals
  SET status = 'approved', processed_at = NOW(), admin_notes = transaction_hash
  WHERE id = withdrawal_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANTS (ensure proper access control)
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.packages TO authenticated;
GRANT SELECT, INSERT ON public.reward_claims TO authenticated;
GRANT SELECT, INSERT ON public.withdrawals TO authenticated;
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT SELECT ON public.gift_codes TO authenticated;
GRANT SELECT, INSERT ON public.gift_code_usage TO authenticated;
GRANT SELECT, INSERT ON public.recharge_requests TO authenticated;

-- Anonymous access (if needed for registration)
GRANT INSERT ON public.members TO anon;
GRANT USAGE ON SEQUENCE members_id_seq TO anon;
