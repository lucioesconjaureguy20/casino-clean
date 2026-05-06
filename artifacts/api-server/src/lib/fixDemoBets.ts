/**
 * fixDemoBets.ts
 *
 * Two responsibilities:
 *
 * 1. REPAIR (startup, once): Users who had ALL their bets retroactively mis-flagged
 *    as is_demo=true by the old corrector logic (which used balance_demo as signal).
 *    Only repair users who have DEPLETED their demo balance (grant > 0, current = 0).
 *    Users with active demo balance keep their bets as demo.
 *
 * 2. PERIODIC CORRECTOR: For users with active demo balance (balance_demo_local > 0),
 *    mark ALL their bets as is_demo=true — not just recent ones. These are streamer/demo
 *    accounts whose bets should never appear in GGR stats.
 */
import { fetchWithTimeout } from "./fetchWithTimeout";
import { logger } from "./logger";
import { getAuthUsers, sleep } from "./supabaseCache";

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sbAdminRest(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Supabase not configured");
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  return fetchWithTimeout(url, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

// ── One-time repair: undo incorrect is_demo=true on REAL users' bets ──────────
// Only targets users who received a demo grant but have FULLY depleted it
// (balance_demo > 0 AND balance_demo_local === 0).
// Users with active demo balance (balance_demo_local > 0) are skipped — their
// bets should remain demo.
async function repairRealBets(): Promise<void> {
  try {
    const users = await getAuthUsers();
    if (!users.length) return;

    // Only users who had a grant but depleted it completely.
    const depletedUsers = users.filter((u) => {
      const meta    = u.app_metadata ?? {};
      const grant   = Number(meta.balance_demo       ?? 0);
      const current = Number(meta.balance_demo_local ?? 0);
      return grant > 0 && current === 0;
    });

    if (!depletedUsers.length) {
      logger.info("[fix-demo-bets] repair: no depleted-demo users found — nothing to repair");
      return;
    }
    logger.info(`[fix-demo-bets] repair: resetting mis-flagged bets for ${depletedUsers.length} depleted-demo user(s)`);

    let totalFixed = 0;
    for (const user of depletedUsers) {
      try {
        const profRes = await sbAdminRest(
          `profiles?id=eq.${encodeURIComponent(user.id)}&select=username&limit=1`,
          { headers: { Prefer: "count=none" } },
        );
        if (!profRes.ok) continue;
        const profRows: { username: string }[] = await profRes.json();
        const username = profRows[0]?.username;
        if (!username) continue;

        // Reset ALL is_demo=true bets for this user — they ran out of demo balance
        // so their historical bets were real money bets mis-flagged by the old corrector.
        const patchRes = await sbAdminRest(
          `game_bets?username=ilike.${encodeURIComponent(username)}&is_demo=eq.true`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal,count=exact" },
            body: JSON.stringify({ is_demo: false }),
          },
        );
        const countHeader = patchRes.headers.get("content-range");
        const fixed = countHeader ? parseInt(countHeader.split("/")[1] ?? "0", 10) : 0;
        if (fixed > 0) {
          logger.info(`[fix-demo-bets] repair: reset ${fixed} bet(s) for "${username}" (depleted demo)`);
          totalFixed += fixed;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`[fix-demo-bets] repair error for ${user.id}: ${msg}`);
      }
      // Brief pause between users to avoid saturating Supabase connections
      await sleep(400);
    }
    logger.info(`[fix-demo-bets] repair done — reset ${totalFixed} bet(s) for depleted-demo users`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[fix-demo-bets] repair unexpected error: ${msg}`);
  }
}

// ── Periodic corrector ────────────────────────────────────────────────────────
export function startDemoBetsCorrector(intervalMs = 30_000): void {
  repairRealBets().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[fix-demo-bets] repair run error: ${msg}`);
  });

  const run = () =>
    fixDemoBets().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[fix-demo-bets] periodic run error: ${msg}`);
    });
  run();
  setInterval(run, intervalMs);
}

// ── Core corrector: mark ALL bets for active-demo accounts as is_demo=true ───
// Active demo accounts (balance_demo_local > 0) are streamer/tester accounts.
// ALL their bets — past and present — should be excluded from GGR.
export async function fixDemoBets(): Promise<void> {
  try {
    const users = await getAuthUsers();
    if (!users.length) return;

    const demoUsers = users.filter((u) => {
      const meta    = u.app_metadata ?? {};
      const current = Number(meta.balance_demo_local ?? 0);
      return current > 0;
    });

    if (!demoUsers.length) return;

    let totalFixed = 0;
    for (const user of demoUsers) {
      try {
        const profRes = await sbAdminRest(
          `profiles?id=eq.${encodeURIComponent(user.id)}&select=username&limit=1`,
          { headers: { Prefer: "count=none" } },
        );
        if (!profRes.ok) continue;
        const profRows: { username: string }[] = await profRes.json();
        const username = profRows[0]?.username;
        if (!username) continue;

        // Mark ALL bets (no date filter) as is_demo=true for active demo accounts.
        // These are dedicated streamer/demo accounts — none of their bets are real GGR.
        const patchRes = await sbAdminRest(
          `game_bets?username=ilike.${encodeURIComponent(username)}&or=(is_demo.eq.false,is_demo.is.null)`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal,count=exact" },
            body: JSON.stringify({ is_demo: true }),
          },
        );

        const countHeader = patchRes.headers.get("content-range");
        const fixed = countHeader ? parseInt(countHeader.split("/")[1] ?? "0", 10) : 0;
        if (fixed > 0) {
          logger.info(`[fix-demo-bets] marked ${fixed} bet(s) as demo for active-demo user "${username}"`);
          totalFixed += fixed;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`[fix-demo-bets] error processing user ${user.id}: ${msg}`);
      }
      // Brief pause between users to avoid saturating Supabase connections
      await sleep(400);
    }

    if (totalFixed > 0) {
      logger.info(`[fix-demo-bets] done — marked ${totalFixed} bet(s) as demo total`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[fix-demo-bets] unexpected error: ${msg}`);
  }
}
