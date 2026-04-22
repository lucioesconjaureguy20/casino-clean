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
import { getMinDepositUsd } from "../lib/depositLimits.js";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

// ── Supabase REST helper ──────────────────────────────────────────────────────
function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
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

// ── Helpers de balance ────────────────────────────────────────────────────────
import { creditBalanceNative, atomicProfileBalanceDelta } from "../lib/atomicBalance";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";

async function creditBalance(manderId: string, currency: string, amount: number, userId?: string) {
  const cur = currency.trim().toUpperCase();
  const result = await creditBalanceNative(manderId, cur, amount, userId);
  if (result.ok) {
    console.log(`[NP webhook] balance +${amount} ${cur} → mander=${manderId} new=${result.newBalance}`);
  } else {
    console.error(`[NP webhook] creditBalanceNative failed: ${result.error} mander=${manderId}`);
  }
}

async function addToProfileBalance(manderId: string, deltaUsd: number) {
  // Atomic additive UPDATE — eliminates the read-modify-write race condition.
  // Uses PostgreSQL RPC: UPDATE profiles SET balance = GREATEST(0, balance + delta)
  await atomicProfileBalanceDelta(manderId, deltaUsd);
  console.log(`[NP webhook] profiles.balance Δ${deltaUsd} USD mander=${manderId}`);
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

  const { payment_status, order_id, actually_paid, pay_currency, payment_id, pay_address } = body;
  console.log(`[NP webhook] PAYLOAD: payment_id=${payment_id} order_id=${order_id} status=${payment_status} paid=${actually_paid} cur=${pay_currency} addr=${pay_address}`);

  // ── Payout (retiro) webhook: NowPayments envía id + status sin payment_status ──
  if (!payment_status && body.id && body.status) {
    const payoutId = String(body.id);
    const payoutStatus = String(body.status).toUpperCase();
    const txHash = body.hash ?? null;

    console.log(`[NP webhook] PAYOUT id=${payoutId} status=${payoutStatus} hash=${txHash}`);

    if (payoutStatus === "FINISHED" || payoutStatus === "SENDING") {
      try {
        // Buscar el retiro por tx_hash = np_payout_{id}
        const wRes = await sbAdmin(
          `withdrawals?tx_hash=eq.np_payout_${encodeURIComponent(payoutId)}&select=id,user_id,amount,currency,status&limit=1`,
          { headers: { Prefer: "count=none" } },
        );
        const wRows = wRes.ok ? await wRes.json() : [];
        const withdrawal = wRows?.[0];

        if (withdrawal && withdrawal.status === "processing") {
          const newStatus = payoutStatus === "FINISHED" ? "paid" : "processing";

          if (payoutStatus === "FINISHED") {
            await sbAdmin(`withdrawals?id=eq.${encodeURIComponent(withdrawal.id)}`, {
              method: "PATCH",
              body: JSON.stringify({ status: "paid", tx_hash: txHash ?? `np_payout_${payoutId}` }),
            });

            // Marcar transacción como completada
            await sbAdmin(
              `transactions?user_id=eq.${encodeURIComponent(withdrawal.user_id)}&type=eq.withdrawal&status=eq.pending&order=created_at.desc&limit=1`,
              {
                method: "PATCH",
                body: JSON.stringify({ status: "completed", completed_at: new Date().toISOString(), notes: `Retiro confirmado en blockchain. TX: ${txHash ?? payoutId}` }),
              },
            );
            console.log(`[NP webhook] PAYOUT FINALIZADO → retiro=${withdrawal.id} pagado`);
          }
        } else {
          console.log(`[NP webhook] PAYOUT id=${payoutId} — retiro no encontrado o ya procesado`);
        }
      } catch (e: any) {
        console.error("[NP webhook] error procesando payout:", e.message);
      }
    } else if (payoutStatus === "FAILED" || payoutStatus === "REJECTED") {
      console.warn(`[NP webhook] PAYOUT FALLIDO id=${payoutId} status=${payoutStatus}`);
      try {
        // Marcar retiro como failed para que admin pueda reintentar
        const wRes = await sbAdmin(
          `withdrawals?tx_hash=eq.np_payout_${encodeURIComponent(payoutId)}&select=id,status&limit=1`,
          { headers: { Prefer: "count=none" } },
        );
        const wRows = wRes.ok ? await wRes.json() : [];
        const withdrawal = wRows?.[0];
        if (withdrawal && (withdrawal.status === "processing" || withdrawal.status === "approved")) {
          await sbAdmin(`withdrawals?id=eq.${encodeURIComponent(withdrawal.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "failed", tx_hash: null }),
          });
          console.warn(`[NP webhook] retiro=${withdrawal.id} marcado como failed — admin debe reintentar`);
        }
      } catch (e: any) {
        console.error("[NP webhook] error marcando retiro como failed:", e.message);
      }
    }

    return res.json({ ok: true });
  }

  // ── Deposit webhook ──────────────────────────────────────────────────────────
  // Procesar pagos completados o parciales con cripto ya recibido
  if (payment_status !== "finished" && payment_status !== "confirmed" && payment_status !== "partially_paid") {
    console.log(`[NP webhook] status=${payment_status} ignorado para payment_id=${payment_id}`);
    return res.json({ ok: true, ignored: true });
  }

  if (!order_id && !payment_id && !pay_address) {
    console.warn("[NP webhook] payload insuficiente: falta order_id, payment_id y pay_address");
    return res.status(400).json({ error: "Payload insuficiente." });
  }

  try {
    // 1. Buscar el depósito por order_id (= deposit.id)
    let deposit: any = null;

    if (order_id) {
      const depRes = await sbAdmin(
        `deposits?id=eq.${encodeURIComponent(order_id)}&select=*&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      if (!depRes.ok) throw new Error("Error leyendo deposit");
      const depRows = await depRes.json();
      deposit = depRows?.[0] ?? null;
    }

    // 1b. Fallback: buscar por payment_id de NOWPayments (guardado en tx_hash)
    if (!deposit && payment_id) {
      console.warn(`[NP webhook] order_id=${order_id} no encontrado — buscando por payment_id=${payment_id}`);
      const depRes2 = await sbAdmin(
        `deposits?tx_hash=eq.${encodeURIComponent(String(payment_id))}&select=*&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      if (depRes2.ok) {
        const rows2 = await depRes2.json();
        deposit = rows2?.[0] ?? null;
        if (deposit) console.log(`[NP webhook] depósito encontrado por payment_id=${payment_id} → deposit.id=${deposit.id}`);
      }
    }

    // 1c. Fallback: buscar por wallet address (pay_address)
    if (!deposit && pay_address) {
      console.warn(`[NP webhook] Buscando por address=${pay_address}`);
      const depRes3 = await sbAdmin(
        `deposits?address=eq.${encodeURIComponent(pay_address)}&select=*&order=created_at.desc&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      if (depRes3.ok) {
        const rows3 = await depRes3.json();
        deposit = rows3?.[0] ?? null;
        if (deposit) console.log(`[NP webhook] depósito encontrado por address=${pay_address} → deposit.id=${deposit.id}`);
      }
    }

    if (!deposit) {
      console.error(`[NP webhook] depósito no encontrado por order_id=${order_id}, payment_id=${payment_id}, address=${pay_address}`);
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

    const minDepositUsd = getMinDepositUsd(currency, deposit.network ?? "");
    if (deltaUsd < minDepositUsd) {
      console.warn(`[NP webhook] monto insuficiente — order=${order_id} recibido=${receivedAmount} ${currency} ${deposit.network} (~$${deltaUsd.toFixed(2)} USD) < mínimo $${minDepositUsd} — no se acredita`);
      await sbAdmin(`deposits?id=eq.${encodeURIComponent(order_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected", amount: receivedAmount, tx_hash: String(payment_id ?? "") }),
      });
      return res.json({ ok: true, rejected: true, reason: "below_minimum" });
    }

    console.log(`[NP webhook] CONFIRMADO — order=${order_id} amount=${receivedAmount} ${currency} (~$${deltaUsd.toFixed(2)} USD) user=${profile.username}`);

    // 3. Marcar deposit como confirmado — conditional PATCH (prevents double-credit race).
    // Filter &status=eq.pending: if another concurrent webhook already confirmed this deposit,
    // the PATCH returns 0 rows and we skip the credit entirely.
    const confirmRes = await sbAdmin(`deposits?id=eq.${encodeURIComponent(order_id)}&status=eq.pending`, {
      method: "PATCH",
      body: JSON.stringify({
        status:  "confirmed",
        amount:  receivedAmount,
        tx_hash: String(payment_id ?? ""),
      }),
    });
    const confirmedRows: any[] = confirmRes.ok ? await confirmRes.json() : [];
    if (!confirmedRows.length) {
      console.warn(`[NP webhook] depósito ${order_id} ya confirmado por webhook concurrente — saltando crédito`);
      return res.json({ ok: true, already_confirmed: true });
    }

    // 4. Acreditar balance en tabla balances (solo si el PATCH anterior acreditó exactamente 1 fila)
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

    // 7. Actualizar estadísticas de afiliado si el usuario tiene un referente
    try {
      const refRes = await sbAdmin(
        `affiliate_referrals?referred_username=eq.${encodeURIComponent(profile.username)}&select=id,referrer_username,deposit_count,deposit_amount,is_ftd&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      const refRows = refRes.ok ? await refRes.json() : [];
      const referral = refRows?.[0];
      if (referral) {
        const newCount = (referral.deposit_count || 0) + 1;
        const newAmount = parseFloat(referral.deposit_amount || 0) + deltaUsd;
        await sbAdmin(`affiliate_referrals?id=eq.${encodeURIComponent(referral.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            deposit_count: newCount,
            deposit_amount: newAmount.toFixed(4),
            is_ftd: true,
            updated_at: new Date().toISOString(),
          }),
        });
        console.log(`[NP webhook] affiliate actualizado: referrer=${referral.referrer_username} +$${deltaUsd.toFixed(2)}`);
      }
    } catch (e: any) {
      console.error("[NP webhook] error actualizando affiliate stats:", e.message);
    }

    return res.json({ ok: true });

  } catch (e: any) {
    console.error("[NP webhook] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
