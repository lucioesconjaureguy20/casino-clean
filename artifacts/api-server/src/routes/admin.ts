import { Router, Request, Response, NextFunction } from "express";
import { verifyGameToken } from "../lib/gameToken.js";

const router = Router();

const SUPABASE_URL          = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY     = process.env.SUPABASE_ANON_KEY!;
const ADMIN_USERNAMES       = () =>
  (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

// GET /api/admin/pending-deposits
router.get("/pending-deposits", async (_req: Request, res: Response) => {
  try {
    const r = await sbAdmin(
      "deposits?status=eq.pending&order=created_at.asc&select=id,user_id,amount,currency,network,address,created_at",
    );
    if (!r.ok) {
      const txt = await r.text();
      console.error("[ADMIN] error fetching deposits:", txt);
      return res.status(502).json({ error: "supabase error", detail: txt });
    }

    const deposits: {
      id: number;
      user_id: string;
      amount: number;
      currency: string;
      network: string;
      address: string;
      created_at: string;
    }[] = await r.json();

    if (!deposits.length) return res.json({ deposits: [] });

    const ids = [...new Set(deposits.map((d) => d.user_id))];
    const idsParam = `(${ids.map((id) => `"${id}"`).join(",")})`;
    let pr = await sbAdmin(
      `profiles?id=in.${idsParam}&select=id,username,mander_id,is_flagged`,
    );
    if (!pr.ok) pr = await sbAdmin(`profiles?id=in.${idsParam}&select=id,username,mander_id`);

    let profileMap: Record<string, { username: string; mander_id: string; is_flagged?: boolean }> = {};
    if (pr.ok) {
      const profiles: { id: string; username: string; mander_id: string; is_flagged?: boolean }[] =
        await pr.json();
      for (const p of profiles) profileMap[p.id] = p;
    }

    const result = deposits.map((d) => ({
      ...d,
      username: profileMap[d.user_id]?.username ?? d.user_id,
      mander_id: profileMap[d.user_id]?.mander_id ?? "",
      is_flagged: profileMap[d.user_id]?.is_flagged ?? false,
    }));

    return res.json({ deposits: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

// GET /api/admin/users
// Returns all users with their balances per currency
router.get("/users", async (_req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  try {
    let pr = await sbAdmin(
      "profiles?select=id,mander_id,username,created_at,is_blocked,is_flagged&order=created_at.asc",
      { headers: { Prefer: "count=none" } },
    );
    // Fallback if is_flagged column not yet added
    if (!pr.ok) {
      pr = await sbAdmin(
        "profiles?select=id,mander_id,username,created_at,is_blocked&order=created_at.asc",
        { headers: { Prefer: "count=none" } },
      );
    }
    if (!pr.ok) {
      const txt = await pr.text();
      return res.status(502).json({ error: "Error fetching profiles", detail: txt });
    }

    const profiles: {
      id: string;
      mander_id: string;
      username: string;
      created_at: string;
      is_blocked?: boolean;
      is_flagged?: boolean;
    }[] = await pr.json();

    if (!profiles.length) return res.json({ users: [] });

    const manderIds = profiles.map((p) => p.mander_id).filter(Boolean);
    const idsParam = `(${manderIds.map((id) => `"${id}"`).join(",")})`;
    const br = await sbAdmin(
      `balances?mander_id=in.${idsParam}&select=mander_id,currency,balance`,
      { headers: { Prefer: "count=none" } },
    );

    const balanceMap: Record<string, { currency: string; balance: number }[]> = {};
    if (br.ok) {
      const balRows: { mander_id: string; currency: string; balance: number }[] =
        await br.json();
      for (const b of balRows) {
        if (!balanceMap[b.mander_id]) balanceMap[b.mander_id] = [];
        balanceMap[b.mander_id].push({ currency: b.currency, balance: Number(b.balance) });
      }
    }

    const users = profiles.map((p) => ({
      id: p.id,
      mander_id: p.mander_id,
      username: p.username,
      created_at: p.created_at,
      is_blocked: p.is_blocked ?? false,
      is_flagged: p.is_flagged ?? false,
      balances: (balanceMap[p.mander_id] ?? []).filter((b) => b.balance > 0),
    }));

    console.log(`[ADMIN users] ${users.length} usuarios`);
    return res.json({ users });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN users] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

// GET /api/admin/user/:userId/stats
router.get("/user/:userId/stats", async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  try {
    // Profile
    const profR = await sbAdmin(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username,created_at,is_blocked&limit=1`,
    );
    if (!profR.ok) return res.status(502).json({ error: "Error fetching profile." });
    const profRows: any[] = await profR.json();
    const profile = profRows[0];
    if (!profile) return res.status(404).json({ error: "Usuario no encontrado." });

    const mid = encodeURIComponent(profile.mander_id);
    const uid = encodeURIComponent(userId);

    // All transactions for this user
    const [txR, wR, depR, balR] = await Promise.all([
      sbAdmin(`transactions?mander_id=eq.${mid}&select=type,amount,currency,status,created_at&order=created_at.desc&limit=5000`, { headers: { Prefer: "count=none" } }),
      sbAdmin(`withdrawals?user_id=eq.${uid}&select=amount,currency,status,created_at&order=created_at.desc`, { headers: { Prefer: "count=none" } }),
      sbAdmin(`deposits?user_id=eq.${uid}&select=amount,currency,status,created_at&order=created_at.desc`, { headers: { Prefer: "count=none" } }),
      sbAdmin(`balances?mander_id=eq.${mid}&select=currency,balance,locked_amount`, { headers: { Prefer: "count=none" } }),
    ]);

    const txs:      any[] = txR.ok  ? await txR.json()  : [];
    const wds:      any[] = wR.ok   ? await wR.json()   : [];
    const deps:     any[] = depR.ok ? await depR.json() : [];
    const balRows:  any[] = balR.ok ? await balR.json() : [];

    // Transactions breakdown
    const bets      = txs.filter(t => t.type === "bet");
    const bonuses   = txs.filter(t => t.type === "bonus");

    const totalWagered    = bets.reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
    const betCount        = bets.length;
    const totalBonus      = bonuses.reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
    const bonusCount      = bonuses.length;

    // Withdrawals
    const paidWds     = wds.filter(w => w.status === "paid");
    const pendingWds  = wds.filter(w => w.status === "pending" || w.status === "approved");
    const totalWithdrawn = paidWds.reduce((s: number, w: any) => s + Number(w.amount), 0);

    // Deposits (confirmed)
    const confirmedDeps  = deps.filter(d => d.status === "confirmed" || d.status === "completed");
    const totalDeposited = confirmedDeps.reduce((s: number, d: any) => s + Number(d.amount), 0);

    // Balances
    const balances = balRows
      .filter(b => Number(b.balance) > 0 || Number(b.locked_amount) > 0)
      .map(b => ({ currency: b.currency, balance: Number(b.balance), locked: Number(b.locked_amount) }));

    // First & last activity
    const allDates = txs.map(t => t.created_at).filter(Boolean).sort();
    const firstActivity = allDates[0] ?? null;
    const lastActivity  = allDates[allDates.length - 1] ?? null;

    return res.json({
      ok: true,
      profile: {
        id: profile.id,
        mander_id: profile.mander_id,
        username: profile.username,
        created_at: profile.created_at,
        is_blocked: profile.is_blocked ?? false,
      },
      stats: {
        totalWagered:   Math.round(totalWagered   * 100) / 100,
        betCount,
        totalDeposited: Math.round(totalDeposited * 100) / 100,
        depositCount:   confirmedDeps.length,
        totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
        withdrawalCount: paidWds.length,
        pendingWithdrawals: pendingWds.length,
        totalBonus:   Math.round(totalBonus * 100) / 100,
        bonusCount,
        txTotal: txs.length,
        firstActivity,
        lastActivity,
      },
      balances,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN user stats] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── Auth middleware (admin only) ──────────────────────────────────────────────
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Sesión inválida." });
  const token = authHeader.slice(7);

  let userId: string | null = null;
  try { const g = verifyGameToken(token) as any; if (g) userId = g.profileId; } catch {}

  if (!userId) {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
      if (r.ok) userId = (await r.json()).id;
    } catch {}
  }

  if (!userId) return res.status(401).json({ error: "Sesión inválida." });

  let pr = await sbAdmin(`profiles?id=eq.${encodeURIComponent(userId)}&select=username&limit=1`);
  if (!pr.ok) return res.status(403).json({ error: "Perfil no encontrado." });
  const rows: any[] = await pr.json();
  if (!rows[0]) return res.status(403).json({ error: "Perfil no encontrado." });
  if (!ADMIN_USERNAMES().includes(rows[0].username.toLowerCase()))
    return res.status(403).json({ error: "Acceso denegado." });

  (req as any).adminUserId = userId;
  next();
}

// ── GET /api/admin/transactions-search ───────────────────────────────────────
// Query params: username, type, status, from, to, limit (default 50), offset (default 0)
router.get("/transactions-search", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, type, status, from, to } = req.query as Record<string, string>;
    const limit  = Math.min(parseInt((req.query.limit  as string) || "50", 10), 200);
    const offset = Math.max(parseInt((req.query.offset as string) || "0",  10), 0);

    // If username filter — resolve mander_id first
    let manderFilter = "";
    let resolvedUsername = "";
    if (username?.trim()) {
      const uname = username.trim().toLowerCase();
      const pr = await sbAdmin(
        `profiles?username=ilike.${encodeURIComponent(uname)}&select=mander_id,username&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      if (pr.ok) {
        const rows: any[] = await pr.json();
        if (rows[0]) {
          manderFilter    = `&mander_id=eq.${encodeURIComponent(rows[0].mander_id)}`;
          resolvedUsername = rows[0].username;
        } else {
          return res.json({ transactions: [], total: 0, limit, offset });
        }
      }
    }

    // Build filter string
    let filters = manderFilter;
    if (type   && type   !== "all") filters += `&type=eq.${encodeURIComponent(type)}`;
    if (status && status !== "all") filters += `&status=eq.${encodeURIComponent(status)}`;
    if (from)  filters += `&created_at=gte.${encodeURIComponent(from)}`;
    if (to) {
      // to = end of that day
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      filters += `&created_at=lte.${encodeURIComponent(toDate.toISOString())}`;
    }

    const txRes = await sbAdmin(
      `transactions?select=id,display_id,mander_id,type,status,amount,currency,created_at,notes,external_tx_id${filters}&order=created_at.desc&limit=${limit}&offset=${offset}`,
      { headers: { Prefer: "count=exact" } },
    );
    if (!txRes.ok) {
      const txt = await txRes.text();
      return res.status(502).json({ error: "Error al buscar transacciones.", detail: txt });
    }

    // Parse total from Content-Range header e.g. "0-49/1234"
    const contentRange = txRes.headers.get("content-range") ?? "";
    const total = parseInt(contentRange.split("/")[1] ?? "0", 10) || 0;

    const txs: any[] = await txRes.json();

    // If no username filter, look up usernames for all mander_ids in result
    let usernameMap: Record<string, string> = {};
    if (resolvedUsername) {
      const mid = txs[0]?.mander_id;
      if (mid) usernameMap[mid] = resolvedUsername;
    } else if (txs.length > 0) {
      const mids = [...new Set(txs.map((t: any) => t.mander_id).filter(Boolean))];
      const idsParam = `(${mids.map(id => `"${id}"`).join(",")})`;
      const pr = await sbAdmin(
        `profiles?mander_id=in.${idsParam}&select=mander_id,username`,
        { headers: { Prefer: "count=none" } },
      );
      if (pr.ok) {
        const rows: any[] = await pr.json();
        for (const r of rows) usernameMap[r.mander_id] = r.username;
      }
    }

    const result = txs.map((t: any) => ({
      id:           t.id,
      display_id:   t.display_id ?? null,
      mander_id:    t.mander_id,
      username:     usernameMap[t.mander_id] ?? t.mander_id,
      type:         t.type,
      status:       t.status,
      amount:       t.amount,
      currency:     t.currency,
      created_at:   t.created_at,
      notes:        t.notes ?? null,
      wallet:       t.external_tx_id ?? null,
    }));

    return res.json({ transactions: result, total, limit, offset });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN tx-search] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

export default router;
