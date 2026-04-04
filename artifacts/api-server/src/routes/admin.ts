import { Router, Request, Response } from "express";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

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

export default router;
