import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { verifyGameToken } from "../lib/gameToken";
import { getPriceUsd, toUsd } from "../lib/prices";

const router = Router();

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY      = process.env.SUPABASE_SERVICE_KEY;

// Valores iniciales de display_id por tipo
// El primer ID real emitido = start + 1
const TX_DISPLAY_START: Record<string, number> = { deposit: 4642, withdrawal: 2099 };

// ── Supabase admin helpers ────────────────────────────────────────────────────
function adminHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

async function sbAdmin(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Supabase admin not configured");
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: adminHeaders(options.headers as Record<string, string> || {}),
  });
  return res;
}

// ── Auth middleware ───────────────────────────────────────────────────────────
interface AuthUser { id: string; email: string; user_metadata: Record<string, any> }
declare global { namespace Express { interface Request { authUser?: AuthUser } } }

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sesión no válida." });
  }
  const token = authHeader.slice(7);

  // 1. Intentar verificar como game-token (no requiere Supabase Auth)
  const gameUser = verifyGameToken(token);
  if (gameUser) {
    req.authUser = { id: gameUser.profileId, email: "", user_metadata: { username: gameUser.username } };
    return next();
  }

  // 2. Fallback: verificar con Supabase Auth (usuarios con email)
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await r.json();
    if (!r.ok || !data?.id) {
      return res.status(401).json({ error: "Sesión expirada o inválida." });
    }
    req.authUser = { id: data.id, email: data.email, user_metadata: data.user_metadata };
    next();
  } catch (e: any) {
    console.error("[TX auth] error:", e.message);
    return res.status(500).json({ error: "Error al verificar la sesión." });
  }
}

// ── Helper: obtener perfil del usuario ───────────────────────────────────────
async function getProfile(userId: string): Promise<{ mander_id: string; username: string; balance?: number; is_blocked?: boolean } | null> {
  const r = await sbAdmin(`profiles?id=eq.${userId}&select=mander_id,username,balance,is_blocked&limit=1`);
  const rows = await r.json();
  return rows?.[0] ?? null;
}

// ── Helper: calcular siguiente display_id ────────────────────────────────────
async function nextDisplayId(type: string): Promise<number | null> {
  const start = TX_DISPLAY_START[type];
  if (start === undefined) return null;

  const r = await sbAdmin(`transactions?type=eq.${type}&display_id=not.is.null&select=display_id`, {
    headers: { Prefer: "count=none" },
  });
  if (!r.ok) {
    console.error("[TX displayId] error al leer IDs existentes:", await r.text());
    return start + 1;
  }
  const rows: { display_id: string }[] = await r.json();
  const ids = rows
    .map(row => parseInt(row.display_id, 10))
    .filter(n => !isNaN(n) && n > start && n < 1_000_000);

  return ids.length > 0 ? Math.max(...ids) + 1 : start + 1;
}

