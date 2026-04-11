import { Router, type Request, type Response, type NextFunction } from "express";
import { createHash as _createHash } from "crypto";
import { getPriceUsd } from "../lib/prices";
import { verifyGameToken } from "../lib/gameToken.js";
import { getMinDepositUsd } from "../lib/depositLimits.js";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY!;
const OXAPAY_MERCHANT_KEY  = process.env.OXAPAY_MERCHANT_KEY;
const OXAPAY_BASE          = "https://api.oxapay.com/v1";
const PLISIO_SECRET_KEY    = process.env.PLISIO_SECRET_KEY;
const PLISIO_BASE          = "https://plisio.net/api/v1";

// ── Plisio: casino currency/network → psys_cid ────────────────────────────────
const PLISIO_CURRENCY: Record<string, Record<string, string>> = {
  USDT: { TRC20: "USDT_TRX", BEP20: "USDT_BSC", ERC20: "USDT", SOL: "USDT_SOL" },
  USDC: { BEP20: "USDC_BSC", ERC20: "USDC" },
  ETH:  { ERC20: "ETH" },
  BTC:  { BTC:   "BTC" },
  LTC:  { LTC:   "LTC" },
  TRX:  { TRC20: "TRX" },
  BNB:  { BEP20: "BNB" },
};

// ── Longitud mínima de dirección válida por red ───────────────────────────────
const MIN_ADDR_LEN: Record<string, number> = {
  BEP20: 42, ERC20: 42, Arbitrum: 42, Optimism: 42,
  TRC20: 34,
  SOL: 32, Solana: 32,
};
function minAddrLenForNet(network: string): number {
  return MIN_ADDR_LEN[network] ?? 26;
}

