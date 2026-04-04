import { Router, type Request, type Response } from "express";
import { getPriceUsd } from "../lib/prices";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Supabase admin helper ─────────────────────────────────────────────────────
function adminHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

async function sbAdmin(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    throw new Error("Supabase admin not configured");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: adminHeaders((options.headers as Record<string, string>) || {}),
  });
  return res;
}

// ── Helper: obtener perfil por user_id ────────────────────────────────────────
async function getProfile(userId: string) {
  const r = await sbAdmin(
    `profiles?id=eq.${userId}&select=id,mander_id,username,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] ?? null;
}

// ── Helper: actualizar tabla balances ─────────────────────────────────────────
// Suma el monto nativo al balance de la moneda. Si no existe, crea la fila.
async function creditBalance(
  manderId: string,
  username: string,
  currency: string,
  nativeAmount: number,
): Promise<void> {
  const cur = currency.trim().toUpperCase();
  const now = new Date().toISOString();

  const getRes = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
    { headers: { Prefer: "count=none" } },
  );

  if (!getRes.ok) {
    console.error("[DEPOSIT balance] error al leer balance:", await getRes.text());
    return;
  }

  const rows = await getRes.json();
  const existing = rows?.[0];

  if (existing) {
    const newBalance = Math.max(0, Number(existing.balance || 0) + nativeAmount);
    const patchRes = await sbAdmin(`balances?id=eq.${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: newBalance, updated_at: now, username }),
    });
    if (!patchRes.ok)
      console.error("[DEPOSIT balance] error al actualizar:", await patchRes.text());
    else
      console.log(`[DEPOSIT balance] +${nativeAmount} ${cur} → mander=${manderId} new=${newBalance}`);
  } else {
    const insRes = await sbAdmin("balances", {
      method: "POST",
      body: JSON.stringify({
        mander_id: manderId,
        username,
        currency: cur,
        balance: Math.max(0, nativeAmount),
        updated_at: now,
      }),
    });
    if (!insRes.ok)
      console.error("[DEPOSIT balance] error al crear fila:", await insRes.text());
    else
      console.log(`[DEPOSIT balance] nuevo: ${nativeAmount} ${cur} → mander=${manderId}`);
  }
}

// ── Helper: actualizar profiles.balance (total USD) ───────────────────────────
async function addToProfileBalance(manderId: string, deltaUsd: number): Promise<void> {
  try {
    const r = await sbAdmin(
      `profiles?mander_id=eq.${encodeURIComponent(manderId)}&select=balance&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    const rows: { balance: number }[] = r.ok ? await r.json() : [];
    const prev = Number(rows?.[0]?.balance ?? 0);
    const next = Math.max(0, prev + deltaUsd);
    await sbAdmin(`profiles?mander_id=eq.${encodeURIComponent(manderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: next }),
    });
    console.log(`[DEPOSIT profile] balance ${prev} → ${next} (Δ${deltaUsd} USD)`);
  } catch (e: any) {
    console.error("[DEPOSIT profile] error:", e.message);
  }
}

