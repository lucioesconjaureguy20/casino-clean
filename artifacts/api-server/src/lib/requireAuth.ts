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
    // Supabase JWT — verify with Supabase auth service.
    try {
      const r = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          "Content-Type": "application/json",
          apikey:          SUPABASE_ANON_KEY,
          Authorization:   `Bearer ${bearerToken}`,
        },
      }, 6_000);
      const data = await r.json();
      if (!r.ok || !data?.id) {
        res.status(401).json({ error: "Sesión expirada o inválida." });
        return;
      }
      req.authUser = { id: data.id, email: data.email, user_metadata: data.user_metadata };
    } catch (e: any) {
      console.error("[requireAuth] Supabase verify error:", e.message);
      // Supabase Auth unreachable — decode JWT locally and validate session token
      // against DB (not just memory) so sessions survive server restarts.
      const clientTokenFallback = req.headers["x-session-token"] as string | undefined;
      const jwtPayload = decodeJwtPayload(bearerToken);
      if (jwtPayload?.sub && clientTokenFallback) {
        try {
          // getActiveSessionToken checks memory first, then DB — survives restarts
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

  const userId      = req.authUser.id;
  const clientToken = req.headers["x-session-token"] as string | undefined;

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
