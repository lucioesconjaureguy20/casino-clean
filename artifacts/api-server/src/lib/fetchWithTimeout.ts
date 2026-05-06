/**
 * fetchWithTimeout.ts
 *
 * Wrapper around fetch() that aborts after `timeoutMs` milliseconds.
 * Prevents indefinite hangs when upstream services (Supabase, etc.) are slow or unreachable.
 * Default timeout: 20 seconds.
 */
export function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}
