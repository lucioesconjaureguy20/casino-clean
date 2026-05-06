import { Router } from "express";
import { signGameToken } from "../lib/gameToken";
import { createSession, getOrCreateSession, clearSession, getActiveSessionToken } from "../lib/sessionStore";
import { requireAuth } from "../lib/requireAuth";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";
import { hashPassword, verifyPassword } from "../lib/localAuth";
import { recordIp } from "../lib/ipStore.js";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbAdmin(path: string, options: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "return=representation",
      ...(options.headers as Record<string, string> || {}),
    },
  });
}

function sbFetch(path: string, options: RequestInit = {}, timeoutMs?: number) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase not configured");
  return fetchWithTimeout(`${SUPABASE_URL}/auth/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...(options.headers as Record<string, string> || {}),
    },
  }, timeoutMs);
}

/** Fetch local profile by email from DB (doesn't need Supabase Auth) */
async function getLocalProfile(email: string): Promise<{ id: string; email: string; local_hash?: string; username?: string } | null> {
  const norm = email.toLowerCase().trim();
  try {
    // Try with local_hash column first
    const r = await sbAdmin(
      `profiles?email=eq.${encodeURIComponent(norm)}&select=id,email,local_hash,username&limit=1`,
      { headers: { Prefer: "return=representation" } },
    );
    if (r.ok) {
      const rows: any[] = await r.json();
      return rows?.[0] ?? null;
    }
    // local_hash column may not exist yet — fallback without it
    if (r.status === 400) {
      const r2 = await sbAdmin(
        `profiles?email=eq.${encodeURIComponent(norm)}&select=id,email,username&limit=1`,
        { headers: { Prefer: "return=representation" } },
      );
      if (!r2.ok) return null;
      const rows2: any[] = await r2.json();
      return rows2?.[0] ? { ...rows2[0], local_hash: undefined } : null;
    }
    return null;
  } catch { return null; }
}

/**
 * Build a minimal JWT-shaped token (unsigned) that contains the userId in `sub`.
 * requireAuth can decode this locally when Supabase is unreachable.
 */
function makeLocalJwt(userId: string, email: string): string {
  const header  = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub:   userId,
    email: email,
    local: true,
    exp:   Math.floor(Date.now() / 1000) + 86400,
  })).toString("base64url");
  return `${header}.${payload}.local`;
}

/** Save hash to profiles asynchronously (fire-and-forget) */
function saveLocalHash(userId: string, password: string) {
  hashPassword(password).then(hash =>
    sbAdmin(`profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ local_hash: hash }),
    }).catch(() => {}),
  ).catch(() => {});
}

const RESERVED_USERNAMES = new Set([
  "matiaslots","luchitox","fedeplay","tincho77","nicobets","franito","tomiwin",
  "facuplay","agusito","dieguito","pablitoo","ramiroo","joaquin77","leanbets",
  "gonzaa","maxiwins","tobiasx","brunito","kevo23","rodriwin","marquitos","enzoo",
  "ivansito","gabywin","cristianr","dylancito","juancito","santii","julianr",
  "hernancito","oscarsito","carlitoss","andresito","miguelito","javierin","victorx",
  "danielr","richar","ferchu","sergito","walterin","gustiwin","eduardito","luisito",
  "raulito","maty77","lucasss","fran22","nico77","tomi23","facu99","agus10",
  "gonza21","lean98","maxi07","tobi22","bruno23","kevin17","rodri10","marcos21",
  "enzo91","ivan22","gabi10","cristian23","dylan07","joaco99","lauta10","rami22",
  "dami23","alex77","adri21","tobi98","juli10","lucho77","slotero","ruletin",
  "cartitas","casinero","girito","suertudo","tirador","apuestin","spinero","ruletazo",
  "tragamon","winito","suertin","jugadita","platinero","doblete","luckito","winwin",
  "betitoo","slotin","fichitas","tiradita","platinito","suertetaa","xluchox","matiux",
  "nicozz","frannn","tomiux","facux","aguszz","leanz","gonzita","maxii","tobita",
  "brunox","kevito","rodrix","marqui","enzito","ivancito","gabito","dylanz","joaquinn",
  "lautii","ramirox","damianx","alexito","adrianoo","julito","luchitoo","randomnico",
  "elgonzita","matute","tinchoide","facundito","agustinok","leanmart","gonzalito",
  "maximil","tobiasr","brunelli","kevind","rodrigox","marcosss","enzooo","ivand",
  "gabrielx","dylannn","joaquind","lautaron","ramirito","damianok","alexanderx",
  "adrianok","julianok","luchok","soporte","support","manderbet","mander",
  "moderador","mod","staff","sistema","system","bot","help","ayuda",
].map(u => u.toLowerCase()));

