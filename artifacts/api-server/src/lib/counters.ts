const DEPOSIT_START = 4649;
const WITHDRAWAL_START = 2149;

let depositCounter = DEPOSIT_START;
let withdrawalCounter = WITHDRAWAL_START;
let initialized = false;

/**
 * Initialize counters from current max display_id in the DB by display family.
 * Must be called once at server startup before any transaction is created.
 */
export async function initCounters(
  sbAdmin: (path: string, opts?: RequestInit) => Promise<Response>,
): Promise<void> {
  try {
    const res = await sbAdmin(
      "transactions?display_id=not.is.null&select=display_id,type,notes,created_at&order=created_at.desc&limit=1000",
      { headers: { Prefer: "count=none" } },
    );
    if (res.ok) {
      const rows: { display_id: string | number; type?: string | null; notes?: string | null }[] = await res.json();
      const maxDepositId = rows.reduce((max, row) => {
        const n = Number(row.display_id);
        const notes = String(row.notes ?? "");
        const isWithdrawal = row.type === "withdrawal" || row.type === "withdraw" || notes.includes("[admin_adjustment:debit]");
        if (isWithdrawal) return max;
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);
      const maxWithdrawalId = rows.reduce((max, row) => {
        const n = Number(row.display_id);
        const notes = String(row.notes ?? "");
        const isWithdrawal = row.type === "withdrawal" || row.type === "withdraw" || notes.includes("[admin_adjustment:debit]");
        if (!isWithdrawal) return max;
        return Number.isFinite(n) && n > max && n < DEPOSIT_START ? n : max;
      }, 0);
      if (maxDepositId > depositCounter) depositCounter = maxDepositId;
      if (maxWithdrawalId > withdrawalCounter) withdrawalCounter = maxWithdrawalId;
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