// ── Helper: actualizar profiles.balance con el total USD ─────────────────────
// Los balances se almacenan como cantidades nativas — se multiplican por precio para obtener USD
async function syncProfileBalance(manderId: string): Promise<void> {
  const allRes = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&select=currency,balance`,
    { headers: { Prefer: "count=none" } },
  );
  if (!allRes.ok) return;
  const allRows: { currency: string; balance: number }[] = await allRes.json();
  const totalUsd = allRows.reduce((sum, r) => sum + toUsd(r.balance, r.currency), 0);
  await sbAdmin(`profiles?mander_id=eq.${encodeURIComponent(manderId)}`, {
    method: "PATCH",
    body: JSON.stringify({ balance: totalUsd }),
  });
}

// ── Helper: actualizar tabla balances ─────────────────────────────────────────
// deltaUsd > 0 = acreditar, < 0 = debitar (siempre en USD)
// Los balances se guardan como cantidades NATIVAS (deltaUsd / priceUsd)
// Solo se llama cuando una transacción pasa a "completed".
// nativeOverride: si se pasa, usar ese monto nativo exacto (evita imprecisión por precio fallback)
async function updateBalance(
  manderId: string,
  currency: string,
  deltaUsd: number,
  txType: string,
  nativeOverride: number | null = null,
): Promise<void> {
  const now = new Date().toISOString();
  const cur = currency.trim().toUpperCase();

  // Usar monto nativo exacto si viene de coinAmount — más preciso que USD/precio
  const priceUsd = getPriceUsd(cur);
  const deltaNative = (nativeOverride !== null) ? nativeOverride : (deltaUsd / priceUsd);

  // Buscar balance existente para (mander_id, currency)
  const getRes = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );

  if (!getRes.ok) {
    console.error("[BALANCE] error al leer balance actual:", await getRes.text());
    return;
  }

  const rows = await getRes.json();
  const existing = rows?.[0];

  if (existing) {
    const newBalance = Math.max(0, Number(existing.balance || 0) + deltaNative);
    const patchRes = await sbAdmin(
      `balances?id=eq.${existing.id}`,
      { method: "PATCH", body: JSON.stringify({ balance: newBalance, updated_at: now }) },
    );
    if (!patchRes.ok) {
      console.error("[BALANCE] error al actualizar balance:", await patchRes.text());
    } else {
      console.log(`[BALANCE] ${txType} +${deltaUsd} USD = +${deltaNative} ${cur} → mander_id=${manderId} native=${newBalance}`);
    }
  } else {
    const initialBalance = Math.max(0, deltaNative);
    const insRes = await sbAdmin("balances", {
      method: "POST",
      body: JSON.stringify({ mander_id: manderId, currency: cur, balance: initialBalance, updated_at: now }),
    });
    if (!insRes.ok) {
      console.error("[BALANCE] error al crear balance:", await insRes.text());
    } else {
      console.log(`[BALANCE] ${txType} nuevo: ${initialBalance} ${cur} (${deltaUsd} USD) → mander_id=${manderId}`);
    }
  }

  // Actualizar profiles.balance de forma aditiva con deltaUsd (calculado por el frontend con
  // precios live). Más preciso que recalcular native × LIVE_PRICES (puede estar 60s desactualizado).
  try {
    const profRes = await sbAdmin(
      `profiles?mander_id=eq.${encodeURIComponent(manderId)}&select=balance&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    const profRows: { balance: number }[] = profRes.ok ? await profRes.json() : [];
    const prevTotal = profRows?.[0]?.balance ?? 0;
    const newTotal = Math.max(0, prevTotal + deltaUsd);
    await sbAdmin(
      `profiles?mander_id=eq.${encodeURIComponent(manderId)}`,
      { method: "PATCH", body: JSON.stringify({ balance: newTotal }) },
    );
    console.log(`[BALANCE] profiles.balance → mander=${manderId} ${prevTotal} + ${deltaUsd} = ${newTotal}`);
  } catch (e: any) {
    console.error("[BALANCE] error actualizando profiles.balance:", e.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/transactions
// Crea una nueva transacción en Supabase.
// Tipos válidos: "deposit" | "withdrawal"
// Body: { type, amount, currency, network?, external_tx_id?, notes?, status? }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/transactions", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  const { type, amount, currency, network, external_tx_id, notes, status } = req.body;

  if (!type || typeof amount !== "number" || !currency) {
    return res.status(400).json({ error: "Faltan campos requeridos: type, amount, currency." });
  }

  console.log(`[TX INSERT] user=${req.authUser!.id} type=${type} amount=${amount} currency=${currency}`);

  try {
    const profile = await getProfile(req.authUser!.id);
    if (!profile) {
      console.error("[TX INSERT] perfil no encontrado para user:", req.authUser!.id);
      return res.status(404).json({ error: "Perfil no encontrado." });
    }

    if (type === "withdrawal" && profile.is_blocked === true) {
      console.warn(`[TX INSERT] usuario bloqueado intentó retiro: ${req.authUser!.id}`);
      return res.status(403).json({ error: "Tu cuenta está bloqueada para retiros. Contactá al soporte." });
    }

    const displayId = await nextDisplayId(type);
    console.log(`[TX INSERT] display_id calculado: ${displayId} para tipo "${type}"`);

    const finalStatus = status || "pending";
    const txRow = {
      mander_id:      profile.mander_id,
      user_id:        req.authUser!.id,
      display_id:     displayId,
      type,
      amount,
      currency,
      network:        network        || "",
      status:         finalStatus,
      external_tx_id: external_tx_id || null,
      notes:          notes          || null,
    };

    console.log("[TX INSERT] row →", JSON.stringify(txRow));

    const insRes = await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify(txRow),
    });

    if (!insRes.ok) {
      const errBody = await insRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[TX INSERT] Supabase error:", insRes.status, msg);
      return res.status(500).json({ error: msg });
    }

    const inserted = await insRes.json();
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log("[TX INSERT] OK — id:", row?.id, "display_id:", row?.display_id);

    // Si la transacción nace directamente como "completed", acreditar/debitar el balance
    if (finalStatus === "completed") {
      const delta = type === "withdrawal" ? -Math.abs(amount) : Math.abs(amount);
      await updateBalance(profile.mander_id, currency, delta, type);
    }

    return res.json({ transaction: row });

  } catch (err: any) {
    console.error("[TX INSERT] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/transactions
// Devuelve las transacciones del usuario autenticado.
// ──────────────────────────────────────────────────────────────────────────────
router.get("/transactions", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  try {
    const profile = await getProfile(req.authUser!.id);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

    const limit  = Math.min(parseInt(req.query.limit  as string) || 200, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const txRes = await sbAdmin(
      `transactions?mander_id=eq.${encodeURIComponent(profile.mander_id)}&order=created_at.desc&limit=${limit}&offset=${offset}&select=*`,
      { headers: { Prefer: "count=none" } },
    );

    if (!txRes.ok) {
      const errBody = await txRes.json().catch(() => ({}));
      console.error("[TX GET] Supabase error:", txRes.status, errBody);
      return res.status(500).json({ error: (errBody as any).message || "Error al obtener transacciones." });
    }

    const txs = await txRes.json();
    console.log(`[TX GET] user=${req.authUser!.id} → ${txs?.length ?? 0} transacciones`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({ transactions: txs || [] });

  } catch (err: any) {
    console.error("[TX GET] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/transactions/:id/status
// Actualiza el estado de una transacción a "completed", "failed" o "cancelled".
// Si pasa a "completed", actualiza automáticamente la tabla balances.
// ──────────────────────────────────────────────────────────────────────────────
router.patch("/transactions/:id/status", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  const VALID_STATUSES = ["pending", "completed", "failed", "cancelled"];
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Estado inválido. Valores permitidos: ${VALID_STATUSES.join(", ")}` });
  }

  const txId = req.params.id;
  console.log(`[TX UPDATE] id=${txId} status=${status} user=${req.authUser!.id}`);

  try {
    const profile = await getProfile(req.authUser!.id);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

    // Leer la transacción actual antes de parchear para:
    // 1. Obtener type, amount, currency, notes para updateBalance
    // 2. Evitar doble-conteo si ya estaba en "completed"
    const currentRes = await sbAdmin(
      `transactions?id=eq.${txId}&mander_id=eq.${encodeURIComponent(profile.mander_id)}&select=id,type,amount,currency,status,notes&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    const currentRows = currentRes.ok ? await currentRes.json() : [];
    const currentTx = currentRows?.[0];

    if (!currentTx) {
      return res.status(404).json({ error: "Transacción no encontrada o no pertenece al usuario." });
    }

    const wasAlreadyCompleted = currentTx.status === "completed";

    const updates: Record<string, string> = { status };
    if (status === "completed") updates.completed_at = new Date().toISOString();

    const updRes = await sbAdmin(
      `transactions?id=eq.${txId}&mander_id=eq.${encodeURIComponent(profile.mander_id)}`,
      { method: "PATCH", body: JSON.stringify(updates) },
    );

    if (!updRes.ok) {
      const errBody = await updRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[TX UPDATE] Supabase error:", updRes.status, msg);
      return res.status(500).json({ error: msg });
    }

    const updatedRows = await updRes.json();
    const row = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

    if (!row) {
      console.warn("[TX UPDATE] sin filas actualizadas — id:", txId, "mander_id:", profile.mander_id);
      return res.status(404).json({ error: "Transacción no encontrada o no pertenece al usuario." });
    }

    console.log("[TX UPDATE] OK — id:", row.id, "status:", row.status, "completed_at:", row.completed_at);

    // Actualizar balance automáticamente al completar (evitar doble-conteo)
    if (status === "completed" && !wasAlreadyCompleted) {
      const delta = currentTx.type === "withdrawal" ? -Math.abs(currentTx.amount) : Math.abs(currentTx.amount);
      // Para depósitos: usar coinAmount de notes si existe (evita imprecisión por precio)
      let nativeOverride: number | null = null;
      if (currentTx.type === "deposit") {
        const match = ((currentTx.notes as string) || "").match(/coinAmount:([0-9.]+)/);
        if (match) nativeOverride = parseFloat(match[1]);
      }
      await updateBalance(profile.mander_id, currentTx.currency, delta, currentTx.type, nativeOverride);
    }

    return res.json({ transaction: row });

  } catch (err: any) {
    console.error("[TX UPDATE] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/profile
// Devuelve el perfil del usuario autenticado.
// Si no existe (usuario nuevo), lo crea automáticamente.
// ──────────────────────────────────────────────────────────────────────────────
router.get("/profile", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  const userId   = req.authUser!.id;
  const username = req.authUser!.user_metadata?.username || req.authUser!.email || userId;
  const email    = req.authUser!.email || "";

  try {
    // 1. Buscar perfil existente
    const profileRes = await sbAdmin(`profiles?id=eq.${userId}&select=*&limit=1`);
    const profileRows: any[] = await profileRes.json();
    let profileRow = profileRows?.[0] ?? null;

    // 2. Auto-crear perfil para usuarios nuevos (primera vez)
    if (!profileRow) {
      const mander_id = crypto.randomBytes(12).toString("hex");
      const now = new Date().toISOString();
      const createRes = await sbAdmin("profiles", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ id: userId, mander_id, username, email, balance: 0, status: "active", created_at: now, last_login: now }),
      });
      const created: any[] = await createRes.json();
      profileRow = created?.[0] ?? { id: userId, mander_id, username, email, balance: 0, status: "active" };
      console.log(`[PROFILE] nuevo perfil creado user=${userId} mander_id=${mander_id}`);
    } else {
      // Actualizar last_login en background
      sbAdmin(`profiles?id=eq.${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ last_login: new Date().toISOString() }),
      }).catch(() => {});
    }

    // Leer balance real + stats en paralelo
    let realBalance = profileRow.balance ?? 0;
    let totalDeposit = 0;
    let wageredTotal = 0;
    try {
      const mid = encodeURIComponent(profileRow.mander_id);
      const [balRes, txRes] = await Promise.all([
        sbAdmin(`balances?mander_id=eq.${mid}&select=balance`, { headers: { Prefer: "count=none" } }),
        sbAdmin(`transactions?mander_id=eq.${mid}&select=type,amount,status&limit=5000`, { headers: { Prefer: "count=none" } }),
      ]);
      if (balRes.ok) {
        const balRows: { balance: number }[] = await balRes.json();
        if (balRows.length > 0) {
          realBalance = balRows.reduce((sum, r) => sum + Math.max(0, Number(r.balance || 0)), 0);
        }
      }
      if (txRes.ok) {
        const txRows: { type: string; amount: number; status: string }[] = await txRes.json();
        totalDeposit = txRows
          .filter(t => t.type === "deposit" && (t.status === "completed" || t.status === "confirmed"))
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        wageredTotal = txRows
          .filter(t => t.type === "bet")
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      }
    } catch {}

    // Verificar si el usuario es admin
    const adminUsernames = (process.env.ADMIN_USERNAMES || "")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = adminUsernames.includes((profileRow.username || "").toLowerCase());

    // Buscar referidor en affiliate_referrals
    let referrerUsername: string | null = null;
    try {
      const refRes = await sbAdmin(
        `affiliate_referrals?referred_username=eq.${encodeURIComponent(profileRow.username)}&select=referrer_username&limit=1`
      );
      if (refRes.ok) {
        const refRows: any[] = await refRes.json();
        if (refRows?.length > 0) referrerUsername = refRows[0].referrer_username || null;
      }
    } catch {}

    // Detectar país por IP (usar header de Cloudflare si está disponible, si no llamar a ipapi.co)
    let countryCode: string | null = null;
    try {
      // Cloudflare envía cf-ipcountry, Render/nginx pueden enviar x-country-code
      countryCode = (
        (req.headers["cf-ipcountry"] as string) ||
        (req.headers["x-country-code"] as string) ||
        null
      );
      if (!countryCode) {
        const forwardedIp = (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() || req.socket.remoteAddress || "";
        if (forwardedIp && !forwardedIp.startsWith("127.") && !forwardedIp.startsWith("10.") && !forwardedIp.startsWith("172.") && !forwardedIp.startsWith("::1")) {
          const geoRes = await fetch(`https://ipapi.co/${forwardedIp}/country/`, { signal: AbortSignal.timeout(2000) });
          if (geoRes.ok) {
            const cc = (await geoRes.text()).trim();
            if (cc.length === 2) countryCode = cc;
          }
        }
      }
    } catch {}

    return res.json({
      profile: {
        mander_id:  profileRow.mander_id,
        username:   profileRow.username,
        email:      profileRow.email,
        balance:    realBalance,
        status:     profileRow.status ?? "active",
        created_at: profileRow.created_at || req.authUser!.created_at,
        is_admin:   isAdmin,
      },
      details: {
        username:    profileRow.username || null,
        country:     countryCode,
        referrer_id: referrerUsername,
      },
      stats: {
        total_deposit:  Math.round(totalDeposit  * 100) / 100,
        wagered_total:  Math.round(wageredTotal   * 100) / 100,
      },
    });
  } catch (err: any) {
    console.error("[PROFILE GET] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/update — actualiza username / email
router.post("/profile/update", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });
  const userId = req.authUser!.id;
  const { username, email } = req.body ?? {};
  const patch: Record<string, string> = {};
  if (username) patch.username = username;
  if (email)    patch.email    = email;
  if (!Object.keys(patch).length) return res.status(400).json({ error: "Nada que actualizar." });
  try {
    await sbAdmin(`profiles?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify(patch) });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/details — devuelve/guarda detalles extendidos del perfil
router.post("/profile/details", requireAuth, async (req: Request, res: Response) => {
  return res.json({ details: req.body ?? {} });
});

// POST /api/profile/stats — devuelve estadísticas de juego del usuario
router.post("/profile/stats", requireAuth, async (req: Request, res: Response) => {
  const profile = await getProfile(req.authUser!.id).catch(() => null);
  if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });
  try {
    const txRes = await sbAdmin(
      `transactions?mander_id=eq.${encodeURIComponent(profile.mander_id)}&select=type,amount,status&limit=1000`,
    );
    const txs: any[] = txRes.ok ? await txRes.json() : [];
    const totalWagered   = txs.filter(t => t.type === "bet"      && t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
    const totalWithdrawn = txs.filter(t => t.type === "withdrawal" && t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
    const totalDeposited = txs.filter(t => t.type === "deposit"   && t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
    return res.json({ stats: { totalWagered, totalWithdrawn, totalDeposited, txCount: txs.length } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/balance
// Devuelve el balance total del usuario (suma de todos los registros en la tabla
// balances). Todos los montos están en USD equivalente.
// ──────────────────────────────────────────────────────────────────────────────
router.get("/balance", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  try {
    const profile = await getProfile(req.authUser!.id);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

    const balRes = await sbAdmin(
      `balances?mander_id=eq.${encodeURIComponent(profile.mander_id)}&select=currency,balance`,
      { headers: { Prefer: "count=none" } },
    );

    if (!balRes.ok) {
      const err = await balRes.json().catch(() => ({}));
      console.error("[BALANCE GET] Supabase error:", balRes.status, err);
      return res.status(500).json({ error: "Error al obtener balance." });
    }

    const rawRows: { currency: string; balance: number }[] = await balRes.json();
    // Agregar duplicados por moneda (tolerancia a filas duplicadas en la tabla)
    const agg: Record<string, number> = {};
    for (const r of rawRows) {
      agg[r.currency] = (agg[r.currency] ?? 0) + (Number(r.balance) || 0);
    }
    const rows = Object.entries(agg).map(([currency, balance]) => ({ currency, balance }));
    const total = rows.reduce((sum, r) => sum + toUsd(r.balance, r.currency), 0);

    console.log(`[BALANCE GET] user=${req.authUser!.id} rawRows=${rawRows.length} coins=${rows.length} total=${total}`);

    // NO actualizar profiles.balance aquí — los precios del servidor difieren de los del frontend.
    // profiles.balance se actualiza únicamente en /api/balance/sync (totalUsd live del frontend).

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({ balances: rows, total_usd: total, stored_usd: typeof profile.balance === "number" ? profile.balance : 0 });

  } catch (err: any) {
    console.error("[BALANCE GET] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/balance/sync
// Sincroniza el balance nativo de una moneda para el usuario autenticado.
// Body: { currency: string, balance: number, totalUsd?: number }
//   currency  – moneda activa (ej. "USDT")
//   balance   – monto nativo absoluto de esa moneda
//   totalUsd  – total USD de TODAS las monedas (calculado en el frontend)
// ──────────────────────────────────────────────────────────────────────────────
router.post("/balance/sync", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  const { currency, balance, totalUsd } = req.body ?? {};
  if (!currency || balance === undefined || balance === null) {
    return res.status(400).json({ error: "currency y balance son requeridos." });
  }

  const newBal = Math.max(0, Number(balance));
  if (isNaN(newBal)) return res.status(400).json({ error: "balance inválido." });

  const cur = String(currency).trim().toUpperCase();

  try {
    const profile = await getProfile(req.authUser!.id);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

    const now = new Date().toISOString();

    // 1. Actualizar (o crear) la fila de la moneda activa en balances
    const getRes = await sbAdmin(
      `balances?mander_id=eq.${encodeURIComponent(profile.mander_id)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    const rows: { id: string; balance: number }[] = getRes.ok ? await getRes.json() : [];
    const existing = rows?.[0];

    if (existing) {
      await sbAdmin(`balances?id=eq.${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ balance: newBal, updated_at: now }),
      });
    } else {
      await sbAdmin("balances", {
        method: "POST",
        body: JSON.stringify({ mander_id: profile.mander_id, username: profile.username, currency: cur, balance: newBal, updated_at: now }),
      });
    }

    // 2. Actualizar profiles.balance — usar totalUsd del frontend (precios live exactos que ve el usuario).
    //    Solo como fallback usar syncProfileBalance (precios del servidor, pueden diferir).
    const frontendTotal = totalUsd !== undefined && totalUsd !== null ? Number(totalUsd) : NaN;
    if (!isNaN(frontendTotal) && frontendTotal >= 0) {
      await sbAdmin(
        `profiles?mander_id=eq.${encodeURIComponent(profile.mander_id)}`,
        { method: "PATCH", body: JSON.stringify({ balance: frontendTotal }) },
      );
    } else {
      await syncProfileBalance(profile.mander_id);
    }

    console.log(`[BALANCE SYNC] user=${req.authUser!.id} ${cur}=${newBal} totalUsd=${totalUsd ?? "recalc"}`);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[BALANCE SYNC] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/admin/adjust-balance
// Suma o resta saldo a un usuario. Requiere auth + ser admin.
// Body: { mander_id, username, amount (signed native), currency, notes? }
router.post("/admin/adjust-balance", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  // Verificar que el caller es admin
  const callerProfile = await getProfile(req.authUser!.id).catch(() => null);
  if (!callerProfile) return res.status(403).json({ error: "Perfil no encontrado." });
  const adminUsernames = (process.env.ADMIN_USERNAMES || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!adminUsernames.includes(callerProfile.username.toLowerCase())) {
    return res.status(403).json({ error: "Acceso denegado." });
  }

  const { mander_id, username, amount, currency, notes } = req.body;
  if (!mander_id || !username || typeof amount !== "number" || amount === 0 || !currency) {
    return res.status(400).json({
      error: "Campos requeridos: mander_id, username, amount (≠ 0), currency.",
    });
  }

  const cur = currency.trim().toUpperCase();
  const isCredit = amount > 0;
  const absAmount = Math.abs(amount);
  const adjustmentNote = notes?.trim()
    || `Admin ${isCredit ? "+" : "-"}${absAmount} ${cur} por ${callerProfile.username}`;

  console.log(`[ADMIN adjust-balance] caller=${callerProfile.username} target=${username} amount=${amount} ${cur}`);

  try {
    // Obtener user_id real del target
    let targetUserId: string | null = null;
    const targetRes = await sbAdmin(
      `profiles?mander_id=eq.${encodeURIComponent(mander_id)}&select=id&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (targetRes.ok) {
      const rows: { id: string }[] = await targetRes.json();
      if (rows[0]) targetUserId = rows[0].id;
    }

    const txRow: Record<string, unknown> = {
      mander_id,
      display_id:     null,
      type:           "bonus",
      amount:         absAmount,
      currency:       cur,
      network:        "",
      status:         "completed",
      external_tx_id: null,
      notes:          `[admin_adjustment] ${adjustmentNote}`,
      completed_at:   new Date().toISOString(),
      user_id:        targetUserId,
    };

    const insRes = await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify(txRow),
    });

    if (!insRes.ok) {
      const errBody = await insRes.json().catch(() => ({}));
      const msg = (errBody as Record<string, unknown>).message || JSON.stringify(errBody);
      console.error("[ADMIN adjust-balance] error TX:", msg);
      return res.status(500).json({ error: "Error al insertar transacción: " + msg });
    }

    const inserted = await insRes.json();
    const txRow_ = Array.isArray(inserted) ? inserted[0] : inserted;

    // Actualizar balance con monto nativo exacto (signed)
    await updateBalance(mander_id, cur, amount, "admin_adjustment", amount);

    console.log(`[ADMIN adjust-balance] OK — tx id=${txRow_?.id} ${isCredit ? "+" : ""}${amount} ${cur} → ${username}`);
    return res.json({
      ok: true,
      transaction: txRow_,
      message: `Balance de ${username} ${isCredit ? "aumentado" : "reducido"} en ${absAmount} ${cur}.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN adjust-balance] excepción:", msg);
    return res.status(500).json({ error: msg });
  }
});

// POST /api/admin/add-balance
// Agrega balance manualmente a un usuario (uso administrativo).
// Header requerido: x-admin-key = SUPABASE_SERVICE_KEY (service role)
// Body: { username, mander_id, amount, currency, notes? }
// Inserta una TX tipo "bonus" con status "completed" y actualiza balances.
// ──────────────────────────────────────────────────────────────────────────────
router.post("/admin/add-balance", async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  // Verificar admin key
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== SUPABASE_SERVICE_KEY) {
    console.warn("[ADMIN] intento de acceso sin clave válida — ip:", req.ip);
    return res.status(401).json({ error: "Acceso denegado. Header x-admin-key requerido." });
  }

  const { username, mander_id, amount, currency, notes } = req.body;

  if (!username || !mander_id || typeof amount !== "number" || amount <= 0 || !currency) {
    return res.status(400).json({
      error: "Campos requeridos: username (string), mander_id (string), amount (number > 0), currency (string).",
    });
  }

  const cur = currency.trim().toUpperCase();
  console.log(`[ADMIN add-balance] username=${username} mander_id=${mander_id} amount=${amount} currency=${cur}`);

  try {
    // 1. Calcular display_id para "bonus" (sin rango propio → null)
    const txRow = {
      mander_id,
      username,
      display_id:     null,
      type:           "bonus",
      amount,
      currency:       cur,
      network:        "",
      status:         "completed",
      external_tx_id: null,
      notes:          notes || "manual admin balance",
      completed_at:   new Date().toISOString(),
    };

    console.log("[ADMIN add-balance] insertando TX →", JSON.stringify(txRow));

    // 2. Insertar la transacción
    const insRes = await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify(txRow),
    });

    if (!insRes.ok) {
      const errBody = await insRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[ADMIN add-balance] error al insertar TX:", insRes.status, msg);
      return res.status(500).json({ error: "Error al insertar transacción: " + msg });
    }

    const inserted = await insRes.json();
    const txRow_ = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log("[ADMIN add-balance] TX insertada — id:", txRow_?.id);

    // 3. Actualizar tabla balances (siempre crédito positivo para bonus)
    await updateBalance(mander_id, username, cur, amount, "bonus");

    return res.json({
      success: true,
      transaction: txRow_,
      message: `Balance de ${username} aumentado en ${amount} ${cur}.`,
    });

  } catch (err: any) {
    console.error("[ADMIN add-balance] excepción:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// In-memory circular buffer for live all-users bets feed (max 60 entries)
// ─────────────────────────────────────────────────────────────────────────────
interface LiveBetEntry {
  username: string; game: string; bet_usd: number; payout_usd: number;
  multiplier: number; win: boolean; created_at: string; currency: string;
}

// Weighted random currency for live feed display (USDT most common)
function randomLiveCurrency(): string {
  const r = Math.random();
  if (r < 0.60) return "USDT";
  if (r < 0.75) return "BNB";
  if (r < 0.87) return "TRX";
  if (r < 0.95) return "LTC";
  return "SOL";
}
const liveBetsBuffer: LiveBetEntry[] = [];
const LIVE_BETS_MAX = 60;

// ── Auto-simulate live bets so the feed is never empty ───────────────────────
const SIM_USERS = [
  "CryptoKing","LuckyAce","MoonShot","BigRoller","DiamondHands",
  "GoldMiner","SilverFox","IronWolf","CobaltBear","NeonTiger",
  "StarBurst","NovaCash","PlutoRich","ZenBet","CosmicWin",
  "BlackjackPro","RouletteKing","HighRoller","SlotMaster","DiceGod",
  "PlinkoFan","KenoBoss","MinesChamp","HiloExpert","BaccaratQueen",
];
const SIM_GAMES = [
  "Dice","Plinko","Keno","Blackjack","Mines","Hilo","Roulette","Baccarat",
];
function generateSimBet(): LiveBetEntry {
  const bet = parseFloat((Math.random() * 28 + 0.5).toFixed(2));
  const game = SIM_GAMES[Math.floor(Math.random() * SIM_GAMES.length)];
  const user = SIM_USERS[Math.floor(Math.random() * SIM_USERS.length)];
  const currency = randomLiveCurrency();

  // Pick target multiplier with realistic distribution (most bets are low-mult)
  // 55% low (1.05x–2x), 30% medium (2x–10x), 15% high (10x–50x)
  const r = Math.random();
  let targetMult: number;
  if (r < 0.55) {
    targetMult = 1.05 + Math.random() * 0.95;  // 1.05x – 2x
  } else if (r < 0.85) {
    targetMult = 2 + Math.random() * 8;         // 2x – 10x
  } else {
    targetMult = 10 + Math.random() * 40;        // 10x – 50x
  }

  // Win probability mirrors real casino math: fair_prob = 1/mult, minus ~5% edge
  const winProb = 1 / (targetMult * 1.05);
  const isWin = Math.random() < winProb;

  let payout = 0;
  let mult = 0;
  if (isWin) {
    mult = parseFloat(targetMult.toFixed(2));
    const rawPayout = bet * mult;
    const cap = 2200 + Math.floor(Math.random() * 601);
    payout = parseFloat(Math.min(rawPayout, cap).toFixed(2));
    mult = parseFloat((payout / bet).toFixed(2));
  }

  return { username: user, game, bet_usd: bet, payout_usd: payout, multiplier: mult, win: isWin, created_at: new Date().toISOString(), currency };
}

function scheduleSimBet() {
  const delay = 2000 + Math.floor(Math.random() * 3000); // 2–5 s
  setTimeout(() => {
    // Only add sim entry if buffer is sparse or no real activity recently
    if (liveBetsBuffer.length < LIVE_BETS_MAX) {
      liveBetsBuffer.push(generateSimBet());
    } else {
      // Replace oldest entry (shift + push)
      liveBetsBuffer.shift();
      liveBetsBuffer.push(generateSimBet());
    }
    scheduleSimBet();
  }, delay);
}
// Pre-seed with 20 entries so feed is instantly populated on startup
for (let i = 0; i < 20; i++) {
  const entry = generateSimBet();
  // Spread timestamps over the last 5 minutes
  const ago = (20 - i) * 15 * 1000;
  entry.created_at = new Date(Date.now() - ago).toISOString();
  liveBetsBuffer.push(entry);
}
scheduleSimBet();
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/live-bets — public, no auth required
const LIVE_MAX_BET_USD = 30;
router.get("/live-bets", (_req: Request, res: Response) => {
  // Return all entries newest-first; win ratio is determined naturally by the generator
  // (real casino math: 1.1x wins ~85% of the time, 10x wins ~9%, etc.)
  const result = liveBetsBuffer
    .filter(b => b.bet_usd <= LIVE_MAX_BET_USD)
    .slice()
    .reverse();

  res.json({ bets: result });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bet-result
// Registra el resultado de una apuesta. game_bets es la única fuente de verdad
// para NGR. affiliate_referrals.wager_amount se mantiene solo como cache de display.
// Body: { bet_usd, payout_usd, game, currency?, bonus_usd? }
// No crítico — nunca rompe el juego, siempre responde { ok: true }.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/bet-result", requireAuth, async (req: Request, res: Response) => {
  const {
    bet_usd,
    payout_usd = 0,
    bonus_usd  = 0,
    game       = "casino",
    currency   = "USD",
  } = req.body ?? {};

  if (typeof bet_usd !== "number" || bet_usd <= 0) {
    return res.json({ ok: true, skip: "invalid_amount" });
  }

  const username = req.authUser!.user_metadata?.username;
  if (!username) return res.json({ ok: true, skip: "no_username" });

  // Always push to live feed buffer (all users, regardless of referrer)
  const win = payout_usd > bet_usd;
  const gameStr = String(game).slice(0, 50);

  // Dedup: skip if same username+game already in last 8 entries (within 45 s)
  const cutoff = Date.now() - 45_000;
  const recentDup = liveBetsBuffer.slice(-8).some(
    b => b.username === username && b.game === gameStr && new Date(b.created_at).getTime() > cutoff
  );
  if (!recentDup) {
    // Cap large wins at a jittered limit so the feed looks natural (2200–2800)
    const jitteredCap = 2200 + Math.floor(Math.random() * 601);
    const displayPayout = win && payout_usd > jitteredCap ? parseFloat(jitteredCap.toFixed(2)) : payout_usd;
    const multiplier = win && bet_usd > 0 ? parseFloat((displayPayout / bet_usd).toFixed(2)) : 0;
    liveBetsBuffer.push({ username, game: gameStr, bet_usd, payout_usd: displayPayout, multiplier, win, created_at: new Date().toISOString(), currency: randomLiveCurrency() });
    if (liveBetsBuffer.length > LIVE_BETS_MAX) liveBetsBuffer.shift();
  }

  try {
    // 1. Verificar si el usuario es referido ANTES de cualquier escritura
    //    Solo registramos en game_bets si el usuario tiene un afiliado que lo trajo.
    const refRes = await sbAdmin(
      `affiliate_referrals?referred_username=eq.${encodeURIComponent(username)}&select=id,wager_amount&limit=1`,
      { headers: { Prefer: "count=none" } }
    );
    const refRows: any[] = refRes.ok ? await refRes.json() : [];
    const hasReferrer = refRows.length > 0;

    if (!hasReferrer) return res.json({ ok: true, skip: "not_referred" });

    // 2. game_bets = única fuente de verdad para NGR
    //    NGR = bet_usd - payout_usd - bonus_usd (calculado en generate-commissions)
    const betRow = {
      username,
      game:       String(game).slice(0, 50),
      currency:   String(currency || "USD").slice(0, 10),
      bet_usd:    parseFloat(Number(bet_usd).toFixed(6)),
      payout_usd: parseFloat(Number(payout_usd || 0).toFixed(6)),
      bonus_usd:  parseFloat(Number(bonus_usd  || 0).toFixed(6)),
    };

    const insRes = await sbAdmin("game_bets", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(betRow),
    });
    if (!insRes.ok) {
      const txt = await insRes.text().catch(() => "");
      console.warn("[bet-result] game_bets insert failed:", insRes.status, txt);
    }

    // 3. Cache de display: solo actualizar wager_amount en affiliate_referrals
    //    (NO actualizar ngr — eso se calcula a demanda desde game_bets)
    const ref = refRows[0];
    const newWager = parseFloat((parseFloat(ref.wager_amount || 0) + bet_usd).toFixed(6));
    sbAdmin(`affiliate_referrals?id=eq.${ref.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ wager_amount: newWager, updated_at: new Date().toISOString() }),
    }).catch(() => {}); // fire-and-forget (cache, no crítico)

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[bet-result] error:", err.message);
    return res.json({ ok: true }); // no bloquear el juego
  }
});

export default router;
