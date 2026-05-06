import { getPriceUsd } from "./prices";
import { nextDepositDisplayId } from "./counters";
import { fetchWithTimeout } from "./fetchWithTimeout";
import { creditBalanceNative, atomicProfileBalanceDelta, getBalanceUsd, insertWagerReset, WAGER_CYCLE_RESET_THRESHOLD_USD } from "./atomicBalance";
import { sendTelegramDeposit, getRefTag } from "./telegram";

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const PLISIO_SECRET_KEY    = process.env.PLISIO_SECRET_KEY;
const MIN_DEPOSIT_USD      = 5;
const POLL_INTERVAL_MS     = 60_000;

const PLISIO_TO_CASINO: Record<string, { currency: string; network: string }> = {
  USDT_TRX:  { currency: "USDT", network: "TRC20" },
  USDT_BSC:  { currency: "USDT", network: "BEP20" },
  USDT:      { currency: "USDT", network: "ERC20"  },
  USDT_SOL:  { currency: "USDT", network: "SOL"    },
  USDC_BSC:  { currency: "USDC", network: "BEP20"  },
  USDC:      { currency: "USDC", network: "ERC20"  },
  USDC_SOL:  { currency: "USDC", network: "SOL"    },
  ETH:       { currency: "ETH",  network: "ERC20"  },
  BTC:       { currency: "BTC",  network: "BTC"    },
  LTC:       { currency: "LTC",  network: "LTC"    },
  TRX:       { currency: "TRX",  network: "TRC20"  },
  BNB:       { currency: "BNB",  network: "BEP20"  },
  SOL:       { currency: "SOL",  network: "SOL"    },
};


function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
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

function isPlisioInvoiceId(txHash: string): boolean {
  if (!txHash) return false;
  if (txHash === "pending") return false;
  if (txHash.startsWith("manual_")) return false;
  if (txHash.startsWith("np_")) return false;
  if (txHash.startsWith("0x") && txHash.length > 40) return false;
  return txHash.length >= 20 && txHash.length <= 32 && /^[a-f0-9]+$/i.test(txHash);
}

// ── Cache de operaciones Plisio para evitar rate limits ──────────────────────
let cachedOperations: any[] = [];
let lastOpsFetch = 0;
const OPS_CACHE_MS = 12_000; // refrescar no más de cada 12s

async function fetchPlisioOperations(): Promise<any[]> {
  const now = Date.now();
  if (now - lastOpsFetch < OPS_CACHE_MS && cachedOperations.length > 0) {
    return cachedOperations;
  }

  try {
    // Intenta /operations primero (lista todas las transacciones entrantes)
    const r = await fetch(
      `https://plisio.net/api/v1/operations?api_key=${PLISIO_SECRET_KEY}&page=0&limit=50`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!r.ok) {
      console.warn(`[plisio-poller] /operations HTTP ${r.status}`);
      return cachedOperations;
    }
    const raw: any = await r.json();
    if (raw?.status !== "success") {
      console.warn("[plisio-poller] /operations error:", JSON.stringify(raw).slice(0, 200));
      return cachedOperations;
    }
    const ops: any[] = Array.isArray(raw?.data?.data) ? raw.data.data
      : Array.isArray(raw?.data) ? raw.data
      : [];
    cachedOperations = ops;
    lastOpsFetch = now;
    return ops;
  } catch (e: any) {
    console.warn("[plisio-poller] /operations fetch error:", e.message);
    return cachedOperations;
  }
}

async function checkAndCredit(deposit: any) {
  const txnId = deposit.tx_hash;
  if (!isPlisioInvoiceId(txnId)) return;

  try {
    // Buscar esta factura en la lista de operaciones (sin restricción de IP)
    const ops = await fetchPlisioOperations();
    const op = ops.find((o: any) => o.txn_id === txnId || o.id === txnId || o.order_number === String(deposit.id));

    if (ops.length > 0 && !op) {
      // Loguear los IDs disponibles para ayudar a debug
      const sample = ops.slice(0, 5).map((o: any) => ({ txn_id: o.txn_id, id: o.id, order: o.order_number, status: o.status }));
      console.log(`[plisio-poller] dep=${deposit.id} NO encontrado en /operations (${ops.length} ops). Muestra:`, JSON.stringify(sample));
    }

    if (!op) {
      // Si /operations no tiene el txn, intentar el endpoint directo como fallback
      try {
        const r = await fetch(
          `https://plisio.net/api/v1/invoices/${txnId}?api_key=${PLISIO_SECRET_KEY}`,
          { signal: AbortSignal.timeout(12000) },
        );
        if (!r.ok) return;
        const raw: any = await r.json();
        // Log completo para dep con status!=new (para debug de pagos atascados)
        if (deposit.id === 209 || (raw?.data?.invoice?.status ?? raw?.data?.status) !== "new") {
          console.log(`[plisio-poller] /invoices raw dep=${deposit.id}:`, JSON.stringify(raw).slice(0, 500));
        }
        if (raw?.status !== "success") {
          if (raw?.data?.code === 104) {
            // IP bloqueada — silenciar error repetitivo
          } else {
            console.warn(`[plisio-poller] /invoices no-success dep=${deposit.id}:`, JSON.stringify(raw).slice(0, 150));
          }
          return;
        }
        const inv = raw.data?.invoice ?? raw.data;
        await creditIfConfirmed(deposit, txnId, inv);
      } catch (_) { /* ignorar si también falla */ }
      return;
    }

    console.log(`[plisio-poller] dep=${deposit.id} encontrado en /operations:`, JSON.stringify(op).slice(0, 300));
    await creditIfConfirmed(deposit, txnId, op);

  } catch (e: any) {
    console.error(`[plisio-poller] error dep=${deposit.id}:`, e.message);
  }
}

