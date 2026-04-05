import { Router, type Request, type Response, type NextFunction } from "express";
import { getPriceUsd } from "../lib/prices";
import { verifyGameToken } from "../lib/gameToken.js";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY!;
const NOWPAYMENTS_API_KEY  = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_BASE     = "https://api.nowpayments.io/v1";

// ── NOWPayments currency code map (coin + network → NP code) ─────────────────
const NP_CURRENCY: Record<string, Record<string, string>> = {
  USDT:  { TRC20: "usdttrc20", ERC20: "usdterc20", BEP20: "usdtbsc" },
  ETH:   { ERC20: "eth",       Arbitrum: "etharb",  Optimism: "ethop" },
  BTC:   { BTC:   "btc" },
  SOL:   { SOL:   "sol" },
  BNB:   { BEP20: "bnbbsc",   Beacon: "bnb" },
  TRX:   { TRC20: "trx" },
  POL:   { ERC20: "maticmainnet" },
  USDC:  { ERC20: "usdcerc20", BEP20: "usdcbsc", SOL: "usdcsol" },
  LTC:   { LTC:   "ltc" },
};

// ── Supabase admin helper ─────────────────────────────────────────────────────
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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    throw new Error("Supabase admin not configured");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: adminHeaders((options.headers as Record<string, string>) || {}),
  });
  return res;
}

// ── Helper: obtener perfil por user_id ────────────────────────────────────────
async function getProfile(userId: string) {
  const r = await sbAdmin(
    `profiles?id=eq.${userId}&select=id,mander_id,username,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] ?? null;
}

// ── Helper: actualizar tabla balances ─────────────────────────────────────────
// Suma el monto nativo al balance de la moneda. Si no existe, crea la fila.
async function creditBalance(
  manderId: string,
  currency: string,
  nativeAmount: number,
): Promise<void> {
  const cur = currency.trim().toUpperCase();
  const now = new Date().toISOString();

  const getRes = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );

  if (!getRes.ok) {
    console.error("[DEPOSIT balance] error al leer balance:", await getRes.text());
    return;
  }

  const rows = await getRes.json();
  const existing = rows?.[0];

  if (existing) {
    const newBalance = Math.max(0, Number(existing.balance || 0) + nativeAmount);
    const patchRes = await sbAdmin(`balances?id=eq.${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: newBalance, updated_at: now }),
    });
    if (!patchRes.ok)
      console.error("[DEPOSIT balance] error al actualizar:", await patchRes.text());
    else
      console.log(`[DEPOSIT balance] +${nativeAmount} ${cur} → mander=${manderId} new=${newBalance}`);
  } else {
    const insRes = await sbAdmin("balances", {
      method: "POST",
      body: JSON.stringify({
        mander_id: manderId,
        currency: cur,
        balance: Math.max(0, nativeAmount),
        updated_at: now,
      }),
    });
    if (!insRes.ok)
      console.error("[DEPOSIT balance] error al crear fila:", await insRes.text());
    else
      console.log(`[DEPOSIT balance] nuevo: ${nativeAmount} ${cur} → mander=${manderId}`);
  }
}

// ── Helper: actualizar profiles.balance (total USD) ───────────────────────────
async function addToProfileBalance(manderId: string, deltaUsd: number): Promise<void> {
  try {
    const r = await sbAdmin(
      `profiles?mander_id=eq.${encodeURIComponent(manderId)}&select=balance&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    const rows: { balance: number }[] = r.ok ? await r.json() : [];
    const prev = Number(rows?.[0]?.balance ?? 0);
    const next = Math.max(0, prev + deltaUsd);
    await sbAdmin(`profiles?mander_id=eq.${encodeURIComponent(manderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: next }),
    });
    console.log(`[DEPOSIT profile] balance ${prev} → ${next} (Δ${deltaUsd} USD)`);
  } catch (e: any) {
    console.error("[DEPOSIT profile] error:", e.message);
  }
}

// ── Helper: registrar transacción en tabla transactions ───────────────────────
async function insertTransaction(
  manderId: string,
  userId: string,
  amount: number,
  currency: string,
  network: string,
  txHash: string,
  depositId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const row = {
    mander_id:      manderId,
    user_id:        userId,
    type:           "deposit",
    amount,
    currency:       currency.trim().toUpperCase(),
    network,
    status:         "completed",
    external_tx_id: txHash || null,
    notes:          `deposit_id:${depositId}`,
    completed_at:   now,
  };

  const r = await sbAdmin("transactions", {
    method: "POST",
    body: JSON.stringify(row),
  });

  if (!r.ok)
    console.error("[DEPOSIT tx] error al insertar transacción:", await r.text());
  else
    console.log(`[DEPOSIT tx] registrado: ${amount} ${currency} mander=${manderId}`);
}

