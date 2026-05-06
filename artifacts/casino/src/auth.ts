import { createClient } from "@supabase/supabase-js";

// ─── Supabase client (browser) ───────────────────────────────────────────────
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are injected at build time
// via the `define` block in vite.config.ts.  They map to the server-side
// SUPABASE_URL / SUPABASE_ANON_KEY environment variables so you never need
// a separate .env file.
const SUPABASE_URL      = (import.meta.env.VITE_SUPABASE_URL      as string) || "";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// ─── Session type ─────────────────────────────────────────────────────────────
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email: string;
    user_metadata?: { username?: string };
    email_confirmed_at?: string | null;
  };
}

// ─── Local session cache (localStorage) ──────────────────────────────────────
const SESSION_KEY       = "mander_session";
const SESSION_TOKEN_KEY = "mander_session_token";

export function saveSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function isSessionValid(session: AuthSession): boolean {
  return Date.now() < session.expires_at - 30_000;
}

// ─── Single-session token (one active session per user across all devices) ────
const SESSION_TOKEN_SAVED_AT_KEY = "mander_session_token_saved_at";

export function saveSessionToken(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_TOKEN_SAVED_AT_KEY, String(Date.now()));
}

/** Returns true if the session token was saved within the last `ms` milliseconds. */
export function sessionTokenSavedRecently(ms = 10_000): boolean {
  const saved = Number(localStorage.getItem(SESSION_TOKEN_SAVED_AT_KEY) ?? 0);
  return saved > 0 && Date.now() - saved < ms;
}

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function clearSessionToken() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_TOKEN_SAVED_AT_KEY);
}

// ─── Helper to map a Supabase SDK session to our AuthSession shape ────────────
function mapSupabaseSession(s: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>): AuthSession {
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: (s.expires_at ?? 0) * 1000,
    user: {
      id:                   s.user.id,
      email:                s.user.email ?? "",
      user_metadata:        s.user.user_metadata as { username?: string } | undefined,
      email_confirmed_at:   s.user.email_confirmed_at,
    },
  };
}

// ─── HTTP helpers (backend API calls) ────────────────────────────────────────
async function post(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  let data: any = {};
  try { data = await res.json(); } catch { /* empty or non-JSON response */ }
  return { ok: res.ok, status: res.status, data };
}

// ─── Auth functions ───────────────────────────────────────────────────────────

/**
 * Return values:
 *   string         — email found
 *   null           — user definitively not found in Supabase
 *   throws Error("CONNECTION_TIMEOUT") — could not reach the DB (show "connection error")
 */
export async function lookupEmailByUsername(username: string): Promise<string | null> {
  let sdkTimedOut = false;
  let serverTimedOut = false;

  // Primary: browser SDK with timeout (avoids server-side timeout issues)
  try {
    const sdkResult = await Promise.race([
      supabase
        .from("profiles")
        .select("email")
        .ilike("username", username)
        .limit(1)
        .maybeSingle(),
      new Promise<null>((resolve) =>
        setTimeout(() => { sdkTimedOut = true; resolve(null); }, 6_000)
      ),
    ]);
    if (sdkResult === null) {
      // Timed out — fall through to server
    } else if (!sdkResult.error && sdkResult.data?.email) {
      return sdkResult.data.email as string;
    }
    // If data===null or error (RLS may hide rows) — fall through to server to confirm
  } catch {
    // SDK threw — fall through to server
  }

  // Fallback: server API (with short timeout)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => { serverTimedOut = true; ctrl.abort(); }, 5_000);
    try {
      const res = await fetch("/api/auth/lookup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
        signal: ctrl.signal,
      });
      if (res.status === 404) return null; // Definitively not found
      if (res.ok) {
        const d = await res.json();
        return d.email ? (d.email as string) : null;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Server also failed
  }

  // Both paths failed — signal a connection problem
  if (sdkTimedOut || serverTimedOut) {
    throw new Error("CONNECTION_TIMEOUT");
  }
  return null;
}

export async function authSignUp(email: string, password: string, username: string) {
  const { ok, data } = await post("/api/auth/signup", { email, password, username });
  if (!ok) return { error: data.error || "Error al registrar." };
  return { message: data.message };
}

