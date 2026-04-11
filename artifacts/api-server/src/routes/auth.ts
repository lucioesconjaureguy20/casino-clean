import { Router } from "express";
import { signGameToken } from "../lib/gameToken";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbAdmin(path: string, options: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
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

function sbFetch(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase not configured");
  return fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...(options.headers as Record<string, string> || {}),
    },
  });
}

router.post("/auth/signup", async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username)
    return res.status(400).json({ error: "Faltan campos requeridos." });

  try {
    const r = await sbFetch("/signup", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        data: { username },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.msg || data?.error_description || data?.message || "Error al registrar.";
      return res.status(r.status).json({ error: msg });
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

  try {
    const r = await sbFetch("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
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

router.post("/auth/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json({ message: "OK" });
  try {
    await sbFetch("/logout", {
      method: "POST",
      headers: { Authorization: authHeader },
    });
    return res.json({ message: "Sesión cerrada." });
  } catch {
    return res.json({ message: "OK" });
  }
});

router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Ingresa un correo." });

  try {
    const r = await sbFetch("/recover", {
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

// ── Emitir game-token para usuarios locales (sin Supabase Auth) ───────────────
// El frontend llama a este endpoint luego de verificar la contraseña localmente.
// No re-verifica la contraseña en el backend (no hay hash almacenado aún),
// pero el token resultante solo sirve para sincronizar el balance del propio
// usuario y está firmado con la clave secreta del servidor.
router.post("/auth/local-token", async (req, res) => {
  const { username } = req.body ?? {};
  if (!username) return res.status(400).json({ error: "username requerido." });

  try {
    const r = await sbAdmin(
      `profiles?username=eq.${encodeURIComponent(username)}&select=id,username&limit=1`
    );
    if (!r.ok) return res.status(500).json({ error: "Error al verificar usuario." });
    const rows: any[] = await r.json();
    const profile = rows?.[0];
    if (!profile) return res.status(404).json({ error: "Usuario no encontrado." });

    const token = signGameToken(profile.id, profile.username);
    console.log(`[local-token] emitido para username="${username}" profileId="${profile.id}"`);
    return res.json({ token, expires_in: 30 * 24 * 3600 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
