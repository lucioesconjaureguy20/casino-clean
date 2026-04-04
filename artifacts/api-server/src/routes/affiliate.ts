import { Router } from "express";
import crypto from "crypto";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const COMMISSION_RATE = parseFloat(process.env.AFFILIATE_COMMISSION_RATE || "0.15");

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

function generateRefCode(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9]/g, "") || crypto.randomBytes(4).toString("hex");
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Supabase not configured");
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase error ${resp.status}: ${text}`);
  }
  return resp.json();
}

router.get("/affiliate/link/:username", async (req, res) => {
  const { username } = req.params;
  if (!username) return res.status(400).json({ error: "Missing username" });

  try {
    const existing = await supabaseFetch(
      `affiliate_links?username=eq.${encodeURIComponent(username)}&select=*&limit=1`
    );
    if (existing && existing.length > 0) {
      return res.json({ ref_code: existing[0].ref_code, username });
    }
    const ref_code = generateRefCode(username);
    await supabaseFetch("affiliate_links", {
      method: "POST",
      body: JSON.stringify({ username, ref_code }),
    });
    return res.json({ ref_code, username });
  } catch (err: any) {
    const ref_code = generateRefCode(username);
    return res.json({ ref_code, username, fallback: true });
  }
});

router.post("/affiliate/track-click", async (req, res) => {
  const { ref_code, visitor_ip } = req.body;
  if (!ref_code) return res.status(400).json({ error: "Missing ref_code" });

  const visitor_hash = visitor_ip
    ? crypto.createHash("sha256").update(visitor_ip).digest("hex").slice(0, 16)
    : crypto.randomBytes(8).toString("hex");

  try {
    await supabaseFetch("affiliate_clicks", {
      method: "POST",
      body: JSON.stringify({ ref_code, visitor_hash }),
    });
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: true, fallback: true });
  }
});

router.get("/affiliate/stats/:username", async (req, res) => {
  const { username } = req.params;
  const { month } = req.query;

  try {
    const linkRows = await supabaseFetch(
      `affiliate_links?username=eq.${encodeURIComponent(username)}&select=ref_code&limit=1`
    );
    const ref_code = linkRows?.[0]?.ref_code || generateRefCode(username);

    let clicksQuery = `affiliate_clicks?ref_code=eq.${encodeURIComponent(ref_code)}&select=id`;
    let referralsQuery = `affiliate_referrals?referrer_username=eq.${encodeURIComponent(username)}&select=*`;
    let commissionsQuery = `affiliate_commissions?referrer_username=eq.${encodeURIComponent(username)}&select=*`;

    if (month) {
      const [year, mon] = (month as string).split("-");
      const from = `${year}-${mon}-01T00:00:00`;
      const daysInMonth = new Date(parseInt(year), parseInt(mon), 0).getDate();
      const to = `${year}-${mon}-${daysInMonth}T23:59:59`;
      clicksQuery += `&created_at=gte.${from}&created_at=lte.${to}`;
      referralsQuery += `&created_at=gte.${from}&created_at=lte.${to}`;
      commissionsQuery += `&created_at=gte.${from}&created_at=lte.${to}`;
    }

    const [clicks, referrals, commissions] = await Promise.all([
      supabaseFetch(clicksQuery),
      supabaseFetch(referralsQuery),
      supabaseFetch(commissionsQuery),
    ]);

    const ftds = (referrals || []).filter((r: any) => r.is_ftd);
    const totalDeposits = (referrals || []).reduce((s: number, r: any) => s + (r.deposit_count || 0), 0);
    const totalDepositAmount = (referrals || []).reduce((s: number, r: any) => s + parseFloat(r.deposit_amount || 0), 0);
    const totalWager = (referrals || []).reduce((s: number, r: any) => s + parseFloat(r.wager_amount || 0), 0);
    const totalNGR = (referrals || []).reduce((s: number, r: any) => s + parseFloat(r.ngr || 0), 0);
    const commissionEarned = (commissions || []).reduce((s: number, c: any) => s + parseFloat(c.amount || 0), 0);
    const commissionPaid = (commissions || []).filter((c: any) => c.status === "paid").reduce((s: number, c: any) => s + parseFloat(c.amount || 0), 0);

    return res.json({
      clicks: (clicks || []).length,
      signups: (referrals || []).length,
      ftds: ftds.length,
      ftd_conversion: (referrals || []).length > 0 ? ((ftds.length / (referrals || []).length) * 100).toFixed(2) : "0.00",
      deposit_count: totalDeposits,
      deposit_amount: totalDepositAmount.toFixed(2),
      wager_amount: totalWager.toFixed(2),
      ngr: totalNGR.toFixed(2),
      commission_earned: commissionEarned.toFixed(2),
      commission_paid: commissionPaid.toFixed(2),
      commission_balance: (commissionEarned - commissionPaid).toFixed(2),
      commission_rate: COMMISSION_RATE,
    });
  } catch {
    return res.json({
      clicks: 0,
      signups: 0,
      ftds: 0,
      ftd_conversion: "0.00",
      deposit_count: 0,
      deposit_amount: "0.00",
      wager_amount: "0.00",
      ngr: "0.00",
      commission_earned: "0.00",
      commission_paid: "0.00",
      commission_balance: "0.00",
      commission_rate: COMMISSION_RATE,
    });
  }
});

router.get("/affiliate/referrals/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const rows = await supabaseFetch(
      `affiliate_referrals?referrer_username=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc&limit=100`
    );
    return res.json(rows || []);
  } catch {
    return res.json([]);
  }
});

router.get("/affiliate/commissions/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const rows = await supabaseFetch(
      `affiliate_commissions?referrer_username=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc&limit=100`
    );
    return res.json(rows || []);
  } catch {
    return res.json([]);
  }
});

router.post("/affiliate/register-referral", async (req, res) => {
  const { referred_username, ref_code } = req.body;
  if (!referred_username || !ref_code) return res.status(400).json({ error: "Missing params" });

  try {
    const linkRows = await supabaseFetch(
      `affiliate_links?ref_code=eq.${encodeURIComponent(ref_code)}&select=username&limit=1`
    );
    if (!linkRows || linkRows.length === 0) return res.status(404).json({ error: "Invalid ref_code" });

    const referrer_username = linkRows[0].username;

    if (referrer_username === referred_username) {
      return res.status(400).json({ error: "Self-referral not allowed" });
    }

    const existing = await supabaseFetch(
      `affiliate_referrals?referred_username=eq.${encodeURIComponent(referred_username)}&select=id&limit=1`
    );
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: "Already referred" });
    }

    await supabaseFetch("affiliate_referrals", {
      method: "POST",
      body: JSON.stringify({
        referrer_username,
        referred_username,
        is_ftd: false,
        deposit_count: 0,
        deposit_amount: 0,
        wager_amount: 0,
        ngr: 0,
      }),
    });

    return res.json({ ok: true, referrer: referrer_username });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
