/**
 * sessionStore.ts
 *
 * Single-session enforcement: each user may have exactly one active session.
 * When a new login occurs the session_token is replaced, instantly invalidating
 * all previous sessions on any device.
 *
 * Source-of-truth hierarchy (authoritative → fallback):
 *   1. activeSessions Map (in-memory, O(1) — populated on login and DB lookup)
 *   2. profiles.session_token column in Supabase (survives server restarts)
 *
 * After a server restart, the first request for each user triggers a DB lookup
 * that warms activeSessions.  From that point on all requests hit the fast path.
 *
 * SQL migration (run once in Supabase SQL Editor before deploying):
 *   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS session_token TEXT;
 */

import crypto from "crypto";
import { fetchWithTimeout } from "./fetchWithTimeout";

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "Content-Type":  "application/json",
      apikey:          SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer:          "return=minimal",
      ...(opts.headers as Record<string, string> || {}),
    },
  });
}

// ── In-memory store ───────────────────────────────────────────────────────────
// userId → active session token.  A missing entry means "unknown" (not "no session");
// getActiveSessionToken() resolves unknowns by consulting the DB.
const activeSessions = new Map<string, string>();

// ── Column TTL cache ──────────────────────────────────────────────────────────
// Re-checks every 5 min so adding the column after startup is picked up.
const COLUMN_TTL_MS = 5 * 60_000;
let _colExists: boolean | null = null;
let _colCheckedAt = 0;

async function columnExists(): Promise<boolean> {
  if (_colExists === true) return true;          // confirmed true — never disappears
  const now = Date.now();
  if (_colExists !== null && now - _colCheckedAt < COLUMN_TTL_MS) return _colExists;
  try {
    const r = await sbAdmin("profiles?limit=0&select=session_token", {
      headers: { Prefer: "count=none" },
    });
    _colExists      = r.ok;
    _colCheckedAt   = now;
    if (!_colExists) {
      console.warn(
        "[SessionStore] ⚠️  profiles.session_token column missing.\n" +
        "  Run: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS session_token TEXT;\n" +
        "  Memory-only mode active — sessions lost on server restart.",
      );
    }
  } catch {
    _colExists    = false;
    _colCheckedAt = now;
  }
  return _colExists;
}

// ── Per-user mutexes ──────────────────────────────────────────────────────────
// Each map holds an in-flight Promise<string> keyed by userId.
// Multiple concurrent callers await the SAME promise → same token result.
const _creationMutex = new Map<string, Promise<string>>();
const _rotationMutex = new Map<string, Promise<string>>();

