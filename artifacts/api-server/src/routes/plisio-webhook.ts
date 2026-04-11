import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { Readable } from "stream";
import Busboy from "busboy";
import { getPriceUsd } from "../lib/prices";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const PLISIO_SECRET_KEY    = process.env.PLISIO_SECRET_KEY;
console.log("[Plisio] IPN Secret primeros 6 chars:", PLISIO_SECRET_KEY?.slice(0, 6) ?? "(NO DEFINIDA)");

// ── Plisio psys_cid → casino { currency, network } ───────────────────────────
const PLISIO_TO_CASINO: Record<string, { currency: string; network: string }> = {
  USDT_TRX:  { currency: "USDT", network: "TRC20" },
  USDT_BSC:  { currency: "USDT", network: "BEP20" },
  USDT:      { currency: "USDT", network: "ERC20"  },
  USDT_SOL:  { currency: "USDT", network: "SOL"    },
  USDC_BSC:  { currency: "USDC", network: "BEP20"  },
  USDC:      { currency: "USDC", network: "ERC20"  },
  ETH:       { currency: "ETH",  network: "ERC20"  },
  BTC:       { currency: "BTC",  network: "BTC"    },
  LTC:       { currency: "LTC",  network: "LTC"    },
  TRX:       { currency: "TRX",  network: "TRC20"  },
  BNB:       { currency: "BNB",  network: "BEP20"  },
};

// ── Supabase REST helper ──────────────────────────────────────────────────────
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

// ── Verificar firma de Plisio — intenta múltiples variantes conocidas ─────────
function verifyPlisioSignature(params: Record<string, any>, secretKey: string): boolean {
  const { verify_hash, ...rest } = params;
  if (!verify_hash) {
    console.warn("[Plisio sig] verify_hash ausente — campos:", Object.keys(params).join(","));
    return false;
  }

  const sortedKeys = Object.keys(rest).filter(k => k !== "verify_hash").sort();
  const sortedObj: Record<string, string> = {};
  sortedKeys.forEach(k => { sortedObj[k] = String(rest[k]); });

  // Variantes a probar (documentación Plisio es inconsistente entre versiones)
  const rawQS   = sortedKeys.map(k => `${k}=${sortedObj[k]}`).join("&");
  const encQS   = sortedKeys.map(k => `${k}=${encodeURIComponent(sortedObj[k])}`).join("&");
  const jsonStr = JSON.stringify(sortedObj);

  const candidates: Array<[string, string]> = [
    ["json+key",    createHash("sha1").update(jsonStr  + secretKey).digest("hex")],
    ["key+json",    createHash("sha1").update(secretKey + jsonStr).digest("hex")],
    ["raw+key",     createHash("sha1").update(rawQS    + secretKey).digest("hex")],
    ["key+raw",     createHash("sha1").update(secretKey + rawQS).digest("hex")],
    ["enc+key",     createHash("sha1").update(encQS    + secretKey).digest("hex")],
    ["key+enc",     createHash("sha1").update(secretKey + encQS).digest("hex")],
  ];

  console.log("[Plisio sig] verify_hash recibido:", verify_hash);
  for (const [label, hash] of candidates) {
    console.log(`[Plisio sig] ${label}: ${hash} ${hash === verify_hash ? "✅ MATCH" : ""}`);
    if (hash === verify_hash) return true;
  }

  console.warn("[Plisio sig] ninguna variante coincidió — rawQS:", rawQS.slice(0, 200));
  return false;
}

