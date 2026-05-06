/**
 * requireAuth.ts
 *
 * Deterministic session middleware — three-way decision per request:
 *
 *   ┌─ active session exists AND token matches ──► next()  (valid, fast path)
 *   │
 *   ├─ active session exists AND token MISMATCH ─► 401 SESSION_INVALID
 *   │    (another device owns this session — no auto-rotation, no exceptions)
 *   │
 *   └─ NO active session anywhere in system:
 *         Supabase users ──► getOrHealSession() + X-New-Session-Token + next()
 *         game-token users → 401 SESSION_INVALID  (re-login required)
 *
 * Admin users (is_admin=true in profiles) are EXEMPT from single-session
 * enforcement — they may be logged in from multiple devices simultaneously.
 *
 * "Active session exists" = getActiveSessionToken() returns a non-null value
 * from memory (fast, O(1)) or DB (slow path, only on post-restart cold-start).
 *
 * Cross-device guarantee:
 *   When device B logs in, activeSessions[userId] = tokenB.
 *   Device A's next request → getActiveSessionToken → tokenB ≠ tokenA → 401.
 *   Device A is evicted on its very first request after device B's login.
 *   There is no window where both devices are simultaneously valid.
 *
 * Game-token users never auto-rotate.  Their only identity proof is the
 * signed game-token itself; without Supabase as an independent verifier we
 * cannot safely issue new sessions without a full re-authentication.
 */

import type { Request, Response, NextFunction } from "express";
import { verifyGameToken } from "./gameToken";
import { getActiveSessionToken, getOrHealSession } from "./sessionStore";
import { fetchWithTimeout } from "./fetchWithTimeout";

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

// Offline admin username set — bypass Supabase roundtrip entirely for known admins.
// Populated from ADMIN_USERNAMES env var (comma-separated, case-insensitive).
const ADMIN_USERNAMES_OFFLINE = new Set(
  (process.env.ADMIN_USERNAMES ?? "")
    .split(",").map(u => u.trim().toLowerCase()).filter(Boolean)
);

// ── JWT verification cache + singleflight ─────────────────────────────────────
// JWTs are immutable; caching the Supabase /auth/v1/user result avoids a 2-6s
// round-trip on every authenticated request.  Singleflight ensures that when
// many requests arrive simultaneously with the same uncached JWT, only ONE
// Supabase call is made — all others await the same Promise.
const JWT_VERIFY_CACHE_TTL = 5 * 60_000;
const jwtVerifyCache = new Map<string, { id: string; email: string; user_metadata: Record<string, any>; at: number }>();
// In-flight map: token → pending verification Promise
const jwtVerifyInFlight = new Map<string, Promise<{ id: string; email: string; user_metadata: Record<string, any> } | null>>();

// ── Admin status cache ────────────────────────────────────────────────────────
// Avoids a DB round-trip on every admin request.  TTL = 5 minutes.
const ADMIN_CACHE_TTL_MS = 5 * 60_000;
const adminCache = new Map<string, { isAdmin: boolean; at: number }>();

