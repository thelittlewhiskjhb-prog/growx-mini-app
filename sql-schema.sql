-- ============================================
-- GROWX PRODUCTION DATABASE SCHEMA
-- PostgreSQL + Supabase
-- Row Level Security (RLS) Enabled
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABLES
-- ============================================

-- Profiles (User accounts)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone VARCHAR(20) UNIQUE NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  client_code VARCHAR(6) UNIQUE NOT NULL,
  role VARCHAR(20) DEFAULT 'member', -- member, admin
  display_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ledger (Balance + reward tracking)
CREATE TABLE IF NOT EXISTS public.ledger (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance DECIMAL(18, 2) DEFAULT 0.00 NOT NULL,
  total_claimed_rewards DECIMAL(18, 2) DEFAULT 0.00 NOT NULL,
  last_reward_claim TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ledger History (Immutable transaction log)
CREATE TABLE IF NOT EXISTS public.ledger_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL, -- reward_claimed, package_added, allocation, withdrawal_completed, gift_redeemed
  amount DECIMAL(18, 2) NOT NULL,
  balance_after DECIMAL(18, 2) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Packages (Investment templates)
CREATE TABLE IF NOT EXISTS public.packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  amount DECIMAL(18, 2) NOT NULL,
  daily_reward_amount DECIMAL(18, 2) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User Packages (Member's active packages)
CREATE TABLE IF NOT EXISTS public.user_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id),
  amount DECIMAL(18, 2) NOT NULL,
  daily_reward_amount DECIMAL(18, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'active', -- active, completed, cancelled
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Reward Claims (24-hour enforcement)
CREATE TABLE IF NOT EXISTS public.reward_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT now()
);

-- Withdrawals (USDT payout requests)
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL,
  usdt_address VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'PROCESSING', -- PROCESSING, APPROVED, COMPLETED, REJECTED
  requested_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  admin_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Gift Codes (Admin-managed)
CREATE TABLE IF NOT EXISTS public.gift_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  reward_amount DECIMAL(18, 2) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id)
);

-- Gift Code Redemptions
CREATE TABLE IF NOT EXISTS public.gift_code_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gift_code_id UUID NOT NULL REFERENCES public.gift_codes(id),
  redeemed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, gift_code_id)
);

-- Audit Log (All admin actions)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES FOR ~10,000 USERS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_client_code ON public.profiles(client_code);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_ledger_history_user_id ON public.ledger_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_history_created_at ON public.ledger_history(created_at);
CREATE INDEX IF NOT EXISTS idx_user_packages_user_id ON public.user_packages(user_id);
CREATE INDEX IF NOT EXISTS idx_user_packages_status ON public.user_packages(status);
CREATE INDEX IF NOT EXISTS idx_reward_claims_user_id ON public.reward_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_claims_claimed_at ON public.reward_claims(claimed_at);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_requested_at ON public.withdrawals(requested_at);
CREATE INDEX IF NOT EXISTS idx_gift_codes_code ON public.gift_codes(code);
CREATE INDEX IF NOT EXISTS idx_gift_codes_active ON public.gift_codes(active);
CREATE INDEX IF NOT EXISTS idx_gift_code_redemptions_user_id ON public.gift_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_code_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- PROFILES: Users can only see their own profile
CREATE POLICY "profiles_own_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = 'member'); -- Cannot change role

-- LEDGER: Users can only see their own balance
CREATE POLICY "ledger_own_select" ON public.ledger
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "ledger_own_update" ON public.ledger
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (false); -- Users cannot modify balance directly

-- LEDGER_HISTORY: Users can only read their own history
CREATE POLICY "ledger_history_own_select" ON public.ledger_history
  FOR SELECT USING (auth.uid() = user_id);

-- USER_PACKAGES: Users can only see their own packages
CREATE POLICY "user_packages_own_select" ON public.user_packages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_packages_own_insert" ON public.user_packages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- REWARD_CLAIMS: Users can only see their own claims
CREATE POLICY "reward_claims_own_select" ON public.reward_claims
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "reward_claims_own_insert" ON public.reward_claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- WITHDRAWALS: Users can only see and create their own
CREATE POLICY "withdrawals_own_select" ON public.withdrawals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "withdrawals_own_insert" ON public.withdrawals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users cannot update their withdrawals (admin-only)
CREATE POLICY "withdrawals_no_user_update" ON public.withdrawals
  FOR UPDATE USING (false); -- Explicitly disabled for users

-- GIFT_CODES: Everyone can view active codes
CREATE POLICY "gift_codes_public_select" ON public.gift_codes
  FOR SELECT USING (active = true);

-- GIFT_CODE_REDEMPTIONS: Users can only see their own
CREATE POLICY "gift_redemptions_own_select" ON public.gift_code_redemptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "gift_redemptions_own_insert" ON public.gift_code_redemptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- PACKAGES: Everyone can view active templates
CREATE POLICY "packages_public_select" ON public.packages
  FOR SELECT USING (active = true);

-- AUDIT_LOG: Admins can read; server-side writes only
CREATE POLICY "audit_log_admin_select" ON public.audit_log
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- ============================================
-- ADMIN VIEWS (Read via RLS when admin)
-- ============================================

CREATE OR REPLACE VIEW admin_member_search AS
  SELECT p.id, p.phone, p.client_code, l.balance, p.created_at
  FROM public.profiles p
  JOIN public.ledger l ON p.id = l.id
  WHERE p.role = 'member';

CREATE OR REPLACE VIEW admin_pending_withdrawals AS
  SELECT 
    w.id,
    w.user_id,
    p.phone,
    p.client_code,
    w.amount,
    w.usdt_address,
    w.status,
    w.requested_at
  FROM public.withdrawals w
  JOIN public.profiles p ON w.user_id = p.id
  WHERE w.status = 'PROCESSING'
  ORDER BY w.requested_at ASC;

-- ============================================
-- GRANTS
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.ledger TO authenticated;
GRANT SELECT ON public.ledger_history TO authenticated;
GRANT SELECT ON public.packages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_packages TO authenticated;
GRANT SELECT, INSERT ON public.reward_claims TO authenticated;
GRANT SELECT, INSERT ON public.withdrawals TO authenticated;
GRANT SELECT ON public.gift_codes TO authenticated;
GRANT SELECT, INSERT ON public.gift_code_redemptions TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;

-- Allow anonymous registration (if applicable)
GRANT INSERT ON public.profiles TO anon;

-- ============================================
-- SEED: Initial Package Templates
-- ============================================

INSERT INTO public.packages (amount, daily_reward_amount, description, active)
VALUES
  (20, 2, 'Starter Package', true),
  (40, 4, 'Basic Package', true),
  (80, 8, 'Standard Package', true),
  (120, 12, 'Premium Package', true),
  (200, 20, 'Pro Package', true),
  (450, 45, 'Elite Package', true),
  (700, 70, 'Platinum Package', true),
  (1000, 100, 'Diamond Package', true),
  (2000, 200, 'Premium Plus Package', true),
  (3000, 300, 'Ultimate Package', true)
ON CONFLICT DO NOTHING;
