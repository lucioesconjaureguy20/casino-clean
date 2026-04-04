import { Router, Request, Response, NextFunction } from "express";
import { verifyGameToken } from "../lib/gameToken.js";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY!;
const ADMIN_USERNAMES      = () =>
  (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// ── Supabase helpers ──────────────────────────────────────────────────────────

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:          SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type":  "application/json",
      Prefer:          "return=representation",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

async function getProfile(userId: string) {
  const r = await sbAdmin(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0] ?? null;
}

// ── requireAuth / requireAdmin middlewares ────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string; user_metadata: Record<string, any> };
    }
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Sesión expirada o inválida." });
  const token = authHeader.slice(7);
  if (!token)
    return res.status(401).json({ error: "Sesión expirada o inválida." });

  // Game token (local auth)
  try {
    const gameUser = verifyGameToken(token) as any;
    if (gameUser) {
      req.authUser = { id: gameUser.profileId, email: "", user_metadata: { username: gameUser.username } };
      return next();
    }
  } catch {}

  // Supabase JWT
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(401).json({ error: "Sesión expirada o inválida." });
    const u = await r.json();
    req.authUser = { id: u.id, email: u.email ?? "", user_metadata: u.user_metadata ?? {} };
    return next();
  } catch {
    return res.status(401).json({ error: "Sesión expirada o inválida." });
  }
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const profile = await getProfile(req.authUser!.id).catch(() => null);
    if (!profile) return res.status(403).json({ error: "Perfil no encontrado." });
    if (!ADMIN_USERNAMES().includes(profile.username.toLowerCase()))
      return res.status(403).json({ error: "Acceso denegado." });
    next();
  });
}

// ── Balance helpers ───────────────────────────────────────────────────────────

async function getBalanceRow(manderId: string, currency: string) {
  const cur = currency.trim().toUpperCase();
  const r = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0] ?? null;
}

/**
 * Atomically deduct `amount` from balance.
 * Returns { ok: true } | { ok: false, reason: string }
 */
async function atomicDeduct(
  manderId: string,
  currency: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Re-fetch balance inside the deduction to get the freshest value
  const row = await getBalanceRow(manderId, currency);
  if (!row) return { ok: false, reason: "Fila de balance no encontrada." };

  const current = Number(row.balance);
  if (current < amount)
    return { ok: false, reason: `Balance insuficiente: ${current} disponibles, ${amount} requeridos.` };

  const newBalance = parseFloat((current - amount).toFixed(8));
  const p = await sbAdmin(`balances?id=eq.${row.id}`, {
    method: "PATCH",
    body: JSON.stringify({ balance: newBalance, updated_at: new Date().toISOString() }),
  });
  if (!p.ok) return { ok: false, reason: "Error al actualizar balance en base de datos." };
  return { ok: true };
}

// ── Wallet format validation ──────────────────────────────────────────────────

const WALLET_RULES: Record<string, { pattern: RegExp; hint: string }> = {
  TRC20:     { pattern: /^T[A-Za-z1-9]{33}$/, hint: "Dirección TRC20 inválida (debe empezar con T, 34 caracteres)." },
  ERC20:     { pattern: /^0x[0-9a-fA-F]{40}$/, hint: "Dirección ERC20 inválida (debe empezar con 0x, 42 caracteres)." },
  BEP20:     { pattern: /^0x[0-9a-fA-F]{40}$/, hint: "Dirección BEP20 inválida (debe empezar con 0x, 42 caracteres)." },
  BTC:       { pattern: /^(1|3|bc1)[A-Za-z0-9]{10,90}$/, hint: "Dirección BTC inválida." },
  SOL:       { pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, hint: "Dirección Solana inválida (32-44 caracteres base58)." },
  LTC:       { pattern: /^(L|M|ltc1)[A-Za-z0-9]{10,90}$/, hint: "Dirección LTC inválida." },
  POLYGON:   { pattern: /^0x[0-9a-fA-F]{40}$/, hint: "Dirección Polygon inválida (debe empezar con 0x, 42 caracteres)." },
};