async function isAdminUser(userId: string, usernameHint?: string): Promise<boolean> {
  // Fast offline check — no Supabase call needed for known admin usernames.
  if (usernameHint && ADMIN_USERNAMES_OFFLINE.has(usernameHint.toLowerCase())) {
    adminCache.set(userId, { isAdmin: true, at: Date.now() });
    return true;
  }

  const cached = adminCache.get(userId);
  if (cached && Date.now() - cached.at < ADMIN_CACHE_TTL_MS) return cached.isAdmin;

  try {
    const r = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=is_admin&limit=1`,
      {
        headers: {
          apikey:        SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Prefer:        "count=none",
        },
      },
      4_000,
    );
    if (!r.ok) { adminCache.set(userId, { isAdmin: false, at: Date.now() }); return false; }
    const rows: { is_admin?: boolean }[] = await r.json();
    const admin = rows?.[0]?.is_admin === true;
    adminCache.set(userId, { isAdmin: admin, at: Date.now() });
    return admin;
  } catch {
    // Supabase unreachable — do not cache failure; return false conservatively.
    return false;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {

  // ── Step 1: Verify identity (Bearer token) ────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "SESSION_INVALID" });
    return;
  }
  const bearerToken = authHeader.slice(7);

  let isGameToken = false;

  const gameUser = verifyGameToken(bearerToken);
  if (gameUser) {
    isGameToken = true;
    req.authUser = {
      id:            gameUser.profileId,
      email:         "",
      user_metadata: { username: gameUser.username },
    };
  } else {
    // Supabase JWT — check cache first, then verify with Supabase auth service.
    // Singleflight: concurrent requests sharing the same uncached JWT await one shared Promise.
    const jwtCached = jwtVerifyCache.get(bearerToken);
    if (jwtCached && Date.now() - jwtCached.at < JWT_VERIFY_CACHE_TTL) {
      req.authUser = { id: jwtCached.id, email: jwtCached.email, user_metadata: jwtCached.user_metadata };
    } else {
      // Singleflight: reuse an in-flight verification if one is already running for this token
      let verifyPromise = jwtVerifyInFlight.get(bearerToken);
      if (!verifyPromise) {
        verifyPromise = (async () => {
          try {
            const r = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
              headers: {
                "Content-Type": "application/json",
                apikey:          SUPABASE_ANON_KEY,
                Authorization:   `Bearer ${bearerToken}`,
              },
            }, 15_000); // extended to 15s — Supabase can be slow; singleflight ensures only 1 call per token
            const data = await r.json();
            if (!r.ok || !data?.id) return null;
            const entry = { id: data.id, email: data.email, user_metadata: data.user_metadata };
            jwtVerifyCache.set(bearerToken, { ...entry, at: Date.now() });
            return entry;
          } catch {
            return null;
          } finally {
            jwtVerifyInFlight.delete(bearerToken);
          }
        })();
        jwtVerifyInFlight.set(bearerToken, verifyPromise);
      }

      const verified = await verifyPromise;
      if (verified) {
        req.authUser = { id: verified.id, email: verified.email, user_metadata: verified.user_metadata };
      } else {
        // Supabase unreachable — try local JWT decode + session-token fallback
        console.error("[requireAuth] Supabase verify returned null (unreachable or invalid token)");
        const clientTokenFallback = req.headers["x-session-token"] as string | undefined;
        const jwtPayload = decodeJwtPayload(bearerToken);
        if (jwtPayload?.sub && clientTokenFallback) {
          try {
            const activeToken = await getActiveSessionToken(jwtPayload.sub);
            if (activeToken && activeToken === clientTokenFallback) {
              console.warn(`[requireAuth] Supabase down — DB/memory fallback OK for userId=${jwtPayload.sub}`);
              req.authUser = {
                id:            jwtPayload.sub,
                email:         jwtPayload.email || "",
                user_metadata: jwtPayload.user_metadata || {},
              };
              next();
              return;
            }
          } catch { /* DB also down — fall through to 503 */ }
        }
        res.status(503).json({ error: "Servicio temporalmente no disponible. Intentá de nuevo en unos segundos." });
        return;
      }
    }
  }

  const userId      = req.authUser.id;
  const clientToken = req.headers["x-session-token"] as string | undefined;

  // ── Admin bypass: admins may use multiple devices simultaneously ──────────
  // Pass username hint for offline check (no Supabase needed for ADMIN_USERNAMES).
  if (!isGameToken) {
    try {
      const usernameHint = req.authUser.user_metadata?.username as string | undefined;
      const admin = await isAdminUser(userId, usernameHint);
      if (admin) {
        next();
        return;
      }
    } catch { /* if check fails, fall through to normal session validation */ }
  }

  // ── Step 2: Deterministic session check ───────────────────────────────────
  //
  // getActiveSessionToken() returns:
  //   string  → the current active token (from memory or DB)
  //   null    → no active session exists anywhere in the system
  //
  // This single call is the only source of truth for session validation.
  const activeToken = await getActiveSessionToken(userId);

  if (activeToken !== null) {
    // An active session EXISTS.  The outcome is binary and immediate.
    if (clientToken === activeToken) {
      next(); // ✓ exact match
      return;
    }
    // Token mismatch — another device has taken this session slot.
    console.warn(
      `[requireAuth] SESSION_INVALID userId=${userId} url=${req.url}` +
      ` clientToken=${clientToken ? clientToken.slice(0,8)+"…" : "(none)"}` +
      ` activeToken=${activeToken.slice(0,8)}…`
    );
    res.status(401).json({ error: "SESSION_INVALID" });
    return;
  }

  // ── No active session in the system ──────────────────────────────────────
  //
  // Occurs after: server restart (activeSessions cleared, DB column absent),
  // or genuinely first-time session for this user.
  //
  // Game-token users cannot self-heal — they have no independent identity
  // verification via Supabase, so we cannot safely mint a new session.
  // Require an explicit re-login.
  if (isGameToken) {
    res.status(401).json({ error: "SESSION_INVALID" });
    return;
  }

  // Supabase users: their JWT is already verified (Step 1), so we can safely
  // issue a brand-new session.  getOrHealSession() is mutex-protected: N
  // concurrent requests all receive the SAME new token, preventing a storm
  // of simultaneous createSession() calls on post-restart cold-start.
  try {
    const newToken = await getOrHealSession(userId);
    res.setHeader("X-New-Session-Token", newToken);
    console.log(`[requireAuth] self-healed session for userId=${userId} (no prior active session)`);
  } catch (e: any) {
    console.error("[requireAuth] self-heal failed:", e.message);
    res.status(401).json({ error: "SESSION_INVALID" });
    return;
  }

  next();
}
