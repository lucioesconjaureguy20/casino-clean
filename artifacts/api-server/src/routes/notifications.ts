import { Router, Request, Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "return=minimal",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

// In-memory cache (survives within a server session, but resets on restart).
// DB is the source of truth; in-memory just avoids a DB round-trip on each request.
const notifLastRead = new Map<string, string>();

// Special sentinel ID used to persist "mark all read" timestamp in user_notifications.
// Filtered out of the visible notification list automatically.
const LASTREAD_PREFIX = "_lastread_";

async function getLastReadFromDb(userId: string): Promise<string | null> {
  try {
    const r = await sbAdmin(
      `user_notifications?id=eq.${encodeURIComponent(LASTREAD_PREFIX + userId)}&select=message&limit=1`,
    );
    if (!r.ok) return null;
    const rows: any[] = await r.json();
    return rows[0]?.message ?? null;
  } catch {
    return null;
  }
}

async function persistLastRead(userId: string, ts: string): Promise<void> {
  const id = LASTREAD_PREFIX + userId;
  await sbAdmin("user_notifications", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id,
      user_id:    userId,
      type:       "_lastread",
      title:      "mark_read",
      message:    ts,
      read:       true,
      created_at: ts,
    }),
  }).catch(() => {});
}

// ── POST /api/notifications/mark-read ─────────────────────────────────────────
router.post("/notifications/mark-read", requireAuth, async (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  const ts = new Date().toISOString();
  notifLastRead.set(userId, ts);

  // Persist to DB so read state survives server restarts
  await persistLastRead(userId, ts);

  // Also mark all individual DB notifications as read
  sbAdmin(`user_notifications?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ read: true }),
  }).catch(() => {});

  return res.json({ ok: true });
});

// ── POST /api/notifications/save ──────────────────────────────────────────────
router.post("/notifications/save", requireAuth, async (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  const { id, type, title, message, title_key, msg_key, params, created_at } = req.body ?? {};

  if (!id || !type || !title || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const r = await sbAdmin("user_notifications", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        id:         String(id),
        user_id:    userId,
        type:       String(type),
        title:      String(title),
        message:    String(message),
        title_key:  title_key ?? null,
        msg_key:    msg_key ?? null,
        params:     params ? params : null,
        read:       false,
        created_at: created_at ?? new Date().toISOString(),
      }),
    });
    if (!r.ok && r.status !== 409) {
      const body = await r.text();
      if (body.includes("relation") && body.includes("does not exist")) {
        return res.json({ ok: true, skipped: true });
      }
      return res.status(500).json({ error: body });
    }
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /api/notifications ─────────────────────────────────────────────────────
router.get("/notifications", requireAuth, async (req: Request, res: Response) => {
  const userId = req.authUser!.id;

  // Resolve lastRead: prefer in-memory (fastest), fall back to DB (survives restarts)
  let lastRead = notifLastRead.get(userId) ?? null;
  if (!lastRead) {
    lastRead = await getLastReadFromDb(userId);
    if (lastRead) notifLastRead.set(userId, lastRead); // warm cache
  }

  try {
    const [depRes, wdRes, customRes] = await Promise.all([
      sbAdmin(`deposits?user_id=eq.${encodeURIComponent(userId)}&status=in.(completed,confirmed,credited)&order=updated_at.desc&limit=100`),
      sbAdmin(`withdrawals?user_id=eq.${encodeURIComponent(userId)}&status=in.(paid,rejected)&order=updated_at.desc&limit=100`),
      sbAdmin(`user_notifications?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=200`),
    ]);

    const deposits:     any[] = depRes.ok     ? await depRes.json()    : [];
    const withdrawals:  any[] = wdRes.ok       ? await wdRes.json()    : [];
    const customRaw:    any[] = customRes.ok   ? await customRes.json(): [];

    // Filter out sentinel records used for persistence
    const custom = customRaw.filter((c: any) => !String(c.id).startsWith(LASTREAD_PREFIX));

    const unreadCutoff = lastRead
      ? new Date(lastRead)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const isUnread = (ts: string) => new Date(ts) > unreadCutoff;

    const notifs: any[] = [];
    const seenIds = new Set<string>();

    // 1. Custom (app-generated) notifications — highest priority
    for (const c of custom) {
      const id = String(c.id);
      // Skip internal sentinel entries
      if (id.startsWith(LASTREAD_PREFIX)) continue;
      seenIds.add(id);
      notifs.push({
        id,
        type:      c.type ?? "bonus",
        key:       c.title_key ?? undefined,
        msgKey:    c.msg_key ?? undefined,
        params:    c.params ?? undefined,
        title:     c.title,
        message:   c.message,
        createdAt: c.created_at,
        read:      c.read || !isUnread(c.created_at),
      });
    }

    // Build set of confirmed deposit IDs to deduplicate custom "pending_deposit" entries
    const confirmedDepKeys = new Set(deposits.map((d: any) => `dep-${d.id}`));

    // Remove custom pending_deposit notifications that now have a confirmed counterpart
    // (custom pending notifications use a timestamp-based ID, not dep-{uuid}, so we match
    //  by type and filter them if ANY confirmed deposit exists for this user)
    const hasConfirmedDeposits = deposits.length > 0;

    // 2. Deposits — use updated_at so timestamp reflects confirmation time
    for (const d of deposits) {
      const amtUsd  = parseFloat(d.amount_usd ?? d.amount ?? 0).toFixed(2);
      const coin    = d.currency ?? "USDT";
      const ts      = d.updated_at ?? d.created_at ?? new Date().toISOString();
      const id      = `dep-${d.id}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      notifs.push({
        id,
        type:      "deposit",
        key:       "depConfTitle",
        msgKey:    "depConfMsg",
        params:    [amtUsd, coin],
        title:     `Depósito confirmado`,
        message:   `+$${amtUsd} ${coin} acreditado en tu cuenta.`,
        createdAt: ts,
        read:      !isUnread(ts),
      });
    }

    // 3. Withdrawals — use updated_at so timestamp reflects resolution time
    for (const w of withdrawals) {
      const amt    = parseFloat(w.amount ?? w.amount_usd ?? 0).toFixed(8);
      const coin   = w.currency ?? "USDT";
      const paid   = w.status === "paid";
      const ts     = w.updated_at ?? w.created_at ?? new Date().toISOString();
      const id     = paid ? `withdraw-paid-${w.id}` : `withdraw-rej-${w.id}`;
      const idLeg  = `wd-${w.id}`;
      if (seenIds.has(id) || seenIds.has(idLeg)) continue;
      seenIds.add(id);
      notifs.push({
        id,
        type:      paid ? "withdraw_paid" : "withdraw",
        key:       paid ? "withdrawSentTitle" : "withdrawRejTitle",
        msgKey:    paid ? "withdrawSentMsg"   : "withdrawRejMsg",
        params:    [amt, coin],
        title:     paid ? `Retiro pagado` : `Retiro rechazado`,
        message:   paid
          ? `Tu retiro de ${amt} ${coin} fue procesado.`
          : `Tu retiro de ${amt} ${coin} fue rechazado.`,
        createdAt: ts,
        read:      !isUnread(ts),
      });
    }

    // Final dedup: remove custom "pending_deposit" entries when confirmed deposit exists
    // (avoids showing both "Pending Deposit" and "Deposit Confirmed" for the same deposit)
    const finalNotifs = hasConfirmedDeposits
      ? notifs.filter(n => n.type !== "pending_deposit")
      : notifs;

    finalNotifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ notifications: finalNotifs.slice(0, 100), lastReadAt: lastRead });
  } catch (e: any) {
    console.error("[notifications] error:", e.message);
    return res.status(500).json({ notifications: [] });
  }
});

export default router;