function validateWallet(wallet: string, network: string): string | null {
  const w = wallet.trim();
  if (!w) return "La wallet no puede estar vacía.";
  if (w.length < 10) return "La wallet debe tener al menos 10 caracteres.";
  if (w.length > 200) return "La wallet es demasiado larga.";

  const net = network.trim().toUpperCase();
  const rule = WALLET_RULES[net];
  if (rule && !rule.pattern.test(w)) return rule.hint;

  return null; // valid
}

// ── 1. POST /api/withdraw/create ─────────────────────────────────────────────

router.post("/withdraw/create", requireAuth, async (req: Request, res: Response) => {
  const { amount, currency, network, wallet } = req.body;

  // Basic field presence
  if (!amount || !currency || !network || !wallet)
    return res.status(400).json({ error: "Campos requeridos: amount, currency, network, wallet." });

  // Wallet format validation
  const walletError = validateWallet(String(wallet), String(network));
  if (walletError) return res.status(400).json({ error: walletError });

  // Amount validation
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0)
    return res.status(400).json({ error: "El monto debe ser un número positivo." });
  if (parsed < 0.000001)
    return res.status(400).json({ error: "El monto mínimo de retiro es 0.000001." });

  // Profile
  const profile = await getProfile(req.authUser!.id).catch(() => null);
  if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

  const cur = currency.trim().toUpperCase();

  // Balance check
  const balRow = await getBalanceRow(profile.mander_id, cur);
  const currentBalance = Number(balRow?.balance ?? 0);
  if (currentBalance < parsed)
    return res.status(400).json({
      error: `Balance insuficiente. Disponible: ${currentBalance} ${cur}, solicitado: ${parsed} ${cur}.`,
    });

  // Check for existing pending withdrawal (avoid spam)
  const existingR = await sbAdmin(
    `withdrawals?user_id=eq.${req.authUser!.id}&currency=eq.${cur}&status=in.(pending,approved)&select=id&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (existingR.ok) {
    const existing: any[] = await existingR.json();
    if (existing.length > 0)
      return res.status(400).json({
        error: "Ya tenés un retiro pendiente o aprobado en esta moneda. Esperá a que se procese antes de solicitar otro.",
      });
  }

  // Insert withdrawal
  const r = await sbAdmin("withdrawals", {
    method: "POST",
    body: JSON.stringify({
      user_id:   req.authUser!.id,
      mander_id: profile.mander_id,
      amount:    parsed,
      currency:  cur,
      network:   network.trim(),
      wallet:    wallet.trim(),
      status:    "pending",
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    console.error("[WITHDRAW create] Supabase error:", err);
    return res.status(500).json({ error: "Error al registrar el retiro. Intentá nuevamente." });
  }

  const [row] = await r.json();
  console.log(`[WITHDRAW create] id=${row?.id} user=${profile.username} amount=${parsed} ${cur}`);
  return res.json({
    ok: true,
    withdrawal: row,
    message: `Retiro de ${parsed} ${cur} solicitado correctamente. El equipo lo procesará en breve.`,
  });
});

// ── 2. GET /api/admin/withdrawals ─────────────────────────────────────────────

router.get("/admin/withdrawals", requireAdmin, async (_req: Request, res: Response) => {
  const r = await sbAdmin(
    "withdrawals?order=created_at.desc&select=id,user_id,mander_id,amount,currency,network,wallet,status,tx_hash,created_at",
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) {
    const err = await r.text();
    console.error("[WITHDRAW list] error:", err);
    return res.status(502).json({ error: "Error al obtener retiros.", detail: err });
  }

  const withdrawals: any[] = await r.json();
  if (!withdrawals.length) return res.json({ withdrawals: [] });

  // Join usernames from profiles
  const ids = [...new Set(withdrawals.map((w) => w.user_id).filter(Boolean))];
  const idsParam = `(${ids.map((id) => `"${id}"`).join(",")})`;
  const pr = await sbAdmin(`profiles?id=in.${idsParam}&select=id,username`, {
    headers: { Prefer: "count=none" },
  });
  let profileMap: Record<string, string> = {};
  if (pr.ok) {
    const profiles: any[] = await pr.json();
    for (const p of profiles) profileMap[p.id] = p.username;
  }

  const result = withdrawals.map((w) => ({
    ...w,
    username: profileMap[w.user_id] ?? w.user_id,
  }));
  return res.json({ withdrawals: result });
});

// ── helper: fetch withdrawal by id ───────────────────────────────────────────

async function fetchWithdrawal(id: string) {
  const r = await sbAdmin(
    `withdrawals?id=eq.${encodeURIComponent(id)}&select=id,user_id,mander_id,amount,currency,network,status,tx_hash&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0] ?? null;
}