router.post("/auth/signup", async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username)
    return res.status(400).json({ error: "Faltan campos requeridos." });

  if (RESERVED_USERNAMES.has(username.toLowerCase()))
    return res.status(400).json({ error: "Ese nombre de usuario no está disponible." });

  try {
    // Verificar si el email ya está registrado usando Admin API
    const emailLower = email.toLowerCase().trim();
    const checkR = await fetchWithTimeout(
      `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(emailLower)}&page=1&per_page=5`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY!,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      },
      6_000,
    );
    if (checkR.ok) {
      const checkData = await checkR.json();
      const users: any[] = checkData?.users ?? [];
      const emailExists = users.some(
        (u: any) => (u.email ?? "").toLowerCase() === emailLower
      );
      if (emailExists) {
        return res.status(400).json({ error: "Ya existe una cuenta con ese correo electrónico." });
      }
    }

    // Verificar si el username ya está en uso
    const profileCheck = await sbAdmin(
      `profiles?username=ilike.${encodeURIComponent(username)}&select=id&limit=1`
    );
    if (profileCheck.ok) {
      const profileRows: any[] = await profileCheck.json();
      if (profileRows?.length > 0) {
        return res.status(400).json({ error: "Ese nombre de usuario ya está en uso." });
      }
    }

    const appUrl = process.env.APP_URL ?? "https://manderbet.com";
    const r = await sbFetch(`/signup?redirect_to=${encodeURIComponent(appUrl)}`, {
      method: "POST",
      body: JSON.stringify({
        email: emailLower,
        password,
        data: { username },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.msg || data?.error_description || data?.message || "Error al registrar.";
      return res.status(r.status).json({ error: msg });
    }
    // Patch email into profile after trigger creates the row (fire-and-forget with delay)
    if (data.user?.id) {
      const uid = data.user.id;
      const userEmail = emailLower;
      setTimeout(() => {
        sbAdmin(`profiles?id=eq.${encodeURIComponent(uid)}`, {
          method: "PATCH",
          body: JSON.stringify({ email: userEmail }),
        }).catch(() => {});
      }, 2000);
    }
    return res.json({ message: "Registro exitoso. Revisa tu correo para verificar tu cuenta.", user: data.user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Faltan campos requeridos." });
  const clientIp = (req.headers["x-forwarded-for"] as string) || (req as any).ip || "";

  let supabaseNetworkError = false;

  // ── Primary: Supabase Auth (8s timeout — fail fast) ──────────────────────
  try {
    const r = await sbFetch("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, 8_000);
    const data = await r.json();
    if (!r.ok) {
      const rawMsg = (data?.error_description || data?.msg || data?.message || "").toLowerCase();
      let msg = "Credenciales incorrectas. Verificá tu usuario y contraseña.";
      if (rawMsg.includes("email not confirmed") || rawMsg.includes("not confirmed")) {
        msg = "EMAIL_NOT_CONFIRMED";
      } else if (rawMsg.includes("invalid login") || rawMsg.includes("invalid credentials")) {
        msg = "Credenciales incorrectas. Verificá tu usuario y contraseña.";
      } else if (rawMsg.includes("too many requests") || rawMsg.includes("rate limit")) {
        msg = "Demasiados intentos. Por favor esperá unos minutos e intentá nuevamente.";
      }
      return res.status(r.status).json({ error: msg });
    }
    // ── Supabase Auth OK ──────────────────────────────────────────────────
    const sessionToken = await createSession(data.user.id);
    console.log(`[login] new session created userId=${data.user.id} email=${data.user.email} token=${sessionToken.slice(0,8)}…`);
    if (data.user?.id && data.user?.email) {
      sbAdmin(`profiles?id=eq.${encodeURIComponent(data.user.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ email: data.user.email }),
      }).catch(() => {});
      // Save local hash for future offline fallback
      saveLocalHash(data.user.id, password);
      // Record IP for duplicate-account detection
      const uname = data.user.user_metadata?.username || data.user.email || "";
      recordIp(data.user.id, uname, clientIp);
    }
    return res.json({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_in:    data.expires_in,
      user:          data.user,
      session_token: sessionToken,
    });
  } catch (err: any) {
    // AbortError = network timeout (Supabase unreachable), not bad credentials
    if (err?.name === "AbortError" || err?.message?.includes("aborted") || err?.message?.includes("abort")) {
      supabaseNetworkError = true;
      console.warn("[login] Supabase Auth timeout — trying local fallback");
    } else {
      return res.status(500).json({ error: "Error al iniciar sesión. Intentá de nuevo." });
    }
  }

  // ── Fallback: local DB auth (when Supabase Auth is unreachable) ───────────
  if (supabaseNetworkError) {
    try {
      const profile = await getLocalProfile(email);
      if (!profile?.local_hash) {
        console.warn("[login] local fallback: no hash stored for", email);
        return res.status(503).json({ error: "Servicio de autenticación no disponible. Intentá de nuevo en unos segundos." });
      }
      const match = await verifyPassword(password, profile.local_hash);
      if (!match) {
        return res.status(401).json({ error: "Credenciales incorrectas. Verificá tu usuario y contraseña." });
      }
      // Issue a local session — emit a fake JWT that requireAuth can decode offline
      const sessionToken  = await createSession(profile.id);
      const localEmail    = profile.email || email;
      const localJwt      = makeLocalJwt(profile.id, localEmail);
      console.log(`[login] LOCAL FALLBACK session userId=${profile.id} email=${localEmail} token=${sessionToken.slice(0,8)}…`);
      recordIp(profile.id, profile.username || localEmail.split("@")[0], clientIp);
      return res.json({
        access_token:  localJwt,
        refresh_token: "",
        expires_in:    86400,
        user: {
          id:             profile.id,
          email:          localEmail,
          user_metadata:  { username: profile.username || localEmail.split("@")[0] },
        },
        session_token: sessionToken,
        local_mode:    true,
      });
    } catch (fbErr: any) {
      console.error("[login] local fallback failed:", fbErr.message);
      return res.status(503).json({ error: "Servicio temporalmente no disponible. Intentá de nuevo en unos segundos." });
    }
  }
});

router.post("/auth/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  // Clear the server-side session ONLY if the client's session_token is still
  // the active one.  If another device has already taken the session (e.g. a
  // new login replaced this token), we must NOT wipe the new device's session.
  const clientSessionToken = req.headers["x-session-token"] as string | undefined;
  if (authHeader) {
    try {
      // Identify user to clear their session in the store
      const r = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey:        SUPABASE_ANON_KEY!,
          Authorization: authHeader,
        },
      });
      if (r.ok) {
        const u = await r.json();
        if (u?.id) {
          // Only clear if this client still owns the active session token.
          // If the tokens don't match, another device already took ownership —
          // clearing would incorrectly invalidate that device's session.
          const activeToken = await getActiveSessionToken(u.id);
          if (clientSessionToken && activeToken && clientSessionToken === activeToken) {
            await clearSession(u.id);
          } else if (!clientSessionToken && !activeToken) {
            // No session token on either side — safe to clear (no-op).
            await clearSession(u.id);
          }
          // else: token mismatch → another device owns the session → skip clearSession
        }
      }
    } catch { /* ignore */ }
    try {
      await sbFetch("/logout", {
        method: "POST",
        headers: { Authorization: authHeader },
      });
    } catch { /* ignore */ }
  }
  return res.json({ message: "Sesión cerrada." });
});

router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Ingresa un correo." });

  try {
    const appUrl = process.env.APP_URL ?? "https://manderbet.com";
    const r = await sbFetch(`/recover?redirect_to=${encodeURIComponent(appUrl)}`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (!r.ok) {
      const data = await r.json();
      return res.status(r.status).json({ error: data?.msg || "Error al enviar correo." });
    }
    return res.json({ message: "Si el correo está registrado, recibirás un enlace de recuperación." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/auth/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: "Token requerido." });

  try {
    const r = await sbFetch("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error_description || "Sesión expirada." });
    }
    return res.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      user: data.user,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/auth/update-password", async (req, res) => {
  const { access_token, password } = req.body;
  if (!access_token || !password)
    return res.status(400).json({ error: "Token y contraseña son requeridos." });

  try {
    const r = await sbFetch("/user", {
      method: "PUT",
      headers: { Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({ password }),
    });
    const data = await r.json();
    if (!r.ok) {
      const rawMsg = (data?.msg || data?.message || data?.error_description || "").toLowerCase();
      let msg = "Error al actualizar la contraseña.";
      if (rawMsg.includes("same password") || rawMsg.includes("should be different")) {
        msg = "La nueva contraseña debe ser diferente a la actual.";
      } else if (rawMsg.includes("weak") || rawMsg.includes("too short")) {
        msg = "La contraseña es demasiado débil. Usá al menos 8 caracteres.";
      }
      return res.status(r.status).json({ error: msg });
    }
    return res.json({ message: "Contraseña actualizada correctamente." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/auth/user", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No autenticado." });

  try {
    const r = await sbFetch("/user", {
      headers: { Authorization: authHeader },
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: "Sesión inválida." });
    return res.json({ user: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/auth/lookup-email", async (req, res) => {
  const { username } = req.body ?? {};
  if (!username) return res.status(400).json({ error: "username requerido." });

  try {
    // Primary: get email directly from profiles table (fast, no auth API call)
    const r = await sbAdmin(
      `profiles?username=ilike.${encodeURIComponent(username)}&select=id,email&limit=1`
    );
    if (!r.ok) return res.status(500).json({ error: "Error al buscar usuario." });
    const rows: any[] = await r.json();
    if (!rows?.length) return res.status(404).json({ error: "Usuario no encontrado." });

    const profile = rows[0];

    // If email is already in the profiles table, return it immediately
    if (profile.email) {
      return res.json({ email: profile.email });
    }

    // Fallback: try admin auth API to get email (may be slow if auth service is down)
    try {
      const adminR = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users/${profile.id}`, {
        headers: {
          apikey: SUPABASE_SERVICE_KEY!,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }, 4_000);
      if (adminR.ok) {
        const userData = await adminR.json();
        if (userData.email) {
          // Backfill email into profiles for future fast lookups
          sbAdmin(`profiles?id=eq.${encodeURIComponent(profile.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ email: userData.email }),
          }).catch(() => {});
          return res.json({ email: userData.email });
        }
      }
    } catch {
      // Auth API unreachable — fall through to not-found
    }

    return res.status(404).json({ error: "Email no encontrado. Intentá iniciar sesión con tu correo electrónico directamente." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Crear sesión para usuarios ya autenticados con Supabase ───────────────────
// Llamado por el frontend en: auto-login post email-confirm, restaurar sesión,
// y refresh de token. Valida el JWT y genera un nuevo session_token.
router.post("/auth/create-session", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token requerido." });
  }
  const token = authHeader.slice(7);
  try {
    const r = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey:        SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await r.json();
    if (!r.ok || !data?.id) {
      return res.status(401).json({ error: "Token inválido." });
    }
    const userId = data.user_id ?? data.id;
    const sessionToken = await getOrCreateSession(userId);
    console.log(`[create-session] sesión para userId=${userId}`);
    // Sync email to profiles (fire-and-forget)
    if (data.email) {
      sbAdmin(`profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({ email: data.email }),
      }).catch(() => {});
    }
    return res.json({ session_token: sessionToken });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Emitir game-token para usuarios locales (sin Supabase Auth) ───────────────
// El frontend llama a este endpoint luego de verificar la contraseña localmente.
// No re-verifica la contraseña en el backend (no hay hash almacenado aún),
// pero el token resultante solo sirve para sincronizar el balance del propio
// usuario y está firmado con la clave secreta del servidor.
router.post("/auth/local-token", async (req, res) => {
  const { username, forceNew } = req.body ?? {};
  if (!username) return res.status(400).json({ error: "username requerido." });

  try {
    const r = await sbAdmin(
      `profiles?username=ilike.${encodeURIComponent(username)}&select=id,username&limit=1`
    );
    if (!r.ok) return res.status(500).json({ error: "Error al verificar usuario." });
    const rows: any[] = await r.json();
    const profile = rows?.[0];
    if (!profile) return res.status(404).json({ error: "Usuario no encontrado." });

    const token = signGameToken(profile.id, profile.username);
    // forceNew=true (explicit login): always create a new session to invalidate other devices.
    // forceNew=false (page refresh / background refresh): reuse existing session to avoid
    // invalidating in-flight requests with the old token.
    const sessionToken = forceNew
      ? await createSession(profile.id)
      : await getOrCreateSession(profile.id);
    console.log(`[local-token] emitido para username="${username}" profileId="${profile.id}"`);
    return res.json({ token, expires_in: 30 * 24 * 3600, session_token: sessionToken });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Session heartbeat ────────────────────────────────────────────────────────
// GET /api/auth/session-check
// Lightweight endpoint called every 30 s by the frontend heartbeat.
// requireAuth already validates both the JWT *and* the x-session-token header.
// If the session token is stale (another device has logged in), requireAuth
// returns 401 SESSION_INVALID → the fetch interceptor fires `session_invalid`.
router.get("/session-check", requireAuth, (_req, res) => {
  return res.json({ ok: true });
});

export default router;
