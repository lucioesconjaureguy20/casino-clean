-- ============================================================
--  Mander Casino — Supabase Schema Completo
--  Pegá todo esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- ── EXTENSIONES ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════════
--  1. PROFILES — tabla principal de usuarios
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mander_id       TEXT        UNIQUE,
  username        TEXT        UNIQUE,
  email           TEXT,
  balance         FLOAT8      NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'active',
  is_blocked      BOOLEAN     NOT NULL DEFAULT false,
  is_flagged      BOOLEAN     NOT NULL DEFAULT false,
  is_admin        BOOLEAN     NOT NULL DEFAULT false,
  local_hash      TEXT,
  session_token   TEXT,
  balance_demo    FLOAT8      NOT NULL DEFAULT 0,
  is_streamer     BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS profiles_username_idx   ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS profiles_email_idx      ON public.profiles (lower(email));
CREATE INDEX IF NOT EXISTS profiles_mander_id_idx  ON public.profiles (mander_id);

-- Trigger: crea un perfil vacío cuando se registra un usuario en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS: permite que cualquiera lea username/email para el lookup de login
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_username_email" ON public.profiles;
CREATE POLICY "profiles_read_username_email" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id OR auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
--  2. BALANCES — saldo nativo por moneda
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.balances (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mander_id      TEXT        NOT NULL,
  user_id        UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  currency       TEXT        NOT NULL,
  balance        NUMERIC     NOT NULL DEFAULT 0,
  locked_amount  NUMERIC     NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mander_id, currency)
);

CREATE INDEX IF NOT EXISTS balances_mander_id_idx ON public.balances (mander_id);
CREATE INDEX IF NOT EXISTS balances_user_id_idx   ON public.balances (user_id);

ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "balances_service_role" ON public.balances;
CREATE POLICY "balances_service_role" ON public.balances USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  3. TRANSACTIONS — historial de movimientos
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.transactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mander_id       TEXT        NOT NULL,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  display_id      BIGINT,
  type            TEXT        NOT NULL,
  amount          NUMERIC     NOT NULL,
  currency        TEXT        NOT NULL DEFAULT 'USDT',
  network         TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending',
  external_tx_id  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_mander_id_idx  ON public.transactions (mander_id);
