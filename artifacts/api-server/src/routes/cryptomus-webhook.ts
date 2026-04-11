import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { getPriceUsd } from "../lib/prices";

const router = Router();

const SUPABASE_URL          = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY!;
const CRYPTOMUS_PAYMENT_KEY = process.env.CRYPTOMUS_PAYMENT_KEY;
const CRYPTOMUS_MERCHANT    = process.env.CRYPTOMUS_MERCHANT_UUID;
const CRYPTOMUS_BASE        = "https://api.cryptomus.com/v1";

// ── Cryptomus currency/network → casino { currency, network } ─────────────────
const CM_TO_CASINO: Record<string, Record<string, { currency: string; network: string }>> = {
  USDT: {
    TRON:    { currency: "USDT", network: "TRC20" },
    BSC:     { currency: "USDT", network: "BEP20" },
    ETH:     { currency: "USDT", network: "ERC20"  },
    SOL:     { currency: "USDT", network: "SOL"    },
    POLYGON: { currency: "USDT", network: "ERC20"  },
  },
  ETH:  { ETH:   { currency: "ETH",  network: "ERC20" } },
  BTC:  { BTC:   { currency: "BTC",  network: "BTC"   } },
  LTC:  { LTC:   { currency: "LTC",  network: "LTC"   } },
  TRX:  { TRON:  { currency: "TRX",  network: "TRC20" } },
  BNB:  { BSC:   { currency: "BNB",  network: "BEP20" } },
};

// ── Supabase admin helper ─────────────────────────────────────────────────────
function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers ?? {}),
    },
  });
}

