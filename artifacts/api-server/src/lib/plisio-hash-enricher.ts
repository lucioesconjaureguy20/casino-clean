/**
 * plisio-hash-enricher.ts
 *
 * Background service that enriches completed deposit transactions with the
 * real blockchain tx hash from Plisio, for deposits that were auto-confirmed
 * before the poller had a chance to fetch the hash.
 *
 * Only touches the `transactions` table (display field) — never the deposits
 * table or any deposit processing logic.
 */

import { fetchWithTimeout } from "./fetchWithTimeout";

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const PLISIO_SECRET_KEY    = process.env.PLISIO_SECRET_KEY;

const ENRICH_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
}

const isBlockchainHash = (h: string) =>
  /^0x[0-9a-fA-F]{40,}/i.test(h) || /^[0-9a-fA-F]{64}$/i.test(h);

function isPlisioInvoiceId(txHash: string): boolean {
  if (!txHash || txHash === "pending") return false;
  if (txHash.startsWith("manual_") || txHash.startsWith("np_") || txHash.startsWith("auto_")) return false;
  if (txHash.startsWith("0x") && txHash.length > 40) return false;
  return txHash.length >= 20 && txHash.length <= 32 && /^[a-f0-9]+$/i.test(txHash);
}

function extractBlockchainHash(inv: any): string | null {
  const rawTxId = inv.tx_id ?? inv.txid;
  const txIdStr = Array.isArray(rawTxId) ? rawTxId[0] : rawTxId;
  if (txIdStr && typeof txIdStr === "string" && isBlockchainHash(txIdStr)) return txIdStr;

  const urls = Array.isArray(inv.tx_url)
    ? inv.tx_url
    : inv.tx_url ? [inv.tx_url] : [];
  for (const url of urls) {
    const m1 = String(url).match(/\/tx\/(0x[0-9a-fA-F]{40,})/i);
    if (m1) return m1[1];
    const m2 = String(url).match(/\/(?:tx|transaction)\/([0-9a-fA-F]{64})/i);
    if (m2) return m2[1];
  }
  return null;
}

async function fetchHashFromPlisio(invoiceId: string): Promise<string | null> {
  if (!PLISIO_SECRET_KEY) return null;

  try {
    const r = await fetchWithTimeout(
      `https://plisio.net/api/v1/invoices/${invoiceId}?api_key=${PLISIO_SECRET_KEY}`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!r.ok) return null;
    const raw: any = await r.json();
    if (raw?.status !== "success") return null;
    const inv = raw.data?.invoice ?? raw.data;
    return extractBlockchainHash(inv);
  } catch {
    return null;
  }
}

async function enrichPendingTxs() {
  if (!PLISIO_SECRET_KEY) return;

  try {
    // Find deposit transactions with no real blockchain hash
    const res = await sbAdmin(
      `transactions?external_tx_id=like.auto_*&type=eq.deposit&status=eq.completed&select=id,notes,external_tx_id&limit=50`,
      { headers: { Prefer: "count=none" } },
    );
    if (!res.ok) return;

    const txs: any[] = await res.json().catch(() => []);
    if (!txs.length) return;

    console.log(`[plisio-hash-enricher] ${txs.length} depósito(s) sin hash — buscando en Plisio`);

    for (const tx of txs) {
      try {
        const notes = String(tx.notes ?? "");

        // Extract deposit_id from notes
        const m = notes.match(/deposit_id:(\d+)/);
        if (!m) continue;
        const depositId = m[1];

        // Get the Plisio invoice ID from the deposits table
        const depRes = await sbAdmin(
          `deposits?id=eq.${depositId}&select=id,tx_hash&limit=1`,
          { headers: { Prefer: "count=none" } },
        );
        if (!depRes.ok) continue;
        const [dep] = await depRes.json().catch(() => []);
        if (!dep?.tx_hash || !isPlisioInvoiceId(dep.tx_hash)) continue;

        const invoiceId = dep.tx_hash;

        // Ask Plisio for the real blockchain hash
        const blockchainHash = await fetchHashFromPlisio(invoiceId);
        if (!blockchainHash) {
          console.log(`[plisio-hash-enricher] tx=${tx.id} dep=${depositId} — hash aún no disponible en Plisio`);
          continue;
        }

        // Update transactions.external_tx_id and add TX: to notes (display only)
        const newNotes = notes.includes("TX:") ? notes : `${notes} TX:${blockchainHash}`;
        const patchRes = await sbAdmin(`transactions?id=eq.${tx.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            external_tx_id: blockchainHash,
            notes:          newNotes,
          }),
          headers: { Prefer: "return=minimal" },
        });

        if (patchRes.ok) {
          console.log(`[plisio-hash-enricher] ✓ tx=${tx.id} dep=${depositId} hash=${blockchainHash.slice(0, 20)}...`);
        }
      } catch (e: any) {
        console.error(`[plisio-hash-enricher] error tx=${tx.id}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error("[plisio-hash-enricher] error general:", e.message);
  }
}

export function startPlisioHashEnricher() {
  if (!PLISIO_SECRET_KEY) {
    console.log("[plisio-hash-enricher] PLISIO_SECRET_KEY no configurado — deshabilitado");
    return;
  }
  console.log("[plisio-hash-enricher] iniciado — revisando cada 2 minutos");
  // Run once shortly after startup, then on interval
  setTimeout(() => enrichPendingTxs(), 10_000);
  setInterval(() => enrichPendingTxs(), ENRICH_INTERVAL_MS);
}