CREATE INDEX IF NOT EXISTS transactions_user_id_idx    ON public.transactions (user_id);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON public.transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_display_id_idx ON public.transactions (display_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transactions_service_role" ON public.transactions;
CREATE POLICY "transactions_service_role" ON public.transactions USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  4. DEPOSITS — depósitos de criptomonedas
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.deposits (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  amount        NUMERIC     NOT NULL DEFAULT 0,
  currency      TEXT        NOT NULL,
  network       TEXT        NOT NULL,
  address       TEXT,
  tx_hash       TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS deposits_user_id_idx    ON public.deposits (user_id);
CREATE INDEX IF NOT EXISTS deposits_status_idx     ON public.deposits (status);
CREATE INDEX IF NOT EXISTS deposits_created_at_idx ON public.deposits (created_at DESC);

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deposits_service_role" ON public.deposits;
CREATE POLICY "deposits_service_role" ON public.deposits USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  5. WITHDRAWALS — retiros
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  mander_id   TEXT,
  amount      NUMERIC     NOT NULL,
  currency    TEXT        NOT NULL,
  network     TEXT        NOT NULL,
  wallet      TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',
  tx_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS withdrawals_user_id_idx    ON public.withdrawals (user_id);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx     ON public.withdrawals (status);
CREATE INDEX IF NOT EXISTS withdrawals_created_at_idx ON public.withdrawals (created_at DESC);

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "withdrawals_service_role" ON public.withdrawals;
CREATE POLICY "withdrawals_service_role" ON public.withdrawals USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  6. GAME_BETS — historial de apuestas
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.game_bets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT        NOT NULL,
  game        TEXT        NOT NULL,
  currency    TEXT        NOT NULL DEFAULT 'USD',
  bet_usd     FLOAT8      NOT NULL DEFAULT 0,
  payout_usd  FLOAT8      NOT NULL DEFAULT 0,
  bonus_usd   FLOAT8      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_bets_username_idx    ON public.game_bets (lower(username));
CREATE INDEX IF NOT EXISTS game_bets_created_at_idx  ON public.game_bets (created_at DESC);

ALTER TABLE public.game_bets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "game_bets_service_role" ON public.game_bets;
CREATE POLICY "game_bets_service_role" ON public.game_bets USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  7. RAKEBACK_POOLS — acumulado de rakeback por período
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rakeback_pools (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mander_id   TEXT        NOT NULL,
  pool_type   TEXT        NOT NULL,
  period_key  TEXT        NOT NULL,
  amount_usd  NUMERIC     NOT NULL DEFAULT 0,
  claimed     BOOLEAN     NOT NULL DEFAULT false,
  claimed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, pool_type, period_key)
);

CREATE INDEX IF NOT EXISTS rakeback_pools_user_id_idx    ON public.rakeback_pools (user_id);
CREATE INDEX IF NOT EXISTS rakeback_pools_period_key_idx ON public.rakeback_pools (period_key);

ALTER TABLE public.rakeback_pools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rakeback_pools_service_role" ON public.rakeback_pools;
CREATE POLICY "rakeback_pools_service_role" ON public.rakeback_pools USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  8. IDEMPOTENCY_KEYS — evitar doble claim
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "idempotency_keys_service_role" ON public.idempotency_keys;
CREATE POLICY "idempotency_keys_service_role" ON public.idempotency_keys USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  9. USER_NOTIFICATIONS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'bonus',
  title       TEXT        NOT NULL DEFAULT '',
  message     TEXT        NOT NULL DEFAULT '',
  title_key   TEXT,
  msg_key     TEXT,
  params      JSONB,
  read        BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_id_idx    ON public.user_notifications (user_id);
CREATE INDEX IF NOT EXISTS user_notifications_created_at_idx ON public.user_notifications (created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_notifications_service_role" ON public.user_notifications;
CREATE POLICY "user_notifications_service_role" ON public.user_notifications USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  10. USER_REWARD_HISTORY
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_reward_history (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      NUMERIC     NOT NULL,
  note        TEXT        NOT NULL DEFAULT '',
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_reward_history_user_id_idx   ON public.user_reward_history (user_id);
CREATE INDEX IF NOT EXISTS user_reward_history_claimed_at_idx ON public.user_reward_history (claimed_at DESC);

ALTER TABLE public.user_reward_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_reward_history_service_role" ON public.user_reward_history;
CREATE POLICY "user_reward_history_service_role" ON public.user_reward_history USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  11. AFFILIATE_LINKS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.affiliate_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT        UNIQUE NOT NULL,
  ref_code    TEXT        UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "affiliate_links_service_role" ON public.affiliate_links;
CREATE POLICY "affiliate_links_service_role" ON public.affiliate_links USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  12. AFFILIATE_REFERRALS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_username   TEXT        NOT NULL,
  referred_username   TEXT        UNIQUE NOT NULL,
  wager_amount        NUMERIC     NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS affiliate_referrals_referrer_idx  ON public.affiliate_referrals (referrer_username);
CREATE INDEX IF NOT EXISTS affiliate_referrals_referred_idx  ON public.affiliate_referrals (referred_username);

ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "affiliate_referrals_service_role" ON public.affiliate_referrals;
CREATE POLICY "affiliate_referrals_service_role" ON public.affiliate_referrals USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  13. AFFILIATE_CLICKS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code      TEXT        NOT NULL,
  visitor_hash  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS affiliate_clicks_ref_code_idx ON public.affiliate_clicks (ref_code);

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "affiliate_clicks_service_role" ON public.affiliate_clicks;
CREATE POLICY "affiliate_clicks_service_role" ON public.affiliate_clicks USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  14. AFFILIATE_COMMISSIONS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_username   TEXT        NOT NULL,
  amount              NUMERIC     NOT NULL DEFAULT 0,
  ngr_period          TEXT,
  period              TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS affiliate_commissions_referrer_idx ON public.affiliate_commissions (referrer_username);
CREATE INDEX IF NOT EXISTS affiliate_commissions_period_idx   ON public.affiliate_commissions (period);

ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "affiliate_commissions_service_role" ON public.affiliate_commissions;
CREATE POLICY "affiliate_commissions_service_role" ON public.affiliate_commissions USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  15. FUNCIÓN RPC: claim_rakeback_atomic
--      Utilizada por /api/claim-rakeback
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.claim_rakeback_atomic(
  p_user_id       UUID,
  p_mander_id     TEXT,
  p_pool_types    TEXT[],
  p_period_keys   TEXT[],
  p_idem_key      UUID,
  p_total_usd     NUMERIC,
  p_tx_id         UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_amount NUMERIC := 0;
  v_pool   RECORD;
BEGIN
  -- Idempotency check
  INSERT INTO public.idempotency_keys (id, key, created_at)
  VALUES (p_tx_id, p_idem_key::TEXT, NOW())
  ON CONFLICT (key) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
  END IF;

  -- Lock and claim pools
  FOR v_pool IN
    SELECT id, amount_usd FROM public.rakeback_pools
    WHERE user_id    = p_user_id
      AND pool_type  = ANY(p_pool_types)
      AND period_key = ANY(p_period_keys)
      AND claimed    = false
    FOR UPDATE SKIP LOCKED
  LOOP
    v_amount := v_amount + v_pool.amount_usd;
    UPDATE public.rakeback_pools
    SET claimed = true, claimed_at = NOW()
    WHERE id = v_pool.id;
  END LOOP;

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pools');
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount_usd', v_amount);
END;
$$;

-- ══════════════════════════════════════════════════════════════
--  LISTO. Todas las tablas y políticas creadas.
-- ══════════════════════════════════════════════════════════════
