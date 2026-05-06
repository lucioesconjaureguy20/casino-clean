import { getPriceUsd } from "./prices.js";

/**
 * Converts a transaction row to its USD value.
 *
 * Two formats exist in the transactions table:
 *  1. Plisio-poller rows (notes starts with "plisio:" or contains "poller dep="):
 *     `amount` was stored as the USD value at credit time.
 *     Use the `usd:XX` tag in notes when present; fall back to raw amount.
 *  2. All other rows (deposit_id:XXX, NowPayments, manual confirms):
 *     `amount` is the native crypto quantity.
 *     Convert with the live price.
 */
export function txToUsd(d: { amount: unknown; currency: unknown; notes: unknown }): number {
  const notes    = typeof d.notes    === "string" ? d.notes    : "";
  const currency = typeof d.currency === "string" ? d.currency : "USDT";
  const amount   = parseFloat(String(d.amount ?? 0)) || 0;

  if (notes.startsWith("plisio:") || /poller dep=/i.test(notes)) {
    const m = notes.match(/usd:([\d.]+)/i);
    return m ? parseFloat(m[1]) : amount;
  }
  return amount * getPriceUsd(currency.trim().toUpperCase());
}