async function creditIfConfirmed(deposit: any, txnId: string, inv: any) {
  const status = inv?.status ?? "";

  // Usar received_amount solo si es un número positivo; si no, caer al monto de la factura
  const receivedNum = parseFloat(inv?.received_amount ?? "0");
  const invoiceNum  = parseFloat(inv?.amount ?? "0");
  const cryptoAmt   = receivedNum > 0 ? receivedNum : invoiceNum;

  console.log(`[plisio-poller] dep=${deposit.id} txn=${txnId} status=${status} crypto=${cryptoAmt} (recv=${receivedNum} inv=${invoiceNum})`);

  // Actualizar amount en DB solo cuando tenemos el monto real on-chain (received_amount > 0)
  // Esto garantiza que el usuario vea la cantidad exacta que envió, no el monto del invoice
  const amountToStore = receivedNum > 0 ? receivedNum : (status === "completed" || status === "mismatch" ? cryptoAmt : 0);
  if (amountToStore > 0 && deposit.amount !== amountToStore) {
    await sbAdmin(`deposits?id=eq.${deposit.id}`, {
      method: "PATCH",
      body: JSON.stringify({ amount: amountToStore }),
    }).catch(() => {});
    console.log(`[plisio-poller] dep=${deposit.id} amount actualizado → ${amountToStore} (recv=${receivedNum} status=${status})`);
  }

  if (status !== "completed" && status !== "mismatch") return;

  const psysCid   = inv.psys_cid ?? inv.currency ?? "";
  const casinoCoin = PLISIO_TO_CASINO[psysCid];
  if (!casinoCoin) {
    console.warn(`[plisio-poller] psys_cid desconocido: ${psysCid} dep=${deposit.id}`);
    return;
  }
  const { currency, network } = casinoCoin;

  if (!cryptoAmt || cryptoAmt <= 0) {
    console.warn(`[plisio-poller] cryptoAmt inválido dep=${deposit.id}`);
    return;
  }
  const priceUsd = getPriceUsd(currency);
  const deltaUsd = cryptoAmt * priceUsd;

  if (deltaUsd < MIN_DEPOSIT_USD) {
    console.warn(`[plisio-poller] por debajo del mínimo $${deltaUsd.toFixed(2)} dep=${deposit.id}`);
    return;
  }

  const profRes = await sbAdmin(`profiles?id=eq.${encodeURIComponent(deposit.user_id)}&limit=1`, {
    headers: { Prefer: "count=none" },
  });
  if (!profRes.ok) return;
  const [profile] = await profRes.json();
  if (!profile) return;

  const manderId = profile.mander_id;
  const now = new Date().toISOString();
  const cur = currency.trim().toUpperCase();

  const patchRes = await sbAdmin(`deposits?tx_hash=eq.${encodeURIComponent(txnId)}&status=eq.pending`, {
    method: "PATCH",
    body: JSON.stringify({ status: "confirmed", amount: cryptoAmt, confirmed_at: new Date().toISOString() }),
    headers: { Prefer: "return=representation" },
  });
  const patchBody = patchRes.ok ? await patchRes.json().catch(() => []) : await patchRes.text().catch(() => "?");
  console.log(`[plisio-poller] PATCH dep=${deposit.id} txn=${txnId} httpStatus=${patchRes.status} rows=${Array.isArray(patchBody) ? patchBody.length : patchBody}`);
  if (!patchRes.ok || (Array.isArray(patchBody) && patchBody.length === 0)) {
    console.log(`[plisio-poller] dep=${deposit.id} ya confirmado — abortando (dedup)`);
    return;
  }

  // Verificar si el saldo previo era ~$0 → nuevo ciclo de wagering
  const balBeforeUsd = await getBalanceUsd(manderId);
  if (balBeforeUsd < WAGER_CYCLE_RESET_THRESHOLD_USD) {
    await insertWagerReset(manderId, deposit.user_id);
  }

  // Atomic balance credit (replaces old read-modify-write)
  const balResult = await creditBalanceNative(manderId, cur, cryptoAmt, deposit.user_id);
  if (balResult.ok) {
    console.log(`[plisio-poller] balances +${cryptoAmt} ${cur} mander=${manderId} new=${balResult.newBalance}`);
  } else {
    console.error(`[plisio-poller] creditBalanceNative failed: ${balResult.error} mander=${manderId}`);
  }

  // Atomic profile balance update
  await atomicProfileBalanceDelta(manderId, deltaUsd);
  console.log(`[plisio-poller] profiles.balance Δ${deltaUsd.toFixed(2)} USD mander=${manderId}`);

  // Extraer hash real de blockchain desde la respuesta de Plisio
  const isBlockchainHash = (h: string) => /^0x[0-9a-fA-F]{40,}/i.test(h) || /^[0-9a-fA-F]{64}$/i.test(h);
  const extractBlockchainHash = (inv: any): string | null => {
    const rawTxId = inv.tx_id ?? inv.txid;
    const txIdStr = Array.isArray(rawTxId) ? rawTxId[0] : rawTxId;
    if (txIdStr && typeof txIdStr === "string" && isBlockchainHash(txIdStr)) return txIdStr;
    const urls = Array.isArray(inv.tx_url) ? inv.tx_url : (inv.tx_url ? [inv.tx_url] : []);
    for (const url of urls) {
      const m1 = String(url).match(/\/tx\/(0x[0-9a-fA-F]{40,})/i); if (m1) return m1[1];
      const m2 = String(url).match(/\/(?:tx|transaction)\/([0-9a-fA-F]{64})/i); if (m2) return m2[1];
    }
    return null;
  };
  const blockchainHash = extractBlockchainHash(inv);
  const addrNote = deposit.address && deposit.address !== "pending" ? ` ADDR:${deposit.address}` : "";
  const hashNote = blockchainHash ? ` TX:${blockchainHash}` : "";

  // Dedup: no insertar transacción si ya existe una para este deposit (creada por webhook O poller)
  const dupCheck = await sbAdmin(
    `transactions?or=(notes.like.*deposit_id:${deposit.id}*,notes.like.*dep=${deposit.id} *)&type=eq.deposit&limit=1`,
    { headers: { Prefer: "count=none" } },
  ).catch(() => null);
  const dupRows: any[] = dupCheck?.ok ? await dupCheck.json().catch(() => []) : [];
  if (dupRows.length > 0) {
    console.log(`[plisio-poller] TX ya existe para dep=${deposit.id} — saltando inserción (dedup)`);
    console.log(`[plisio-poller] ACREDITADO crypto=${cryptoAmt} ${cur} ($${deltaUsd.toFixed(2)}) user=${profile.username} dep=${deposit.id}`);
    return;
  }

  const displayId = nextDepositDisplayId();

  // amount en cripto — el wagering check multiplica amount × getPriceUsd(currency)
  await sbAdmin("transactions", {
    method: "POST",
    body: JSON.stringify({
      user_id:        deposit.user_id,
      mander_id:      manderId,
      display_id:     displayId,
      type:           "deposit",
      amount:         cryptoAmt,
      currency:       cur,
      network,
      status:         "completed",
      external_tx_id: blockchainHash ?? txnId,
      notes:          `plisio:${txnId} poller dep=${deposit.id} crypto=${cryptoAmt}${addrNote}${hashNote} usd:${deltaUsd.toFixed(2)}`,
      completed_at:   now,
    }),
  });

  console.log(`[plisio-poller] ACREDITADO crypto=${cryptoAmt} ${cur} ($${deltaUsd.toFixed(2)}) user=${profile.username} dep=${deposit.id}`);

  // Notificar al grupo de Telegram
  getRefTag(profile.username).then(refTag =>
    sendTelegramDeposit(
      `💸 <b>Nuevo depósito confirmado</b>\n` +
      `👤 Usuario: <b>${profile.username}</b>${refTag}\n` +
      `💰 Monto: <b>${cryptoAmt} ${cur}</b> (~$${deltaUsd.toFixed(2)} USD)\n` +
      `🌐 Red: <b>${network}</b>\n` +
      `🆔 Dep ID: <code>${deposit.id}</code>`,
    )
  ).catch(() => {});
}

async function poll() {
  if (!PLISIO_SECRET_KEY) return;

  try {
    const r = await sbAdmin(
      "deposits?status=eq.pending&order=created_at.desc&limit=50",
      { headers: { Prefer: "count=none" } },
    );
    if (!r.ok) return;
    const deposits: any[] = await r.json();

    const plisioDeps = deposits.filter(d => isPlisioInvoiceId(d.tx_hash));
    if (plisioDeps.length > 0) {
      console.log(`[plisio-poller] revisando ${plisioDeps.length} depósitos pendientes`);
    }

    for (const dep of plisioDeps) {
      await checkAndCredit(dep);
    }
  } catch (e: any) {
    console.error("[plisio-poller] error general:", e.message);
  }
}

export function startPlisioPoller() {
  console.log(`[plisio-poller] iniciado — revisando cada ${POLL_INTERVAL_MS / 1000}s`);
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}