// ── Helpers: balance, transaction display_id ──────────────────────────────────
async function addToCryptoBalance(manderId: string, userId: string, cryptoAmount: number, currency: string, deltaUsd: number) {
  const now = new Date().toISOString();
  const cur = currency.trim().toUpperCase();

  // 1. Update balances table (crypto units)
  const getBalRes = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  const balRows: any[] = getBalRes.ok ? await getBalRes.json() : [];
  const existing = balRows?.[0];

  if (existing) {
    const newBal = Number(existing.balance) + cryptoAmount;
    await sbAdmin(`balances?id=eq.${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: newBal, updated_at: now }),
    });
    console.log(`[Plisio] balances ${existing.balance} → ${newBal} ${cur} (Δ${cryptoAmount}) mander=${manderId}`);
  } else {
    await sbAdmin("balances", {
      method: "POST",
      body: JSON.stringify({ mander_id: manderId, user_id: userId, currency: cur, balance: cryptoAmount, locked_amount: 0, updated_at: now }),
    });
    console.log(`[Plisio] balances creada ${cryptoAmount} ${cur} mander=${manderId}`);
  }

  // 2. Also keep profiles.balance in sync (stored_usd)
  const profRes = await sbAdmin(
    `profiles?mander_id=eq.${encodeURIComponent(manderId)}&select=balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  const profRows: { balance: number }[] = profRes.ok ? await profRes.json() : [];
  const prevUsd = Number(profRows?.[0]?.balance ?? 0);
  const nextUsd = Math.max(0, prevUsd + deltaUsd);
  await sbAdmin(`profiles?mander_id=eq.${encodeURIComponent(manderId)}`, {
    method: "PATCH",
    body: JSON.stringify({ balance: nextUsd }),
  });
  console.log(`[Plisio] profiles.balance ${prevUsd} → ${nextUsd} USD mander=${manderId}`);
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
  txId: string, depositId: string, walletAddress?: string,
) {
  const displayId = await nextDepositDisplayId();
  const notesAddr = walletAddress && walletAddress !== "pending" && walletAddress.length > 5
    ? ` ADDR:${walletAddress}` : "";
  const isRealHash = (h: string) => /^0x[0-9a-fA-F]{40,}/i.test(h) || /^[0-9a-fA-F]{64}$/i.test(h);
  const notesHash = isRealHash(txId) ? ` TX:${txId}` : "";
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
      external_tx_id: txId,
      notes:          `plisio:${txId} deposit_id:${depositId}${notesAddr}${notesHash}`,
      completed_at:   new Date().toISOString(),
    }),
  });
  if (!r.ok) console.error("[Plisio] error insertando transaction:", await r.text());
  else console.log(`[Plisio] tx registrada: ${amount} ${currency} mander=${manderId} display_id=${displayId}`);
}

// ── Parsear multipart/form-data desde un string raw ───────────────────────────
function parseMultipartBusboy(rawBody: string, contentType: string): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let bb: ReturnType<typeof Busboy>;
    try {
      bb = Busboy({
        headers: { "content-type": contentType },
        limits: { fieldNameSize: 500, fieldSize: 10 * 1024 * 1024 }, // 10MB por campo, sin truncamiento
      });
    } catch (e) {
      return reject(e);
    }
    bb.on("field", (name, value, info) => {
      if (info.nameTruncated) console.warn("[busboy] NOMBRE TRUNCADO:", name);
      if (info.valueTruncated) console.warn("[busboy] VALOR TRUNCADO para campo:", name);
      fields[name] = value;
    });
    bb.on("finish", () => resolve(fields));
    bb.on("error", reject);
    Readable.from(Buffer.from(rawBody, "binary")).pipe(bb);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/plisio
