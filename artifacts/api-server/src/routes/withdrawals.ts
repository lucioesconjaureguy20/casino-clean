import { Router, Request, Response, NextFunction } from "express";
import { verifyGameToken } from "../lib/gameToken.js";

const router = Router();

const SUPABASE_URL        = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY   = process.env.SUPABASE_ANON_KEY!;
const ADMIN_USERNAMES     = () =>
  (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// ── Supabase helpers ──────────────────────────────────────────────────────────

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:        SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer:        "return=representation",
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

// ── requireAuth middleware ────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request { authUser?: { id: string; email: string; user_metadata: Record<string, any> }; }
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Sesión expirada o inválida." });
  const token = authHeader.slice(7);
  if (!token) return res.status(401).json({ error: "Sesión expirada o inválida." });

  try {
    const gameUser = verifyGameToken(token);
    if (gameUser) {
      req.authUser = { id: (gameUser as any).profileId, email: "", user_metadata: { username: (gameUser as any).username } };
      return next();
    }
  } catch {}

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

async function getBalance(manderId: string, currency: string): Promise<number> {
  const cur = currency.trim().toUpperCase();
  const r = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return 0;
  const rows: any[] = await r.json();
  return Number(rows[0]?.balance ?? 0);
}

async function deductBalance(manderId: string, currency: string, amount: number): Promise<boolean> {
  const cur = currency.trim().toUpperCase();
  const r = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return false;
  const rows: any[] = await r.json();
  const row = rows[0];
  if (!row) return false;
  const newBalance = Number(row.balance) - amount;
  if (newBalance < 0) return false;
  const p = await sbAdmin(`balances?id=eq.${row.id}`, {
    method: "PATCH",
    body: JSON.stringify({ balance: newBalance, updated_at: new Date().toISOString() }),
  });
  return p.ok;
}

// ── 1. POST /withdraw/create ──────────────────────────────────────────────────

router.post("/withdraw/create", requireAuth, async (req: Request, res: Response) => {
  const { amount, currency, network, wallet } = req.body;
  if (!amount || !currency || !network || !wallet)
    return res.status(400).json({ error: "Campos requeridos: amount, currency, network, wallet." });

  const parsed = Number(amount);
  if (!parsed || parsed <= 0) return res.status(400).json({ error: "El monto debe ser mayor a cero." });

  const profile = await getProfile(req.authUser!.id).catch(() => null);
  if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

  const cur = currency.trim().toUpperCase();
  const currentBalance = await getBalance(profile.mander_id, cur);
  if (currentBalance < parsed)
    return res.status(400).json({ error: `Balance insuficiente. Disponible: ${currentBalance} ${cur}` });

  const r = await sbAdmin("withdrawals", {
    method: "POST",
    body: JSON.stringify({
      user_id:    req.authUser!.id,
      mander_id:  profile.mander_id,
      amount:     parsed,
      currency:   cur,
      network:    network.trim(),
      wallet:     wallet.trim(),
      status:     "pending",
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    console.error("[WITHDRAW create] error:", err);
    return res.status(500).json({ error: "Error al crear el retiro." });
  }

  const [row] = await r.json();
  console.log(`[WITHDRAW create] id=${row?.id} user=${profile.username} amount=${parsed} ${cur}`);
  return res.json({ ok: true, withdrawal: row, message: `Retiro de ${parsed} ${cur} solicitado correctamente.` });
});

// ── 2. GET /admin/withdrawals ─────────────────────────────────────────────────

router.get("/admin/withdrawals", requireAdmin, async (_req: Request, res: Response) => {
  const r = await sbAdmin(
    "withdrawals?order=created_at.desc&select=id,user_id,mander_id,amount,currency,network,wallet,status,tx_hash,created_at",
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) {
    const err = await r.text();
    return res.status(502).json({ error: "Error al obtener retiros.", detail: err });
  }
  const withdrawals: any[] = await r.json();
  if (!withdrawals.length) return res.json({ withdrawals: [] });

  const ids = [...new Set(withdrawals.map(w => w.user_id).filter(Boolean))];
  const idsParam = `(${ids.map(id => `"${id}"`).join(",")})`;
  const pr = await sbAdmin(`profiles?id=in.${idsParam}&select=id,username`, { headers: { Prefer: "count=none" } });
  let profileMap: Record<string, string> = {};
  if (pr.ok) {
    const profiles: any[] = await pr.json();
    for (const p of profiles) profileMap[p.id] = p.username;
  }

  const result = withdrawals.map(w => ({ ...w, username: profileMap[w.user_id] ?? w.user_id }));
  return res.json({ withdrawals: result });
});

// ── helper: update withdrawal status ─────────────────────────────────────────

async function updateWithdrawalStatus(id: string, patch: Record<string, unknown>) {
  return sbAdmin(`withdrawals?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ── 3. POST /admin/withdraw/approve ──────────────────────────────────────────

router.post("/admin/withdraw/approve", requireAdmin, async (req: Request, res: Response) => {
  const { withdrawal_id } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });
  const r = await updateWithdrawalStatus(withdrawal_id, { status: "approved" });
  if (!r.ok) return res.status(500).json({ error: "Error al aprobar el retiro." });
  console.log(`[WITHDRAW approve] id=${withdrawal_id}`);
  return res.json({ ok: true, message: "Retiro aprobado." });
});

// ── 4. POST /admin/withdraw/reject ───────────────────────────────────────────

router.post("/admin/withdraw/reject", requireAdmin, async (req: Request, res: Response) => {
  const { withdrawal_id } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });
  const r = await updateWithdrawalStatus(withdrawal_id, { status: "rejected" });
  if (!r.ok) return res.status(500).json({ error: "Error al rechazar el retiro." });
  console.log(`[WITHDRAW reject] id=${withdrawal_id}`);
  return res.json({ ok: true, message: "Retiro rechazado." });
});

// ── 5. POST /admin/withdraw/pay ──────────────────────────────────────────────

router.post("/admin/withdraw/pay", requireAdmin, async (req: Request, res: Response) => {
  const { withdrawal_id, tx_hash } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });

  const wr = await sbAdmin(
    `withdrawals?id=eq.${encodeURIComponent(withdrawal_id)}&select=id,user_id,mander_id,amount,currency,status&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!wr.ok) return res.status(502).json({ error: "Error al obtener el retiro." });
  const [withdrawal] = await wr.json();
  if (!withdrawal) return res.status(404).json({ error: "Retiro no encontrado." });
  if (withdrawal.status === "paid") return res.status(400).json({ error: "Este retiro ya fue pagado." });
  if (withdrawal.status === "rejected") return res.status(400).json({ error: "No se puede pagar un retiro rechazado." });

  const { mander_id, amount, currency, user_id } = withdrawal;
  const cur = currency.trim().toUpperCase();
  const parsed = Number(amount);

  const currentBalance = await getBalance(mander_id, cur);
  if (currentBalance < parsed)
    return res.status(400).json({ error: `Balance insuficiente para descontar: ${currentBalance} ${cur} disponibles, ${parsed} ${cur} requeridos.` });

  const deducted = await deductBalance(mander_id, cur, parsed);
  if (!deducted) return res.status(500).json({ error: "Error al descontar el balance." });

  const txR = await sbAdmin("transactions", {
    method: "POST",
    body: JSON.stringify({
      user_id,
      mander_id,
      type:          "withdrawal",
      amount:        -parsed,
      currency:      cur,
      network:       withdrawal.network ?? "",
      status:        "completed",
      external_tx_id: tx_hash?.trim() || null,
      notes:         `Retiro pagado. TX: ${tx_hash?.trim() || "—"}`,
      completed_at:  new Date().toISOString(),
    }),
  });
  if (!txR.ok) console.error("[WITHDRAW pay] TX insert error:", await txR.text());

  const pr = await updateWithdrawalStatus(withdrawal_id, {
    status:   "paid",
    tx_hash:  tx_hash?.trim() || null,
  });
  if (!pr.ok) return res.status(500).json({ error: "Balance descontado pero error al actualizar status." });

  console.log(`[WITHDRAW pay] id=${withdrawal_id} amount=-${parsed} ${cur} mander_id=${mander_id}`);
  return res.json({ ok: true, message: `Retiro pagado. ${parsed} ${cur} descontados del balance.` });
});

export default router;
