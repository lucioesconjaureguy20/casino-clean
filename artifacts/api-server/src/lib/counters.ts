import { fetchWithTimeout } from "./fetchWithTimeout";

const DEPOSIT_START    = 4649;
const WITHDRAWAL_START = 2149;

let depositCounter    = DEPOSIT_START;
let withdrawalCounter = WITHDRAWAL_START;
let initialized       = false;

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer:         "count=none",
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
}

/**
 * Initialize counters from current max display_id in the DB by display family.
 * Must be called once at server startup before any transaction is created.
 * Uses two targeted queries (ordered by display_id desc, limit 1) so it always
 * finds the true max regardless of how many transactions exist.
 */
export async function initCounters(): Promise<void> {
  try {
    // Deposit family: display_id >= DEPOSIT_START
    const depRes = await sbAdmin(
      `transactions?display_id=gte.${DEPOSIT_START}&select=display_id&order=display_id.desc&limit=1`,
    );
    if (depRes.ok) {
      const rows: { display_id: string | number }[] = await depRes.json();
      const max = rows.length > 0 ? Number(rows[0].display_id) : 0;
      if (Number.isFinite(max) && max > depositCounter) depositCounter = max;
    }

    // Withdrawal family: display_id < DEPOSIT_START
    const wdRes = await sbAdmin(
      `transactions?display_id=lt.${DEPOSIT_START}&select=display_id&order=display_id.desc&limit=1`,
    );
    if (wdRes.ok) {
      const rows: { display_id: string | number }[] = await wdRes.json();
      const max = rows.length > 0 ? Number(rows[0].display_id) : 0;
      if (Number.isFinite(max) && max > withdrawalCounter) withdrawalCounter = max;
    }
  } catch (e) {
    console.error("[counters] Failed to init counter:", e);
  }
  initialized = true;
  console.log(`[counters] TX counters initialized deposit=${depositCounter} withdrawal=${withdrawalCounter}`);
}

export function nextDepositDisplayId(): number {
  if (!initialized) {
    depositCounter = Math.max(depositCounter, DEPOSIT_START);
  }
  depositCounter += 1;
  return depositCounter;
}

export function nextWithdrawalDisplayId(): number {
  if (!initialized) {
    withdrawalCounter = Math.max(withdrawalCounter, WITHDRAWAL_START);
  }
  withdrawalCounter += 1;
  return withdrawalCounter;
}

export const nextTxDisplayId = nextDepositDisplayId;
