/**
 * supabaseRpc.ts
 *
 * Typed helper for calling Supabase PostgreSQL RPC functions.
 * All critical financial operations go through RPC functions that run as
 * proper PostgreSQL transactions — atomicity and isolation guaranteed at DB level.
 */

import { fetchWithTimeout } from "./fetchWithTimeout";

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

export async function rpc<T = any>(funcName: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/${funcName}`, {
    method:  "POST",
    headers: {
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[RPC] ${funcName} failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}
