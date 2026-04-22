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

// In-memory store: userId → ISO timestamp of when user last marked all notifs as read.
// Cross-browser: both browsers hit the same server instance, so state is shared.
// Resets on server restart (acceptable — users will briefly see unread badge again).
const notifLastRead = new Map<string, string>();

// ── POST /api/notifications/mark-read ─────────────────────────────────────────
router.post("/notifications/mark-read", requireAuth, (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  notifLastRead.set(userId, new Date().toISOString());
  // Also mark all DB notifications as read
  sbAdmin(`user_notifications?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ read: true }),
  }).catch(() => {});
  return res.json({ ok: true });
});

// ── POST /api/notifications/save ──────────────────────────────────────────────
// Saves a single notification to the DB (called by frontend addNotif).
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
      // Gracefully handle missing table (migration not yet run)
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
// Returns merged notification history: deposits, withdrawals, reward claims,
// AND custom user notifications saved via POST /api/notifications/save.
router.get("/notifications", requireAuth, async (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  const lastRead = notifLastRead.get(userId) ?? null;

  try {
    const [depRes, wdRes, customRes] = await Promise.all([
      sbAdmin(`deposits?user_id=eq.${encodeURIComponent(userId)}&status=in.(completed,confirmed,credited)&order=created_at.desc&limit=100`),
      sbAdmin(`withdrawals?user_id=eq.${encodeURIComponent(userId)}&status=in.(paid,rejected)&order=created_at.desc&limit=100`),
      sbAdmin(`user_notifications?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=200`),
    ]);

    const deposits:     any[] = depRes.ok     ? await depRes.json()    : [];
    const withdrawals:  any[] = wdRes.ok       ? await wdRes.json()    : [];
    const custom:       any[] = customRes.ok   ? await customRes.json(): [];

    const unreadCutoff = lastRead
      ? new Date(lastRead)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const isUnread = (createdAt: string) => new Date(createdAt) > unreadCutoff;

    const notifs: any[] = [];
    const seenIds = new Set<string>();

    // 1. Custom (app-generated) notifications — highest priority, most recent
    // NOTE: use c.id directly (no prefix) so frontend stableId dedup works correctly.
    // Deposit IDs are "dep-{uuid}" and withdrawal IDs are "wd-{uuid}" — no collision risk.
    for (const c of custom) {
      const id = String(c.id);
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

    // 2. Deposits
    for (const d of deposits) {
      const amtUsd  = parseFloat(d.amount_usd ?? d.amount ?? 0).toFixed(2);
      const coin    = d.currency ?? "USDT";
      const ts      = d.created_at ?? d.updated_at ?? new Date().toISOString();
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

    // 3. Withdrawals
    for (const w of withdrawals) {
      const amt = parseFloat(w.amount ?? w.amount_usd ?? 0).toFixed(8);
      const coin   = w.currency ?? "USDT";
      const paid   = w.status === "paid";
      const ts     = w.updated_at ?? w.created_at ?? new Date().toISOString();
      // Use same ID format as frontend so custom + withdrawal notifications deduplicate
      const id     = paid ? `withdraw-paid-${w.id}` : `withdraw-rej-${w.id}`;
      const idLeg  = `wd-${w.id}`; // legacy format — skip if already seen under either ID
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

    notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ notifications: notifs.slice(0, 100), lastReadAt: lastRead });
  } catch (e: any) {
    console.error("[notifications] error:", e.message);
    return res.status(500).json({ notifications: [] });
  }
});

export default router;
