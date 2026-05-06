/**
 * supabaseCache.ts
 *
 * Shared in-memory cache for expensive Supabase calls that multiple
 * parts of the server make independently (auth users list, profiles dump).
 * Prevents concurrent cache misses from all hitting Supabase at the same time
 * (singleflight pattern).
 */
import { fetchWithTimeout } from "./fetchWithTimeout";
import { logger } from "./logger";

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Typed entries ─────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  app_metadata: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  email?: string;
}

// ── Generic cache entry ───────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ── Singleflight helper ───────────────────────────────────────────────────────
// If the same key is already being fetched, return the in-flight promise
// instead of launching a second request.

const inflight: Map<string, Promise<unknown>> = new Map();

async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ── Auth users cache (5-minute TTL) ──────────────────────────────────────────

const AUTH_USERS_TTL_MS = 5 * 60 * 1000;
let authUsersCache: CacheEntry<AuthUser[]> | null = null;

async function fetchAuthUsers(): Promise<AuthUser[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return [];
  try {
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      },
      15_000,
    );
    if (!res.ok) {
      logger.warn(`[supabaseCache] getAuthUsers failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data?.users ?? data ?? []) as AuthUser[];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`[supabaseCache] getAuthUsers error: ${msg}`);
    return [];
  }
}

/**
 * Returns the cached auth users list (fetched at most once every 5 minutes).
 * Uses singleflight so concurrent callers share one in-flight request.
 */
export function getAuthUsers(): Promise<AuthUser[]> {
  const now = Date.now();
  if (authUsersCache && authUsersCache.expiresAt > now) {
    return Promise.resolve(authUsersCache.value);
  }
  return singleFlight("authUsers", async () => {
    const users = await fetchAuthUsers();
    authUsersCache = { value: users, expiresAt: now + AUTH_USERS_TTL_MS };
    return users;
  });
}

/**
 * Force-invalidate the auth users cache (call after updating app_metadata, etc.).
 */
export function invalidateAuthUsersCache(): void {
  authUsersCache = null;
}

// ── Small delay helper (used between sequential Supabase calls) ───────────────

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// ── Cached game_bets rows (shared between stats + affiliates) ─────────────────
//
// Fetching all 55k+ bet rows via pagination takes ~10s on cold load.
// Both /admin/stats and /admin/affiliates need the same data, so share it.

const BET_ROWS_CACHE_TTL_MS = 5 * 60 * 1000;
let betRowsCache: CacheEntry<any[]> | null = null;

export function getCachedBetRows(): Promise<any[]> {
  const now = Date.now();
  if (betRowsCache && betRowsCache.expiresAt > now) {
    return Promise.resolve(betRowsCache.value);
  }
  return singleFlight("betRows", async () => {
    const rows = await fetchAllRows(
      "game_bets?select=username,bet_usd,payout_usd,bonus_usd,created_at&is_demo=eq.false&order=id.asc",
      { concurrency: 10, timeoutMs: 25_000 },
    );
    betRowsCache = { value: rows, expiresAt: now + BET_ROWS_CACHE_TTL_MS };
    logger.info(`[betRowsCache] loaded ${rows.length} rows`);
    return rows;
  });
}

export function invalidateBetRowsCache(): void {
  betRowsCache = null;
}

// ── Paginated row fetcher ─────────────────────────────────────────────────────
//
// PostgREST enforces a max-rows limit (default 1000).  This helper fetches ALL
// rows by paginating with Range headers and running up to `concurrency` pages
// in parallel.  The `path` must NOT include a `limit=` parameter.
//
// Example:
//   const rows = await fetchAllRows(
//     "game_bets?select=username,bet_usd&is_demo=eq.false&order=id.asc"
//   );

export async function fetchAllRows(
  path: string,
  { pageSize = 1000, concurrency = 10, timeoutMs = 25_000 }: {
    pageSize?: number;
    concurrency?: number;
    timeoutMs?: number;
  } = {},
): Promise<any[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return [];

  const baseHeaders = {
    apikey:        SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    Prefer:        "count=exact",
  };

  // First page — also gives us the total via Content-Range
  const firstRes = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/${path}`,
    { headers: { ...baseHeaders, Range: `0-${pageSize - 1}` } },
    timeoutMs,
  );
  if (!firstRes.ok) {
    logger.warn(`[fetchAllRows] first page failed: ${firstRes.status} path=${path}`);
    return [];
  }

  const contentRange = firstRes.headers.get("content-range") ?? "";
  const total = parseInt(contentRange.split("/")[1] ?? "0", 10) || 0;
  const firstRows: any[] = await firstRes.json().catch(() => []);

  if (total <= pageSize) return Array.isArray(firstRows) ? firstRows : [];

  // Build list of remaining pages
  const pageStarts: number[] = [];
  for (let start = pageSize; start < total; start += pageSize) {
    pageStarts.push(start);
  }

  const noCountHeaders = { ...baseHeaders, Prefer: "count=none" };
  const allRows: any[] = Array.isArray(firstRows) ? [...firstRows] : [];

  for (let i = 0; i < pageStarts.length; i += concurrency) {
    const batch = pageStarts.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(start =>
        fetchWithTimeout(
          `${SUPABASE_URL}/rest/v1/${path}`,
          { headers: { ...noCountHeaders, Range: `${start}-${start + pageSize - 1}` } },
          timeoutMs,
        )
          .then(r => (r.ok ? r.json() : []))
          .catch(() => []),
      ),
    );
    for (const rows of results) {
      if (Array.isArray(rows)) allRows.push(...rows);
    }
  }

  return allRows;
}