// ── Helper: registrar transacción en tabla transactions ───────────────────────
async function insertTransaction(
  manderId: string,
  username: string,
  amount: number,
  currency: string,
  network: string,
  txHash: string,
  depositId: string,
): Promise<void> {
  const row = {
    mander_id:      manderId,
    username,
    type:           "deposit",
    amount,
    currency:       currency.trim().toUpperCase(),
    network,
    status:         "completed",
    external_tx_id: txHash || null,
    notes:          `deposit_id:${depositId}`,
    completed_at:   new Date().toISOString(),
  };

  const r = await sbAdmin("transactions", {
    method: "POST",
    body: JSON.stringify(row),
  });

  if (!r.ok)
    console.error("[DEPOSIT tx] error al insertar transacción:", await r.text());
  else
    console.log(`[DEPOSIT tx] registrado: ${amount} ${currency} mander=${manderId}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deposit/create
// Crea un depósito pendiente en la tabla deposits.
// Body: { user_id, amount, currency, network }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/deposit/create", async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  const { user_id, amount, currency, network } = req.body ?? {};

  if (!user_id || !amount || !currency || !network) {
    return res.status(400).json({
      error: "Campos requeridos: user_id, amount, currency, network.",
    });
  }

  if (typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "amount debe ser un número positivo." });
  }

  try {
    const profile = await getProfile(user_id);
    if (!profile) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const depositRow = {
      user_id,
      amount,
      currency: currency.trim().toUpperCase(),
      network,
      status:   "pending",
    };

    console.log(`[DEPOSIT create] user=${user_id} ${amount} ${currency} ${network}`);

    const insRes = await sbAdmin("deposits", {
      method: "POST",
      body: JSON.stringify(depositRow),
    });

    if (!insRes.ok) {
      const errBody = await insRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[DEPOSIT create] Supabase error:", insRes.status, msg);
      return res.status(500).json({ error: msg });
    }

    const inserted = await insRes.json();
    const deposit = Array.isArray(inserted) ? inserted[0] : inserted;

    console.log(`[DEPOSIT create] OK — deposit_id=${deposit?.id}`);
    return res.status(201).json({ deposit });

  } catch (err: any) {
    console.error("[DEPOSIT create] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/deposit/confirm
// Confirma un depósito pendiente: cambia status a "completed", guarda tx_hash,
// actualiza balances y registra la transacción.
// Body: { deposit_id, tx_hash }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/deposit/confirm", async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  const { deposit_id, tx_hash } = req.body ?? {};

  if (!deposit_id) {
    return res.status(400).json({ error: "Campos requeridos: deposit_id." });
  }

  try {
    // 1. Leer el depósito
    const depRes = await sbAdmin(
      `deposits?id=eq.${deposit_id}&select=*&limit=1`,
      { headers: { Prefer: "count=none" } },
    );

    if (!depRes.ok) {
      const errBody = await depRes.json().catch(() => ({}));
      return res.status(500).json({ error: (errBody as any).message || "Error al leer el depósito." });
    }

    const depRows = await depRes.json();
    const deposit = depRows?.[0];

    if (!deposit) {
      return res.status(404).json({ error: "Depósito no encontrado." });
    }

    if (deposit.status === "completed") {
      return res.status(409).json({ error: "El depósito ya fue confirmado." });
    }

    // 2. Obtener perfil del usuario
    const profile = await getProfile(deposit.user_id);
    if (!profile) {
      return res.status(404).json({ error: "Usuario del depósito no encontrado." });
    }

    // 3. Actualizar el depósito a "completed" con tx_hash
    const updRes = await sbAdmin(`deposits?id=eq.${deposit_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status:      "completed",
        tx_hash:     tx_hash || null,
        completed_at: new Date().toISOString(),
      }),
    });

    if (!updRes.ok) {
      const errBody = await updRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[DEPOSIT confirm] error al actualizar deposit:", msg);
      return res.status(500).json({ error: msg });
    }

    const updatedRows = await updRes.json();
    const updatedDeposit = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

    console.log(`[DEPOSIT confirm] deposit=${deposit_id} completado tx_hash=${tx_hash}`);

    // 4. Acreditar balance en tabla balances (monto nativo)
    const nativeAmount = Number(deposit.amount);
    await creditBalance(profile.mander_id, profile.username, deposit.currency, nativeAmount);

    // 5. Actualizar profiles.balance (total en USD)
    const priceUsd = getPriceUsd(deposit.currency.trim().toUpperCase());
    const deltaUsd = nativeAmount * priceUsd;
    await addToProfileBalance(profile.mander_id, deltaUsd);

    // 6. Registrar en tabla transactions
    await insertTransaction(
      profile.mander_id,
      profile.username,
      nativeAmount,
      deposit.currency,
      deposit.network,
      tx_hash || "",
      deposit_id,
    );

    return res.json({
      ok: true,
      deposit: updatedDeposit ?? { ...deposit, status: "completed", tx_hash },
    });

  } catch (err: any) {
    console.error("[DEPOSIT confirm] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