// ── Verificar firma del webhook de Cryptomus ──────────────────────────────────
function verifySignature(body: Record<string, any>, apiKey: string): boolean {
  const { sign, ...rest } = body;
  if (!sign) return false;
  const json = JSON.stringify(rest);
  const expected = createHash("md5")
    .update(Buffer.from(json).toString("base64") + apiKey)
    .digest("hex");
  return expected === sign;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function addToProfileBalance(manderId: string, deltaUsd: number) {
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
  console.log(`[Cryptomus] balance ${prev} → ${next} (Δ${deltaUsd.toFixed(4)} USD) mander=${manderId}`);
}

async function nextDepositDisplayId(): Promise<number> {
  const TX_START = 4642;
  const r = await sbAdmin(
    `transactions?type=eq.deposit&display_id=not.is.null&select=display_id`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return TX_START + 1;
  const rows: { display_id: string }[] = await r.json();
  const ids = rows
    .map(row => parseInt(row.display_id, 10))
    .filter(n => !isNaN(n) && n > TX_START && n < 1_000_000);
  return ids.length > 0 ? Math.max(...ids) + 1 : TX_START + 1;
}

async function insertTransaction(
  manderId: string, userId: string,
  amount: number, currency: string, network: string,
  txHash: string, depositId: string,
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
      external_tx_id: txHash,
      notes:          `cryptomus:${txHash} deposit_id:${depositId}`,
      completed_at:   new Date().toISOString(),
    }),
  });
  if (!r.ok) console.error("[Cryptomus] error insertando transaction:", await r.text());
  else console.log(`[Cryptomus] tx registrada: ${amount} ${currency} mander=${manderId} display_id=${displayId}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/cryptomus
// ──────────────────────────────────────────────────────────────────────────────
router.post("/webhooks/cryptomus", async (req: Request, res: Response) => {
  const params: Record<string, any> = req.body ?? {};

  console.log("[Cryptomus webhook] recibido:", JSON.stringify(params).slice(0, 500));

  // 1. Verificar firma
  if (CRYPTOMUS_PAYMENT_KEY) {
    if (!verifySignature(params, CRYPTOMUS_PAYMENT_KEY)) {
      console.warn("[Cryptomus webhook] firma inválida — rechazando");
      return res.status(400).json({ error: "invalid signature" });
    }
  }

  const status   = String(params.status ?? "");
  const orderId  = String(params.order_id ?? "");
  const currency = String(params.currency ?? "").toUpperCase();
  const network  = String(params.network ?? "").toUpperCase();
  const txHash   = String(params.txid ?? params.uuid ?? "");
  const paidAmt  = parseFloat(params.payment_amount_usd ?? params.payer_amount_usd ?? "0");

  // 2. Solo procesar status "paid" o "paid_over"
  if (status !== "paid" && status !== "paid_over") {
    console.log(`[Cryptomus webhook] status="${status}" — ignorado`);
    return res.status(200).json({ message: "ok" });
  }

  // 3. El order_id del static wallet tiene formato: cm_<manderId>_<CURRENCY>_<NETWORK>
  //    Extraer manderId para identificar al usuario
  const parts = orderId.split("_");
  if (parts.length < 4 || parts[0] !== "cm") {
    console.warn(`[Cryptomus webhook] order_id con formato inesperado: ${orderId}`);
    return res.status(200).json({ message: "ok" });
  }
  const manderId = parts[1];

  // 4. Buscar depósito permanente por order_id (almacenado en tx_hash)
  const depRes = await sbAdmin(
    `deposits?tx_hash=eq.${encodeURIComponent(orderId)}&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!depRes.ok) {
    console.error("[Cryptomus webhook] error buscando deposit:", await depRes.text());
    return res.status(500).json({ error: "db error" });
  }
  const [deposit] = await depRes.json();
  if (!deposit) {
    console.warn(`[Cryptomus webhook] deposit no encontrado para order_id=${orderId}`);
    return res.status(200).json({ message: "ok" });
  }

  // 5. Buscar perfil
  const profRes = await sbAdmin(
    `profiles?mander_id=eq.${encodeURIComponent(manderId)}&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!profRes.ok || !(await profRes.clone().json())?.[0]) {
    console.warn(`[Cryptomus webhook] profile no encontrado mander_id=${manderId}`);
    return res.status(200).json({ message: "ok" });
  }
  const [profile] = await profRes.json();

  // 6. Prevenir doble acreditación por el mismo txHash
  if (txHash) {
    const dupRes = await sbAdmin(
      `transactions?external_tx_id=eq.${encodeURIComponent(txHash)}&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (dupRes.ok) {
      const dups = await dupRes.json();
      if (dups?.length > 0) {
        console.log(`[Cryptomus webhook] txHash ${txHash} ya procesado — ignorando`);
        return res.status(200).json({ message: "ok" });
      }
    }
  }

  // 7. Calcular monto USD
  const casinoCoin = CM_TO_CASINO[currency]?.[network];
  const casinoCurrency = casinoCoin?.currency ?? currency;
  const casinoNetwork  = casinoCoin?.network  ?? network;
  let deltaUsd = paidAmt;
  if (!deltaUsd || deltaUsd <= 0) {
    const priceUsd = getPriceUsd(casinoCurrency);
    const cryptoAmt = parseFloat(params.payment_amount ?? params.payer_amount ?? "0");
    deltaUsd = cryptoAmt * priceUsd;
  }

  if (deltaUsd <= 0) {
    console.warn(`[Cryptomus webhook] monto 0 — ignorando`);
    return res.status(200).json({ message: "ok" });
  }

  console.log(`[Cryptomus webhook] ACREDITANDO $${deltaUsd.toFixed(4)} (${currency}/${network}) → ${profile.username}`);

  // 8. Acreditar balance
  await addToProfileBalance(profile.mander_id, deltaUsd);

  // 9. Registrar transacción
  await insertTransaction(
    profile.mander_id, deposit.user_id,
    deltaUsd, casinoCurrency, casinoNetwork,
    txHash || orderId, deposit.id,
  );

  // 10. Actualizar affiliate stats
  try {
    const refRes = await sbAdmin(
      `referrals?referred_id=eq.${encodeURIComponent(deposit.user_id)}&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (refRes.ok) {
      const [referral] = await refRes.json();
      if (referral && !referral.is_ftd) {
        await sbAdmin(`referrals?id=eq.${referral.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            total_deposits:    (referral.total_deposits ?? 0) + deltaUsd,
            commission_earned: (referral.commission_earned ?? 0) + deltaUsd * 0.05,
            is_ftd:            true,
            updated_at:        new Date().toISOString(),
          }),
        });
      }
    }
  } catch (e: any) {
    console.error("[Cryptomus webhook] error affiliate:", e.message);
  }

  return res.status(200).json({ message: "ok" });
});

export { CRYPTOMUS_BASE, CRYPTOMUS_MERCHANT, CRYPTOMUS_PAYMENT_KEY };
export default router;