export async function authLogin(email: string, password: string): Promise<{ session?: AuthSession; error?: string }> {
  // Clear any stale session token BEFORE signing in.
  // If the old token is left in localStorage and the fetch interceptor sends it
  // during the login flow (e.g., an API call triggered by the SIGNED_IN event),
  // the server may return SESSION_INVALID (token mismatch) and auto-log the user out
  // before create-session has a chance to save the new token.
  // Clearing it first makes the interceptor return 503 (SESSION_NOT_READY) instead,
  // which is a safe no-op that never triggers a logout.
  clearSessionToken();

  // ── Primary: Supabase SDK directly from browser (fastest, no server hop) ──
  try {
    const { data: sdkData, error: sdkError } = await supabase.auth.signInWithPassword({ email, password });
    if (sdkError) {
      const rawMsg = (sdkError.message || "").toLowerCase();
      let msg = "Credenciales incorrectas. Verificá tu usuario y contraseña.";
      if (rawMsg.includes("email not confirmed") || rawMsg.includes("not confirmed")) {
        msg = "EMAIL_NOT_CONFIRMED";
      } else if (rawMsg.includes("too many requests") || rawMsg.includes("rate limit")) {
        msg = "Demasiados intentos. Por favor esperá unos minutos e intentá nuevamente.";
      } else if (rawMsg.includes("invalid") || rawMsg.includes("credentials")) {
        msg = "Credenciales incorrectas. Verificá tu usuario y contraseña.";
      }
      return { error: msg };
    }
    if (sdkData.session) {
      const session = mapSupabaseSession(sdkData.session);
      saveSession(session);
      // Create server-side session token synchronously — must complete before returning
      // so that mander_session_token is in localStorage when authLogin resolves.
      // The fetch interceptor in App.tsx blocks /api/balance (and other protected endpoints)
      // when no session token is present, causing balance to stay at 0 on login.
      try {
        const r = await fetch("/api/auth/create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        });
        const d = r.ok ? await r.json() : null;
        if (d?.session_token) saveSessionToken(d.session_token);
      } catch { /* fail open — login still succeeds without server session token */ }
      return { session };
    }
  } catch {
    // SDK failed — fall through to backend
  }

  // ── Fallback: backend /api/auth/login ─────────────────────────────────────
  const { ok, data } = await post("/api/auth/login", { email, password });
  if (!ok) return { error: (data as any).error || "Credenciales incorrectas." };

  const session: AuthSession = {
    access_token: (data as any).access_token,
    refresh_token: (data as any).refresh_token,
    expires_at: Date.now() + (data as any).expires_in * 1000,
    user: (data as any).user,
  };
  saveSession(session);
  supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }).catch(() => {});
  if ((data as any).session_token) saveSessionToken((data as any).session_token);
  return { session };
}

export async function authLogout(token: string, sessionToken?: string) {
  clearSession();
  clearSessionToken();
  // Bug C fix: call server BEFORE supabase signOut — the server uses the JWT
  // to identify the user; invalidating it first can prevent session cleanup.
  // Bug A fix: pass sessionToken explicitly in the header because localStorage
  // is already cleared by the time this runs (fetch interceptor won't add it).
  const logoutHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (sessionToken) logoutHeaders["x-session-token"] = sessionToken;
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: logoutHeaders,
    body: JSON.stringify({}),
  }).catch(() => {});
  await supabase.auth.signOut().catch(() => {});
}

export async function authForgotPassword(email: string) {
  const { ok, data } = await post("/api/auth/forgot-password", { email });
  if (!ok) return { error: data.error || "Error al enviar correo." };
  return { message: data.message };
}

export async function authRefreshSession(refresh_token: string): Promise<AuthSession | null> {
  const { ok, data } = await post("/api/auth/refresh", { refresh_token });
  if (!ok) return null;
  const session: AuthSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    user: data.user,
  };
  saveSession(session);
  // Keep the Supabase SDK in sync so autoRefreshToken takes over going forward
  supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }).catch(() => {});
  return session;
}

// ─── getOrRefreshSession ──────────────────────────────────────────────────────
// Primary: Supabase client session. If expired, refreshes via SDK.
// Fallback: stored session with manual refresh.
// Returns null if token is expired and cannot be refreshed → caller shows login error.
export async function getOrRefreshSession(): Promise<AuthSession | null> {
  // 1. Ask the Supabase SDK for its cached session
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const session = mapSupabaseSession(data.session);
      // 1a. Token still valid — return directly
      if (isSessionValid(session)) {
        saveSession(session);
        return session;
      }
      // 1b. Token expired — try to refresh via Supabase SDK
      const { data: rd, error: re } = await supabase.auth.refreshSession();
      if (!re && rd.session) {
        const refreshed = mapSupabaseSession(rd.session);
        saveSession(refreshed);
        return refreshed;
      }
      // Refresh failed via SDK — fall through to mander_session (do NOT clear it)
      await supabase.auth.signOut().catch(() => {});
    }
  } catch {
    // Supabase SDK error (e.g., wrong config) — fall through to stored session
  }

  // 2. No Supabase session — fall back to manually stored session
  const stored = loadSession();
  if (!stored) return null;
  if (isSessionValid(stored)) return stored;
  return await authRefreshSession(stored.refresh_token);
}
