import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── Supabase service-role helper ──────────────────────────────────────────────
function sbSvc(path: string, opts: RequestInit = {}) {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
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

// ── POST /api/support-chat ────────────────────────────────────────────────────
// Save user message and return a static auto-reply (no AI)
router.post("/support-chat", async (req, res) => {
  const { message, username, chat_id } = req.body as {
    message?: string;
    username?: string;
    chat_id?: string;
  };

  if (!message?.trim() || !username?.trim() || !chat_id) {
    return res.status(400).json({ error: "message, username and chat_id required" });
  }

  // Persist user message and auto-reply
  try {
    // Check existing messages: first user message + whether operator has joined
    const [existingRes, adminRes] = await Promise.all([
      sbSvc(`support_messages?chat_id=eq.${encodeURIComponent(chat_id)}&sender=eq.user&limit=1`, { headers: { Prefer: "count=none" } }),
      sbSvc(`support_messages?chat_id=eq.${encodeURIComponent(chat_id)}&sender=eq.admin&limit=1`, { headers: { Prefer: "count=none" } }),
    ]);
    const existingMsgs: any[] = existingRes.ok ? await existingRes.json() : [];
    const adminMsgs: any[]    = adminRes.ok    ? await adminRes.json()    : [];
    const isFirstMessage  = existingMsgs.length === 0;
    const operatorJoined  = adminMsgs.length > 0;

    // Save user message
    await sbSvc("support_messages", {
      method: "POST",
      body: JSON.stringify({ chat_id, username: username.trim(), sender: "user", message: message.trim() }),
    });

    // Build auto-reply only if operator has NOT joined yet
    const ticketNum = (parseInt(chat_id.replace(/-/g,"").slice(0,12), 16) % 900000 + 100000).toString();
    let autoReply: string | null = null;
    if (!operatorJoined) {
      autoReply = isFirstMessage
        ? `🎫 Ticket #${ticketNum} — Thank you for reaching out! An agent will be with you shortly.`
        : "An agent will get back to you shortly 😊";

      // Save auto-reply to DB so it persists when user returns
      await sbSvc("support_messages", {
        method: "POST",
        body: JSON.stringify({ chat_id, username: username.trim(), sender: "bot", message: autoReply }),
      });
    }

    await sbSvc(`support_chats?id=eq.${encodeURIComponent(chat_id)}`, {
      method: "PATCH",
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    });

    return res.json({ reply: autoReply });
  } catch (err) {
    console.error("[support-chat] save error:", err instanceof Error ? err.message : String(err));
    return res.json({ reply: "An agent will get back to you shortly 😊" });
  }
});

// ── POST /api/support-chat/init-session ──────────────────────────────────────
// Get or create a DB chat session for a username
router.post("/support-chat/init-session", async (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  const uname = username.trim();
  try {
    // Look for an existing open ticket for this user
    const existingRes = await sbSvc(
      `support_chats?username=eq.${encodeURIComponent(uname)}&status=eq.open&order=created_at.desc&limit=1`,
      { headers: { Prefer: "count=none" } },
    );

    if (existingRes.ok) {
      const rows: any[] = await existingRes.json();
      if (rows[0]) {
        // User already has an open ticket — return it, block new creation
        return res.json({ chat_id: rows[0].id, is_existing: true });
      }
    }

    // No open ticket → create a fresh one
    const now = new Date().toISOString();
    const created = await sbSvc("support_chats", {
      method: "POST",
      body: JSON.stringify({ username: uname, status: "open", updated_at: now, created_at: now }),
    });
    if (!created.ok) {
      const txt = await created.text();
      console.error("[init-session] INSERT error:", txt);
      return res.status(502).json({ error: "Error creating chat.", detail: txt });
    }
    const newRows: any[] = await created.json();
    return res.json({ chat_id: newRows[0]?.id ?? null, is_existing: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/support-chat/save ───────────────────────────────────────────────
// Save a message (user or assistant) to the DB
router.post("/support-chat/save", async (req, res) => {
  const { chat_id, username, sender, message } = req.body as {
    chat_id?: string; username?: string; sender?: string; message?: string;
  };
  if (!chat_id || !username || !sender || !message?.trim()) {
    return res.status(400).json({ error: "chat_id, username, sender and message required" });
  }

  try {
    const msgRes = await sbSvc("support_messages", {
      method: "POST",
      body: JSON.stringify({ chat_id, username, sender, message: message.trim() }),
    });
    if (!msgRes.ok) {
      const txt = await msgRes.text();
      return res.status(502).json({ error: "Error saving message.", detail: txt });
    }

    await sbSvc(`support_chats?id=eq.${encodeURIComponent(chat_id)}`, {
      method: "PATCH",
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    });

    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/support-chat/tickets/:username ───────────────────────────────────
// Return all tickets (open + closed) for a user, most recent first
router.get("/support-chat/tickets/:username", async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  try {
    const r = await sbSvc(
      `support_chats?username=eq.${encodeURIComponent(username.trim())}&order=created_at.desc&limit=20`,
      { headers: { Prefer: "count=none" } },
    );
    if (!r.ok) return res.status(502).json({ error: "Error fetching tickets" });
    const rows: any[] = await r.json();
    return res.json(rows.map(c => ({ chat_id: c.id, status: c.status ?? "open", updated_at: c.updated_at, created_at: c.created_at })));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/support-chat/status/:username ───────────────────────────────────
// Check if user has an open ticket (no creation)
router.get("/support-chat/status/:username", async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  try {
    const r = await sbSvc(
      `support_chats?username=eq.${encodeURIComponent(username.trim())}&status=eq.open&order=created_at.desc&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!r.ok) return res.status(502).json({ error: "Error checking status" });
    const rows: any[] = await r.json();
    if (rows[0]) {
      return res.json({ has_open_ticket: true, chat_id: rows[0].id });
    }
    return res.json({ has_open_ticket: false, chat_id: null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/support-chat/:chatId/messages ────────────────────────────────────
// Get all messages for a chat session
router.get("/support-chat/:chatId/messages", async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) return res.status(400).json({ error: "chatId required" });

  try {
    const r = await sbSvc(
      `support_messages?chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.asc`,
      { headers: { Prefer: "count=none" } },
    );
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: "Error fetching messages", detail: txt });
    }
    const msgs: any[] = await r.json();
    return res.json(msgs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/support-chat/poll/:chatId ───────────────────────────────────────
// Poll for new admin/system messages since a timestamp, also returns ticket status
router.get("/support-chat/poll/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const { since } = req.query as { since?: string };

  try {
    // Fetch new messages
    let msgUrl = `support_messages?chat_id=eq.${encodeURIComponent(chatId)}&sender=in.(admin,system)&order=created_at.asc`;
    if (since) msgUrl += `&created_at=gt.${encodeURIComponent(since)}`;

    const [msgRes, chatRes] = await Promise.all([
      sbSvc(msgUrl, { headers: { Prefer: "count=none" } }),
      sbSvc(`support_chats?id=eq.${encodeURIComponent(chatId)}&select=status`, { headers: { Prefer: "count=none" } }),
    ]);

    if (!msgRes.ok) {
      const txt = await msgRes.text();
      return res.status(502).json({ error: "Error polling messages.", detail: txt });
    }

    const msgs: any[] = await msgRes.json();
    let ticketStatus = "open";
    if (chatRes.ok) {
      const chatRows: any[] = await chatRes.json();
      if (chatRows.length > 0) ticketStatus = chatRows[0].status ?? "open";
    }

    return res.json({ messages: msgs, ticket_status: ticketStatus });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/support/upload-image ────────────────────────────────────────────
// Accepts base64 image, uploads to Supabase Storage, returns public URL
router.post("/support/upload-image", async (req, res) => {
  const { imageData, filename, contentType } = req.body as {
    imageData?: string;
    filename?: string;
    contentType?: string;
  };
  if (!imageData || !filename) {
    return res.status(400).json({ error: "imageData and filename required" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
  const BUCKET = "chat-uploads";

  try {
    // Create bucket if it doesn't exist (ignore error if already exists)
    await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    });

    // Decode base64 and upload
    const base64 = imageData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const mime = contentType || "image/jpeg";

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${uniqueName}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": mime,
        "x-upsert": "true",
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return res.status(502).json({ error: "Storage upload failed", detail: errText });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${uniqueName}`;
    return res.json({ url: publicUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

export default router;
