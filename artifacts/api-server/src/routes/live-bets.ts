/**
 * live-bets.ts
 * GET /api/live-bets  — recent bets for the ticker
 * GET /api/top-bets   — top big wins (payout_usd) and lucky bets (multiplier)
 */

import { Router, Request, Response } from "express";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";

const router = Router();

const SB_URL = process.env.SUPABASE_URL ?? "";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:        SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer:        "count=none",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

interface RawBet {
  username:   string;
  game:       string;
  currency:   string;
  bet_usd:    number;
  payout_usd: number;
  created_at: string;
  is_demo:    boolean | null;
}

function mapBet(b: RawBet) {
  const bet    = Number(b.bet_usd   ?? 0);
  const payout = Number(b.payout_usd ?? 0);
  const mult   = bet > 0 ? Math.round((payout / bet) * 100) / 100 : 0;
  return {
    username:   b.username,
    game:       b.game,
    currency:   b.currency ?? "USDT",
    bet_usd:    bet,
    payout_usd: payout,
    multiplier: mult,
    win:        payout > 0,
    created_at: b.created_at,
  };
}

// ── GET /api/live-bets ────────────────────────────────────────────────────────
router.get("/live-bets", async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const r = await sbAdmin(
      `game_bets?select=username,game,currency,bet_usd,payout_usd,created_at,is_demo` +
      `&created_at=gte.${encodeURIComponent(since)}` +
      `&or=(is_demo.eq.false,is_demo.is.null)` +
      `&order=created_at.desc&limit=120`,
    );
    if (!r.ok) return res.json({ bets: [] });
    const rows: RawBet[] = await r.json();
    return res.json({ bets: rows.map(mapBet) });
  } catch {
    return res.json({ bets: [] });
  }
});

// ── GET /api/top-bets ─────────────────────────────────────────────────────────
router.get("/top-bets", async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const base =
      `game_bets?select=username,game,currency,bet_usd,payout_usd,created_at,is_demo` +
      `&created_at=gte.${encodeURIComponent(since)}` +
      `&or=(is_demo.eq.false,is_demo.is.null)` +
      `&payout_usd=gte.10`;

    const [bigRes, luckyRes] = await Promise.all([
      sbAdmin(`${base}&order=payout_usd.desc&limit=40`),
      sbAdmin(`${base}&order=payout_usd.desc&limit=200`),
    ]);

    let bigWins: ReturnType<typeof mapBet>[]  = [];
    let luckyBets: ReturnType<typeof mapBet>[] = [];

    if (bigRes.ok) {
      const rows: RawBet[] = await bigRes.json();
      bigWins = rows.map(mapBet).slice(0, 20);
    }

    if (luckyRes.ok) {
      const rows: RawBet[] = await luckyRes.json();
      luckyBets = rows
        .map(mapBet)
        .filter(b => b.multiplier >= 10)
        .sort((a, b) => b.multiplier - a.multiplier)
        .slice(0, 20);
    }

    return res.json({ bigWins, luckyBets });
  } catch {
    return res.json({ bigWins: [], luckyBets: [] });
  }
});

export default router;
