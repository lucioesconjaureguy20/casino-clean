/**
 * oxapay-webhook.ts
 *
 * Recibe notificaciones de Oxapay cuando un pago cambia de estado.
 * En status "paid" → acredita el balance del usuario automáticamente.
 *
 * Verificación HMAC-SHA-512:
 *   - Header:   HMAC
 *   - Clave:    OXAPAY_MERCHANT_KEY
 *   - Payload:  raw body (JSON string)
 *
 * El order_id en Oxapay = deposit.id en nuestra tabla deposits.
 */

import { Router, type Request, type Response } from "express";
import { createHmac } from "crypto";
import { getPriceUsd } from "../lib/prices";
import { getMinDepositUsd } from "../lib/depositLimits.js";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const OXAPAY_MERCHANT_KEY  = process.env.OXAPAY_MERCHANT_KEY;
const OXAPAY_BASE          = "https://api.oxapay.com/v1";

// ── Mapa moneda/red → Oxapay pay_currency + network ──────────────────────────
type OpPair = { payCurrency: string; network: string };
const OP_CURRENCY: Record<string, Record<string, OpPair>> = {
  USDT: { TRC20: { payCurrency: "USDT", network: "TRC20" }, ERC20: { payCurrency: "USDT", network: "ERC20" }, BEP20: { payCurrency: "USDT", network: "BEP20" } },
  ETH:  { ERC20: { payCurrency: "ETH", network: "ERC20" }, Arbitrum: { payCurrency: "ETH", network: "Arbitrum" } },
  BTC:  { BTC:   { payCurrency: "BTC", network: "Bitcoin" } },
  SOL:  { SOL:   { payCurrency: "SOL", network: "Solana" } },
  BNB:  { BEP20: { payCurrency: "BNB", network: "BEP20" } },
  TRX:  { TRC20: { payCurrency: "TRX", network: "TRC20" } },
  POL:  { ERC20: { payCurrency: "POL", network: "ERC20" } },
  USDC: { BEP20: { payCurrency: "USDC", network: "BEP20" }, SOL: { payCurrency: "USDC", network: "Solana" } },
  LTC:  { LTC:   { payCurrency: "LTC", network: "Litecoin" } },
};

// ── Supabase REST helper ──────────────────────────────────────────────────────
function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "return=representation",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

// ── Verificación HMAC-SHA-512 ─────────────────────────────────────────────────
function verifySignature(rawBody: string, signature: string): boolean {
  if (!OXAPAY_MERCHANT_KEY) return true; // dev: sin key configurada, aceptar
  const hmac = createHmac("sha512", OXAPAY_MERCHANT_KEY)
    .update(rawBody)
    .digest("hex");
  return hmac === signature;
}

