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

export default router;
