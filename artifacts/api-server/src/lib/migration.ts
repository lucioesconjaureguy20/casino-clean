/**
 * migration.ts
 *
 * Runs at server startup to ensure user_notifications and user_reward_history
 * tables exist in Supabase.
 *
 * Uses the Supabase Management API if SUPABASE_MANAGEMENT_KEY is set.
 * Otherwise falls back to checking table existence and logging instructions.
 */

import { fetchWithTimeout } from "./fetchWithTimeout";

const SUPABASE_URL         = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
const MANAGEMENT_KEY       = process.env.SUPABASE_MANAGEMENT_KEY ?? "";

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "return=minimal",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

async function tableExists(name: string): Promise<boolean> {
  try {
    const r = await sbAdmin(`${name}?limit=1`);
    return r.ok || r.status === 400;
  } catch {
    return false;
  }
}

async function runSqlViaManagementApi(sql: string): Promise<boolean> {
  if (!MANAGEMENT_KEY) return false;
  const urlMatch = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) return false;
  const ref = urlMatch[1];
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${MANAGEMENT_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

const NOTIFICATIONS_DDL = `
CREATE TABLE IF NOT EXISTS user_notifications (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'bonus',
  title       TEXT        NOT NULL DEFAULT '',
  message     TEXT        NOT NULL DEFAULT '',
  title_key   TEXT,
  msg_key     TEXT,
  params      JSONB,
  read        BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at DESC);
`;

const REWARDS_DDL = `
CREATE TABLE IF NOT EXISTS user_reward_history (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL,
  amount      NUMERIC     NOT NULL,
  note        TEXT        NOT NULL DEFAULT '',
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_reward_history_user_id ON user_reward_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_reward_history_claimed_at ON user_reward_history(claimed_at DESC);
`;

export async function runMigration(): Promise<void> {
  const [notifExists, rewardExists] = await Promise.all([
    tableExists("user_notifications"),
    tableExists("user_reward_history"),
  ]);

  if (notifExists && rewardExists) {
    console.log("[migration] Tables OK: user_notifications, user_reward_history");
    return;
  }

  if (MANAGEMENT_KEY) {
    const results = await Promise.all([
      notifExists  ? Promise.resolve(true) : runSqlViaManagementApi(NOTIFICATIONS_DDL),
      rewardExists ? Promise.resolve(true) : runSqlViaManagementApi(REWARDS_DDL),
    ]);
    if (results.every(Boolean)) {
      console.log("[migration] Tables created via management API.");
      return;
    }
  }

  if (!notifExists || !rewardExists) {
    console.warn("[migration] ⚠️  Missing tables detected.");
    console.warn("[migration] Run supabase-migration.sql in the Supabase SQL editor.");
    console.warn("[migration] Or set SUPABASE_MANAGEMENT_KEY for auto-migration.");
  }
}