// ── Oxapay currency/network map (coin + network → Oxapay pay_currency + network) ─
type OpPair = { payCurrency: string; network: string };
const OP_CURRENCY: Record<string, Record<string, OpPair>> = {
  USDT: { TRC20: { payCurrency: "USDT", network: "TRC20"    }, ERC20:    { payCurrency: "USDT", network: "ERC20"    }, BEP20: { payCurrency: "USDT", network: "BEP20" } },
  ETH:  { ERC20: { payCurrency: "ETH",  network: "ERC20"    } },
  BTC:  { BTC:   { payCurrency: "BTC",  network: "Bitcoin"  } },
  SOL:  { SOL:   { payCurrency: "SOL",  network: "Solana"   } },
  BNB:  { BEP20: { payCurrency: "BNB",  network: "BEP20"    } },
  TRX:  { TRC20: { payCurrency: "TRX",  network: "TRC20"    } },
  USDC: { BEP20: { payCurrency: "USDC", network: "BEP20"    }, SOL: { payCurrency: "USDC", network: "Solana" } },
  LTC:  { LTC:   { payCurrency: "LTC",  network: "Litecoin" } },
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
  walletAddress?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const notesAddr = walletAddress && walletAddress !== "pending" && walletAddress.length > 5
    ? ` ADDR:${walletAddress}`
    : "";
  const row = {
    mander_id:      manderId,
    user_id:        userId,
    type:           "deposit",
    amount,
    currency:       currency.trim().toUpperCase(),
    network,
    status:         "completed",
    external_tx_id: txHash || null,
    notes:          `deposit_id:${depositId}${notesAddr}`,
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

// GET /api/deposit/minimums — mínimos del casino por coin:network
router.get("/deposit/minimums", (_req: Request, res: Response) => {
  const minimums: Record<string, number> = {};
  for (const [coin, networks] of Object.entries(OP_CURRENCY)) {
    for (const net of Object.keys(networks)) {
      minimums[`${coin}:${net}`] = getMinDepositUsd(coin, net);
    }
  }
  return res.json({ minimums });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/deposit/address?currency=USDT&network=TRC20
// Devuelve la dirección permanente del usuario para esa moneda/red, si existe.
// No crea ningún pago nuevo.
// ──────────────────────────────────────────────────────────────────────────────
router.get("/deposit/address", requireAuth, async (req: Request, res: Response) => {
  const authUser = (req as any).authUser;
  const cur = String(req.query.currency ?? "").trim().toUpperCase();
  const net = String(req.query.network ?? "").trim();
  if (!cur || !net) return res.status(400).json({ error: "currency y network son requeridos." });

  try {
    // Preferir el pending más reciente; si no hay, usar cualquier depósito con dirección válida
    const pendingRes = await sbAdmin(
      `deposits?user_id=eq.${encodeURIComponent(authUser.id)}&currency=eq.${encodeURIComponent(cur)}&network=eq.${encodeURIComponent(net)}&status=eq.pending&order=created_at.desc&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (pendingRes.ok) {
      const rows = await pendingRes.json();
      const dep = rows?.[0];
      if (dep && dep.address && dep.address !== "pending" && dep.address.length >= minAddrLenForNet(net)) {
        return res.json({ address: dep.address, deposit_id: dep.id, currency: cur, network: net, status: "pending" });
      }
    }

    // Sin fallback: solo devolver si hay un pending válido de Plisio
    return res.json({ address: null });
  } catch {
    return res.json({ address: null });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deposit/nowpayments   (ahora usa Oxapay internamente)
// Crea un pago en Oxapay y devuelve la dirección + monto exacto en crypto.
// Body: { currency, network, amount_usd }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/deposit/nowpayments", requireAuth, async (req: Request, res: Response) => {
  if (!OXAPAY_MERCHANT_KEY)
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
  const opPair = OP_CURRENCY[cur]?.[net];
  if (!opPair)
    return res.status(400).json({ error: `Red no soportada: ${cur} ${net}` });

  const minDepositUsd = getMinDepositUsd(cur, net);
  if (parsedUsd < minDepositUsd)
    return res.status(400).json({ error: `El depósito mínimo para ${cur} ${net} es $${minDepositUsd} USD.` });

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
    console.error("[OP deposit] Supabase insert error:", err);
    return res.status(500).json({ error: "Error al crear depósito." });
  }
  const [depositRow] = await insRes.json();
  const depositId = depositRow.id;

  // 3. Construir callback_url
  const appUrl = process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const callbackUrl = appUrl ? `${appUrl}/api/webhooks/oxapay` : undefined;

  // 4. Llamar a Oxapay white-label API
  try {
    const opBody: Record<string, any> = {
      amount:       parsedUsd,
      currency:     "USD",
      pay_currency: opPair.payCurrency,
      network:      opPair.network,
      order_id:     String(depositId),
      lifetime:     2880, // 48 horas
      under_paid_coverage: 5, // tolerar hasta 5% de diferencia
    };
    if (callbackUrl) opBody.callback_url = callbackUrl;

    const opRes = await fetch(`${OXAPAY_BASE}/payment/white-label`, {
      method: "POST",
      headers: {
        "merchant_api_key": OXAPAY_MERCHANT_KEY,
        "Content-Type":     "application/json",
      },
      body: JSON.stringify(opBody),
    });

    const opRaw: any = await opRes.json();
    // Oxapay v1 devuelve { status: 200, data: { ... }, message: "..." }
    const opOk = opRaw?.status === 200 || opRaw?.message === "Operation completed successfully!";
    if (!opRes.ok || !opOk) {
      console.error("[OP deposit] Oxapay error:", opRes.status, opRaw);
      await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" });
      return res.status(502).json({ error: opRaw?.message ?? "Error al crear pago en Oxapay." });
    }
    const opData = opRaw.data ?? opRaw;

    // Validar dirección devuelta
    const payAddress: string = opData.address ?? "";
    const minLen = minAddrLenForNet(net);
    if (payAddress.length < minLen) {
      console.error(`[OP deposit] dirección inválida (${payAddress.length} chars, mín=${minLen} para ${net}): "${payAddress}"`);
      await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" });
      return res.status(502).json({ error: `Oxapay devolvió una dirección inválida para ${cur} ${net}. Intentá con otra red.` });
    }

    const trackId = String(opData.track_id ?? "");

    // 5. Guardar dirección y trackId en el depósito
    await sbAdmin(`deposits?id=eq.${depositId}`, {
      method: "PATCH",
      body: JSON.stringify({
        address: payAddress,
        tx_hash: trackId,
      }),
    });

    console.log(`[OP deposit] OK — deposit_id=${depositId} trackId=${trackId} addr=${payAddress} payAmount=${opData.pay_amount} ${opData.pay_currency}`);

    return res.status(201).json({
      deposit_id:   depositId,
      payment_id:   trackId,
      pay_address:  payAddress,
      pay_amount:   opData.pay_amount,
      pay_currency: opData.pay_currency,
      coin_amount:  opData.pay_amount,
      status:       "waiting",
    });
  } catch (e: any) {
    console.error("[OP deposit] fetch error:", e.message);
    await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" }).catch(() => {});
    return res.status(500).json({ error: "Error de conexión con Oxapay." });
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
      deposit.address,
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

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deposit/plisio
// Crea (o reutiliza) una invoice Plisio por el monto mínimo.
// El webhook acepta cualquier monto >= $5 (completed + mismatch/overpayment).
// Body: { currency, network }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/deposit/plisio", requireAuth, async (req: Request, res: Response) => {
  if (!PLISIO_SECRET_KEY)
    return res.status(503).json({ error: "Pasarela de pago Plisio no configurada." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  const { currency, network } = req.body ?? {};
  const authUser = (req as any).authUser;

  if (!currency || !network)
    return res.status(400).json({ error: "Campos requeridos: currency, network." });

  const cur = String(currency).trim().toUpperCase();
  const net = String(network).trim();
  const psysCid = PLISIO_CURRENCY[cur]?.[net];
  if (!psysCid)
    return res.status(400).json({ error: `Red no soportada para Plisio: ${cur} ${net}` });

  const minDepositUsd = getMinDepositUsd(cur, net);

  // 1. Obtener perfil
  const profile = await getProfile(authUser.id);
  if (!profile) return res.status(404).json({ error: "Usuario no encontrado." });

  // 2. Reutilizar invoice pending activa (no expirada, dentro de las 47 h)
  const existRes = await sbAdmin(
    `deposits?user_id=eq.${encodeURIComponent(authUser.id)}&currency=eq.${encodeURIComponent(cur)}&network=eq.${encodeURIComponent(net)}&status=eq.pending&order=created_at.desc&limit=3`,
    { headers: { Prefer: "count=none" } },
  );
  if (existRes.ok) {
    const rows = await existRes.json();
    const cutoff = Date.now() - 47 * 60 * 60 * 1000;
    const reusable = rows?.find((d: any) =>
      d.address && d.address !== "pending" &&
      d.address.length >= minAddrLenForNet(net) &&
      new Date(d.created_at).getTime() > cutoff &&
      d.tx_hash && !d.tx_hash.startsWith("0x") && d.tx_hash.length < 60 && isNaN(Number(d.tx_hash)),
    );
    if (reusable) {
      console.log(`[Plisio deposit] reutilizando dirección ${reusable.address} deposit_id=${reusable.id}`);
      return res.json({
        pay_address: reusable.address,
        pay_amount:  null,
        deposit_id:  reusable.id,
        currency: cur,
        network: net,
      });
    }
  }

  // 3. Crear registro pending en DB para obtener el UUID (order_number)
  const insRes = await sbAdmin("deposits", {
    method: "POST",
    body: JSON.stringify({
      user_id: authUser.id, amount: 0,
      currency: cur, network: net,
      address: "pending", status: "pending",
    }),
  });
  if (!insRes.ok) {
    console.error("[Plisio deposit] Supabase insert error:", await insRes.text());
    return res.status(500).json({ error: "Error al crear depósito." });
  }
  const [depositRow] = await insRes.json();
  const depositId = depositRow.id;

  // 4. Construir callback_url
  const appUrl = process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const callbackUrl = appUrl ? `${appUrl}/api/webhooks/plisio` : undefined;

  // 5. Crear invoice por el monto mínimo (el webhook acredita source_amount real)
  try {
    // Plisio `amount` es en unidades de crypto, no en USD.
    // Convertimos $5 USD → crypto y sumamos 1% de margen para superar el mínimo de Plisio.
    const priceUsd   = getPriceUsd(cur);
    const cryptoAmt  = (minDepositUsd / (priceUsd > 0 ? priceUsd : 1)) * 1.01;
    const invoiceAmt = parseFloat(cryptoAmt.toPrecision(6));
    const params: Record<string, string> = {
      api_key:      PLISIO_SECRET_KEY,
      currency:     psysCid,
      amount:       String(invoiceAmt),
      order_number: String(depositId),
      order_name:   `Deposit ${cur}`,
      expire_min:   "2880",
    };
    if (callbackUrl) params.callback_url = callbackUrl;

    const invRes = await fetch(
      `${PLISIO_BASE}/invoices/new?${new URLSearchParams(params).toString()}`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!invRes.ok) {
      console.error("[Plisio deposit] HTTP error:", invRes.status);
      await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" });
      return res.status(502).json({ error: "Error al conectar con Plisio." });
    }
    const invRaw: any = await invRes.json();
    if (invRaw?.status !== "success" || !invRaw.data?.txn_id) {
      console.error("[Plisio deposit] error API:", JSON.stringify(invRaw).slice(0, 300));
      await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" });
      const errMsg = invRaw?.data?.message ?? invRaw?.message ?? "Error al generar dirección.";
      return res.status(400).json({ error: errMsg });
    }

    const txnId = invRaw.data.txn_id;
    const invDataKeys = Object.keys(invRaw.data ?? {});
    console.log("[Plisio deposit] invoice creation keys:", invDataKeys, "| wallet_hash=", invRaw.data?.wallet_hash, "| qr_code=", (invRaw.data?.qr_code ?? "").slice(0, 80));

    // Helper: extrae dirección de un payment URI (bitcoin:ADDR?amount=..., tron:ADDR, etc.)
    function parseAddrFromQr(qr: string): string {
      if (!qr) return "";
      const withoutScheme = qr.replace(/^[^:]+:/, "");
      return withoutScheme.split("?")[0].trim();
    }

    // 6a. Intentar obtener address del invoice creation response directamente
    let walletHash: string =
      invRaw.data?.wallet_hash ??
      parseAddrFromQr(invRaw.data?.qr_code ?? "") ??
      "";

    // 6b. Si no vino en la creación, obtener desde /wallets endpoint (no tiene restricción de IP)
    if (!walletHash || walletHash.length < minAddrLenForNet(net)) {
      console.log(`[Plisio deposit] address no en invoice creation, intentando /wallets para ${psysCid}…`);
      try {
        const walRes = await fetch(
          `${PLISIO_BASE}/wallets?api_key=${PLISIO_SECRET_KEY}&psys_cid=${encodeURIComponent(psysCid)}`,
          { signal: AbortSignal.timeout(15000) },
        );
        const walRaw: any = walRes.ok ? await walRes.json() : null;
        console.log("[Plisio deposit] /wallets response:", JSON.stringify(walRaw).slice(0, 400));
        const wAddr: string =
          walRaw?.data?.wallet_hash ??
          walRaw?.data?.[0]?.wallet_hash ??
          (Array.isArray(walRaw?.data) ? walRaw.data.find((w: any) => w.psys_cid === psysCid)?.wallet_hash : undefined) ??
          "";
        if (wAddr && wAddr.length >= minAddrLenForNet(net)) {
          walletHash = wAddr;
          console.log(`[Plisio deposit] address from /wallets: ${walletHash}`);
        }
      } catch (we: any) {
        console.warn("[Plisio deposit] /wallets error:", we.message);
      }
    }

    // 6c. Último recurso: invoice detail (puede ser bloqueado por IP whitelist)
    if (!walletHash || walletHash.length < minAddrLenForNet(net)) {
      console.log(`[Plisio deposit] intentando /invoices/${txnId} como último recurso…`);
      try {
        const detRes = await fetch(
          `${PLISIO_BASE}/invoices/${txnId}?api_key=${PLISIO_SECRET_KEY}`,
          { signal: AbortSignal.timeout(15000) },
        );
        const detRaw: any = detRes.ok ? await detRes.json() : null;
        if (detRaw?.data) {
          console.log("[Plisio deposit] detail keys:", Object.keys(detRaw.data));
          walletHash =
            detRaw.data?.invoice?.wallet_hash ??
            detRaw.data?.wallet_hash ??
            parseAddrFromQr(detRaw.data?.invoice?.qr_code ?? detRaw.data?.qr_code ?? "") ??
            "";
        }
      } catch (de: any) {
        console.warn("[Plisio deposit] invoice detail error:", de.message);
      }
    }

    if (!walletHash || walletHash.length < minAddrLenForNet(net)) {
      console.error(`[Plisio deposit] wallet_hash inválido: "${walletHash}" (psys_cid=${psysCid} net=${net} minLen=${minAddrLenForNet(net)})`);
      await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" });
      return res.status(502).json({ error: "Plisio no devolvió una dirección válida." });
    }

    // 7. Actualizar depósito con dirección y txn_id
    await sbAdmin(`deposits?id=eq.${depositId}`, {
      method: "PATCH",
      body: JSON.stringify({ address: walletHash, tx_hash: txnId }),
    });

    console.log(`[Plisio deposit] OK user=${profile.username} ${cur}/${net} addr=${walletHash} txn=${txnId}`);

    return res.json({
      pay_address: walletHash,
      pay_amount:  null,
      deposit_id:  depositId,
      currency: cur,
      network: net,
    });

  } catch (e: any) {
    console.error("[Plisio deposit] catch:", e.message);
    await sbAdmin(`deposits?id=eq.${depositId}`, { method: "DELETE" }).catch(() => {});
    if (e.name === "TimeoutError" || e.name === "AbortError")
      return res.status(504).json({ error: "Plisio tardó demasiado. Intentá de nuevo." });
    return res.status(500).json({ error: "Error al generar dirección de pago." });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deposit/cryptomus
// Crea (o reutiliza) una Static Wallet de Cryptomus — dirección PERMANENTE.
// Body: { currency, network }   (sin amount_usd — acepta cualquier monto)
// ──────────────────────────────────────────────────────────────────────────────
const CRYPTOMUS_BASE         = "https://api.cryptomus.com/v1";
const CRYPTOMUS_PAYMENT_KEY  = process.env.CRYPTOMUS_PAYMENT_KEY;
const CRYPTOMUS_MERCHANT_UUID = process.env.CRYPTOMUS_MERCHANT_UUID;

const CM_CURRENCY: Record<string, Record<string, { cm_currency: string; cm_network: string }>> = {
  USDT: {
    TRC20: { cm_currency: "USDT", cm_network: "TRON"    },
    BEP20: { cm_currency: "USDT", cm_network: "BSC"     },
    ERC20: { cm_currency: "USDT", cm_network: "ETH"     },
    SOL:   { cm_currency: "USDT", cm_network: "SOL"     },
  },
  ETH:  { ERC20: { cm_currency: "ETH",  cm_network: "ETH"  } },
  BTC:  { BTC:   { cm_currency: "BTC",  cm_network: "BTC"  } },
  LTC:  { LTC:   { cm_currency: "LTC",  cm_network: "LTC"  } },
  TRX:  { TRC20: { cm_currency: "TRX",  cm_network: "TRON" } },
  BNB:  { BEP20: { cm_currency: "BNB",  cm_network: "BSC"  } },
  SOL:  { SOL:   { cm_currency: "SOL",  cm_network: "SOL"  } },
};

function cryptomusSign(body: Record<string, any>, apiKey: string): string {
  const json = JSON.stringify(body);
  return _createHash("md5")
    .update(Buffer.from(json).toString("base64") + apiKey)
    .digest("hex");
}

router.post("/deposit/cryptomus", requireAuth, async (req: Request, res: Response) => {
  if (!CRYPTOMUS_PAYMENT_KEY || !CRYPTOMUS_MERCHANT_UUID)
    return res.status(503).json({ error: "Cryptomus no configurado." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  const { currency, network } = req.body ?? {};
  const authUser = (req as any).authUser;

  if (!currency || !network)
    return res.status(400).json({ error: "Campos requeridos: currency, network." });

  const cur = String(currency).trim().toUpperCase();
  const net = String(network).trim();
  const cmPair = CM_CURRENCY[cur]?.[net];
  if (!cmPair)
    return res.status(400).json({ error: `Red no soportada para Cryptomus: ${cur} ${net}` });

  // 1. Obtener perfil del usuario
  const profile = await getProfile(authUser.id);
  if (!profile) return res.status(404).json({ error: "Usuario no encontrado." });

  // El order_id que identifica permanentemente la wallet del usuario para esta coin/network
  const orderId = `cm_${profile.mander_id}_${cur}_${net}`;

  // 2. Buscar si ya existe wallet permanente en DB (tx_hash = orderId)
  const existRes = await sbAdmin(
    `deposits?user_id=eq.${encodeURIComponent(authUser.id)}&currency=eq.${encodeURIComponent(cur)}&network=eq.${encodeURIComponent(net)}&tx_hash=eq.${encodeURIComponent(orderId)}&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (existRes.ok) {
    const rows = await existRes.json();
    const existing = rows?.[0];
    if (existing?.address && existing.address !== "pending" && existing.address.length >= minAddrLenForNet(net)) {
      console.log(`[Cryptomus] reutilizando wallet permanente ${existing.address} mander=${profile.mander_id}`);
      return res.json({
        pay_address: existing.address,
        deposit_id:  existing.id,
        currency: cur,
        network: net,
        permanent: true,
      });
    }
  }

  // 3. Llamar a Cryptomus /v1/wallet para crear o recuperar la static wallet
  const appUrl = process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const callbackUrl = appUrl ? `${appUrl}/api/webhooks/cryptomus` : undefined;

  const cmBody: Record<string, any> = {
    currency: cmPair.cm_currency,
    network:  cmPair.cm_network,
    order_id: orderId,
  };
  if (callbackUrl) cmBody.url_callback = callbackUrl;

  try {
    const sign = cryptomusSign(cmBody, CRYPTOMUS_PAYMENT_KEY);
    const cmRes = await fetch(`${CRYPTOMUS_BASE}/wallet`, {
      method: "POST",
      headers: {
        merchant:       CRYPTOMUS_MERCHANT_UUID,
        sign,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmBody),
      signal: AbortSignal.timeout(20000),
    });

    const cmRaw: any = await cmRes.json();
    console.log(`[Cryptomus] /v1/wallet response: ${JSON.stringify(cmRaw).slice(0, 400)}`);

    if (cmRaw?.message && !cmRaw.result) {
      const msg = cmRaw.message;
      return res.status(502).json({ error: `Cryptomus: ${msg}` });
    }

    const walletAddress: string = cmRaw.result?.address ?? "";
    if (!walletAddress || walletAddress.length < minAddrLenForNet(net)) {
      return res.status(502).json({ error: "Cryptomus no devolvió una dirección válida." });
    }

    // 4. Crear o actualizar registro en DB con dirección permanente
    //    (tx_hash = orderId para poder encontrarla en webhooks y en reuso)
    const insRes = await sbAdmin("deposits", {
      method: "POST",
      body: JSON.stringify({
        user_id:  authUser.id,
        amount:   0,
        currency: cur,
        network:  net,
        address:  walletAddress,
        status:   "pending",
        tx_hash:  orderId,
      }),
    });

    let depositId = "";
    if (insRes.ok) {
      const [row] = await insRes.json();
      depositId = row?.id ?? "";
    } else {
      console.error("[Cryptomus] error guardando deposit:", await insRes.text());
    }

    console.log(`[Cryptomus] wallet permanente creada: ${walletAddress} mander=${profile.mander_id} order=${orderId}`);

    return res.status(201).json({
      pay_address: walletAddress,
      deposit_id:  depositId,
      currency: cur,
      network: net,
      permanent: true,
    });

  } catch (e: any) {
    console.error("[Cryptomus] catch:", e.message);
    if (e.name === "TimeoutError" || e.name === "AbortError")
      return res.status(504).json({ error: "Cryptomus tardó demasiado. Intentá de nuevo." });
    return res.status(500).json({ error: "Error al generar dirección de pago." });
  }
});

// ── GET /api/deposit/status/:depositId ──────────────────────────────────────
// Permite al frontend saber si un depósito fue confirmado por el poller/webhook
router.get("/deposit/status/:depositId", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).authUser?.id as string;
  const { depositId } = req.params;
  if (!depositId) return res.status(400).json({ error: "depositId requerido" });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/deposits?id=eq.${encodeURIComponent(depositId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,status,amount,currency,network&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY!,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      },
    );
    if (!r.ok) return res.status(500).json({ error: "db error" });
    const rows: any[] = await r.json();
    if (!rows?.[0]) return res.status(404).json({ error: "not found" });
    const dep = rows[0];
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({ status: dep.status, amount: dep.amount, currency: dep.currency, network: dep.network });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /api/deposits/pending-balance ──────────────────────────────────────────
// Devuelve:
//   pending_usd  → suma USD de depósitos en vuelo (status=pending, amount>0)
//   items        → lista detallada de depósitos pendientes
//   recent       → últimos 5 depósitos (pending + confirmed) para historial UI
router.get("/deposits/pending-balance", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).authUser?.id as string;
  try {
    const headers = {
      apikey: SUPABASE_SERVICE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "count=none",
    };

    // Depósitos pendientes con monto
    const rPending = await fetch(
      `${SUPABASE_URL}/rest/v1/deposits?user_id=eq.${encodeURIComponent(userId)}&status=eq.pending&amount=gt.0&select=id,amount,currency,network,created_at&order=created_at.desc&limit=20`,
      { headers },
    );
    // Últimos 5 depósitos (cualquier status) para historial en UI
    const rRecent = await fetch(
      `${SUPABASE_URL}/rest/v1/deposits?user_id=eq.${encodeURIComponent(userId)}&amount=gt.0&select=id,amount,currency,network,status,created_at,confirmed_at&order=created_at.desc&limit=5`,
      { headers },
    );

    const pendingRows: { id: number; amount: number; currency: string; network: string; created_at: string }[] =
      rPending.ok ? await rPending.json() : [];
    const recentRows: any[] = rRecent.ok ? await rRecent.json() : [];

    let pendingUsd = 0;
    const items = pendingRows
      .filter(row => parseFloat(String(row.amount)) > 0)
      .map(row => {
        const amt = parseFloat(String(row.amount));
        const usd = amt * getPriceUsd(row.currency.trim().toUpperCase());
        pendingUsd += usd;
        return { id: row.id, amount: amt, currency: row.currency, network: row.network, usd, created_at: row.created_at };
      });

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({
      pending_usd: Math.round(pendingUsd * 100) / 100,
      items,
      recent: recentRows,
    });
  } catch (e: any) {
    return res.json({ pending_usd: 0, items: [], recent: [] });
  }
});

export default router;