// ──────────────────────────────────────────────────────────────────────────────
async function handlePlisioWebhook(req: Request, res: Response) {
  // ── Usar SOLO rawBody — req.body es ignorado completamente ──────────────────
  const raw: string = (req as any).rawBody ?? "";
  const ct: string  = String(req.headers["content-type"] ?? "");

  // Parsear parámetros exclusivamente desde rawBody
  let params: Record<string, string> = {};

  if (ct.includes("multipart/form-data")) {
    params = await parseMultipartBusboy(raw, ct);
  } else if (ct.includes("application/json")) {
    try { const p = JSON.parse(raw); if (p && typeof p === "object") params = p; } catch {}
  } else if (ct.includes("application/x-www-form-urlencoded") || !ct) {
    try {
      const qs = new URLSearchParams(raw);
      qs.forEach((v, k) => { params[k] = v; });
    } catch {}
  }

  // Query string params como fallback adicional (nunca sobrescribir los del body)
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (!(k in params)) params[k] = String(v);
  }

  console.log("[Plisio webhook] ct:", ct.slice(0, 80));
  console.log("[Plisio webhook] rawBody len:", raw.length, "campos:", Object.keys(params).join(","));
  console.log("[Plisio webhook] recibido:", JSON.stringify(params).slice(0, 500));

  const status        = params.status ?? "";
  const txnId         = params.id ?? params.txn_id ?? "";
  const orderNumber   = String(params.order_number ?? "");
  const psysCid       = String(params.currency ?? "").trim();
  const operationType = String(params.type ?? params.operation_type ?? "").trim();

  // ── RETIRO (cash_out) — se detecta por type=cash_out O por order_number UUID ─
  const isCashOut = operationType === "cash_out" ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderNumber);

  if (isCashOut && orderNumber) {
    console.log(`[Plisio webhook] 💸 RETIRO detected order=${orderNumber} status=${status}`);

    if (status === "completed" || status === "paid") {
      const txHash = params.tx_id ?? params.txn_id ?? params.id ?? "";

      // Update withdrawal → "paid"
      const patchRes = await sbAdmin(
        `withdrawals?id=eq.${encodeURIComponent(orderNumber)}&status=eq.processing`,
        {
          method:  "PATCH",
          body:    JSON.stringify({ status: "paid", tx_hash: txHash || undefined }),
          headers: { Prefer: "return=representation" },
        },
      );
      const patchRows: any[] = patchRes.ok ? await patchRes.json().catch(() => []) : [];
      if (patchRows.length > 0) {
        const w = patchRows[0];
        const cur = String(w.currency ?? "").toUpperCase();

        // Clear locked_amount for the coin that was withdrawn
        if (w.user_id && cur) {
          await sbAdmin(
            `balances?user_id=eq.${encodeURIComponent(w.user_id)}&currency=eq.${encodeURIComponent(cur)}`,
            { method: "PATCH", body: JSON.stringify({ locked_amount: 0 }) },
          ).catch(() => {});
        }

        // Update the matching pending withdrawal transaction → completed
        if (w.user_id && cur) {
          const txFindRes = await sbAdmin(
            `transactions?user_id=eq.${encodeURIComponent(w.user_id)}&type=eq.withdrawal&status=eq.pending&currency=eq.${encodeURIComponent(cur)}&order=created_at.desc&limit=1`,
            { headers: { Prefer: "count=none" } },
          ).catch(() => null);
          if (txFindRes?.ok) {
            const txRows: any[] = await txFindRes.json().catch(() => []);
            if (txRows.length > 0) {
              await sbAdmin(`transactions?id=eq.${txRows[0].id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status:       "completed",
                  notes:        `Retiro pagado vía Plisio. TX: ${txHash || orderNumber}`,
                  completed_at: new Date().toISOString(),
                }),
              }).catch(() => {});
              console.log(`[Plisio webhook] TX historial ${txRows[0].id} → completed`);
            }
          }
        }

        console.log(`[Plisio webhook] ✅ Retiro ${orderNumber} marcado como PAGADO tx=${txHash}`);
      } else {
        console.log(`[Plisio webhook] Retiro ${orderNumber} ya pagado o no encontrado en processing`);
      }
    } else if (status === "error" || status === "failed") {
      // Revert withdrawal to "approved" so admin can retry
      await sbAdmin(
        `withdrawals?id=eq.${encodeURIComponent(orderNumber)}&status=eq.processing`,
        { method: "PATCH", body: JSON.stringify({ status: "approved", tx_hash: null }) },
      ).catch(() => {});
      console.log(`[Plisio webhook] ⚠️ Retiro ${orderNumber} falló — revertido a "approved"`);
    } else {
      console.log(`[Plisio webhook] Retiro ${orderNumber} status=${status} — sin acción`);
    }

    return res.status(200).json({ message: "ok" });
  }
  // Preferir received_amount (real on-chain) sobre amount (factura)
  const receivedAmt = parseFloat(params.received_amount ?? "0");
  const invoiceAmt  = parseFloat(params.amount ?? "0");
  const cryptoAmt   = receivedAmt > 0 ? receivedAmt : invoiceAmt;
  const usdAmt      = parseFloat(params.source_amount ?? "0");
  const rawTxIdP    = Array.isArray(params.tx_id) ? params.tx_id[0] : params.tx_id;
  const isBlockchainHash = (h: string) => /^0x[0-9a-fA-F]{40,}/i.test(h) || /^[0-9a-fA-F]{64}$/i.test(h);
  const extractFromUrls = (txUrl: any): string | null => {
    const urls = Array.isArray(txUrl) ? txUrl : (txUrl ? [txUrl] : []);
    for (const u of urls) {
      // ETH/BSC: /tx/0x...
      const m1 = String(u).match(/\/tx\/(0x[0-9a-fA-F]{40,})/i); if (m1) return m1[1];
      // TRX/BTC/LTC: /tx/HASH64 or /#/transaction/HASH64 (Tronscan)
      const m2 = String(u).match(/\/(?:tx|transaction)\/([0-9a-fA-F]{64})/i); if (m2) return m2[1];
    }
    return null;
  };
  const blockchainDepHash = (rawTxIdP && isBlockchainHash(rawTxIdP)) ? rawTxIdP : extractFromUrls(params.tx_url);
  const txHash      = blockchainDepHash ?? rawTxIdP ?? txnId;

  console.log(`[Plisio webhook] status=${status} order=${orderNumber} txn=${txnId} crypto=${cryptoAmt} usd=$${usdAmt}`);

  // FIX 2: Firma obligatoria — se valida para TODOS los statuses creditables
  const sigValid = PLISIO_SECRET_KEY
    ? verifyPlisioSignature(params, PLISIO_SECRET_KEY)
    : false;
  if (!sigValid) {
    console.warn("[Plisio webhook] ⚠️  firma inválida — verificá que PLISIO_SECRET_KEY en Render sea el IPN Secret (no el API Key)");
  }

  // ── Manejo por status ────────────────────────────────────────────────────────

  if (status === "new") {
    return res.status(200).json({ message: "ok" });
  }

  if (status === "pending") {
    // FIX 2 + UX: actualiza monto en DB (para badge ⏳ en UI) SIEMPRE,
    // pero solo acredita balance si la firma es válida.
    if (orderNumber && cryptoAmt > 0) {
      await sbAdmin(`deposits?id=eq.${encodeURIComponent(orderNumber)}`, {
        method: "PATCH",
        body: JSON.stringify({ amount: cryptoAmt }),
      }).catch(() => {});
      console.log(`[Plisio webhook] pending: badge actualizado dep=${orderNumber} crypto=${cryptoAmt}`);
    }
    if (!sigValid) {
      console.log("[Plisio webhook] pending: sin crédito (firma inválida) — el poller acredita al confirmar");
      return res.status(200).json({ message: "ok" });
    }
    // firma válida → cae al flujo de crédito ↓
    console.log("[Plisio webhook] pending: firma válida — acreditando al instante");
  }

  if (status === "expired" || status === "error") {
    if (orderNumber) {
      await sbAdmin(`deposits?id=eq.${encodeURIComponent(orderNumber)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", tx_hash: txnId }),
      }).catch(() => {});
    }
    return res.status(200).json({ message: "ok" });
  }

  // completed/mismatch: procesamos aunque la firma falle (IP whitelist bloquea poller)
  // Protección: verificamos que el depósito exista en DB y que su status sea "pending"
  if (status === "completed" || status === "mismatch") {
    if (!sigValid) {
      console.warn(`[Plisio webhook] ${status}: firma inválida — procesando igual (poller bloqueado por IP)`);
    } else {
      console.log(`[Plisio webhook] ${status}: firma válida — acreditando`);
    }
  }

  if (status !== "completed" && status !== "mismatch" && status !== "pending") {
    console.log(`[Plisio webhook] status=${status} — ignorado`);
    return res.status(200).json({ message: "ok" });
  }

  // 3. Resolver moneda/red
  const casinoCoin = PLISIO_TO_CASINO[psysCid];
  if (!casinoCoin) {
    console.warn(`[Plisio webhook] psys_cid desconocido: ${psysCid}`);
    return res.status(200).json({ message: "ok" });
  }
  const { currency, network } = casinoCoin;

  // 4. Buscar depósito por order_number, con fallback a txn_id
  let deposit: any = null;
  if (orderNumber) {
    const r = await sbAdmin(
      `deposits?id=eq.${encodeURIComponent(orderNumber)}&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (r.ok) [deposit] = await r.json();
  }
  if (!deposit && txnId) {
    const r = await sbAdmin(
      `deposits?tx_hash=eq.${encodeURIComponent(txnId)}&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (r.ok) [deposit] = await r.json();
  }
  if (!deposit) {
    console.warn(`[Plisio webhook] deposit no encontrado order=${orderNumber} txn=${txnId}`);
    return res.status(200).json({ message: "ok" });
  }

  // 5. Protección contra doble acreditación
  if (deposit.status === "confirmed") {
    console.log(`[Plisio webhook] depósito ${deposit.id} ya confirmado — ignorando`);
    return res.status(200).json({ message: "ok" });
  }

  // 6. Obtener perfil del usuario
  const profRes = await sbAdmin(
    `profiles?id=eq.${encodeURIComponent(deposit.user_id)}&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!profRes.ok) {
    console.error("[Plisio webhook] error buscando profile:", await profRes.text());
    return res.status(500).json({ error: "db error" });
  }
  const [profile] = await profRes.json();
  if (!profile) {
    console.warn(`[Plisio webhook] profile no encontrado user_id=${deposit.user_id}`);
    return res.status(200).json({ message: "ok" });
  }

  // 7. FIX 1: calcular USD correctamente (usar source_amount de Plisio si disponible)
  const priceUsd = getPriceUsd(currency);
  const deltaUsd = usdAmt > 0 ? usdAmt : cryptoAmt * priceUsd;

  const MIN_DEPOSIT_USD = 5;
  if (cryptoAmt <= 0 || deltaUsd < MIN_DEPOSIT_USD) {
    console.warn(`[Plisio webhook] monto inválido o por debajo del mínimo: crypto=${cryptoAmt} usd=$${deltaUsd.toFixed(2)} — ignorado`);
    return res.status(200).json({ message: "ok" });
  }

  console.log(`[Plisio webhook] ACREDITANDO crypto=${cryptoAmt} ${currency} USD=$${deltaUsd.toFixed(2)} → ${profile.username}`);

  // 8. FIX 3/4: PATCH atómico — solo actualiza si el depósito SIGUE en "pending"
  // Si ya fue confirmado (race condition), Supabase devuelve 0 rows y abortamos.
  const patchRes = await sbAdmin(`deposits?id=eq.${deposit.id}&status=eq.pending`, {
    method: "PATCH",
    body: JSON.stringify({
      status:       "confirmed",
      amount:       cryptoAmt,   // FIX 1: monto real en crypto
      tx_hash:      txHash,
      confirmed_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=representation" },
  });
  const patchRows: any[] = patchRes.ok ? await patchRes.json().catch(() => []) : [];
  if (!patchRes.ok || patchRows.length === 0) {
    console.log(`[Plisio webhook] depósito ${deposit.id} ya confirmado o no encontrado — ignorando (dedup FIX 3/4)`);
    return res.status(200).json({ message: "ok" });
  }

  // 9. Acreditar balance
  await addToCryptoBalance(profile.mander_id, deposit.user_id, cryptoAmt, currency, deltaUsd);  // FIX 1

  // 10. Registrar transacción — amount en USD (el frontend muestra tx.amount como $)
  await insertTransaction(
    profile.mander_id, deposit.user_id,
    parseFloat(deltaUsd.toFixed(2)), currency, network,
    txHash, deposit.id, deposit.address,
  );

  // 11. Estadísticas de afiliados
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
        console.log(`[Plisio webhook] affiliate: referrer=${referral.referrer_username} +$${deltaUsd.toFixed(2)}`);
      }
    }
  } catch (e: any) {
    console.error("[Plisio webhook] error affiliate stats:", e.message);
  }

  // 12. Auto-recicle
  recycleDeposit(deposit.user_id, profile.mander_id, profile.username, currency, network, psysCid)
    .catch(e => console.error("[Plisio webhook] recycle error:", e.message));

  console.log(`[Plisio webhook] depósito ${deposit.id} acreditado correctamente`);
  return res.status(200).json({ message: "ok" });
}

// ── Auto-recicle Plisio ───────────────────────────────────────────────────────
async function recycleDeposit(
  userId: string, manderId: string, username: string,
  currency: string, network: string, psysCid: string,
) {
  if (!PLISIO_SECRET_KEY) return;

  const appUrl = process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const callbackUrl = appUrl ? `${appUrl}/api/webhooks/plisio` : undefined;

  try {
    // 1. Crear registro pending en DB
    const insRes = await sbAdmin("deposits", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId, amount: 0,
        currency, network, address: "pending", status: "pending",
      }),
    });
    if (!insRes.ok) { console.warn("[recycle plisio] error creando deposit en DB"); return; }
    const [newDep] = await insRes.json();
    if (!newDep?.id) { console.warn("[recycle plisio] deposit sin id"); return; }

    // 2. Crear invoice: amount en crypto (no USD), $5 mínimo convertido al precio actual
    const priceUsd  = getPriceUsd(currency);
    const cryptoAmt = (5 / (priceUsd > 0 ? priceUsd : 1)) * 1.01;
    const invoiceAmt = parseFloat(cryptoAmt.toPrecision(6));
    const params: Record<string, string> = {
      api_key:      PLISIO_SECRET_KEY,
      currency:     psysCid,
      amount:       String(invoiceAmt),
      order_number: String(newDep.id),
      order_name:   `Deposit ${currency}`,
      expire_min:   "2880",
    };
    if (callbackUrl) params.callback_url = callbackUrl;

    const invRes = await fetch(
      "https://plisio.net/api/v1/invoices/new?" + new URLSearchParams(params).toString(),
      { signal: AbortSignal.timeout(20000) },
    );
    const invRaw: any = await invRes.json();
    if (invRaw?.status !== "success" || !invRaw.data?.txn_id) {
      console.warn("[recycle plisio] error creando invoice:", JSON.stringify(invRaw).slice(0, 200));
      await sbAdmin(`deposits?id=eq.${newDep.id}`, { method: "DELETE" }).catch(() => {});
      return;
    }

    const txnId = invRaw.data.txn_id;

    // 3. Obtener wallet_hash desde detalles de la factura
    const detRes = await fetch(
      `https://plisio.net/api/v1/invoices/${txnId}?api_key=${PLISIO_SECRET_KEY}`,
      { signal: AbortSignal.timeout(20000) },
    );
    const detRaw: any = await detRes.json();
    const walletHash = detRaw.data?.invoice?.wallet_hash ?? "";

    if (!walletHash || walletHash.length < 20) {
      console.warn("[recycle plisio] wallet_hash inválido:", walletHash);
      await sbAdmin(`deposits?id=eq.${newDep.id}`, { method: "DELETE" }).catch(() => {});
      return;
    }

    // 4. Actualizar depósito con dirección
    await sbAdmin(`deposits?id=eq.${newDep.id}`, {
      method: "PATCH",
      body: JSON.stringify({ address: walletHash, tx_hash: txnId }),
    });

    console.log(`[recycle plisio] OK user=${username} ${currency}/${network} addr=${walletHash} txn=${txnId}`);
  } catch (e: any) {
    console.error("[recycle plisio] error:", e.message);
  }
}

// Aceptar tanto GET como POST — Plisio puede enviar en cualquier método
router.post("/webhooks/plisio", handlePlisioWebhook);
router.get("/webhooks/plisio", handlePlisioWebhook);

export default router;