function withMutex(
  cache: Map<string, Promise<string>>,
  userId: string,
  factory: () => Promise<string>,
): Promise<string> {
  const inflight = cache.get(userId);
  if (inflight) return inflight;
  const p = factory().finally(() => cache.delete(userId));
  cache.set(userId, p);
  return p;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Memory-only lookup — never contacts DB.
 * Used as fallback when Supabase is unreachable.
 * Returns the token if present in memory, undefined otherwise.
 */
export function getMemorySessionToken(userId: string): string | undefined {
  return activeSessions.get(userId);
}

/**
 * Retrieve the current active session token for `userId`.
 *
 * Returns the token string if an active session exists (in memory or DB).
 * Returns null if no active session exists anywhere in the system.
 *
 * This is the SINGLE authoritative lookup used by requireAuth.  The return
 * value drives a three-way decision:
 *   token matches client  → allow
 *   token exists, no match → 401 SESSION_INVALID (no auto-rotate)
 *   null (no session)      → Supabase users may self-heal; game-token → 401
 */
export async function getActiveSessionToken(userId: string): Promise<string | null> {
  // Fast path — memory hit
  const memToken = activeSessions.get(userId);
  if (memToken !== undefined) return memToken;

  // Slow path — DB fallback (post-restart)
  if (!(await columnExists())) {
    // No DB column available: cannot determine whether a session exists.
    // Return null so requireAuth applies its no-session branch (Supabase
    // users auto-heal; game-token users get 401).
    return null;
  }

  try {
    const r = await sbAdmin(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=session_token&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    const rows: { session_token: string | null }[] = r.ok ? await r.json() : [];
    const dbToken = rows?.[0]?.session_token ?? null;

    if (dbToken) {
      activeSessions.set(userId, dbToken); // warm memory cache
      return dbToken;
    }
    // Explicitly no session in DB → store empty-string sentinel so we
    // don't re-query DB on every request for this user during this
    // server lifetime.  getActiveSessionToken callers treat "" as null.
    activeSessions.set(userId, "");
    return null;
  } catch {
    return null; // DB error — treat as no session (requireAuth decides what to do)
  }
}

/**
 * Create a brand-new session for `userId`, atomically invalidating all previous
 * sessions.  Always generates a new token regardless of any existing session.
 *
 * Use this ONLY for explicit login events.  For background/fallback use
 * getOrCreateSession(); for requireAuth self-heal use getOrHealSession().
 */
export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  activeSessions.set(userId, token);

  if (await columnExists()) {
    try {
      await sbAdmin(`profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body:   JSON.stringify({ session_token: token }),
      });
    } catch (e: any) {
      console.error("[SessionStore] error persisting session_token:", e.message);
    }
  }

  return token;
}

/**
 * Return the existing active session token for `userId` if one is already live
 * in memory; otherwise create a new one.  Mutex-protected so concurrent callers
 * share the same Promise and never generate two different tokens simultaneously.
 *
 * Use this in the create-session and local-token endpoints (background/fallback
 * issuance).  Preserves the session created by a concurrent /login call.
 */
export async function getOrCreateSession(userId: string): Promise<string> {
  const existing = activeSessions.get(userId);
  if (existing) return existing;
  return withMutex(_creationMutex, userId, () => createSession(userId));
}

/**
 * Issue a self-heal session for `userId` with per-user mutex protection.
 *
 * Used ONLY in requireAuth when there is NO active session anywhere in the
 * system (post-restart + no DB, or truly first-time session).  The mutex
 * ensures N concurrent requests all receive the SAME new token.
 *
 * NEVER call this when another device's active session already exists in memory
 * or DB — that case must return 401, not auto-rotate.
 *
 * Unlike createSession(), this variant writes to DB BEFORE setting memory.
 * This prevents a race where concurrent requests see the new token in memory
 * but still carry the old token → SESSION_INVALID storm after server restart.
 * During the DB write, concurrent callers hit the mutex and await the same
 * promise, so they all receive the same token without triggering SESSION_INVALID.
 */
export async function getOrHealSession(userId: string): Promise<string> {
  return withMutex(_rotationMutex, userId, async () => {
    const token = generateSessionToken();
    // Write to DB FIRST — while the write is in progress, getActiveSessionToken
    // returns null (memory miss + DB null) so concurrent requests join the mutex
    // rather than seeing a stale token mismatch.
    if (await columnExists()) {
      try {
        await sbAdmin(`profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          body:   JSON.stringify({ session_token: token }),
        });
      } catch (e: any) {
        console.error("[SessionStore] self-heal: error persisting session_token:", e.message);
      }
    }
    // Set memory AFTER DB write — now getActiveSessionToken returns the new token
    // and all awaiting requests get an exact match.
    activeSessions.set(userId, token);
    return token;
  });
}

/**
 * Destroy the session for `userId` (logout).
 */
export async function clearSession(userId: string): Promise<void> {
  activeSessions.delete(userId);
  _creationMutex.delete(userId);
  _rotationMutex.delete(userId);

  if (await columnExists()) {
    try {
      await sbAdmin(`profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body:   JSON.stringify({ session_token: null }),
      });
    } catch { /* ignore on logout */ }
  }
}

// Probe column existence at startup so the warning appears early.
columnExists().catch(() => {});
