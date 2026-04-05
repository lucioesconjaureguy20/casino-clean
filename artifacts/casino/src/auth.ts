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
const SESSION_KEY = "mander_session";

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
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ─── Auth functions ───────────────────────────────────────────────────────────

export async function authSignUp(email: string, password: string, username: string) {
  const { ok, data } = await post("/api/auth/signup", { email, password, username });
  if (!ok) return { error: data.error || "Error al registrar." };
  return { message: data.message };
}

export async function authLogin(email: string, password: string): Promise<{ session?: AuthSession; error?: string }> {
  const { ok, data } = await post("/api/auth/login", { email, password });
  if (!ok) return { error: data.error || "Credenciales incorrectas." };

  const session: AuthSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    user: data.user,
  };
  saveSession(session);
  return { session };
}

export async function authLogout(token: string) {
  clearSession();
  await supabase.auth.signOut().catch(() => {});
  await post("/api/auth/logout", {}, token).catch(() => {});
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
  return session;
}

// ─── getOrRefreshSession ──────────────────────────────────────────────────────
// Primary: Supabase client session. If expired, refreshes via SDK.
// Fallback: stored session with manual refresh.
// Returns null if token is expired and cannot be refreshed → caller shows login error.
export async function getOrRefreshSession(): Promise<AuthSession | null> {
  // 1. Ask the Supabase SDK for its cached session
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
    // Refresh failed — clear stale session so caller shows login error
    clearSession();
    await supabase.auth.signOut().catch(() => {});
    return null;
  }

  // 2. No Supabase session — fall back to manually stored session
  const stored = loadSession();
  if (!stored) return null;
  if (isSessionValid(stored)) return stored;
  return await authRefreshSession(stored.refresh_token);
}