// ── Helpers de balance ────────────────────────────────────────────────────────
async function creditBalance(manderId: string, currency: string, amount: number) {
  const cur = currency.trim().toUpperCase();
  const getRes = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!getRes.ok) { console.error("[OP webhook] error leyendo balance"); return; }
  const rows = await getRes.json();
  const existing = rows?.[0];
  const now = new Date().toISOString();
  if (existing) {
    const newBal = Math.max(0, Number(existing.balance ?? 0) + amount);
    await sbAdmin(`balances?id=eq.${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: newBal, updated_at: now }),
    });
    console.log(`[OP webhook] balance +${amount} ${cur} → mander=${manderId} new=${newBal}`);
  } else {
    await sbAdmin("balances", {
      method: "POST",
      body: JSON.stringify({ mander_id: manderId, currency: cur, balance: Math.max(0, amount), updated_at: now }),
    });
    console.log(`[OP webhook] nuevo balance ${amount} ${cur} → mander=${manderId}`);
  }
}

async function addToProfileBalance(manderId: string, deltaUsd: number) {
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
    console.log(`[OP webhook] profile balance ${prev} → ${next} (Δ${deltaUsd} USD)`);
  } catch (e: any) {
    console.error("[OP webhook] error actualizando profile balance:", e.message);
  }
}

const TX_DEPOSIT_START = 4642;

async function nextDepositDisplayId(): Promise<number> {
  const r = await sbAdmin(
    `transactions?type=eq.deposit&display_id=not.is.null&select=display_id`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return TX_DEPOSIT_START + 1;
  const rows: { display_id: string }[] = await r.json();
  const ids = rows
    .map(row => parseInt(row.display_id, 10))
    .filter(n => !isNaN(n) && n > TX_DEPOSIT_START && n < 1_000_000);
  return ids.length > 0 ? Math.max(...ids) + 1 : TX_DEPOSIT_START + 1;
}

async function insertTransaction(
  manderId: string, userId: string,
  amount: number, currency: string, network: string,
  trackId: string, depositId: string,
) {
  const displayId = await nextDepositDisplayId();
  const r = await sbAdmin("transactions", {
    method: "POST",
    body: JSON.stringify({
      mander_id:      manderId,
      user_id:        userId,
      type:           "deposit",
      display_id:     String(displayId),
      amount,
      currency:       currency.trim().toUpperCase(),
      network,
      status:         "completed",
      external_tx_id: trackId,
      notes:          `oxapay:${trackId} deposit_id:${depositId}`,
      completed_at:   new Date().toISOString(),
    }),
  });
  if (!r.ok) console.error("[OP webhook] error insertando transaction:", await r.text());
  else console.log(`[OP webhook] tx registrada: ${amount} ${currency} mander=${manderId} display_id=${displayId}`);
}

// ── Auto-recicle: crear nuevo pago en Oxapay para mantener la dirección activa ─
async function recycleDeposit(
  userId: string, manderId: string, username: string,
  currency: string, network: string,
) {
  if (!OXAPAY_MERCHANT_KEY) return;
  const opPair = OP_CURRENCY[currency]?.[network];
  if (!opPair) return;

  const minUsd = getMinDepositUsd(currency, network);
  const appUrl = process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const callbackUrl = appUrl ? `${appUrl}/api/webhooks/oxapay` : undefined;

  try {
    // 1. Crear registro pending en DB para obtener el UUID (order_id)
    const insRes = await sbAdmin("deposits", {
      method: "POST",
      body: JSON.stringify({
        user_id:  userId,
        amount:   0,
        currency: currency,
        network:  network,
        address:  "pending",
        status:   "pending",
      }),
    });
    if (!insRes.ok) { console.warn("[recycle] error creando deposit en DB"); return; }
    const insRows = await insRes.json();
    const newDepositId = insRows?.[0]?.id;
    if (!newDepositId) { console.warn("[recycle] deposit creado sin id"); return; }

    // 2. Llamar a Oxapay para crear el nuevo pago
    const opBody: Record<string, any> = {
      amount:              minUsd,
      currency:            "USD",
      pay_currency:        opPair.payCurrency,
      network:             opPair.network,
      order_id:            String(newDepositId),
      lifetime:            2880,
      under_paid_coverage: 5,
    };
    if (callbackUrl) opBody.callback_url = callbackUrl;

    const opRes = await fetch(`${OXAPAY_BASE}/payment/white-label`, {
      method: "POST",
      headers: { "merchant_api_key": OXAPAY_MERCHANT_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(opBody),
    });
    const opRaw: any = await opRes.json();
    const opOk = opRaw?.status === 200 || opRaw?.message === "Operation completed successfully!";
    if (!opOk) {
      console.warn(`[recycle] Oxapay error: ${JSON.stringify(opRaw).slice(0, 200)}`);
      await sbAdmin(`deposits?id=eq.${newDepositId}`, { method: "DELETE" }).catch(() => {});
      return;
    }

    const opData = opRaw.data ?? opRaw;
    const address = opData.address ?? "";
    const trackId = String(opData.track_id ?? "");

    if (!address || address.length < 20) {
      console.warn("[recycle] dirección inválida devuelta por Oxapay");
      await sbAdmin(`deposits?id=eq.${newDepositId}`, { method: "DELETE" }).catch(() => {});
      return;
    }

    // 3. Actualizar el depósito con dirección y track_id
    await sbAdmin(`deposits?id=eq.${newDepositId}`, {
      method: "PATCH",
      body: JSON.stringify({ address, tx_hash: trackId }),
    });

    console.log(`[recycle] OK — user=${username} ${currency}/${network} addr=${address} trackId=${trackId} deposit_id=${newDepositId}`);
  } catch (e: any) {
    console.error("[recycle] error:", e.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/oxapay
// ──────────────────────────────────────────────────────────────────────────────
router.post("/webhooks/oxapay", async (req: Request, res: Response) => {
  const sig  = req.headers["hmac"] as string | undefined;
  const body = req.body;
  // req.body ya es JSON parseado por express.json(); para HMAC necesitamos raw string
  const rawBody = typeof (req as any).rawBody === "string"
    ? (req as any).rawBody
    : JSON.stringify(body);

  console.log("[OP webhook] recibido:", JSON.stringify(body).slice(0, 300));

  if (sig && !verifySignature(rawBody, sig)) {
    console.warn("[OP webhook] firma inválida — rechazado");
    return res.status(401).json({ error: "Firma inválida." });
  }

  const status  = body?.status as string | undefined;
  const orderId = body?.order_id as string | undefined;  // nuestro deposit.id
  const trackId = body?.track_id as string | undefined;  // ID de Oxapay

  // Solo procesar pagos confirmados (Oxapay envía "Paid" con P mayúscula)
  if (status?.toLowerCase() !== "paid") {
    console.log(`[OP webhook] status=${status} trackId=${trackId} — ignorado`);
    return res.status(200).send("ok");
  }

  if (!orderId && !trackId) {
    console.warn("[OP webhook] payload sin order_id ni track_id");
    return res.status(400).json({ error: "Payload insuficiente." });
  }

  // Extraer monto recibido desde txs[0] (detalle de la transacción crypto)
  const txs: any[] = body?.txs ?? [];
  const tx = txs[0];
  const receivedAmount = Number(tx?.amount ?? body?.amount ?? 0);
  const payCurrency    = String(tx?.currency  ?? body?.pay_currency ?? "").toUpperCase();
  const payNetwork     = String(tx?.network   ?? body?.network      ?? "");
  const txHash         = tx?.tx_hash ?? null;

  console.log(`[OP webhook] PAID — orderId=${orderId} trackId=${trackId} amount=${receivedAmount} ${payCurrency} txHash=${txHash}`);

  try {
    // 1. Buscar el depósito por order_id
    let deposit: any = null;

    if (orderId) {
      const depRes = await sbAdmin(
        `deposits?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      if (depRes.ok) {
        const rows = await depRes.json();
        deposit = rows?.[0] ?? null;
      }
    }

    // Fallback: buscar por trackId guardado en tx_hash
    if (!deposit && trackId) {
      console.warn(`[OP webhook] orderId no encontrado — buscando por trackId=${trackId}`);
      const depRes2 = await sbAdmin(
        `deposits?tx_hash=eq.${encodeURIComponent(trackId)}&select=*&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      if (depRes2.ok) {
        const rows2 = await depRes2.json();
        deposit = rows2?.[0] ?? null;
        if (deposit) console.log(`[OP webhook] depósito encontrado por trackId=${trackId}`);
      }
    }

    if (!deposit) {
      console.error(`[OP webhook] depósito no encontrado — orderId=${orderId} trackId=${trackId}`);
      return res.status(404).json({ error: "Depósito no encontrado." });
    }

    // Idempotencia
    if (deposit.status === "confirmed") {
      console.log(`[OP webhook] depósito ya confirmado — idempotente`);
      return res.status(200).send("ok");
    }

    // 2. Obtener perfil del usuario
    const profRes = await sbAdmin(
      `profiles?id=eq.${encodeURIComponent(deposit.user_id)}&select=id,mander_id,username&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!profRes.ok) throw new Error("Error leyendo profile");
    const profRows = await profRes.json();
    const profile = profRows?.[0];
    if (!profile) throw new Error(`Perfil no encontrado para user_id=${deposit.user_id}`);

    const currency = (deposit.currency as string).toUpperCase();
    const network  = deposit.network ?? payNetwork;
    const priceUsd = getPriceUsd(currency);
    const deltaUsd = receivedAmount * priceUsd;

    const minDepositUsd = getMinDepositUsd(currency, network);
    if (deltaUsd < minDepositUsd) {
      console.warn(`[OP webhook] monto insuficiente — recibido=${receivedAmount} ${currency} (~$${deltaUsd.toFixed(2)} USD) < mínimo $${minDepositUsd}`);
      await sbAdmin(`deposits?id=eq.${encodeURIComponent(deposit.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected", amount: receivedAmount, tx_hash: txHash ?? trackId ?? "" }),
      });
      return res.status(200).send("ok");
    }

    console.log(`[OP webhook] CONFIRMADO — orderId=${orderId} amount=${receivedAmount} ${currency} (~$${deltaUsd.toFixed(2)} USD) user=${profile.username}`);

    // 3. Marcar depósito como confirmado
    await sbAdmin(`deposits?id=eq.${encodeURIComponent(deposit.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status:  "confirmed",
        amount:  receivedAmount,
        tx_hash: txHash ?? trackId ?? "",
      }),
    });

    // 4. Acreditar balance en tabla balances
    await creditBalance(profile.mander_id, currency, receivedAmount);

    // 5. Actualizar profiles.balance (total USD)
    await addToProfileBalance(profile.mander_id, deltaUsd);

    // 6. Registrar transacción
    await insertTransaction(
      profile.mander_id,
      deposit.user_id,
      receivedAmount,
      currency,
      network,
      trackId ?? orderId ?? "",
      deposit.id,
    );

    // 7. Actualizar estadísticas de afiliado
    try {
      const refRes = await sbAdmin(
        `affiliate_referrals?referred_username=eq.${encodeURIComponent(profile.username)}&select=id,referrer_username,deposit_count,deposit_amount,is_ftd&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      const refRows = refRes.ok ? await refRes.json() : [];
      const referral = refRows?.[0];
      if (referral) {
        const newCount  = (referral.deposit_count  || 0) + 1;
        const newAmount = parseFloat(referral.deposit_amount || 0) + deltaUsd;
        await sbAdmin(`affiliate_referrals?id=eq.${encodeURIComponent(referral.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            deposit_count:  newCount,
            deposit_amount: newAmount.toFixed(4),
            is_ftd:         true,
            updated_at:     new Date().toISOString(),
          }),
        });
        console.log(`[OP webhook] affiliate actualizado: referrer=${referral.referrer_username} +$${deltaUsd.toFixed(2)}`);
      }
    } catch (e: any) {
      console.error("[OP webhook] error actualizando affiliate stats:", e.message);
    }

    // 8. Auto-recicle: pre-crear el próximo pago para que la dirección quede siempre activa
    recycleDeposit(deposit.user_id, profile.mander_id, profile.username, currency, network)
      .catch(e => console.error("[OP webhook] recycle error:", e.message));

    return res.status(200).send("ok");

  } catch (e: any) {
    console.error("[OP webhook] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/oxapay/manual-credit
// Acredita manualmente un depósito de Oxapay usando el deposit_id (order_id).
// Solo accesible con el token de admin (ADMIN_SECRET).
// ──────────────────────────────────────────────────────────────────────────────
router.post("/webhooks/oxapay/manual-credit", async (req: Request, res: Response) => {
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader  = req.headers["authorization"] ?? "";
  const token       = String(authHeader).replace(/^Bearer\s+/i, "");

  if (adminSecret && token !== adminSecret) {
    return res.status(401).json({ error: "No autorizado." });
  }

  const { deposit_id, amount, currency, network, track_id } = req.body ?? {};
  if (!deposit_id || !amount || !currency) {
    return res.status(400).json({ error: "deposit_id, amount y currency son requeridos." });
  }

  try {
    // Buscar depósito
    const depRes = await sbAdmin(
      `deposits?id=eq.${encodeURIComponent(deposit_id)}&select=*&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!depRes.ok) throw new Error("Error buscando depósito");
    const rows = await depRes.json();
    const deposit = rows?.[0];
    if (!deposit) return res.status(404).json({ error: `Depósito ${deposit_id} no encontrado.` });

    const alreadyConfirmed = deposit.status === "confirmed";
    const forceInsertTx    = req.body?.force_tx === true;

    // Buscar perfil
    const profRes = await sbAdmin(
      `profiles?id=eq.${encodeURIComponent(deposit.user_id)}&select=id,mander_id,username&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!profRes.ok) throw new Error("Error buscando perfil");
    const profile = (await profRes.json())?.[0];
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

    const cur      = String(currency).toUpperCase();
    const net      = String(network ?? deposit.network ?? "");
    const amt      = Number(amount);
    const priceUsd = getPriceUsd(cur);
    const deltaUsd = amt * priceUsd;
    const tid      = String(track_id ?? deposit_id);

    if (alreadyConfirmed && !forceInsertTx) {
      return res.status(200).json({ message: "Ya estaba confirmado. Usá force_tx:true para insertar la transacción faltante." });
    }

    if (!alreadyConfirmed) {
      // Marcar depósito como confirmado y acreditar balance solo si aún no se hizo
      await sbAdmin(`deposits?id=eq.${encodeURIComponent(deposit_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "confirmed", amount: amt, tx_hash: tid }),
      });
      await creditBalance(profile.mander_id, cur, amt);
      await addToProfileBalance(profile.mander_id, deltaUsd);
    }

    // Insertar transacción (siempre, incluyendo cuando force_tx=true)
    await insertTransaction(profile.mander_id, deposit.user_id, amt, cur, net, tid, deposit_id);

    console.log(`[manual-credit] OK — deposit_id=${deposit_id} ${amt} ${cur} user=${profile.username} force=${forceInsertTx}`);
    return res.status(200).json({ ok: true, credited: alreadyConfirmed ? 0 : amt, tx_inserted: true, currency: cur, user: profile.username, deltaUsd: alreadyConfirmed ? 0 : deltaUsd });

  } catch (e: any) {
    console.error("[manual-credit] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
