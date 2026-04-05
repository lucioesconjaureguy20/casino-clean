/**
 * nowpayments-webhook.ts
 *
 * Recibe notificaciones IPN de NOWPayments cuando un pago es confirmado.
 * En status "finished" → acredita el balance del usuario automáticamente.
 *
 * Verificación HMAC-SHA-512 con NOWPAYMENTS_IPN_SECRET (si está configurado).
 * El order_id en NOWPayments = deposit.id en nuestra tabla deposits.
 */

import { Router, type Request, type Response } from "express";
import { createHmac } from "crypto";
import { getPriceUsd } from "../lib/prices";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

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
function verifySignature(body: Record<string, any>, signature: string): boolean {
  if (!NOWPAYMENTS_IPN_SECRET) return true; // sin secret configurado, aceptar (solo dev)
  const sorted = Object.keys(body).sort().reduce<Record<string, any>>((acc, k) => {
    acc[k] = body[k];
    return acc;
  }, {});
  const hmac = createHmac("sha512", NOWPAYMENTS_IPN_SECRET)
    .update(JSON.stringify(sorted))
    .digest("hex");
  return hmac === signature;
}

// ── Helpers de balance (igual que en deposit.ts) ──────────────────────────────
async function creditBalance(manderId: string, currency: string, amount: number) {
  const cur = currency.trim().toUpperCase();
  const getRes = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!getRes.ok) { console.error("[NP webhook] error leyendo balance"); return; }
  const rows = await getRes.json();
  const existing = rows?.[0];
  const now = new Date().toISOString();
  if (existing) {
    const newBal = Math.max(0, Number(existing.balance ?? 0) + amount);
    await sbAdmin(`balances?id=eq.${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: newBal, updated_at: now }),
    });
    console.log(`[NP webhook] balance +${amount} ${cur} → mander=${manderId} new=${newBal}`);
  } else {
    await sbAdmin("balances", {
      method: "POST",
      body: JSON.stringify({ mander_id: manderId, currency: cur, balance: Math.max(0, amount), updated_at: now }),
    });
    console.log(`[NP webhook] nuevo balance ${amount} ${cur} → mander=${manderId}`);
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
    console.log(`[NP webhook] profile balance ${prev} → ${next} (Δ${deltaUsd} USD)`);
  } catch (e: any) {
    console.error("[NP webhook] error actualizando profile balance:", e.message);
  }
}

async function insertTransaction(
  manderId: string, userId: string,
  amount: number, currency: string, network: string,
  paymentId: string, depositId: string,
) {
  const r = await sbAdmin("transactions", {
    method: "POST",
    body: JSON.stringify({
      mander_id:      manderId,
      user_id:        userId,
      type:           "deposit",
      amount,
      currency:       currency.trim().toUpperCase(),
      network,
      status:         "completed",
      external_tx_id: paymentId,
      notes:          `nowpayments:${paymentId} deposit_id:${depositId}`,
      completed_at:   new Date().toISOString(),
    }),
  });
  if (!r.ok) console.error("[NP webhook] error insertando transaction:", await r.text());
  else console.log(`[NP webhook] tx registrada: ${amount} ${currency} mander=${manderId}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/nowpayments
// ──────────────────────────────────────────────────────────────────────────────
router.post("/webhooks/nowpayments", async (req: Request, res: Response) => {
  const sig = req.headers["x-nowpayments-sig"] as string | undefined;
  const body = req.body;

  console.log("[NP webhook] recibido:", JSON.stringify(body).slice(0, 300));

  // Verificar firma
  if (sig && !verifySignature(body, sig)) {
    console.warn("[NP webhook] firma inválida — rechazado");
    return res.status(401).json({ error: "Firma inválida." });
  }

  const { payment_status, order_id, actually_paid, pay_currency, payment_id } = body;

  // Solo procesar pagos completados
  if (payment_status !== "finished" && payment_status !== "confirmed") {
    console.log(`[NP webhook] status=${payment_status} ignorado para payment_id=${payment_id}`);
    return res.json({ ok: true, ignored: true });
  }

  if (!order_id) {
    console.warn("[NP webhook] falta order_id");
    return res.status(400).json({ error: "Falta order_id." });
  }

  try {
    // 1. Buscar el depósito por order_id (= deposit.id)
    const depRes = await sbAdmin(
      `deposits?id=eq.${encodeURIComponent(order_id)}&select=*&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!depRes.ok) throw new Error("Error leyendo deposit");
    const depRows = await depRes.json();
    const deposit = depRows?.[0];
    if (!deposit) {
      console.warn(`[NP webhook] depósito no encontrado: order_id=${order_id}`);
      return res.status(404).json({ error: "Depósito no encontrado." });
    }

    // Idempotencia: si ya fue confirmado, no volver a acreditar
    if (deposit.status === "confirmed") {
      console.log(`[NP webhook] depósito ${order_id} ya confirmado — idempotente`);
      return res.json({ ok: true, already_confirmed: true });
    }

    // 2. Buscar el perfil del usuario
    const profRes = await sbAdmin(
      `profiles?id=eq.${encodeURIComponent(deposit.user_id)}&select=id,mander_id,username&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!profRes.ok) throw new Error("Error leyendo profile");
    const profRows = await profRes.json();
    const profile = profRows?.[0];
    if (!profile) throw new Error(`Perfil no encontrado para user_id=${deposit.user_id}`);

    const receivedAmount = Number(actually_paid ?? 0);
    const currency = (deposit.currency as string).toUpperCase();
    const priceUsd = getPriceUsd(currency);
    const deltaUsd = receivedAmount * priceUsd;

    console.log(`[NP webhook] CONFIRMADO — order=${order_id} amount=${receivedAmount} ${currency} (~$${deltaUsd.toFixed(2)} USD) user=${profile.username}`);

    // 3. Marcar deposit como confirmado
    await sbAdmin(`deposits?id=eq.${encodeURIComponent(order_id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status:  "confirmed",
        amount:  receivedAmount,
        tx_hash: String(payment_id ?? ""),
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
      deposit.network,
      String(payment_id ?? ""),
      order_id,
    );

    return res.json({ ok: true });

  } catch (e: any) {
    console.error("[NP webhook] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