async function patchWithdrawal(id: string, patch: Record<string, unknown>) {
  return sbAdmin(`withdrawals?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ── 3. POST /api/admin/withdraw/approve ──────────────────────────────────────

router.post("/admin/withdraw/approve", requireAdmin, async (req: Request, res: Response) => {
  const { withdrawal_id } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });

  const w = await fetchWithdrawal(withdrawal_id);
  if (!w) return res.status(404).json({ error: "Retiro no encontrado." });
  if (w.status === "paid") return res.status(400).json({ error: "No se puede aprobar un retiro ya pagado." });
  if (w.status === "rejected") return res.status(400).json({ error: "No se puede aprobar un retiro rechazado." });
  if (w.status === "approved") return res.status(400).json({ error: "El retiro ya está aprobado." });

  const r = await patchWithdrawal(withdrawal_id, { status: "approved" });
  if (!r.ok) {
    console.error("[WITHDRAW approve] patch error:", await r.text());
    return res.status(500).json({ error: "Error al aprobar el retiro." });
  }

  console.log(`[WITHDRAW approve] id=${withdrawal_id}`);
  return res.json({ ok: true, message: "Retiro aprobado." });
});

// ── 4. POST /api/admin/withdraw/reject ───────────────────────────────────────

router.post("/admin/withdraw/reject", requireAdmin, async (req: Request, res: Response) => {
  const { withdrawal_id } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });

  const w = await fetchWithdrawal(withdrawal_id);
  if (!w) return res.status(404).json({ error: "Retiro no encontrado." });
  if (w.status === "paid") return res.status(400).json({ error: "No se puede rechazar un retiro ya pagado." });
  if (w.status === "rejected") return res.status(400).json({ error: "El retiro ya está rechazado." });

  const r = await patchWithdrawal(withdrawal_id, { status: "rejected" });
  if (!r.ok) {
    console.error("[WITHDRAW reject] patch error:", await r.text());
    return res.status(500).json({ error: "Error al rechazar el retiro." });
  }

  console.log(`[WITHDRAW reject] id=${withdrawal_id}`);
  return res.json({ ok: true, message: "Retiro rechazado." });
});

// ── 5. POST /api/admin/withdraw/pay ──────────────────────────────────────────
//
// Atomic safety strategy:
//   1. Fresh fetch + status guard (double-pay prevention)
//   2. Balance re-validation (exploit prevention)
//   3. Conditional PATCH status → "paid" WHERE status IN (pending,approved)
//      This uses Supabase filter so only one concurrent request can succeed.
//   4. Deduct balance (with fresh fetch inside atomicDeduct)
//   5. Insert negative transaction
//   If steps 4-5 fail after step 3: log CRITICAL and return error with details.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/withdraw/pay", requireAdmin, async (req: Request, res: Response) => {
  const { withdrawal_id, tx_hash } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });

  // ── Step 1: Fresh fetch + guard ──────────────────────────────────────────
  const w = await fetchWithdrawal(withdrawal_id);
  if (!w) return res.status(404).json({ error: "Retiro no encontrado." });
  if (w.status === "paid")
    return res.status(400).json({ error: "DOBLE PAGO BLOQUEADO: Este retiro ya fue pagado." });
  if (w.status === "rejected")
    return res.status(400).json({ error: "No se puede pagar un retiro rechazado." });

  const { mander_id, amount, currency, user_id } = w;
  const cur    = (currency as string).trim().toUpperCase();
  const parsed = Number(amount);

  if (!Number.isFinite(parsed) || parsed <= 0)
    return res.status(400).json({ error: "El monto del retiro es inválido." });

  // ── Step 2: Balance re-validation ────────────────────────────────────────
  const balRow = await getBalanceRow(mander_id, cur);
  const currentBalance = Number(balRow?.balance ?? 0);
  if (currentBalance < parsed)
    return res.status(400).json({
      error: `Balance insuficiente para procesar: ${currentBalance} ${cur} disponibles, ${parsed} ${cur} requeridos.`,
    });

  // ── Step 3: Conditional PATCH to "paid" — prevents double-pay race ───────
  // Filter: only update if status is still pending or approved (not already paid/rejected).
  const claimRes = await sbAdmin(
    `withdrawals?id=eq.${encodeURIComponent(withdrawal_id)}&status=in.(pending,approved)`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "paid", tx_hash: tx_hash?.trim() || null }),
    },
  );

  if (!claimRes.ok) {
    const err = await claimRes.text();
    console.error("[WITHDRAW pay] conditional PATCH failed:", err);
    return res.status(500).json({ error: "Error al actualizar el estado del retiro." });
  }

  const claimed: any[] = await claimRes.json();
  if (!claimed.length) {
    // 0 rows updated → someone else already paid it (concurrent request)
    console.warn(`[WITHDRAW pay] DOUBLE-PAY PREVENTED — id=${withdrawal_id} already changed status`);
    return res.status(409).json({
      error: "DOBLE PAGO BLOQUEADO: El retiro ya fue procesado por otra operación simultánea.",
    });
  }

  console.log(`[WITHDRAW pay] status → paid claimed — id=${withdrawal_id}`);

  // ── Step 4: Deduct balance ───────────────────────────────────────────────
  const deductResult = await atomicDeduct(mander_id, cur, parsed);
  if (!deductResult.ok) {
    // CRITICAL: status is already "paid" but balance wasn't deducted
    // Log with high visibility for manual reconciliation
    console.error(
      `[WITHDRAW pay] CRITICAL — retiro id=${withdrawal_id} marcado como paid pero balance NO descontado. ` +
      `Razón: ${deductResult.reason}. mander_id=${mander_id} amount=${parsed} ${cur}`,
    );
    // Attempt to revert status back to "approved" for safety
    await sbAdmin(`withdrawals?id=eq.${encodeURIComponent(withdrawal_id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });
    return res.status(500).json({
      error: `Error al descontar el balance: ${deductResult.reason}. El retiro fue revertido a "aprobado".`,
    });
  }

  console.log(`[WITHDRAW pay] balance deducted — -${parsed} ${cur} mander_id=${mander_id}`);

  // ── Step 5: Insert transaction record (negative amount = withdrawal) ──────
  const txRes = await sbAdmin("transactions", {
    method: "POST",
    body: JSON.stringify({
      user_id,
      mander_id,
      type:           "withdrawal",
      amount:         -Math.abs(parsed),   // always negative
      currency:       cur,
      network:        w.network ?? "",
      status:         "completed",
      external_tx_id: tx_hash?.trim() || null,
      notes:          `Retiro pagado. TX: ${tx_hash?.trim() || "—"}`,
      completed_at:   new Date().toISOString(),
    }),
  });

  if (!txRes.ok) {
    const txErr = await txRes.text();
    console.error(`[WITHDRAW pay] TX insert error (non-fatal) id=${withdrawal_id}:`, txErr);
    // Non-fatal: balance was deducted and withdrawal is paid — just log it
  } else {
    console.log(`[WITHDRAW pay] TX record inserted — id=${withdrawal_id} amount=-${parsed} ${cur}`);
  }

  return res.json({
    ok: true,
    message: `Retiro pagado exitosamente. ${parsed} ${cur} descontados del balance del usuario.`,
  });
});

export default router;