// ── Auth middleware ───────────────────────────────────────────────────────────
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Sesión expirada o inválida." });
  const token = authHeader.slice(7);
  try {
    const gameUser = verifyGameToken(token) as any;
    if (gameUser) {
      (req as any).authUser = { id: gameUser.profileId, email: "", user_metadata: { username: gameUser.username } };
      return next();
    }
  } catch {}
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(401).json({ error: "Sesión expirada o inválida." });
    const u = await r.json();
    (req as any).authUser = { id: u.id, email: u.email ?? "", user_metadata: u.user_metadata ?? {} };
    return next();
  } catch {
    return res.status(401).json({ error: "Sesión expirada o inválida." });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deposit/nowpayments
// Crea un pago en NOWPayments y devuelve la dirección real + monto exacto.
// Body: { currency, network, amount_usd }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/deposit/nowpayments", requireAuth, async (req: Request, res: Response) => {
  if (!NOWPAYMENTS_API_KEY)
    return res.status(503).json({ error: "Pasarela de pago no configurada." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  const { currency, network, amount_usd } = req.body ?? {};
  const authUser = (req as any).authUser;

  if (!currency || !network || !amount_usd)
    return res.status(400).json({ error: "Campos requeridos: currency, network, amount_usd." });

  const parsedUsd = Number(amount_usd);
  if (!Number.isFinite(parsedUsd) || parsedUsd <= 0)
    return res.status(400).json({ error: "amount_usd debe ser un número positivo." });

  const cur = String(currency).trim().toUpperCase();
  const net = String(network).trim();
  const npCurrency = NP_CURRENCY[cur]?.[net];
  if (!npCurrency)
    return res.status(400).json({ error: `Red no soportada: ${cur} ${net}` });

  // 1. Obtener perfil
  const profile = await getProfile(authUser.id);
  if (!profile) return res.status(404).json({ error: "Usuario no encontrado." });

  // 2. Crear registro pending en deposits primero para obtener el UUID (order_id)
  const insRes = await sbAdmin("deposits", {
    method: "POST",
    body: JSON.stringify({
      user_id:  authUser.id,
      amount:   0,
      currency: cur,
      network:  net,
      address:  "pending",
      status:   "pending",
    }),
  });
  if (!insRes.ok) {
    const err = await insRes.text();
    console.error("[NP deposit] Supabase insert error:", err);
    return res.status(500).json({ error: "Error al crear depósito." });
  }
  const [depositRow] = await insRes.json();
  const depositId = depositRow.id;

  // 3. Construir ipn_callback_url
  const appUrl = process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const ipnUrl = appUrl ? `${appUrl}/api/webhooks/nowpayments` : undefined;

  // 4. Llamar a NOWPayments API
  try {
    // Obtener el mínimo real de NOWPayments para este par de monedas
    let effectiveUsd = parsedUsd;
    try {
      const minRes = await fetch(
        `${NOWPAYMENTS_BASE}/min-amount?currency_from=usd&currency_to=${npCurrency}`,
        { headers: { "x-api-key": NOWPAYMENTS_API_KEY! } }
      );
      if (minRes.ok) {
        const minData: any = await minRes.json();
        const minUsd = Number(minData?.min_amount);
        if (Number.isFinite(minUsd) && minUsd > effectiveUsd) {
          // Añadir 5% de margen para evitar errores por fluctuación de precio
          effectiveUsd = +(minUsd * 1.05).toFixed(2);
          console.log(`[NP deposit] min override: ${parsedUsd} → ${effectiveUsd} USD (min=${minUsd})`);
        }
      }
    } catch (_) { /* si falla la consulta de mínimo, seguimos con el amount original */ }

    const npBody: Record<string, any> = {
      price_amount:   effectiveUsd,
      price_currency: "usd",
      pay_currency:   npCurrency,
      order_id:       depositId,
    };
    if (ipnUrl) npBody.ipn_callback_url = ipnUrl;

    const npRes = await fetch(`${NOWPAYMENTS_BASE}/payment`, {
      method: "POST",
      headers: {
        "x-api-key":    NOWPAYMENTS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(npBody),
    });

    const npData: any = await npRes.json();
    if (!npRes.ok) {
      console.error("[NP deposit] NOWPayments error:", npRes.status, npData);
      // Limpiar el registro pending
      await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" });
      return res.status(502).json({ error: npData?.message ?? "Error al crear pago en NOWPayments." });
    }

    // Validar que la dirección devuelta sea mínimamente válida (>= 26 chars)
    const payAddress: string = npData.pay_address ?? "";
    if (payAddress.length < 26) {
      console.error(`[NP deposit] dirección inválida recibida de NOWPayments: "${payAddress}" (${payAddress.length} chars)`);
      await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" });
      return res.status(502).json({ error: `NOWPayments devolvió una dirección inválida para ${cur} ${net}. Intentá con otra red.` });
    }

    // 5. Actualizar el registro con la dirección real y payment_id
    await sbAdmin(`deposits?id=eq.${depositId}`, {
      method: "PATCH",
      body: JSON.stringify({
        address: payAddress,
        tx_hash: npData.payment_id?.toString() ?? null,
      }),
    });

    console.log(`[NP deposit] OK — deposit_id=${depositId} payment_id=${npData.payment_id} addr=${payAddress} (${payAddress.length} chars)`);

    return res.status(201).json({
      deposit_id:   depositId,
      payment_id:   npData.payment_id,
      pay_address:  npData.pay_address,
      pay_amount:   npData.pay_amount,
      pay_currency: npData.pay_currency,
      status:       npData.payment_status,
    });
  } catch (e: any) {
    console.error("[NP deposit] fetch error:", e.message);
    await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" }).catch(() => {});
    return res.status(500).json({ error: "Error de conexión con NOWPayments." });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deposit/create
// Crea un depósito pendiente en la tabla deposits.
// El monto real lo ingresa el admin al confirmar, no el usuario al crear.
// Body: { user_id, currency, network, address }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/deposit/create", async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  const { user_id, currency, network, address } = req.body ?? {};

  if (!user_id || !currency || !network) {
    return res.status(400).json({
      error: "Campos requeridos: user_id, currency, network.",
    });
  }

  try {
    const profile = await getProfile(user_id);
    if (!profile) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const depositRow = {
      user_id,
      amount:   0, // el monto real lo ingresa el admin al confirmar
      currency: currency.trim().toUpperCase(),
      network,
      address:  address || "",
      status:   "pending",
    };

    console.log(`[DEPOSIT create] user=${user_id} ${currency} ${network} (monto pendiente de confirmar)`);

    const insRes = await sbAdmin("deposits", {
      method: "POST",
      body: JSON.stringify(depositRow),
    });

    if (!insRes.ok) {
      const errBody = await insRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[DEPOSIT create] Supabase error:", insRes.status, msg);
      return res.status(500).json({ error: msg });
    }

    const inserted = await insRes.json();
    const deposit = Array.isArray(inserted) ? inserted[0] : inserted;

    console.log(`[DEPOSIT create] OK — deposit_id=${deposit?.id}`);
    return res.status(201).json({ deposit });

  } catch (err: any) {
    console.error("[DEPOSIT create] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deposit/confirm
// Confirma un depósito pendiente: cambia status a "confirmed", guarda tx_hash
// y el monto real enviado por el usuario, acredita balance y registra transacción.
// Body: { deposit_id, amount, tx_hash? }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/deposit/confirm", async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  const { deposit_id, tx_hash, amount: rawAmount } = req.body ?? {};

  if (!deposit_id) {
    return res.status(400).json({ error: "Campos requeridos: deposit_id." });
  }

  const confirmedAmount = parseFloat(rawAmount);
  if (!rawAmount || isNaN(confirmedAmount) || confirmedAmount <= 0) {
    return res.status(400).json({ error: "Ingresá el monto real recibido (amount > 0)." });
  }

  try {
    // 1. Leer el depósito
    const depRes = await sbAdmin(
      `deposits?id=eq.${deposit_id}&select=*&limit=1`,
      { headers: { Prefer: "count=none" } },
    );

    if (!depRes.ok) {
      const errBody = await depRes.json().catch(() => ({}));
      return res.status(500).json({ error: (errBody as any).message || "Error al leer el depósito." });
    }

    const depRows = await depRes.json();
    const deposit = depRows?.[0];

    if (!deposit) {
      return res.status(404).json({ error: "Depósito no encontrado." });
    }

    if (deposit.status === "confirmed") {
      return res.status(409).json({ error: "El depósito ya fue confirmado." });
    }

    // 2. Obtener perfil del usuario
    const profile = await getProfile(deposit.user_id);
    if (!profile) {
      return res.status(404).json({ error: "Usuario del depósito no encontrado." });
    }

    // 3. Actualizar el depósito con monto real, tx_hash y status "confirmed"
    const updRes = await sbAdmin(`deposits?id=eq.${deposit_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status:  "confirmed",
        amount:  confirmedAmount,
        tx_hash: tx_hash || null,
      }),
    });

    if (!updRes.ok) {
      const errBody = await updRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[DEPOSIT confirm] error al actualizar deposit:", msg);
      return res.status(500).json({ error: msg });
    }

    const updatedRows = await updRes.json();
    const updatedDeposit = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

    console.log(`[DEPOSIT confirm] deposit=${deposit_id} amount=${confirmedAmount} ${deposit.currency} tx_hash=${tx_hash}`);

    // 4. Acreditar balance en tabla balances (monto nativo real confirmado)
    await creditBalance(profile.mander_id, deposit.currency, confirmedAmount);

    // 5. Actualizar profiles.balance (total en USD)
    const priceUsd = getPriceUsd(deposit.currency.trim().toUpperCase());
    const deltaUsd = confirmedAmount * priceUsd;
    await addToProfileBalance(profile.mander_id, deltaUsd);

    // 6. Registrar en tabla transactions
    await insertTransaction(
      profile.mander_id,
      deposit.user_id,
      confirmedAmount,
      deposit.currency,
      deposit.network,
      tx_hash || "",
      deposit_id,
    );

    return res.json({
      ok: true,
      deposit: updatedDeposit ?? { ...deposit, status: "confirmed", tx_hash },
    });

  } catch (err: any) {
    console.error("[DEPOSIT confirm] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
