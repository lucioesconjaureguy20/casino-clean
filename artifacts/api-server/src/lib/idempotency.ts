/**
 * idempotency.ts — DB-backed idempotency (production-grade)
 *
 * Uses the `idempotency_keys` table via the `try_idempotency` PostgreSQL
 * function (INSERT … ON CONFLICT DO NOTHING).
 *
 * Guarantees:
 *  - Works across server restarts (data lives in DB, not memory)
 *  - Works across multiple server instances
 *  - `try_idempotency` is atomic — race-safe at DB level
 *
 * Run migration.sql in Supabase SQL Editor before deploying.
 */

import { rpc } from "./supabaseRpc";

export interface IdempotencyResult {
  /** true  → first time this key is seen; caller should proceed */
  isNew: boolean;
  /** true  → caller should abort (already processed) */
  isDuplicate: boolean;
}

/**
 * Attempt to claim an idempotency key.
 * Returns { isNew: true } if the key was inserted (safe to proceed).
 * Returns { isNew: false, isDuplicate: true } if the key already exists.
 * Throws if the DB call itself fails.
 */
export async function tryIdempotency(key: string, userId: string): Promise<IdempotencyResult> {
  const result = await rpc<{ is_new: boolean }>("try_idempotency", {
    p_key:     key,
    p_user_id: userId,
  });

  return {
    isNew:       result.is_new === true,
    isDuplicate: result.is_new !== true,
  };
}
