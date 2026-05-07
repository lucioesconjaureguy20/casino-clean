import { useEffect, useState, useCallback, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface UserBalance { currency: string; balance: number; }

interface AdminUser {
  id: string;
  mander_id: string;
  username: string;
  email?: string;
  created_at: string;
  is_blocked: boolean;
  is_flagged?: boolean;
  balances: UserBalance[];
  balance_demo?: number;
  referred_by?: string | null;
  ref_code_used?: string | null;
}

interface PendingDeposit {
  id: number;
  user_id: string;
  username: string;
  mander_id: string;
  currency: string;
  network: string;
  address: string;
  created_at: string;
  is_flagged?: boolean;
}

interface LastDeposit { amount: number; currency: string; created_at: string; status: string; }

interface Withdrawal {
  id: string;
  user_id: string;
  mander_id: string;
  username: string;
  amount: number;
  amount_usd?: number;
  currency: string;
  network: string;
  wallet: string;
  status: "pending" | "approved" | "paid" | "rejected";
  tx_hash: string | null;
  created_at: string;
  is_flagged?: boolean;
  is_streamer_withdrawal?: boolean;
  last_deposit?: LastDeposit | null;
}

interface ConfirmInputs { amount: string; txHash: string; }

// ── Fee por red (USD) — mismo valor que networkLimits en App.tsx ──────────────
const WITHDRAWAL_FEES: Record<string, Record<string, number>> = {
  USDT:  { TRC20: 1,   ERC20: 2,   BEP20: 0.5 },
  ETH:   { ERC20: 2,   Arbitrum: 0.3, Optimism: 0.3 },
  BTC:   { BTC: 3 },
  TRX:   { TRC20: 0.5 },
  BNB:   { BEP20: 0.5, Beacon: 0.3 },
  SOL:   { SOL: 0.1 },
  POL:   { ERC20: 0.2 },
  USDC:  { ERC20: 2,   BEP20: 0.5, SOL: 0.1 },
  LTC:   { LTC: 0.5 },
};
function getWFee(currency: string, network: string): number {
  return WITHDRAWAL_FEES[currency]?.[network] ?? 0;
}

// ── Mobile hook ───────────────────────────────────────────────────────────────
function useIsMobile(bp = 640) {
  const [mobile, setMobile] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < bp);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return mobile;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AR = "America/Argentina/Buenos_Aires";

// Supabase returns timestamps without 'Z' but they are stored in UTC.
// Appending 'Z' forces the browser to treat them as UTC before converting to AR.
function parseUTC(iso: string): Date {
  if (!iso) return new Date(NaN);
  return new Date(/[Z+]/.test(iso) ? iso : iso + "Z");
}

function fmt(iso: string) {
  return parseUTC(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: AR,
  });
}

function fmtBal(b: number | undefined | null) {
  const n = Number(b ?? 0);
  if (!isFinite(n) || n === 0) return "0";
  if (n < 1e-9) return "0";
  if (n < 0.0001) return n.toFixed(8).replace(/\.?0+$/, "");
  if (n < 1) return n.toFixed(6).replace(/\.?0+$/, "");
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

const CURRENCIES = ["USDT","USDC","BTC","ETH","BNB","SOL","LTC","TRX","POL"];

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#111827", border: "1px solid #1e2a3d",
  borderRadius: "14px", overflow: "hidden",
};

const th: React.CSSProperties = {
  padding: "12px 16px", textAlign: "left", color: "#64748b",
  fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.8px", borderBottom: "1px solid #1e2a3d", whiteSpace: "nowrap",
  fontFamily: "'Inter', sans-serif",
};

const td: React.CSSProperties = {
  padding: "12px 16px", fontSize: "13px", color: "#e2e8f0",
  borderBottom: "1px solid #131d30", verticalAlign: "middle",
  fontFamily: "'Inter', sans-serif",
};

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#0d1525", border: "1px solid #2a3550",
  borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 12,
  outline: "none", boxSizing: "border-box", fontFamily: "'Inter', sans-serif",
};

const btnPrimary: React.CSSProperties = {
  background: "#f59e0b", border: "none", borderRadius: 8, color: "#0d1117",
  cursor: "pointer", fontSize: 13, fontWeight: 700, padding: "9px 18px",
  transition: "all .15s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
};

const btnSecondary: React.CSSProperties = {
  background: "transparent", border: "1px solid #2a3550", borderRadius: 8,
  color: "#94a3b8", cursor: "pointer", fontSize: 13, padding: "8px 16px",
  display: "flex", alignItems: "center", gap: 6, transition: "all .15s",
  fontFamily: "'Inter', sans-serif",
};

// ── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#1e2a3d", color: "#f59e0b", label: "Pendiente" },
  approved: { bg: "#0d2b1e", color: "#4ade80", label: "Aprobado"  },
  paid:     { bg: "#0d2224", color: "#22d3ee", label: "Pagado"    },
  rejected: { bg: "#1e0d0d", color: "#f87171", label: "Rechazado" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? { bg: "#1e2a3d", color: "#94a3b8", label: status };
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}40`,
      borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700,
      letterSpacing: "0.5px", whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

// ── Adjust-balance modal ──────────────────────────────────────────────────────

interface AdjustModalProps {
  user: AdminUser;
  token: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function AdjustModal({ user, token, onClose, onSuccess, onError }: AdjustModalProps) {
  const [amount, setAmount]     = useState("");
  const [currency, setCurrency] = useState("USDT");
  const [notes, setNotes]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function submit() {
    const parsed = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(parsed) || parsed === 0) {
      onError("Ingresá un monto distinto de cero (puede ser negativo para restar).");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/admin/adjust-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mander_id: user.mander_id, username: user.username,
          amount: parsed, currency, notes: notes.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error([data.error, data.hint].filter(Boolean).join(" "));
      onSuccess(data.message || `Balance ajustado para ${user.username}`);
      onClose();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const isPositive = parseFloat(amount) > 0;
  const isNegative = parseFloat(amount) < 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,.7)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#111827", border: "1px solid #2a3550",
        borderRadius: 10, padding: 28, width: "100%", maxWidth: 400,
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Ajustar balance</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            Usuario: <strong style={{ color: "#f59e0b" }}>{user.username}</strong>
          </p>
        </div>

        {user.balances.length > 0 && (
          <div style={{ background: "#0d1525", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#64748b" }}>
            <div style={{ fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>Balance actual:</div>
            {user.balances.map(b => (
              <div key={b.currency} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{b.currency}</span>
                <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{fmtBal(b.balance)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>
            Monto <span style={{ color: "#64748b", fontWeight: 400 }}>(positivo = sumar, negativo = restar)</span>
          </label>
          <input type="number" placeholder="ej: 50  o  -10" step="any" value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ ...inputStyle, borderColor: isPositive ? "#15803d" : isNegative ? "#dc2626" : "#2a3550", color: isPositive ? "#4ade80" : isNegative ? "#f87171" : "#e2e8f0" }}
          />
          {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) !== 0 && (
            <div style={{ fontSize: 11, marginTop: 4, color: isPositive ? "#4ade80" : "#f87171" }}>
              {isPositive ? `▲ Sumar ${Math.abs(parseFloat(amount))} ${currency}` : `▼ Restar ${Math.abs(parseFloat(amount))} ${currency}`}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>Moneda</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>
            Nota <span style={{ color: "#64748b", fontWeight: 400 }}>(opcional)</span>
          </label>
          <input type="text" placeholder="Motivo del ajuste..." value={notes}
            onChange={e => setNotes(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={submit} disabled={loading} style={{
            ...btnPrimary, flex: 1,
            background: loading ? "#374151" : "#f59e0b",
            color: loading ? "#9ca3af" : "#0d1117",
            cursor: loading ? "not-allowed" : "pointer",
          }}>
            {loading ? "Guardando..." : "Confirmar ajuste"}
          </button>
          <button onClick={onClose} style={{ ...btnSecondary }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── User Stats Modal ──────────────────────────────────────────────────────────

interface UserStats {
  totalWagered: number;
  betCount: number;
  totalDeposited: number;
  depositCount: number;
  totalWithdrawn: number;
  withdrawalCount: number;
  pendingWithdrawals: number;
  totalBonus: number;
  bonusCount: number;
  txTotal: number;
  firstActivity: string | null;
  lastActivity: string | null;
}

interface UserStatsData {
  profile: { id: string; mander_id: string; username: string; created_at: string; is_blocked: boolean };
  stats: UserStats;
  balances: { currency: string; balance: number; locked: number }[];
}

function UserStatsModal({ userId, token, onClose }: { userId: string; token: string; onClose: () => void }) {
  const [data, setData]       = useState<UserStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/admin/user/${userId}/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        setData(d);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error al cargar");
      } finally { setLoading(false); }
    })();
  }, [userId, token]);

  const fmtNum = (n: number) =>
    n === 0 ? "0" : n < 0.001 ? n.toExponential(2) : n.toLocaleString("en-US", { maximumFractionDigits: 4 });

  const fmtDate = (iso: string | null) =>
    iso ? parseUTC(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: AR }) : "—";

  const s = data?.stats;

  const StatRow = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1e2a3d" }}>
      <span style={{ color: "#64748b", fontSize: 13 }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: color ?? "#e2e8f0" }}>{value}</span>
        {sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#111827", border: "1px solid #2a3550", borderRadius: 18,
        width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
        fontFamily: "'Inter', sans-serif", boxShadow: "0 20px 60px rgba(0,0,0,.7)",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #1e2a3d", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            {data ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "#f59e0b" }}>{data.profile.username}</span>
                  {data.profile.is_blocked && (
                    <span style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 5, color: "#fca5a5", fontSize: 10, fontWeight: 700, padding: "2px 7px" }}>BLOQUEADO</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", marginTop: 4 }}>{data.profile.mander_id}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>Registrado {fmtDate(data.profile.created_at)}</div>
              </>
            ) : (
              <span style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>Estadísticas de usuario</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: "16px 24px 24px" }}>
          {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>Cargando estadísticas...</div>}
          {error  && <div style={{ color: "#fca5a5", fontSize: 13 }}>Error: {error}</div>}

          {data && s && (
            <>
              {/* Wagering */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>🎰 Juego</div>
                <StatRow label="Total apostado"  value={`$${fmtNum(s.totalWagered)}`}  sub={`${s.betCount} rondas`} color="#e2e8f0" />
                <StatRow label="Bonos recibidos" value={`$${fmtNum(s.totalBonus)}`}    sub={`${s.bonusCount} bonos`} />
              </div>

              {/* Deposits */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>⬇ Depósitos</div>
                <StatRow label="Total depositado" value={`$${fmtNum(s.totalDeposited)}`} sub={`${s.depositCount} depósito${s.depositCount !== 1 ? "s" : ""} confirmado${s.depositCount !== 1 ? "s" : ""}`} color="#4ade80" />
              </div>

              {/* Withdrawals */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>⬆ Retiros</div>
                <StatRow label="Total retirado"   value={`$${fmtNum(s.totalWithdrawn)}`} sub={`${s.withdrawalCount} retiro${s.withdrawalCount !== 1 ? "s" : ""} pagado${s.withdrawalCount !== 1 ? "s" : ""}`} color="#f87171" />
                {s.pendingWithdrawals > 0 && (
                  <StatRow label="Retiros pendientes" value={String(s.pendingWithdrawals)} color="#f59e0b" />
                )}
              </div>

              {/* Balances */}
              {data.balances.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#22d3ee", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>💰 Balance actual</div>
                  {data.balances.map(b => (
                    <StatRow
                      key={b.currency}
                      label={b.currency}
                      value={fmtNum(b.balance)}
                      sub={b.locked > 0 ? `${fmtNum(b.locked)} en retiro pendiente` : undefined}
                      color="#22d3ee"
                    />
                  ))}
                </div>
              )}

              {/* Activity */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>📅 Actividad</div>
                <StatRow label="Primera actividad" value={fmtDate(s.firstActivity)} />
                <StatRow label="Última actividad"  value={fmtDate(s.lastActivity)} />
                <StatRow label="Transacciones totales" value={String(s.txTotal)} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

const FALLBACK_PRICES: Record<string, number> = {
  USDT: 1, USDC: 1, BTC: 81000, ETH: 2400, BNB: 630, SOL: 85, LTC: 55, TRX: 0.34,
};

function useLivePrices() {
  const [prices, setPrices] = useState<Record<string, number>>(FALLBACK_PRICES);
  useEffect(() => {
    fetch("/api/live-prices").then(r => r.ok ? r.json() : null).then(d => { if (d) setPrices({ ...FALLBACK_PRICES, ...d }); }).catch(() => {});
  }, []);
  return prices;
}

function toUsdStr(amount: number, currency: string, prices: Record<string, number>): string {
  const price = prices[currency.toUpperCase()] ?? 1;
  const usd = amount * price;
  if (usd < 0.01) return "";
  return `≈$${usd.toFixed(2)}`;
}

function UsersTab({ token }: { token: string }) {
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [search, setSearch]       = useState("");
  const [adjusting, setAdjusting] = useState<AdminUser | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [blocking, setBlocking]   = useState<string | null>(null);
  const [statsUser, setStatsUser] = useState<AdminUser | null>(null);
  const [streamerUser, setStreamerUser] = useState<AdminUser | null>(null);
  const [streamerAmount, setStreamerAmount] = useState("");
  const [streamerBusy, setStreamerBusy] = useState(false);
  const prices = useLivePrices();

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(""); }
    try {
      const r = await fetch("/api/admin/users");
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      const fresh: AdminUser[] = data.users ?? [];
      if (silent) {
        // Only update state if something actually changed — avoids full re-render on every poll
        setUsers(prev => {
          if (prev.length === fresh.length && prev.every((u, i) =>
            u.id === fresh[i].id &&
            u.balance === fresh[i].balance &&
            u.balance_demo === fresh[i].balance_demo &&
            u.is_blocked === fresh[i].is_blocked
          )) return prev;
          return fresh;
        });
      } else {
        setUsers(fresh);
      }
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : "Error desconocido");
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh user list every 1 second — silent so no loading flash
  useEffect(() => {
    const id = setInterval(() => { load(true); }, 1_000);
    return () => clearInterval(id);
  }, [load]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function toggleBlock(u: AdminUser) {
    const action = u.is_blocked ? "unblock" : "block";
    setBlocking(u.id);
    try {
      const r = await fetch(`/api/admin/user/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: u.id }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.error ?? "Error", false); return; }
      showToast(data.message ?? "OK", true);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_blocked: !u.is_blocked } : x));
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error de red", false);
    } finally {
      setBlocking(null);
    }
  }

  async function addStreamerBalance() {
    if (!streamerUser || !streamerAmount) return;
    const amount = Number(streamerAmount);
    if (!Number.isFinite(amount) || amount === 0) { showToast("Monto inválido", false); return; }
    setStreamerBusy(true);
    try {
      const r = await fetch("/api/admin/add-streamer-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: streamerUser.id, amount_usd: amount }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.error ?? "Error", false); return; }
      showToast(data.message ?? "Balance demo acreditado", true);
      setStreamerUser(null);
      setStreamerAmount("");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error de red", false);
    } finally {
      setStreamerBusy(false);
    }
  }

  const [userView, setUserView] = useState<"all" | "streamers">("all");

  const blockedCount = users.filter(u => u.is_blocked).length;
  const streamers    = users.filter(u => (u.balance_demo ?? 0) > 0);
  const nonStreamers = users.filter(u => (u.balance_demo ?? 0) === 0);

  const filtered = (userView === "streamers" ? streamers : nonStreamers).filter(u =>
    !search || u.username.toLowerCase().includes(search.toLowerCase()) || u.mander_id.includes(search)
  );

  return (
    <>
      {statsUser && (
        <UserStatsModal userId={statsUser.id} token={token} onClose={() => setStatsUser(null)} />
      )}
      {adjusting && (
        <AdjustModal user={adjusting} token={token}
          onClose={() => { setAdjusting(null); load(); }}
          onSuccess={(msg) => showToast(msg, true)}
          onError={(msg) => showToast(msg, false)}
        />
      )}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9998,
          background: toast.ok ? "#15803d" : "#dc2626",
          color: "#fff", borderRadius: 10, padding: "12px 20px",
          fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: 420,
        }}>{toast.msg}</div>
      )}

      {/* Streamer Balance Modal */}
      {streamerUser && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}
          onClick={e => { if (e.target === e.currentTarget) { setStreamerUser(null); setStreamerAmount(""); } }}>
          <div style={{ background:"#111827",border:"1px solid #2a3550",borderRadius: 10,padding:28,width:"100%",maxWidth:380,fontFamily:"'Inter', sans-serif" }}>
            <div style={{ marginBottom:18 }}>
              <h2 style={{ margin:0,fontSize:18,fontWeight:700,color:"#e2e8f0" }}>Saldo Streamer</h2>
              <p style={{ margin:"4px 0 0",color:"#64748b",fontSize:13 }}>
                Usuario: <strong style={{ color:"#a78bfa" }}>{streamerUser.username}</strong>
              </p>
              <p style={{ margin:"6px 0 0",color:"#64748b",fontSize:12,lineHeight:1.5 }}>
                El saldo demo NO puede ser retirado. Se usa para apostar y las ganancias quedan como demo.
              </p>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:"block",fontSize:12,color:"#94a3b8",marginBottom:6,fontWeight:600 }}>Monto USD a acreditar</label>
              <input type="number" placeholder="ej: 500 (negativo para descontar)" step="any" value={streamerAmount}
                onChange={e => setStreamerAmount(e.target.value)}
                style={{ ...inputStyle, borderColor: streamerAmount && Number(streamerAmount) !== 0 ? "#7c3aed" : "#2a3550" }}
                autoFocus />
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={addStreamerBalance} disabled={streamerBusy || !streamerAmount || Number(streamerAmount) === 0}
                style={{ ...btnPrimary,flex:1,background:streamerBusy||!streamerAmount||Number(streamerAmount)===0?"#374151":"#7c3aed",color:streamerBusy||!streamerAmount||Number(streamerAmount)===0?"#9ca3af":"#fff",cursor:streamerBusy||!streamerAmount||Number(streamerAmount)===0?"not-allowed":"pointer" }}>
                {streamerBusy ? "Procesando..." : (Number(streamerAmount) < 0 ? "Descontar Demo" : "Acreditar Demo")}
              </button>
              <button onClick={() => { setStreamerUser(null); setStreamerAmount(""); }} style={btnSecondary}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Usuarios</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
            {loading ? "Cargando..." : `${users.length} usuario${users.length !== 1 ? "s" : ""} registrado${users.length !== 1 ? "s" : ""}`}
            {!loading && blockedCount > 0 && (
              <span style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 6, color: "#fca5a5", fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>
                🚫 {blockedCount} bloqueado{blockedCount !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input type="text" placeholder="Buscar por username o ID..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, minWidth: 180, flex: 1 }} />
          <button onClick={() => load()} disabled={loading} style={btnSecondary}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {(["all", "streamers"] as const).map(v => {
          const active = userView === v;
          const label  = v === "all"
            ? `👥 Usuarios (${nonStreamers.length})`
            : `🎥 Streamers (${streamers.length})`;
          return (
            <button key={v} onClick={() => { setUserView(v); setSearch(""); }} style={{
              background: active ? (v === "streamers" ? "#4c1d95" : "#1e3a5f") : "#0d1117",
              border: `1px solid ${active ? (v === "streamers" ? "#7c3aed" : "#2563eb") : "#2a3550"}`,
              borderRadius: 8, color: active ? "#e2e8f0" : "#64748b",
              cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
              padding: "8px 18px", transition: "all .15s", fontFamily: "'Inter', sans-serif",
            }}>{label}</button>
          );
        })}
      </div>

      {error && (
        <div style={{ background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10, padding: "14px 18px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>Cargando usuarios...</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: "50px 0", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>{userView === "streamers" ? "🎥" : "👤"}</div>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 15 }}>
            {search
              ? "No se encontraron usuarios"
              : userView === "streamers"
                ? "No hay streamers con saldo demo activo"
                : "Sin usuarios registrados"}
          </div>
        </div>
      ) : userView === "streamers" ? (
        /* ── Streamers table ──────────────────────────────────────── */
        <div style={{ ...card, border: "1px solid #4c1d95" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #2a1f4a" }}>
            <span style={{ fontSize: 20 }}>🎥</span>
            <div>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#c4b5fd" }}>Streamers con saldo demo</span>
              <span style={{ marginLeft: 10, background: "#4c1d95", border: "1px solid #7c3aed", borderRadius: 12, color: "#ddd6fe", fontSize: 11, fontWeight: 700, padding: "2px 9px" }}>
                {streamers.length}
              </span>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={th}>Streamer</th>
                  <th style={th}>Saldo demo</th>
                  <th style={th}>Saldo real</th>
                  <th style={th}>Registro</th>
                  <th style={{ ...th, textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1a1230")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    style={{ transition: "background .15s" }}
                  >
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14 }}>🎥</span>
                        <span
                          onClick={() => setStatsUser(u)}
                          style={{ fontWeight: 700, color: "#a78bfa", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
                          title="Ver estadísticas"
                        >{u.username}</span>
                        {u.is_blocked && (
                          <span style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 5, color: "#fca5a5", fontSize: 10, fontWeight: 700, padding: "1px 6px" }}>BLOQUEADO</span>
                        )}
                      </div>
                      {u.email && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{u.email}</div>}
                    </td>
                    <td style={td}>
                      <span style={{
                        background: "#2e1065", border: "1px solid #7c3aed",
                        borderRadius: 8, padding: "4px 12px", fontSize: 14,
                        color: "#c4b5fd", fontWeight: 800, letterSpacing: "0.3px",
                      }}>
                        ${fmtBal(u.balance_demo ?? 0)} <span style={{ fontSize: 11, fontWeight: 500, color: "#7c3aed" }}>DEMO</span>
                      </span>
                    </td>
                    <td style={td}>
                      {u.balances.length === 0 ? (
                        <span style={{ color: "#334155", fontSize: 12 }}>—</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {u.balances.map(b => (
                            <span key={b.currency} style={{ background: "#1e2a3d", border: "1px solid #2a3550", borderRadius: 6, padding: "2px 8px", fontSize: 12, color: "#94a3b8" }}>
                              <strong style={{ color: "#e2e8f0" }}>{fmtBal(b.balance)}</strong> {b.currency}
                              {toUsdStr(b.balance, b.currency, prices) && (
                                <span style={{ color: "#64748b", fontSize: 10, marginLeft: 4 }}>{toUsdStr(b.balance, b.currency, prices)}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(u.created_at)}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        <button onClick={() => { setStreamerUser(u); setStreamerAmount(""); }} style={{
                          background: "#2e1065", border: "1px solid #7c3aed",
                          borderRadius: 8, color: "#c4b5fd", cursor: "pointer",
                          fontSize: 12, fontWeight: 700, padding: "7px 14px",
                          transition: "all .15s", fontFamily: "'Inter', sans-serif",
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#7c3aed"; e.currentTarget.style.color = "#fff"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#2e1065"; e.currentTarget.style.color = "#c4b5fd"; }}
                        >💰 Ajustar demo</button>
                        <button onClick={() => setAdjusting(u)} style={{
                          background: "#1e2a3d", border: "1px solid #2a3550",
                          borderRadius: 8, color: "#f59e0b", cursor: "pointer",
                          fontSize: 12, fontWeight: 600, padding: "7px 12px",
                          transition: "all .15s", fontFamily: "'Inter', sans-serif",
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#f59e0b"; e.currentTarget.style.color = "#0d1117"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#1e2a3d"; e.currentTarget.style.color = "#f59e0b"; }}
                        >Ajustar real</button>
                        <button
                          onClick={() => toggleBlock(u)} disabled={blocking === u.id}
                          style={{
                            background: u.is_blocked ? "#14532d" : "#450a0a",
                            border: `1px solid ${u.is_blocked ? "#166534" : "#7f1d1d"}`,
                            borderRadius: 8, cursor: blocking === u.id ? "not-allowed" : "pointer",
                            color: u.is_blocked ? "#86efac" : "#fca5a5",
                            fontSize: 12, fontWeight: 600, padding: "7px 12px",
                            opacity: blocking === u.id ? 0.6 : 1,
                            transition: "all .15s", fontFamily: "'Inter', sans-serif",
                          }}
                          onMouseEnter={e => { if (blocking !== u.id) e.currentTarget.style.opacity = "0.8"; }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                        >{blocking === u.id ? "..." : u.is_blocked ? "Desbloquear" : "Bloquear"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Regular users table ──────────────────────────────────── */
        <div style={card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={th}>Usuario</th>
                  <th style={th}>Mander ID</th>
                  <th style={th}>Balances</th>
                  <th style={th}>Cód. referido</th>
                  <th style={th}>Registro</th>
                  <th style={{ ...th, textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}
                    onMouseEnter={e => (e.currentTarget.style.background = u.is_blocked ? "#1a0a0a" : "#131d30")}
                    onMouseLeave={e => (e.currentTarget.style.background = u.is_blocked ? "#120808" : "transparent")}
                    style={{ transition: "background .15s", background: u.is_blocked ? "#120808" : "transparent" }}
                  >
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span
                          onClick={() => setStatsUser(u)}
                          style={{ fontWeight: 700, color: u.is_blocked ? "#f87171" : "#f59e0b", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
                          title="Ver estadísticas"
                        >{u.username}</span>
                        {u.is_flagged && (
                          <span style={{ background: "#1a1205", border: "1px solid #78350f", borderRadius: 4, color: "#fbbf24", fontSize: 9, fontWeight: 700, padding: "1px 5px", letterSpacing: "0.3px" }}>
                            ⚑
                          </span>
                        )}
                        {u.is_blocked && (
                          <span style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 5, color: "#fca5a5", fontSize: 10, fontWeight: 700, padding: "1px 6px", letterSpacing: "0.3px" }}>
                            BLOQUEADO
                          </span>
                        )}
                      </div>
                      {u.email && (
                        <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{u.email}</div>
                      )}
                    </td>
                    <td style={td}><span style={{ fontFamily: "monospace", fontSize: 11, color: "#475569" }}>{u.mander_id || "—"}</span></td>
                    <td style={td}>
                      {u.balances.length === 0 && !u.balance_demo ? (
                        <span style={{ color: "#475569", fontSize: 12 }}>Sin saldo</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {u.balances.map(b => (
                            <span key={b.currency} style={{
                              background: "#1e2a3d", border: "1px solid #2a3550",
                              borderRadius: 6, padding: "2px 8px", fontSize: 12, color: "#94a3b8",
                            }}>
                              <strong style={{ color: "#e2e8f0" }}>{fmtBal(b.balance)}</strong> {b.currency}
                              {toUsdStr(b.balance, b.currency, prices) && (
                                <span style={{ color: "#64748b", fontSize: 10, marginLeft: 4 }}>{toUsdStr(b.balance, b.currency, prices)}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {u.ref_code_used ? (
                        <div>
                          <span style={{ fontFamily: "monospace", fontSize: 12, background: "#1e2a3d", border: "1px solid #2a3550", borderRadius: 5, padding: "2px 7px", color: "#f59e0b", fontWeight: 700, letterSpacing: "0.5px" }}>
                            {u.ref_code_used}
                          </span>
                          {u.referred_by && (
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>via {u.referred_by}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#334155", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(u.created_at)}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                        <button onClick={() => setAdjusting(u)} style={{
                          background: "#1e2a3d", border: "1px solid #2a3550",
                          borderRadius: 8, color: "#f59e0b", cursor: "pointer",
                          fontSize: 12, fontWeight: 600, padding: "7px 12px",
                          transition: "all .15s", fontFamily: "'Inter', sans-serif",
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#f59e0b"; e.currentTarget.style.color = "#0d1117"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#1e2a3d"; e.currentTarget.style.color = "#f59e0b"; }}
                        >Ajustar</button>
                        <button onClick={() => { setStreamerUser(u); setStreamerAmount(""); }} style={{
                          background: "#1e2a3d", border: "1px solid #2a3550",
                          borderRadius: 8, color: "#a78bfa", cursor: "pointer",
                          fontSize: 12, fontWeight: 600, padding: "7px 12px",
                          transition: "all .15s", fontFamily: "'Inter', sans-serif",
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#a78bfa"; e.currentTarget.style.color = "#0d1117"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#1e2a3d"; e.currentTarget.style.color = "#a78bfa"; }}
                        >Demo</button>
                        <button
                          onClick={() => toggleBlock(u)}
                          disabled={blocking === u.id}
                          style={{
                            background: u.is_blocked ? "#14532d" : "#450a0a",
                            border: `1px solid ${u.is_blocked ? "#166534" : "#7f1d1d"}`,
                            borderRadius: 8, cursor: blocking === u.id ? "not-allowed" : "pointer",
                            color: u.is_blocked ? "#86efac" : "#fca5a5",
                            fontSize: 12, fontWeight: 600, padding: "7px 12px",
                            opacity: blocking === u.id ? 0.6 : 1,
                            transition: "all .15s", fontFamily: "'Inter', sans-serif",
                          }}
                          onMouseEnter={e => { if (blocking !== u.id) e.currentTarget.style.opacity = "0.8"; }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                        >
                          {blocking === u.id ? "..." : u.is_blocked ? "Desbloquear" : "Bloquear"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── Deposits Tab ──────────────────────────────────────────────────────────────

type DepositRow = PendingDeposit & { tx_hash?: string; status: string };

function DepositsTab() {
  const [deposits, setDeposits]     = useState<DepositRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [inputs, setInputs]         = useState<Record<number, ConfirmInputs>>({});
  const [confirming, setConfirming] = useState<number | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [showManualCredit, setShowManualCredit] = useState(false);
  const [creditForm, setCreditForm] = useState({ username: "", currency: "USDT", amount: "", note: "" });
  const [crediting, setCrediting]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/deposits?status=all", { cache: "no-store" });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      setDeposits(data.deposits ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function getInput(id: number): ConfirmInputs { return inputs[id] ?? { amount: "", txHash: "" }; }
  function setField(id: number, field: keyof ConfirmInputs, value: string) {
    setInputs(prev => ({ ...prev, [id]: { ...getInput(id), [field]: value } }));
  }
  function showToast(msg: string, ok: boolean) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  async function confirm(d: DepositRow) {
    const { amount, txHash } = getInput(d.id);
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) { showToast("Ingresá el monto recibido antes de confirmar", false); return; }
    setConfirming(d.id);
    try {
      const r = await fetch("/api/deposit/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit_id: String(d.id), amount: parsedAmount, tx_hash: txHash.trim() || undefined }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error ?? `Error ${r.status}`);
      showToast(`Depósito #${d.id} confirmado — $${parsedAmount} acreditado a ${d.username} ✓`, true);
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error al confirmar", false);
    } finally { setConfirming(null); }
  }

  async function handleManualCredit() {
    const { username, currency, amount, note } = creditForm;
    const parsedAmt = parseFloat(amount.replace(",", "."));
    if (!username.trim()) { showToast("Ingresá el nombre de usuario", false); return; }
    if (!parsedAmt || parsedAmt <= 0) { showToast("Ingresá un monto válido", false); return; }
    setCrediting(true);
    try {
      const token = Object.keys(localStorage).filter(k => k.startsWith("mander_game_token_")).map(k => localStorage.getItem(k)).filter(Boolean)[0] || "";
      const r = await fetch("/api/admin/credit-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ username: username.trim(), currency: currency.trim().toUpperCase(), amount_usd: parsedAmt, note: note.trim() || undefined }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error ?? `Error ${r.status}`);
      showToast(data.message ?? "Balance acreditado ✓", true);
      setCreditForm({ username: "", currency: "USDT", amount: "", note: "" });
      setShowManualCredit(false);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error al acreditar", false);
    } finally { setCrediting(false); }
  }

  const pending   = deposits.filter(d => d.status === "pending");
  const confirmed = deposits.filter(d => d.status === "confirmed");

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      pending:   { bg: "#1a1205", color: "#f59e0b", label: "Pendiente" },
      confirmed: { bg: "#052e16", color: "#22c55e", label: "Confirmado" },
      rejected:  { bg: "#1e1215", color: "#f87171", label: "Rechazado" },
    };
    const m = map[s] ?? { bg: "#0d1117", color: "#64748b", label: s };
    return (
      <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}44`, borderRadius: 5, fontSize: 10, fontWeight: 700, padding: "2px 7px" }}>
        {m.label}
      </span>
    );
  };

  return (
    <>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.ok ? "#15803d" : "#dc2626", color: "#fff", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: 420 }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Depósitos</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading ? "Cargando..." : `${confirmed.length} confirmado${confirmed.length !== 1 ? "s" : ""}`}
            {!loading && pending.length > 0 && (
              <span style={{ color: "#f59e0b", marginLeft: 8 }}>· {pending.length} wallet{pending.length !== 1 ? "s" : ""} en espera</span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {pending.length > 0 && (
            <button onClick={() => setShowPending(v => !v)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${showPending ? "#f59e0b" : "#2d3748"}`,
              background: showPending ? "#1a120522" : "#0d1117",
              color: showPending ? "#f59e0b" : "#64748b",
            }}>
              {showPending ? "▼" : "▶"} Wallets en espera ({pending.length})
            </button>
          )}
          <button onClick={() => setShowManualCredit(v => !v)} style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${showManualCredit ? "#22c55e" : "#1e2a3d"}`,
            background: showManualCredit ? "#052e1633" : "#0d1117",
            color: showManualCredit ? "#22c55e" : "#94a3b8",
          }}>
            ⚡ Acreditación manual
          </button>
          <button onClick={() => load()} disabled={loading} style={btnSecondary}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {showManualCredit && (
        <div style={{ background: "#050f1a", border: "1px solid #22c55e44", borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ color: "#22c55e", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>⚡ Acreditación Manual de Balance</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, marginBottom: 8 }}>
            <input
              placeholder="Username del usuario"
              value={creditForm.username}
              onChange={e => setCreditForm(p => ({ ...p, username: e.target.value }))}
              style={{ background: "#0d1117", border: "1px solid #1e2a3d", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 13 }}
            />
            <select
              value={creditForm.currency}
              onChange={e => setCreditForm(p => ({ ...p, currency: e.target.value }))}
              style={{ background: "#0d1117", border: "1px solid #1e2a3d", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 13 }}
            >
              {["USDT","USDC","BTC","ETH","BNB","SOL","LTC","TRX","POL"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              placeholder="Monto USD"
              type="number"
              min="0"
              step="0.01"
              value={creditForm.amount}
              onChange={e => setCreditForm(p => ({ ...p, amount: e.target.value }))}
              style={{ background: "#0d1117", border: "1px solid #1e2a3d", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 13 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Nota (opcional): ej: Depósito manual TRC20 $6 — TX hash"
              value={creditForm.note}
              onChange={e => setCreditForm(p => ({ ...p, note: e.target.value }))}
              style={{ flex: 1, background: "#0d1117", border: "1px solid #1e2a3d", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 13 }}
            />
            <button onClick={handleManualCredit} disabled={crediting} style={{
              padding: "7px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: crediting ? "not-allowed" : "pointer",
              background: crediting ? "#064e3b" : "#16a34a", color: "#fff", border: "none",
            }}>
              {crediting ? "Acreditando…" : "Acreditar"}
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10, padding: "14px 18px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>Error: {error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>Cargando depósitos...</div>
      ) : confirmed.length === 0 ? (
        <div style={{ ...card, padding: "60px 0", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💳</div>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Sin depósitos confirmados</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>Aquí aparecerán los depósitos cuando el pago sea recibido y confirmado.</div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 580 }}>
              <thead>
                <tr>
                  <th style={th}>#ID</th>
                  <th style={th}>Usuario</th>
                  <th style={th}>Moneda / Red</th>
                  <th style={th}>Fecha</th>
                  <th style={th}>Monto (USD)</th>
                  <th style={th}>Estado</th>
                  <th style={th}>TX Hash</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map((d, i) => (
                  <tr key={d.id}
                    onMouseEnter={e => (e.currentTarget.style.background = "#131d30")}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#0d1117" : "#0a1120")}
                    style={{ background: i % 2 === 0 ? "#0d1117" : "#0a1120", transition: "background .15s" }}
                  >
                    <td style={{ ...td, color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>#{d.id}</td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{d.username}</span>
                        {d.is_flagged && <span style={{ background: "#1a1205", border: "1px solid #78350f", borderRadius: 4, color: "#fbbf24", fontSize: 9, fontWeight: 700, padding: "1px 5px" }}>⚑</span>}
                      </div>
                      {d.mander_id && <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{d.mander_id.slice(0,12)}…</div>}
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{d.currency}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{d.network}</div>
                    </td>
                    <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(d.created_at)}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 700, color: "#4ade80" }}>${Number(d.amount_usd ?? d.amount).toFixed(2)}</span>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{Number(d.amount).toFixed(8)} {d.currency}</div>
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>{statusBadge(d.status)}</td>
                    <td style={{ ...td, fontSize: 11, color: "#475569", fontFamily: "monospace", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {d.tx_hash ? <span title={d.tx_hash}>{String(d.tx_hash).slice(0,14)}…</span> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPending && pending.length > 0 && (
        <div style={{ marginTop: 16, border: "1px solid #f59e0b44", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ background: "#1a120510", padding: "10px 16px", borderBottom: "1px solid #f59e0b33", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 13 }}>⏳ Wallets en espera de pago</span>
            <span style={{ color: "#64748b", fontSize: 12 }}>Confirmá manualmente si el usuario envió el pago</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 580 }}>
              <thead>
                <tr>
                  <th style={th}>#ID</th>
                  <th style={th}>Usuario</th>
                  <th style={th}>Moneda / Red</th>
                  <th style={th}>Fecha</th>
                  <th style={th}>Monto (USD)</th>
                  <th style={th}>TX Hash</th>
                  <th style={{ ...th, textAlign: "center" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((d, i) => {
                  const inp = getInput(d.id);
                  const busy = confirming === d.id;
                  return (
                    <tr key={d.id}
                      onMouseEnter={e => (e.currentTarget.style.background = "#131d30")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#0d1117" : "#0a1120")}
                      style={{ background: i % 2 === 0 ? "#0d1117" : "#0a1120", transition: "background .15s" }}
                    >
                      <td style={{ ...td, color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>#{d.id}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{d.username}</div>
                        {d.mander_id && <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{d.mander_id.slice(0,12)}…</div>}
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{d.currency}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{d.network}</div>
                      </td>
                      <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(d.created_at)}</td>
                      <td style={td}>
                        <input type="number" placeholder="0.00" step="any" min="0"
                          value={inp.amount} onChange={e => setField(d.id, "amount", e.target.value)}
                          style={{ ...inputStyle, width: 90 }} />
                      </td>
                      <td style={td}>
                        <input type="text" placeholder="TxHash (opcional)"
                          value={inp.txHash} onChange={e => setField(d.id, "txHash", e.target.value)}
                          style={{ ...inputStyle, width: 130 }} />
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <button onClick={() => confirm(d)} disabled={busy} style={{ ...btnPrimary, fontSize: 12, padding: "7px 13px", background: busy ? "#374151" : "#f59e0b", color: busy ? "#9ca3af" : "#0d1117", cursor: busy ? "not-allowed" : "pointer" }}>
                          {busy ? "..." : "Confirmar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── Withdrawals Tab ───────────────────────────────────────────────────────────

function WithdrawalsTab({ token }: { token: string }) {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [txInputs, setTxInputs]       = useState<Record<string, string>>({});
  const [acting, setActing]           = useState<string | null>(null);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [filter, setFilter]           = useState<string>("all");
  const [usernameSearch, setUsernameSearch] = useState<string>("");
  const [dismissedDemoAlerts, setDismissedDemoAlerts] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/withdrawals", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      setWithdrawals(data.withdrawals ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // Map from endpoint → optimistic new status shown immediately on click
  const OPTIMISTIC_STATUS: Record<string, Withdrawal["status"]> = {
    "/admin/withdraw/approve": "approved",
    "/admin/withdraw/reject":  "rejected",
    "/admin/withdraw/pay":     "processing",
  };

  async function action(endpoint: string, withdrawal_id: string, extra?: Record<string, string>) {
    const newStatus = OPTIMISTIC_STATUS[endpoint];

    // 1. Optimistic update — instant visual feedback
    if (newStatus) {
      setWithdrawals(prev => prev.map(w => w.id === withdrawal_id ? { ...w, status: newStatus } : w));
    }
    setActing(withdrawal_id);

    try {
      const r = await fetch(`/api${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ withdrawal_id, ...extra }),
      });
      const data = await r.json();
      if (!r.ok) {
        // Revert optimistic update on error
        if (newStatus) setWithdrawals(prev => prev.map(w => w.id === withdrawal_id ? { ...w, status: "pending" } : w));
        throw new Error(data.error || `Error ${r.status}`);
      }
      showToast(data.message || "Operación exitosa", true);
      // Background refresh — non-blocking, just syncs server state
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error desconocido", false);
    } finally { setActing(null); }
  }

  const filtered = withdrawals.filter(w =>
    (filter === "all" || w.status === filter) &&
    (!usernameSearch.trim() || (w.username ?? "").toLowerCase().includes(usernameSearch.trim().toLowerCase()))
  );
  const counts   = withdrawals.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1; return acc;
  }, {});

  return (
    <>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? "#15803d" : "#dc2626",
          color: "#fff", borderRadius: 10, padding: "12px 20px",
          fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: 420,
        }}>{toast.msg}</div>
      )}

      {/* ── Alert banner: demo withdrawal attempts ───────────────────────────── */}
      {withdrawals
        .filter(w => w.is_streamer_withdrawal && w.status === "pending" && !dismissedDemoAlerts.has(w.id))
        .map(w => (
          <div key={w.id} style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.08))",
            border: "1.5px solid rgba(239,68,68,0.55)",
            borderRadius: 10, padding: "12px 16px", marginBottom: 14,
            boxShadow: "0 0 18px rgba(239,68,68,0.18)",
          }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>🚨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f87171", marginBottom: 3 }}>
                Alerta: intento de retiro con saldo demo
              </div>
              <div style={{ fontSize: 13, color: "#e2e8f0" }}>
                <strong style={{ color: "#fbbf24" }}>{w.username}</strong>
                {" "}solicitó retirar{" "}
                <strong style={{ color: "#f87171" }}>{fmtBal(w.amount_usd ?? w.amount)} USD</strong>
                {" "}({fmtBal(w.amount)} {w.currency}) con saldo demo.
              </div>
            </div>
            <button
              onClick={() => setDismissedDemoAlerts(prev => new Set([...prev, w.id]))}
              style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
              title="Descartar alerta"
            >×</button>
          </div>
        ))
      }
      {/* ──────────────────────────────────────────────────────────────────────── */}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Retiros</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading ? "Cargando..." : `${withdrawals.length} retiro${withdrawals.length !== 1 ? "s" : ""} en total`}
            {counts.pending ? <span style={{ color: "#f59e0b", marginLeft: 8, fontWeight: 600 }}>· {counts.pending} pendiente{counts.pending !== 1 ? "s" : ""}</span> : null}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Buscar usuario..."
            value={usernameSearch}
            onChange={e => setUsernameSearch(e.target.value)}
            style={{
              background: "#0d1117", border: "1px solid #2a3550", borderRadius: 8,
              color: "#e2e8f0", fontSize: 12, fontWeight: 500, padding: "6px 12px",
              fontFamily: "'Inter', sans-serif", outline: "none", width: 160,
            }}
          />
          {["all","pending","approved","paid","rejected"].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              background: filter === s ? "#f59e0b" : "transparent",
              border: `1px solid ${filter === s ? "#f59e0b" : "#2a3550"}`,
              borderRadius: 8, color: filter === s ? "#0d1117" : "#94a3b8",
              cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 12px",
              fontFamily: "'Inter', sans-serif", transition: "all .15s",
            }}>
              {s === "all" ? "Todos" : STATUS_COLORS[s]?.label ?? s}
              {s !== "all" && counts[s] ? ` (${counts[s]})` : ""}
            </button>
          ))}
          <button onClick={load} disabled={loading} style={btnSecondary}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10, padding: "14px 18px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>Cargando retiros...</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: "60px 0", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 16 }}>Sin retiros{filter !== "all" ? ` ${STATUS_COLORS[filter]?.label?.toLowerCase() ?? filter}s` : ""}</div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={th}>Usuario</th>
                  <th style={th}>Monto Retiro</th>
                  <th style={th}>Último Depósito</th>
                  <th style={th}>Red</th>
                  <th style={{ ...th, minWidth: 180 }}>Wallet</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Fecha</th>
                  <th style={{ ...th, minWidth: 220 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => {
                  const busy = acting === w.id;
                  const txVal = txInputs[w.id] ?? "";
                  return (
                    <tr key={w.id}
                      onMouseEnter={e => (e.currentTarget.style.background = "#131d30")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      style={{ transition: "background .15s" }}
                    >
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, color: "#f59e0b" }}>{w.username}</span>
                          {w.is_flagged && (
                            <span style={{ background: "#1a1205", border: "1px solid #78350f", borderRadius: 4, color: "#fbbf24", fontSize: 9, fontWeight: 700, padding: "1px 5px" }}>⚑</span>
                          )}
                          {w.is_streamer_withdrawal && (
                            <span style={{ background: "#1a0f0f", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 4, color: "#f87171", fontSize: 9, fontWeight: 700, padding: "1px 6px", letterSpacing: "0.04em" }}>SALDO DEMO</span>
                          )}
                        </div>
                        {w.is_streamer_withdrawal && (
                          <div style={{ marginTop: 5, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "5px 8px" }}>
                            <div style={{ fontSize: 10, color: "#f87171", fontWeight: 700 }}>🚨 Intento de retiro con saldo demo</div>
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginTop: 2 }}>{w.mander_id?.slice(0,12)}…</div>
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0" }}>
                          {fmtBal(w.amount_usd ?? w.amount)} USD
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          {fmtBal(w.amount)} {w.currency}
                        </div>
                        {(() => {
                          const amtUsd = w.amount_usd ?? w.amount;
                          const fee = getWFee(w.currency, w.network);
                          const net = Math.max(0, amtUsd - fee);
                          return (
                            <div style={{ marginTop: 3 }}>
                              <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>
                                Enviar: {fmtBal(net)} USD
                              </div>
                              {fee > 0 && (
                                <div style={{ fontSize: 10, color: "#64748b" }}>
                                  Fee {w.network}: −${fee}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td style={td}>
                        {w.last_deposit ? (() => {
                          const dep = w.last_deposit;
                          const depUsd = dep.amount_usd ?? dep.amount;
                          const witUsd = w.amount_usd ?? w.amount;
                          const diff = depUsd - witUsd;
                          const isProfit = diff > 0; // casino ganó (depósito USD > retiro USD)
                          return (
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>
                                {fmtBal(dep.amount)} {dep.currency}
                              </div>
                              <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: isProfit ? "#4ade80" : "#f87171" }}>
                                {isProfit
                                  ? `Casino ganó $${fmtBal(Math.abs(diff))}`
                                  : `Casino perdió $${fmtBal(Math.abs(diff))}`}
                              </div>
                              <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>
                                {fmt(dep.created_at)}
                              </div>
                            </div>
                          );
                        })() : (
                          <span style={{ fontSize: 11, color: "#475569" }}>Sin depósitos</span>
                        )}
                      </td>
                      <td style={{ ...td, fontSize: 12 }}>{w.network}</td>
                      <td style={td}>
                        <div style={{
                          fontFamily: "monospace", fontSize: 11, color: "#94a3b8",
                          maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }} title={w.wallet}>{w.wallet}</div>
                        {w.tx_hash && (
                          <div style={{ fontSize: 10, color: "#22d3ee", fontFamily: "monospace", marginTop: 2 }}>
                            TX: {w.tx_hash.slice(0, 20)}…
                          </div>
                        )}
                      </td>
                      <td style={td}><StatusBadge status={w.status} /></td>
                      <td style={{ ...td, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{fmt(w.created_at)}</td>
                      <td style={td}>
                        {w.status === "pending" && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button onClick={() => action("/admin/withdraw/approve", w.id)} disabled={busy} style={{
                              background: "#0d2b1e", border: "1px solid #166534", borderRadius: 7,
                              color: "#4ade80", cursor: busy ? "not-allowed" : "pointer",
                              fontSize: 12, fontWeight: 600, padding: "6px 12px",
                              fontFamily: "'Inter', sans-serif", transition: "all .15s",
                            }}>
                              {busy ? "..." : "Aprobar"}
                            </button>
                            <button onClick={() => action("/admin/withdraw/reject", w.id)} disabled={busy} style={{
                              background: "#1e0d0d", border: "1px solid #7f1d1d", borderRadius: 7,
                              color: "#f87171", cursor: busy ? "not-allowed" : "pointer",
                              fontSize: 12, fontWeight: 600, padding: "6px 12px",
                              fontFamily: "'Inter', sans-serif", transition: "all .15s",
                            }}>
                              {busy ? "..." : "Rechazar"}
                            </button>
                          </div>
                        )}
                        {w.status === "approved" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <button onClick={() => action("/admin/withdraw/pay", w.id)} disabled={busy} style={{
                              background: "#0d2224", border: "1px solid #0891b2", borderRadius: 7,
                              color: "#22d3ee", cursor: busy ? "not-allowed" : "pointer",
                              fontSize: 12, fontWeight: 600, padding: "7px 14px",
                              fontFamily: "'Inter', sans-serif", transition: "all .15s", whiteSpace: "nowrap",
                            }}>
                              {busy ? "Enviando…" : "⚡ Enviar automático"}
                            </button>
                            <div style={{ fontSize: 10, color: "#475569", textAlign: "center" }}>
                              vía Plisio
                            </div>
                          </div>
                        )}
                        {w.status === "processing" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <button
                              onClick={async () => {
                                // Optimistic update
                                setWithdrawals(prev => prev.map(x => x.id === w.id ? { ...x, status: "paid" } : x));
                                setActing(w.id);
                                try {
                                  const r = await fetch("/api/admin/withdraw/mark-paid", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ withdrawal_id: w.id }),
                                  });
                                  const d = await r.json();
                                  if (!r.ok) {
                                    setWithdrawals(prev => prev.map(x => x.id === w.id ? { ...x, status: "processing" } : x));
                                    alert(d.error ?? "Error");
                                  } else {
                                    showToast("Retiro marcado como pagado", true);
                                    load();
                                  }
                                } finally { setActing(null); }
                              }}
                              disabled={busy}
                              style={{
                                background: "#0d1e2b", border: "1px solid #1d4ed8", borderRadius: 7,
                                color: "#60a5fa", cursor: busy ? "not-allowed" : "pointer",
                                fontSize: 12, fontWeight: 600, padding: "7px 14px",
                                fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                              }}
                            >
                              {busy ? "..." : "✓ Marcar Pagado"}
                            </button>
                            <div style={{ fontSize: 10, color: "#475569", textAlign: "center" }}>
                              en espera de blockchain
                            </div>
                          </div>
                        )}
                        {(w.status === "paid" || w.status === "rejected") && (
                          <span style={{ color: "#475569", fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── Alerts Tab ────────────────────────────────────────────────────────────────

type AlertSeverity = "critical" | "medium" | "low";
type AlertType =
  | "large_withdrawal" | "large_deposit" | "balance_drain"
  | "rapid_activity"  | "instant_withdrawal" | "multiple_pending"
  | "flagged_wallet"  | "high_locked" | "low_wagering_cashout";

interface Alert {
  id: string; severity: AlertSeverity; type: AlertType;
  title: string; detail: string; username: string; userId: string;
  amount?: number; currency?: string; wallet?: string; network?: string;
  txId?: string; createdAt: string;
}
interface AlertsData {
  alerts: Alert[];
  summary: { total: number; critical: number; medium: number; low: number };
  blockedUsers: { id: string; username: string; blocked_at: string | null }[];
  flaggedUsers: { id: string; username: string; flagged_at: string | null }[];
  period: string;
  generatedAt: string;
}

const SEV: Record<AlertSeverity, { color: string; bg: string; border: string; label: string; dot: string }> = {
  critical: { color: "#f87171", bg: "#1a0808", border: "#7f1d1d", label: "Crítica", dot: "🔴" },
  medium:   { color: "#fb923c", bg: "#1a1008", border: "#78350f", label: "Media",   dot: "🟠" },
  low:      { color: "#4ade80", bg: "#081a0e", border: "#14532d", label: "Baja",    dot: "🟢" },
};

const TYPE_META: Record<AlertType, { label: string; icon: string }> = {
  large_withdrawal:     { label: "Retiro grande",       icon: "📤" },
  large_deposit:        { label: "Depósito grande",     icon: "💰" },
  balance_drain:        { label: "Drain de balance",    icon: "📉" },
  rapid_activity:       { label: "Actividad rápida",    icon: "⚡" },
  instant_withdrawal:   { label: "Retiro inmediato",    icon: "⏱️" },
  multiple_pending:     { label: "Múlt. pendientes",    icon: "🔄" },
  flagged_wallet:       { label: "Wallet duplicada",    icon: "⚠️" },
  high_locked:          { label: "Fondos bloqueados",   icon: "🔒" },
  low_wagering_cashout: { label: "Cash-out sin wager",  icon: "🎰" },
};

const LS_KEY = "casino_admin_reviewed";
function loadReviewed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? "[]")); }
  catch { return new Set(); }
}
function saveReviewed(s: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...s])); } catch {}
}

const PERIODS = [
  { id: "today", label: "Hoy"     },
  { id: "7d",    label: "7 días"  },
  { id: "30d",   label: "30 días" },
] as const;

const ALL_TYPES: AlertType[] = [
  "large_withdrawal","large_deposit","balance_drain",
  "rapid_activity","instant_withdrawal","multiple_pending",
  "flagged_wallet","high_locked","low_wagering_cashout",
];

function AlertsTab({ token }: { token: string }) {
  const [data, setData]       = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [period, setPeriod]   = useState<"today" | "7d" | "30d">("30d");
  const [sevFilter, setSevFilter] = useState<AlertSeverity | "all">("all");
  const [typeFilter, setTypeFilter] = useState<AlertType | "all">("all");
  const [userSearch, setUserSearch] = useState("");
  const [reviewed, setReviewed]   = useState<Set<string>>(loadReviewed);
  const [acting, setActing]       = useState<string | null>(null);
  const [blockInputs, setBlockInputs] = useState<Record<string, string>>({});
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [view, setView]           = useState<"alerts" | "flagged" | "blocked">("alerts");
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/admin/alerts?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "Error desconocido");
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar alertas");
    } finally { setLoading(false); }
  }, [token, period]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function markReviewed(id: string) {
    setReviewed(prev => {
      const next = new Set(prev).add(id);
      saveReviewed(next);
      return next;
    });
  }

  async function blockUser(userId: string, uname: string) {
    const reason = blockInputs[userId] ?? "";
    setActing(userId);
    try {
      const r = await fetch("/api/admin/user/block", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId, reason: reason || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`);
      showToast(`${uname} bloqueado correctamente.`, true);
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error al bloquear", false);
    } finally { setActing(null); }
  }

  async function unblockUser(userId: string, uname: string) {
    setActing(userId);
    try {
      const r = await fetch("/api/admin/user/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`);
      showToast(`${uname} desbloqueado.`, true);
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error al desbloquear", false);
    } finally { setActing(null); }
  }

  async function flagUser(userId: string, uname: string) {
    const reason = blockInputs[userId] ?? "";
    setActing(userId);
    try {
      const r = await fetch("/api/admin/user/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId, reason: reason || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`);
      showToast(`${uname} marcado como flagged.`, true);
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error al marcar", false);
    } finally { setActing(null); }
  }

  async function unflagUser(userId: string, uname: string) {
    setActing(userId);
    try {
      const r = await fetch("/api/admin/user/unflag", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`);
      showToast(`${uname} removido de flagged.`, true);
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error al desmarcar", false);
    } finally { setActing(null); }
  }

  const isBlocked = (userId: string) => data?.blockedUsers.some(b => b.id === userId) ?? false;
  const isFlagged = (userId: string) => data?.flaggedUsers?.some(f => f.id === userId) ?? false;

  const visible = (data?.alerts ?? []).filter(a => {
    if (isBlocked(a.userId)) return false;       // bloqueados van solo al tab Bloqueados
    if (isFlagged(a.userId)) return false;       // flaggeados van solo al tab Flagged
    if (reviewed.has(a.id)) return false;
    if (sevFilter !== "all" && a.severity !== sevFilter) return false;
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    if (userSearch.trim() && !a.username.toLowerCase().includes(userSearch.trim().toLowerCase())) return false;
    return true;
  });

  // counts on the visible (not reviewed, not blocked, not flagged) alerts
  const counts = {
    critical: (data?.alerts ?? []).filter(a => !isBlocked(a.userId) && !isFlagged(a.userId) && !reviewed.has(a.id) && a.severity === "critical").length,
    medium:   (data?.alerts ?? []).filter(a => !isBlocked(a.userId) && !isFlagged(a.userId) && !reviewed.has(a.id) && a.severity === "medium").length,
    low:      (data?.alerts ?? []).filter(a => !isBlocked(a.userId) && !isFlagged(a.userId) && !reviewed.has(a.id) && a.severity === "low").length,
  };

  const btnFilter = (active: boolean, color?: string): React.CSSProperties => ({
    background:   active ? (color ? `${color}18` : "#1e2a3d") : "transparent",
    border:       `1px solid ${active ? (color ?? "#334155") : "#1e2a3d"}`,
    borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600,
    color:        active ? (color ?? "#e2e8f0") : "#64748b",
    cursor: "pointer", transition: "all .15s", fontFamily: "'Inter', sans-serif",
    whiteSpace: "nowrap" as const,
  });

  return (
    <>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? "#15803d" : "#dc2626", color: "#fff",
          borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600,
          boxShadow: "0 6px 24px rgba(0,0,0,.6)", maxWidth: 400,
        }}>{toast.msg}</div>
      )}

      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Alertas y Monitoreo</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading
              ? "Analizando actividad…"
              : data
                ? `${counts.critical + counts.medium + counts.low} activas · actualizado ${parseUTC(data.generatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: AR })}`
                : "Sin datos"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} style={btnFilter(period === p.id, "#f59e0b")}>
              {p.label}
            </button>
          ))}
          <button onClick={load} disabled={loading} style={{ ...btnSecondary, marginLeft: 8 }}>
            {loading ? "…" : "↻ Analizar"}
          </button>
        </div>
      </div>

      {/* ── Sub-view toggle ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "#0d1117", border: "1px solid #1e2a3d", borderRadius: 10, padding: 4 }}>
        <button
          onClick={() => setView("alerts")}
          style={{
            flex: 1, padding: "9px 0", borderRadius: 7, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 13, fontFamily: "'Inter', sans-serif",
            background: view === "alerts" ? "#1e2a3d" : "transparent",
            color: view === "alerts" ? "#e2e8f0" : "#475569",
            transition: "all .15s",
          }}
        >
          🚨 Alertas {!loading && data && counts.critical + counts.medium + counts.low > 0 && (
            <span style={{
              background: "#7f1d1d", color: "#fca5a5", borderRadius: 10,
              padding: "1px 7px", fontSize: 11, marginLeft: 6,
            }}>{counts.critical + counts.medium + counts.low}</span>
          )}
        </button>
        <button
          onClick={() => setView("flagged")}
          style={{
            flex: 1, padding: "9px 0", borderRadius: 7, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 13, fontFamily: "'Inter', sans-serif",
            background: view === "flagged" ? "#1a1505" : "transparent",
            color: view === "flagged" ? "#fbbf24" : "#475569",
            transition: "all .15s",
          }}
        >
          ⚑ Flagged {!loading && (data?.flaggedUsers?.length ?? 0) > 0 && (
            <span style={{
              background: "#451a03", color: "#fde68a", borderRadius: 10,
              padding: "1px 7px", fontSize: 11, marginLeft: 6,
            }}>{(data?.flaggedUsers?.length ?? 0)}</span>
          )}
        </button>
        <button
          onClick={() => setView("blocked")}
          style={{
            flex: 1, padding: "9px 0", borderRadius: 7, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 13, fontFamily: "'Inter', sans-serif",
            background: view === "blocked" ? "#1a0808" : "transparent",
            color: view === "blocked" ? "#f87171" : "#475569",
            transition: "all .15s",
          }}
        >
          🚫 Bloqueados {!loading && (data?.blockedUsers.length ?? 0) > 0 && (
            <span style={{
              background: "#450a0a", color: "#fca5a5", borderRadius: 10,
              padding: "1px 7px", fontSize: 11, marginLeft: 6,
            }}>{data!.blockedUsers.length}</span>
          )}
        </button>
      </div>

      {error && (
        <div style={{ background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ══════════════ VISTA: ALERTAS ══════════════ */}
      {view === "alerts" && <>

        {/* ── Summary bar ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
          {(["critical","medium","low"] as AlertSeverity[]).map(sev => {
            const s = SEV[sev]; const c = counts[sev];
            return (
              <button key={sev} onClick={() => setSevFilter(sevFilter === sev ? "all" : sev)} style={{
                background:  sevFilter === sev ? s.bg : "#111827",
                border:      `1px solid ${sevFilter === sev ? s.border : "#1e2a3d"}`,
                borderRadius: 10, padding: "16px 20px", cursor: "pointer", textAlign: "left",
                transition: "all .15s", fontFamily: "'Inter', sans-serif",
              }}>
                <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{s.dot}</span> {s.label}
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: c > 0 ? s.color : "#334155", lineHeight: 1 }}>{c}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>alertas activas</div>
              </button>
            );
          })}
        </div>

        {/* ── Filters row ── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <button onClick={() => setTypeFilter("all")} style={btnFilter(typeFilter === "all")}>
            Todos los tipos
          </button>
          {ALL_TYPES.map(t => {
            const m = TYPE_META[t];
            return (
              <button key={t} onClick={() => setTypeFilter(typeFilter === t ? "all" : t)} style={btnFilter(typeFilter === t, "#f59e0b")}>
                {m.icon} {m.label}
              </button>
            );
          })}
          <input
            type="text" placeholder="🔍 Buscar usuario…"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            style={{ ...inputStyle, width: 170, fontSize: 12, marginLeft: "auto" }}
          />
        </div>

      </>}

      {/* ══════════════ VISTA: FLAGGED ══════════════ */}
      {view === "flagged" && (data?.flaggedUsers?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 24 }}>
          {/* Section header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
            paddingBottom: 10, borderBottom: "1px solid #1e2a3d",
          }}>
            <span style={{ fontSize: 18 }}>⚑</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#fbbf24" }}>Usuarios Flaggeados</span>
            <span style={{
              background: "#451a03", border: "1px solid #92400e",
              borderRadius: 10, padding: "2px 10px", fontSize: 12, fontWeight: 700, color: "#fde68a",
            }}>{(data?.flaggedUsers?.length ?? 0)}</span>
            <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>— en revisión manual</span>
          </div>

          {/* Accordion list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data?.flaggedUsers ?? []).map(fu => {
              const userAlerts = (data?.alerts ?? []).filter(a => a.userId === fu.id);
              const busy = acting === fu.id;
              const open = expanded.has(fu.id);

              return (
                <div key={fu.id} style={{
                  background: "#0d0d08", border: `2px solid ${open ? "#92400e" : "#3a2805"}`,
                  borderRadius: 10, overflow: "hidden", transition: "border-color .2s",
                }}>
                  {/* Row header */}
                  <div
                    onClick={() => toggleExpand(fu.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                      padding: "13px 16px", background: open ? "#1a1205" : "#100e04",
                      cursor: "pointer", userSelect: "none", transition: "background .2s",
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24" width="16" height="16" fill="none"
                      stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0, transition: "transform .25s cubic-bezier(0.22,1,0.36,1)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>

                    <span style={{ fontSize: 15 }}>⚑</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: "#fbbf24" }}>@{fu.username}</span>
                    <span style={{
                      background: "#78350f", color: "#fde68a", borderRadius: 5,
                      padding: "1px 7px", fontSize: 10, fontWeight: 700, letterSpacing: "0.4px",
                    }}>FLAGGED</span>

                    {fu.flagged_at && (
                      <span style={{ fontSize: 11, color: "#78350f" }}>
                        desde {fmt(fu.flagged_at)}
                      </span>
                    )}

                    {/* Alert count badge */}
                    {userAlerts.length > 0 && (
                      <span style={{
                        background: "#1e2a3d", border: "1px solid #2a3550",
                        borderRadius: 10, padding: "1px 8px", fontSize: 11, color: "#94a3b8", fontWeight: 600,
                      }}>
                        {userAlerts.length} alerta{userAlerts.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {userAlerts.length === 0 && (
                      <span style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>sin alertas en este período</span>
                    )}

                    {/* Actions — stop propagation */}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); unflagUser(fu.id, fu.username); }}
                        disabled={busy}
                        style={{
                          background: "#1a2438", border: "1px solid #2a3550",
                          borderRadius: 7, color: "#94a3b8", cursor: busy ? "not-allowed" : "pointer",
                          fontSize: 12, fontWeight: 700, padding: "6px 12px", opacity: busy ? 0.6 : 1,
                          fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                        }}
                      >{busy ? "…" : "Quitar flag"}</button>
                      <button
                        onClick={e => { e.stopPropagation(); blockUser(fu.id, fu.username); }}
                        disabled={busy}
                        style={{
                          background: "#1a0808", border: "1px solid #7f1d1d",
                          borderRadius: 7, color: "#f87171", cursor: busy ? "not-allowed" : "pointer",
                          fontSize: 12, fontWeight: 700, padding: "6px 12px", opacity: busy ? 0.6 : 1,
                          fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                        }}
                      >{busy ? "…" : "🔒 Bloquear"}</button>
                    </div>
                  </div>

                  {/* Expandable alerts panel */}
                  {open && (
                    <div style={{
                      padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 8,
                      borderTop: "1px solid #2a1a05",
                      animation: "blockExpand .25s cubic-bezier(0.22,1,0.36,1)",
                    }}>
                      {userAlerts.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", padding: "6px 0" }}>
                          Sin alertas en el período seleccionado.
                        </div>
                      ) : userAlerts.map(a => {
                        const s  = SEV[a.severity];
                        const tm = TYPE_META[a.type] ?? { label: a.type, icon: "❓" };
                        return (
                          <div key={a.id} style={{
                            display: "flex", gap: 10, alignItems: "flex-start",
                            background: "#100e04", border: `1px solid ${s.border}`,
                            borderLeft: `3px solid ${s.color}`, borderRadius: 8, padding: "10px 12px",
                          }}>
                            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{tm.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                                <span style={{
                                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                                  borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 700,
                                }}>{s.dot} {s.label.toUpperCase()}</span>
                                <span style={{ fontSize: 11, color: "#475569" }}>{tm.icon} {tm.label}</span>
                                <span style={{ marginLeft: "auto", fontSize: 11, color: "#334155", whiteSpace: "nowrap" }}>
                                  {fmt(a.createdAt)}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: s.color, marginBottom: 2 }}>{a.title}</div>
                              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{a.detail}</div>
                              {a.wallet && (
                                <div style={{ fontSize: 11, color: "#334155", marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                                  <span style={{ color: "#475569" }}>Wallet:</span>
                                  <code style={{ background: "#0d1525", padding: "2px 6px", borderRadius: 4, color: "#94a3b8", fontFamily: "monospace", fontSize: 10 }}>
                                    {a.wallet.slice(0, 14)}…{a.wallet.slice(-6)}
                                  </code>
                                  {a.network && <span style={{ color: "#334155" }}>· {a.network}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════ VISTA: BLOQUEADOS ══════════════ */}
      {view === "blocked" && (data?.blockedUsers.length ?? 0) > 0 && (
        <div style={{ marginBottom: 24 }}>
          <style>{`
            @keyframes blockExpand {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0);    }
            }
          `}</style>

          {/* Section header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
            paddingBottom: 10, borderBottom: "1px solid #1e2a3d",
          }}>
            <span style={{ fontSize: 18 }}>🚫</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#f87171" }}>Usuarios Bloqueados</span>
            <span style={{
              background: "#450a0a", border: "1px solid #7f1d1d",
              borderRadius: 10, padding: "2px 10px", fontSize: 12, fontWeight: 700, color: "#fca5a5",
            }}>{data!.blockedUsers.length}</span>
          </div>

          {/* Accordion list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data!.blockedUsers.map(bu => {
              // Mostrar TODAS las alertas del usuario bloqueado (explican por qué fue bloqueado + nuevas)
              const userAlerts = (data?.alerts ?? []).filter(a => a.userId === bu.id);
              const busy       = acting === bu.id;
              const open       = expanded.has(bu.id);

              return (
                <div key={bu.id} style={{
                  background: "#0d0808", border: `2px solid ${open ? "#991b1b" : "#3f1515"}`,
                  borderRadius: 10, overflow: "hidden", transition: "border-color .2s",
                }}>
                  {/* ── Row header (clickable to expand) ── */}
                  <div
                    onClick={() => toggleExpand(bu.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                      padding: "13px 16px", background: open ? "#1f0808" : "#160606",
                      cursor: "pointer", userSelect: "none", transition: "background .2s",
                    }}
                  >
                    {/* Chevron arrow */}
                    <svg
                      viewBox="0 0 24 24" width="16" height="16" fill="none"
                      stroke="#7f1d1d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0, transition: "transform .25s cubic-bezier(0.22,1,0.36,1)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>

                    <span style={{ fontSize: 15 }}>🔒</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: "#f87171" }}>@{bu.username}</span>
                    <span style={{
                      background: "#7f1d1d", color: "#fca5a5", borderRadius: 5,
                      padding: "1px 7px", fontSize: 10, fontWeight: 700, letterSpacing: "0.4px",
                    }}>BLOQUEADO</span>

                    {/* Alert count badge */}
                    {userAlerts.length > 0 && (
                      <span style={{
                        background: "#1e2a3d", border: "1px solid #2a3550",
                        borderRadius: 10, padding: "1px 8px", fontSize: 11, color: "#94a3b8", fontWeight: 600,
                      }}>
                        {userAlerts.length} alerta{userAlerts.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {userAlerts.length === 0 && (
                      <span style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>sin alertas en este período</span>
                    )}

                    {/* Unblock button — stop propagation so it doesn't toggle */}
                    <button
                      onClick={e => { e.stopPropagation(); unblockUser(bu.id, bu.username); }}
                      disabled={busy}
                      style={{
                        marginLeft: "auto", background: "#14532d", border: "1px solid #166534",
                        borderRadius: 7, color: "#86efac", cursor: busy ? "not-allowed" : "pointer",
                        fontSize: 12, fontWeight: 700, padding: "6px 14px", opacity: busy ? 0.6 : 1,
                        fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >{busy ? "…" : "Desbloquear"}</button>
                  </div>

                  {/* ── Expandable alerts panel ── */}
                  {open && (
                    <div style={{
                      padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 8,
                      borderTop: "1px solid #2d1010",
                      animation: "blockExpand .25s cubic-bezier(0.22,1,0.36,1)",
                    }}>
                      {userAlerts.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", padding: "6px 0" }}>
                          Sin alertas en el período seleccionado — posiblemente fue bloqueado en base a actividad histórica.
                        </div>
                      ) : userAlerts.map(a => {
                        const s  = SEV[a.severity];
                        const tm = TYPE_META[a.type] ?? { label: a.type, icon: "❓" };
                        return (
                          <div key={a.id} style={{
                            display: "flex", gap: 10, alignItems: "flex-start",
                            background: "#110c0c", border: `1px solid ${s.border}`,
                            borderLeft: `3px solid ${s.color}`, borderRadius: 8, padding: "10px 12px",
                          }}>
                            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{tm.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                                <span style={{
                                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                                  borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 700,
                                }}>{s.dot} {s.label.toUpperCase()}</span>
                                <span style={{ fontSize: 11, color: "#475569" }}>{tm.icon} {tm.label}</span>
                                <span style={{ marginLeft: "auto", fontSize: 11, color: "#334155", whiteSpace: "nowrap" }}>
                                  {fmt(a.createdAt)}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: s.color, marginBottom: 2 }}>{a.title}</div>
                              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{a.detail}</div>
                              {a.wallet && (
                                <div style={{ fontSize: 11, color: "#334155", marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                                  <span style={{ color: "#475569" }}>Wallet:</span>
                                  <code style={{ background: "#0d1525", padding: "2px 6px", borderRadius: 4, color: "#94a3b8", fontFamily: "monospace", fontSize: 10 }}>
                                    {a.wallet.slice(0, 14)}…{a.wallet.slice(-6)}
                                  </code>
                                  {a.network && <span style={{ color: "#334155" }}>· {a.network}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Loading spinner (both views) ── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>Analizando actividad sospechosa…</div>
      )}

      {/* ── VISTA ALERTAS: empty + cards ── */}
      {view === "alerts" && !loading && visible.length === 0 && (
        <div style={{ ...card, padding: "60px 0", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Sin alertas activas</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>
            {reviewed.size > 0 ? `${reviewed.size} marcadas como revisadas.` : "No se detectó actividad sospechosa en el período seleccionado."}
          </div>
        </div>
      )}

      {/* ── VISTA FLAGGED: empty state ── */}
      {view === "flagged" && !loading && (data?.flaggedUsers?.length ?? 0) === 0 && (
        <div style={{ ...card, padding: "60px 0", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚑</div>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Sin usuarios flaggeados</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>Ningún usuario está marcado para revisión manual actualmente.</div>
        </div>
      )}

      {/* ── VISTA BLOQUEADOS: empty state ── */}
      {view === "blocked" && !loading && (data?.blockedUsers.length ?? 0) === 0 && (
        <div style={{ ...card, padding: "60px 0", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Sin usuarios bloqueados</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>No hay ningún usuario con la cuenta bloqueada actualmente.</div>
        </div>
      )}

      {/* ── Alert cards (solo vista alertas) ── */}
      {view === "alerts" && !loading && visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map(alert => {
            const s     = SEV[alert.severity];
            const tm    = TYPE_META[alert.type] ?? { label: alert.type, icon: "❓" };
            const busy  = acting === alert.userId;
            const blocked = isBlocked(alert.userId);

            return (
              <div key={alert.id} style={{
                background:   "#0d1117",
                border:       `1px solid ${s.border}`,
                borderLeft:   `4px solid ${s.color}`,
                borderRadius: 10, padding: "14px 18px",
                display:      "flex", gap: 16, alignItems: "flex-start",
                transition:   "background .15s",
              }}>
                {/* Left: icon */}
                <div style={{ fontSize: 26, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{tm.icon}</div>

                {/* Center: info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{
                      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                      borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
                    }}>
                      {s.dot} {s.label.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: "#475569", background: "#111827", border: "1px solid #1e2a3d", borderRadius: 6, padding: "2px 8px" }}>
                      {tm.icon} {tm.label}
                    </span>
                    <button onClick={() => setUserSearch(alert.username)} style={{
                      background: "transparent", border: "none", cursor: "pointer", padding: 0,
                      fontWeight: 700, color: "#f59e0b", fontSize: 13, fontFamily: "'Inter', sans-serif",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      {blocked && <span style={{ fontSize: 11 }}>🔒</span>}
                      @{alert.username}
                    </button>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#334155", whiteSpace: "nowrap" }}>
                      {fmt(alert.createdAt)}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 600, color: s.color, marginBottom: 3 }}>{alert.title}</div>
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, marginBottom: alert.wallet ? 6 : 0 }}>{alert.detail}</div>

                  {alert.wallet && (
                    <div style={{ fontSize: 11, color: "#334155", marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ color: "#475569" }}>Wallet:</span>
                      <code style={{ background: "#0d1525", padding: "2px 8px", borderRadius: 4, color: "#94a3b8", fontFamily: "monospace", fontSize: 10 }}>
                        {alert.wallet.slice(0, 14)}…{alert.wallet.slice(-6)}
                      </code>
                      {alert.network && <span style={{ color: "#334155" }}>· {alert.network}</span>}
                    </div>
                  )}
                </div>

                {/* Right: actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, alignItems: "flex-end" }}>
                  {/* Mark as reviewed */}
                  <button onClick={() => markReviewed(alert.id)} style={{
                    background: "#0d1a0a", border: "1px solid #166534", borderRadius: 7,
                    color: "#4ade80", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    padding: "5px 12px", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                  }}>
                    ✓ Revisada
                  </button>

                  {blocked ? (
                    <button onClick={() => unblockUser(alert.userId, alert.username)} disabled={busy} style={{
                      background: "#0d2b1e", border: "1px solid #166534", borderRadius: 7,
                      color: "#4ade80", cursor: busy ? "not-allowed" : "pointer",
                      fontSize: 11, fontWeight: 600, padding: "5px 12px",
                      fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                    }}>
                      {busy ? "…" : "Desbloquear"}
                    </button>
                  ) : (
                    <>
                      <input
                        type="text" placeholder="Motivo (opc.)"
                        value={blockInputs[alert.userId] ?? ""}
                        onChange={e => setBlockInputs(prev => ({ ...prev, [alert.userId]: e.target.value }))}
                        style={{ ...inputStyle, width: 120, fontSize: 11 }}
                      />
                      <button onClick={() => flagUser(alert.userId, alert.username)} disabled={busy} style={{
                        background: "#1a1205", border: "1px solid #92400e", borderRadius: 7,
                        color: "#fbbf24", cursor: busy ? "not-allowed" : "pointer",
                        fontSize: 11, fontWeight: 600, padding: "5px 12px",
                        fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                      }}>
                        {busy ? "…" : "⚑ Flaggear"}
                      </button>
                      <button onClick={() => blockUser(alert.userId, alert.username)} disabled={busy} style={{
                        background: "#1a0808", border: "1px solid #7f1d1d", borderRadius: 7,
                        color: "#f87171", cursor: busy ? "not-allowed" : "pointer",
                        fontSize: 11, fontWeight: 600, padding: "5px 12px",
                        fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                      }}>
                        {busy ? "…" : "🔒 Bloquear"}
                      </button>
                    </>
                  )}

                  {/* Dismiss */}
                  <button onClick={() => markReviewed(alert.id)} title="Descartar" style={{
                    background: "transparent", border: "1px solid #1e2a3d", borderRadius: 7,
                    color: "#334155", cursor: "pointer", fontSize: 11,
                    padding: "4px 10px", fontFamily: "'Inter', sans-serif",
                  }}>✕ Ignorar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

type Period = "day" | "week" | "month";

interface GGRStat { wagered: number; paid: number; bonus: number; ggr: number; count: number; }
interface StatsData {
  generatedAt: string;
  balanceTotals: { currency: string; balance: number; locked: number; total: number }[];
  transactions: {
    deposits:    { day: PeriodStat; week: PeriodStat; month: PeriodStat };
    withdrawals: { day: PeriodStat; week: PeriodStat; month: PeriodStat };
    bonuses:     { day: PeriodStat; week: PeriodStat; month: PeriodStat };
  };
  activeUsers:          { day: number; week: number; month: number };
  withdrawalsByStatus:  { pending: number; approved: number; paid: number; rejected: number; pendingAmounts: { currency: string; amount: number }[] };
  topPlayers:           { username: string; wagered: number; deposits: number; withdrawals: number }[];
  newUsers:             { day: number; week: number; month: number; total: number };
  casinoGGR:            { day: GGRStat; week: GGRStat; month: GGRStat };
}
interface PeriodStat { count: number; total: number; }

const PERIOD_LABELS: Record<Period, string> = { day: "Hoy", week: "7 días", month: "30 días" };

function StatCard({ label, value, sub, color = "#f59e0b", icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: string;
}) {
  return (
    <div style={{
      background: "#111827", border: "1px solid #1e2a3d", borderRadius: 10,
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.7px" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: "#1e2a3d", borderRadius: 4, height: 6, width: "100%", overflow: "hidden" }}>
      <div style={{ background: color, width: `${pct}%`, height: "100%", borderRadius: 4, transition: "width .4s ease" }} />
    </div>
  );
}

function StatsTab({ token }: { token: string }) {
  const [data, setData]       = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [period, setPeriod]   = useState<Period>("week");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "Error desconocido");
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ textAlign: "center", padding: "80px 0", color: "#64748b", fontSize: 15 }}>Cargando estadísticas...</div>;
  if (error) return (
    <div style={{ background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10, padding: "16px 20px", color: "#fca5a5" }}>
      Error: {error}
    </div>
  );
  if (!data) return null;

  const tx       = data.transactions;
  const txD      = { dep: tx.deposits[period], wit: tx.withdrawals[period], bon: tx.bonuses[period] };
  const maxVol   = Math.max(...data.topPlayers.map(p => p.wagered), 1);

  const wStatusItems = [
    { label: "Pendientes",  value: data.withdrawalsByStatus.pending,  color: "#f59e0b" },
    { label: "Aprobados",   value: data.withdrawalsByStatus.approved, color: "#4ade80" },
    { label: "Pagados",     value: data.withdrawalsByStatus.paid,     color: "#22d3ee" },
    { label: "Rechazados",  value: data.withdrawalsByStatus.rejected, color: "#f87171" },
  ];

  const genAt = parseUTC(data.generatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: AR });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Estadísticas</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Actualizado a las {genAt}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["day", "week", "month"] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              background: period === p ? "#f59e0b" : "transparent",
              border: `1px solid ${period === p ? "#f59e0b" : "#2a3550"}`,
              borderRadius: 8, color: period === p ? "#0d1117" : "#94a3b8",
              cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 14px",
              fontFamily: "'Inter', sans-serif", transition: "all .15s",
            }}>{PERIOD_LABELS[p]}</button>
          ))}
          <button onClick={load} style={{ ...btnSecondary, padding: "6px 12px" }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Row 1 — Summary cards */}
      {(() => {
        const ggr = data.casinoGGR?.[period];
        const ggrVal  = ggr?.ggr  ?? 0;
        const ggrColor = ggrVal >= 0 ? "#4ade80" : "#f87171";
        const ggrLabel = ggrVal >= 0 ? `▲ Casa gana` : `▼ Casa pierde`;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <StatCard icon="👥" label="Usuarios totales"  value={data.newUsers.total}   sub={`+${data.newUsers[period]} en ${PERIOD_LABELS[period].toLowerCase()}`} color="#e2e8f0" />
            <StatCard icon="🟢" label="Usuarios activos"  value={data.activeUsers[period]} sub={PERIOD_LABELS[period]} color="#4ade80" />
            <StatCard icon="⬇" label="Depósitos"          value={`$${txD.dep.total}`}   sub={`${txD.dep.count} operaciones`} color="#22d3ee" />
            <StatCard icon="⬆" label="Retiros pagados"    value={`$${txD.wit.total}`}   sub={`${txD.wit.count} operaciones`} color="#f87171" />
            <StatCard icon="🔒" label="Retiros pendientes" value={data.withdrawalsByStatus.pending + data.withdrawalsByStatus.approved} sub="pending + aprobados" color="#f59e0b" />
            <StatCard icon="🎰" label="GGR Casino"
              value={`${ggrVal >= 0 ? "+" : ""}$${fmtBal(Math.abs(ggrVal))}`}
              sub={`${ggrLabel} · ${ggr?.count ?? 0} rondas`}
              color={ggrColor} />
          </div>
        );
      })()}

      {/* Row 2 — Balance + Tx breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>

        {/* Casino balance per currency */}
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 16 }}>💰 Balance del Casino</div>
          {data.balanceTotals.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 13 }}>Sin balance registrado.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.balanceTotals.map(b => (
                <div key={b.currency}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{b.currency}</span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}>{fmtBal(b.balance)}</span>
                      {b.locked > 0 && (
                        <span style={{ fontSize: 11, color: "#f59e0b", marginLeft: 8 }}>+{fmtBal(b.locked)} 🔒</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, height: 6 }}>
                    <div style={{
                      background: "#4ade80",
                      borderRadius: 4,
                      height: "100%",
                      width: b.total > 0 ? `${(b.balance / b.total) * 100}%` : "0%",
                      transition: "width .4s ease",
                    }} />
                    <div style={{
                      background: "#f59e0b",
                      borderRadius: 4,
                      height: "100%",
                      width: b.total > 0 ? `${(b.locked / b.total) * 100}%` : "0%",
                      transition: "width .4s ease",
                    }} />
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: "#4ade80" }}>■ Líquido</span>
                    <span style={{ fontSize: 10, color: "#f59e0b" }}>■ Bloqueado</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transaction flow */}
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 16 }}>📊 Flujo ({PERIOD_LABELS[period]})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { label: "Depósitos",  value: txD.dep.total, count: txD.dep.count, color: "#22d3ee" },
              { label: "Retiros",    value: txD.wit.total, count: txD.wit.count, color: "#f87171" },
              { label: "Bonos",      value: txD.bon.total, count: txD.bon.count, color: "#a78bfa" },
            ].map(item => {
              const maxVal = Math.max(txD.dep.total, txD.wit.total, txD.bon.total, 1);
              return (
                <div key={item.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{item.label}</span>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>${fmtBal(item.value)}</span>
                      <span style={{ fontSize: 11, color: "#475569", marginLeft: 6 }}>{item.count}x</span>
                    </div>
                  </div>
                  <Bar value={item.value} max={maxVal} color={item.color} />
                </div>
              );
            })}

            <div style={{ borderTop: "1px solid #1e2a3d", paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px" }}>Retiros por estado</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {wStatusItems.map(s => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{s.label}:</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
              {data.withdrawalsByStatus.pendingAmounts.length > 0 && (
                <div style={{ marginTop: 10, background: "#0d1525", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#f59e0b" }}>
                  🔒 En proceso: {data.withdrawalsByStatus.pendingAmounts.map(a => `${fmtBal(a.amount)} ${a.currency}`).join(" · ")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row GGR — Casino profit/loss breakdown */}
      {data.casinoGGR && (() => {
        const ggr = data.casinoGGR[period];
        const isProfit = ggr.ggr >= 0;
        const margin = ggr.wagered > 0 ? ((ggr.ggr / ggr.wagered) * 100).toFixed(1) : "0.0";
        const rows: { label: string; value: number; color: string; sign?: string }[] = [
          { label: "Total apostado",  value: ggr.wagered, color: "#e2e8f0" },
          { label: "Pagado a players", value: ggr.paid,   color: "#f87171", sign: "-" },
          { label: "Bonus usados",     value: ggr.bonus,  color: "#a78bfa", sign: "-" },
        ];
        return (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #1e2a3d", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>🎰 Ganancias / Pérdidas del Casino — {PERIOD_LABELS[period]}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                background: isProfit ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                color: isProfit ? "#4ade80" : "#f87171",
                border: `1px solid ${isProfit ? "#4ade80" : "#f87171"}`,
              }}>
                {isProfit ? "▲ Casa gana" : "▼ Casa pierde"}
              </span>
            </div>
            <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Left — metric rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {rows.map(r => (
                  <div key={r.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>
                        {r.sign}{r.sign ? "" : ""} ${fmtBal(r.value)}
                      </span>
                    </div>
                    <Bar value={r.value} max={ggr.wagered || 1} color={r.color} />
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #1e2a3d", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>GGR neto</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: isProfit ? "#4ade80" : "#f87171" }}>
                    {isProfit ? "+" : ""}${fmtBal(Math.abs(ggr.ggr))}
                  </span>
                </div>
              </div>
              {/* Right — summary numbers */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{
                  background: isProfit ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)",
                  border: `1px solid ${isProfit ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                  borderRadius: 10, padding: "20px 16px", textAlign: "center", flex: 1,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 600 }}>GGR {PERIOD_LABELS[period]}</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: isProfit ? "#4ade80" : "#f87171", lineHeight: 1 }}>
                    {isProfit ? "+" : "-"}${fmtBal(Math.abs(ggr.ggr))}
                  </div>
                  <div style={{ fontSize: 12, color: "#475569" }}>Margen: {margin}%</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{ggr.count.toLocaleString()} rondas jugadas</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Row 3 — Top players */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ padding: "16px 20px 12px", fontSize: 13, fontWeight: 700, color: "#e2e8f0", borderBottom: "1px solid #1e2a3d" }}>
          🏆 Top Jugadores por Volumen — {PERIOD_LABELS[period]}
        </div>
        {data.topPlayers.length === 0 ? (
          <div style={{ padding: "30px 20px", color: "#64748b", fontSize: 13 }}>Sin actividad en este período.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 36 }}>#</th>
                  <th style={th}>Usuario</th>
                  <th style={th}>Depósitos</th>
                  <th style={th}>Retiros</th>
                  <th style={th}>Wagered</th>
                  <th style={{ ...th, minWidth: 140 }}>Barra de actividad</th>
                </tr>
              </thead>
              <tbody>
                {data.topPlayers.map((p, i) => (
                  <tr key={p.username}
                    onMouseEnter={e => (e.currentTarget.style.background = "#131d30")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    style={{ transition: "background .15s" }}
                  >
                    <td style={{ ...td, color: i < 3 ? "#f59e0b" : "#475569", fontWeight: 700, fontSize: 14 }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: "#f59e0b" }}>{p.username}</td>
                    <td style={{ ...td, color: "#22d3ee" }}>${fmtBal(p.deposits)}</td>
                    <td style={{ ...td, color: "#f87171" }}>${fmtBal(p.withdrawals)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>${fmtBal(p.wagered)}</td>
                    <td style={{ ...td, minWidth: 140 }}>
                      <Bar value={p.wagered} max={maxVol} color="#f59e0b" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row 4 — New users mini-stats */}
      <div style={{ ...card, padding: "16px 20px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 14 }}>👤 Nuevos Registros</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 12 }}>
          {([["Hoy", data.newUsers.day, "#22d3ee"], ["7 días", data.newUsers.week, "#4ade80"], ["30 días", data.newUsers.month, "#a78bfa"], ["Total", data.newUsers.total, "#e2e8f0"]] as [string, number, string][]).map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TransactionsTab ───────────────────────────────────────────────────────────

interface TxSearchRow {
  id: string;
  display_id: string | null;
  mander_id: string;
  username: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  notes: string | null;
  wallet: string | null;
}

const TX_TYPE_LABELS: Record<string, string> = {
  deposit: "Depósito", withdrawal: "Retiro", bonus: "Bono",
  bet: "Apuesta", win: "Ganancia",
};
const TX_TYPE_COLORS: Record<string, string> = {
  deposit: "#22c55e", withdrawal: "#f59e0b", bonus: "#a855f7",
  bet: "#64748b", win: "#22c55e",
};

// Returns a specific label + color for a transaction, reading the notes
// to distinguish between rakeback subtypes, admin adjustments, rank rewards, etc.
function getTxDisplayType(type: string, notes: string | null): { label: string; color: string } {
  if (type === "bonus" && notes) {
    const n = notes.toLowerCase();
    if (n.startsWith("[rakeback:instant"))   return { label: "Instant Rakeback",  color: "#38bdf8" };
    if (n.startsWith("[rakeback:weekly"))    return { label: "Rakeback Semanal",  color: "#818cf8" };
    if (n.startsWith("[rakeback:monthly"))   return { label: "Rakeback Mensual",  color: "#c084fc" };
    if (n.startsWith("[admin_adjustment"))   return { label: "Ajuste Admin",      color: "#f59e0b" };
    if (n.startsWith("[rank_reward"))        return { label: "Premio de Rango",   color: "#facc15" };
    if (n.startsWith("[affiliate"))          return { label: "Comisión Afiliado", color: "#34d399" };
    if (n.startsWith("[vip"))                return { label: "Premio VIP",        color: "#fb923c" };
  }
  if (type === "deposit")    return { label: "Depósito",  color: "#22c55e" };
  if (type === "withdrawal") return { label: "Retiro",    color: "#f59e0b" };
  if (type === "bet")        return { label: "Apuesta",   color: "#64748b" };
  if (type === "win")        return { label: "Ganancia",  color: "#22c55e" };
  return { label: TX_TYPE_LABELS[type] ?? type, color: TX_TYPE_COLORS[type] ?? "#64748b" };
}
const TX_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente", completed: "Completado",
};
const TX_STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b", completed: "#22c55e",
};

function TransactionsTab({ token }: { token: string }) {
  const [username, setUsername] = useState("");
  const [type,     setType]     = useState("all");
  const [status,   setStatus]   = useState("all");
  const [from,     setFrom]     = useState("");
  const [to,       setTo]       = useState("");
  const [rows,     setRows]     = useState<TxSearchRow[]>([]);
  const [total,    setTotal]    = useState(0);
  const [offset,   setOffset]   = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [searched, setSearched] = useState(false);
  const LIMIT = 40;

  const search = useCallback(async (off = 0) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (username.trim()) params.set("username", username.trim());
      if (type   !== "all") params.set("type",   type);
      if (status !== "all") params.set("status", status);
      if (from) params.set("from", from);
      if (to)   params.set("to",   to);

      const r = await fetch(`/api/admin/transactions-search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Error al buscar."); return; }
      setRows(data.transactions ?? []);
      setTotal(data.total ?? 0);
      setOffset(off);
      setSearched(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [username, type, status, from, to, token]);

  const clearFilters = () => {
    setUsername(""); setType("all"); setStatus("all"); setFrom(""); setTo("");
    setRows([]); setTotal(0); setOffset(0); setSearched(false); setError("");
  };

  const fmtDate = (iso: string) => {
    const d = parseUTC(iso);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: AR })
      + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: AR });
  };

  const selStyle: React.CSSProperties = {
    background: "#0d1117", border: "1px solid #1e2a3d", borderRadius: 8,
    color: "#e2e8f0", padding: "8px 12px", fontSize: 14, outline: "none",
    fontFamily: "'Inter', sans-serif",
  };
  const inputStyle: React.CSSProperties = { ...selStyle, width: "100%", boxSizing: "border-box" };

  const hasPrev = offset > 0;
  const hasNext = offset + LIMIT < total;

  return (
    <div>
      {/* Filter bar */}
      <div style={{
        background: "#111827", border: "1px solid #1e2a3d", borderRadius: 10,
        padding: "20px 24px", marginBottom: 20,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", color: "#64748b", fontSize: 12, marginBottom: 5, fontWeight: 600 }}>
              USUARIO
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search(0)}
              placeholder="Buscar por username..."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", color: "#64748b", fontSize: 12, marginBottom: 5, fontWeight: 600 }}>
              TIPO
            </label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ ...selStyle, width: "100%" }}>
              <option value="all">Todos</option>
              <option value="deposit">Depósito</option>
              <option value="withdrawal">Retiro</option>
              <option value="bonus">Bono</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", color: "#64748b", fontSize: 12, marginBottom: 5, fontWeight: 600 }}>
              ESTADO
            </label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...selStyle, width: "100%" }}>
              <option value="all">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="completed">Completado</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", color: "#64748b", fontSize: 12, marginBottom: 5, fontWeight: 600 }}>
              DESDE
            </label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          </div>
          <div>
            <label style={{ display: "block", color: "#64748b", fontSize: 12, marginBottom: 5, fontWeight: 600 }}>
              HASTA
            </label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => search(0)}
            disabled={loading}
            style={{
              background: "#f59e0b", border: "none", borderRadius: 8, padding: "9px 22px",
              color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer",
              fontFamily: "'Inter', sans-serif", opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Buscando…" : "Buscar"}
          </button>
          {searched && (
            <button
              onClick={clearFilters}
              style={{
                background: "transparent", border: "1px solid #1e2a3d", borderRadius: 8,
                padding: "9px 18px", color: "#64748b", fontWeight: 600, fontSize: 14,
                cursor: "pointer", fontFamily: "'Inter', sans-serif",
              }}
            >
              Limpiar
            </button>
          )}
          {searched && !loading && (
            <span style={{ color: "#64748b", fontSize: 14, alignSelf: "center", marginLeft: 4 }}>
              {total === 0 ? "Sin resultados" : `${total} transacción${total !== 1 ? "es" : ""} encontrada${total !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          background: "#1f1315", border: "1px solid #7f1d1d", borderRadius: 10,
          padding: "14px 18px", color: "#f87171", fontSize: 14, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Results table */}
      {rows.length > 0 && (
        <div style={{ background: "#111827", border: "1px solid #1e2a3d", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e2a3d" }}>
                {["Fecha", "Usuario", "Tipo", "Estado", "Monto", "Notas"].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "12px 16px", color: "#64748b",
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((tx, i) => (
                <tr
                  key={tx.id}
                  style={{
                    borderBottom: i < rows.length - 1 ? "1px solid #1e2a3d" : "none",
                    background: i % 2 === 0 ? "transparent" : "#0d1117",
                  }}
                >
                  <td style={{ padding: "11px 16px", color: "#94a3b8", fontSize: 13, whiteSpace: "nowrap" }}>
                    {fmtDate(tx.created_at)}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                      {tx.username}
                    </span>
                    {tx.display_id && (
                      <span style={{ color: "#475569", fontSize: 11, marginLeft: 6 }}>#{tx.display_id}</span>
                    )}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    {(() => {
                      const { label, color } = getTxDisplayType(tx.type, tx.notes);
                      return (
                        <span style={{
                          background: color + "22",
                          color,
                          borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}>
                          {label}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{
                      background: (TX_STATUS_COLORS[tx.status] || "#64748b") + "22",
                      color: TX_STATUS_COLORS[tx.status] || "#64748b",
                      borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 700,
                    }}>
                      {TX_STATUS_LABELS[tx.status] || tx.status}
                    </span>
                  </td>
                  <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                    <span style={{
                      color: tx.type === "bet" ? "#ef4444" :
                             tx.type === "deposit" || tx.type === "win" || tx.type === "bonus" ? "#22c55e" : "#f59e0b",
                      fontWeight: 700, fontSize: 14,
                    }}>
                      {tx.type === "bet" ? "-" : "+"}${Math.abs(Number(tx.amount)).toFixed(2)}
                    </span>
                    <span style={{ color: "#475569", fontSize: 12, marginLeft: 5 }}>{tx.currency}</span>
                  </td>
                  <td style={{ padding: "11px 16px", color: "#64748b", fontSize: 12, maxWidth: 200 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tx.notes || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Pagination */}
          {(hasPrev || hasNext) && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px", borderTop: "1px solid #1e2a3d",
            }}>
              <span style={{ color: "#64748b", fontSize: 13 }}>
                Mostrando {offset + 1}–{Math.min(offset + LIMIT, total)} de {total}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => search(offset - LIMIT)}
                  disabled={!hasPrev || loading}
                  style={{
                    background: hasPrev ? "#1e2a3d" : "transparent",
                    border: "1px solid #1e2a3d", borderRadius: 7,
                    color: hasPrev ? "#e2e8f0" : "#475569",
                    padding: "7px 16px", fontSize: 13, fontWeight: 600,
                    cursor: hasPrev ? "pointer" : "not-allowed",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => search(offset + LIMIT)}
                  disabled={!hasNext || loading}
                  style={{
                    background: hasNext ? "#1e2a3d" : "transparent",
                    border: "1px solid #1e2a3d", borderRadius: 7,
                    color: hasNext ? "#e2e8f0" : "#475569",
                    padding: "7px 16px", fontSize: 13, fontWeight: 600,
                    cursor: hasNext ? "pointer" : "not-allowed",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {searched && !loading && rows.length === 0 && !error && (
        <div style={{
          background: "#111827", border: "1px solid #1e2a3d", borderRadius: 10,
          padding: "48px 24px", textAlign: "center", color: "#475569",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin resultados</div>
          <div style={{ fontSize: 13 }}>Probá con otros filtros</div>
        </div>
      )}
    </div>
  );
}

// ── AdminPanel ────────────────────────────────────────────────────────────────

// ── AffiliatesTab ─────────────────────────────────────────────────────────────

interface AffiliateRow {
  username: string;
  ref_code: string;
  created_at: string;
  signups: number;
  ftds: number;
  deposit_amount: string;
  wager_amount: string;
  ngr: string;
  commission_earned: string;
  commission_paid: string;
  last_activity: string | null;
}

interface CommissionRow {
  id: number;
  referrer_username: string;
  amount: string;
  ngr_period: string;
  period: string;
  status: string;
  created_at: string;
}

function AffiliatesTab({ token }: { token: string }) {
  const [subtab, setSubtab] = useState<"affiliates" | "commissions">("affiliates");

  // ── Afiliados ─────────────────────────────────────────────────────────────
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [origin, setOrigin] = useState("");

  // ── Autocomplete ──────────────────────────────────────────────────────────
  interface UserSearchResult { username: string; mander_id: string; created_at: string; deposit_count: number; has_affiliate_code: boolean; }
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchResults, setSearchResults]   = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [dropdownOpen, setDropdownOpen]     = useState(false);
  const [selectedUser, setSelectedUser]     = useState<UserSearchResult | null>(null);
  const [customCode, setCustomCode]         = useState("");
  const [codeError, setCodeError]           = useState("");
  const searchDebounce                      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef                         = useRef<HTMLDivElement>(null);

  // ── Comisiones ───────────────────────────────────────────────────────────
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [commLoading, setCommLoading] = useState(false);
  const [commFilter, setCommFilter] = useState<"all" | "pending" | "paid">("all");
  const [generating, setGenerating] = useState(false);
  const [genPeriod, setGenPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [genMsg, setGenMsg] = useState("");
  const [genResults, setGenResults] = useState<{referrer:string;ngr:string;commission:number;skipped?:boolean;reason?:string}[]>([]);
  const [bypassMinimum, setBypassMinimum] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);

  // ── Modal Jugadores ───────────────────────────────────────────────────────
  interface PlayerRow { username: string; mander_id: string | null; joined_at: string; referred_at: string; balance: string; deposit_count: number; deposit_amount: string; last_deposit: string | null; wager_amount: string; ngr: string; is_ftd: boolean; }
  const [playersModal, setPlayersModal] = useState<string | null>(null);
  const [playersData, setPlayersData] = useState<PlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [copiedManderId, setCopiedManderId] = useState<string | null>(null);

  const openPlayers = useCallback(async (username: string) => {
    setPlayersModal(username);
    setPlayersData([]);
    setPlayersLoading(true);
    try {
      const r = await fetch(`/api/admin/affiliates/${encodeURIComponent(username)}/players`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await r.json();
      setPlayersData(Array.isArray(data) ? data : []);
    } catch { setPlayersData([]); }
    finally { setPlayersLoading(false); }
  }, [token]);

  useEffect(() => { setOrigin(window.location.origin); }, []); 

  const loadAffiliates = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/affiliates", { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      setAffiliates(Array.isArray(data) ? data : []);
    } catch { setAffiliates([]); }
    finally { setLoading(false); }
  }, [token]);

  const loadCommissions = useCallback(async () => {
    setCommLoading(true);
    try {
      const qs = commFilter !== "all" ? `?status=${commFilter}` : "";
      const r = await fetch(`/api/admin/affiliate/commissions${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      setCommissions(Array.isArray(data) ? data : []);
    } catch { setCommissions([]); }
    finally { setCommLoading(false); }
  }, [token, commFilter]);

  useEffect(() => { loadAffiliates(); }, [loadAffiliates]);
  useEffect(() => { if (subtab === "commissions") loadCommissions(); }, [subtab, loadCommissions]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Búsqueda debounced
  function handleSearchChange(val: string) {
    setSearchQuery(val);
    setSelectedUser(null);
    setDropdownOpen(true);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (val.length < 2) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/users/search?q=${encodeURIComponent(val)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 280);
  }

  function selectUser(u: { username: string; mander_id: string; created_at: string; deposit_count: number; has_affiliate_code: boolean }) {
    setSelectedUser(u);
    setSearchQuery(u.username);
    setDropdownOpen(false);
    setCreateMsg("");
    setCodeError("");
    // Sugerir código basado en el username (uppercase, sin espacios ni chars inválidos)
    const suggested = u.username.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20);
    setCustomCode(suggested);
  }

  function handleCodeChange(val: string) {
    const clean = val.toUpperCase().replace(/[^A-Z0-9_]/g, "");
    setCustomCode(clean);
    setCodeError(clean.length > 0 && clean.length < 2 ? "Mínimo 2 caracteres" : "");
  }

  async function createAffiliate() {
    if (!selectedUser) return;
    if (customCode && customCode.length < 2) { setCodeError("Mínimo 2 caracteres"); return; }
    setCreating(true); setCreateMsg(""); setCodeError("");
    try {
      const body: Record<string, string> = { username: selectedUser.username };
      if (customCode.trim()) body.ref_code = customCode.trim();
      const r = await fetch("/api/admin/affiliates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setCreateMsg(`Error: ${data.error}`); return; }
      setCreateMsg(`Afiliado creado. Código: ${data.ref_code}`);
      setSelectedUser(null);
      setSearchQuery("");
      setSearchResults([]);
      setCustomCode("");
      loadAffiliates();
    } catch { setCreateMsg("Error al crear afiliado."); }
    finally { setCreating(false); }
  }

  async function generateCommissions() {
    if (!genPeriod) return;
    setGenerating(true); setGenMsg("");
    try {
      const r = await fetch("/api/admin/affiliate/generate-commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ period: genPeriod, bypass_minimum: bypassMinimum }),
      });
      const data = await r.json();
      if (!r.ok) { setGenMsg(`Error: ${data.error}`); return; }
      setGenMsg(`Generadas: ${data.generated} | Omitidas: ${data.skipped}`);
      setGenResults(Array.isArray(data.results) ? data.results : []);
      loadCommissions();
    } catch { setGenMsg("Error al generar comisiones."); }
    finally { setGenerating(false); }
  }

  async function markAsPaid(id: number) {
    setPayingId(id);
    try {
      await fetch(`/api/admin/affiliate/commissions/${id}/pay`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      loadCommissions();
    } catch {}
    finally { setPayingId(null); }
  }

  async function deleteAffiliate(username: string) {
    setDeletingAff(username);
    setDeleteError(null);
    try {
      const r = await fetch(`/api/admin/affiliates/${encodeURIComponent(username)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await r.text();
      const data = text ? JSON.parse(text) : {};
      if (!r.ok) {
        setDeleteError(data.error ?? "Error al eliminar.");
        setConfirmDeleteAff(null);
        setTimeout(() => setDeleteError(null), 4000);
        return;
      }
      setConfirmDeleteAff(null);
      loadAffiliates();
    } catch {
      setDeleteError("Error de conexión al eliminar.");
      setTimeout(() => setDeleteError(null), 4000);
    }
    finally { setDeletingAff(null); }
  }

  // ── sorting + filtro ───────────────────────────────────────────────────────
  type AffSort = "username" | "signups" | "ftds" | "deposit_amount" | "wager_amount" | "ngr" | "commission_earned" | "last_activity";
  const [affSort, setAffSort] = useState<AffSort>("ngr");
  const [affDir,  setAffDir]  = useState<"asc"|"desc">("desc");
  const [affSearch, setAffSearch] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [confirmDeleteAff, setConfirmDeleteAff] = useState<string | null>(null);
  const [deletingAff, setDeletingAff] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function copyLink(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLink(key);
      setTimeout(() => setCopiedLink(null), 1800);
    }).catch(() => {});
  }

  function toggleAffSort(col: AffSort) {
    if (affSort === col) setAffDir(d => d === "desc" ? "asc" : "desc");
    else { setAffSort(col); setAffDir("desc"); }
  }

  function relativeTime(iso: string | null): string {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)    return "Ahora";
    if (mins < 60)   return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)   return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 30)   return `hace ${days}d`;
    const months = Math.floor(days / 30);
    return `hace ${months} mes${months > 1 ? "es" : ""}`;
  }

  const affSearchLower = affSearch.toLowerCase();
  const filteredAffiliates = affSearch
    ? affiliates.filter(a =>
        a.username.toLowerCase().includes(affSearchLower) ||
        a.ref_code.toLowerCase().includes(affSearchLower)
      )
    : affiliates;

  const sortedAffiliates = [...filteredAffiliates].sort((a, b) => {
    // NGR column uses a fixed 3-tier order regardless of sort direction:
    //   Tier 1: NGR > 0  (green) — highest first
    //   Tier 2: NGR < 0  (negative) — least negative first
    //   Tier 3: no deposits at all — alphabetical at the bottom
    if (affSort === "ngr") {
      const ngrA = parseFloat(a.ngr || "0");
      const ngrB = parseFloat(b.ngr || "0");
      const noDepA = parseFloat(a.deposit_amount || "0") === 0 && a.ftds === 0;
      const noDepB = parseFloat(b.deposit_amount || "0") === 0 && b.ftds === 0;
      const tierA = noDepA ? 2 : ngrA >= 0 ? 0 : 1;
      const tierB = noDepB ? 2 : ngrB >= 0 ? 0 : 1;
      if (tierA !== tierB) return tierA - tierB;
      // Within same tier: highest NGR first for tiers 0 and 1; alpha for tier 2
      if (tierA === 2) return a.username.localeCompare(b.username);
      return ngrB - ngrA;
    }

    let cmp = 0;
    if      (affSort === "username")          cmp = a.username.localeCompare(b.username);
    else if (affSort === "signups")           cmp = a.signups - b.signups;
    else if (affSort === "ftds")              cmp = a.ftds - b.ftds;
    else if (affSort === "deposit_amount")    cmp = parseFloat(a.deposit_amount) - parseFloat(b.deposit_amount);
    else if (affSort === "wager_amount")      cmp = parseFloat(a.wager_amount)   - parseFloat(b.wager_amount);
    else if (affSort === "commission_earned") cmp = parseFloat(a.commission_earned) - parseFloat(b.commission_earned);
    else if (affSort === "last_activity") {
      const ta = a.last_activity ? new Date(a.last_activity).getTime() : 0;
      const tb = b.last_activity ? new Date(b.last_activity).getTime() : 0;
      cmp = ta - tb;
    }
    return affDir === "desc" ? -cmp : cmp;
  });

  const cell: React.CSSProperties = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #1a2436", color: "#cbd5e1", whiteSpace: "nowrap" as const };
  const headCell: React.CSSProperties = { ...cell, color: "#64748b", fontWeight: 700, fontSize: 12, background: "#0d1117", textTransform: "uppercase" as const, letterSpacing: "0.05em", cursor: "pointer", userSelect: "none" as const };
  const headCellNoSort: React.CSSProperties = { ...headCell, cursor: "default" };
  const subtabBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 18px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: active ? "#1e3a5f" : "transparent",
    color: active ? "#60a5fa" : "#64748b",
    transition: "all .15s",
  });

  const arrow = (col: AffSort) => affSort === col ? (affDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <>
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0d1117", borderRadius: 10, padding: 4, width: "fit-content" }}>
        <button style={subtabBtn(subtab === "affiliates")} onClick={() => setSubtab("affiliates")}>Streamers / Links</button>
        <button style={subtabBtn(subtab === "commissions")} onClick={() => setSubtab("commissions")}>Comisiones NGR</button>
      </div>

      {/* ── Panel: Afiliados ────────────────────────────────────────────── */}
      {subtab === "affiliates" && (
        <div>
          <div style={{ background: "#111827", border: "1px solid #1e2a3d", borderRadius: 10, padding: 20, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 14px", color: "#e2e8f0", fontSize: 15, fontWeight: 700 }}>Crear nuevo afiliado</h3>

            {/* Autocomplete */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "flex-start" }}>
              <div ref={dropdownRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
                {/* Input */}
                <div style={{ position: "relative" }}>
                  <input
                    value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)}
                    onFocus={() => searchQuery.length >= 2 && setDropdownOpen(true)}
                    placeholder="Buscar usuario..."
                    autoComplete="off"
                    style={{
                      width: "100%", boxSizing: "border-box" as const,
                      padding: "9px 36px 9px 14px", borderRadius: 8,
                      border: `1px solid ${selectedUser ? "#29c46d55" : "#253048"}`,
                      background: "#192236", color: "#e6edf3", fontSize: 14, outline: "none",
                    }}
                  />
                  {searchLoading && (
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#64748b" }}>⏳</span>
                  )}
                  {!searchLoading && searchQuery && (
                    <button onClick={() => { setSearchQuery(""); setSelectedUser(null); setSearchResults([]); setDropdownOpen(false); }}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2 }}>✕</button>
                  )}
                </div>

                {/* Dropdown */}
                {dropdownOpen && searchQuery.length >= 2 && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
                    background: "#0f1923", border: "1px solid #253048", borderRadius: 10,
                    boxShadow: "0 8px 32px #00000066", maxHeight: 280, overflowY: "auto" as const,
                  }}>
                    {searchLoading ? (
                      <div style={{ padding: "14px 16px", color: "#64748b", fontSize: 13 }}>Buscando...</div>
                    ) : searchResults.length === 0 ? (
                      <div style={{ padding: "14px 16px", color: "#64748b", fontSize: 13 }}>No se encontraron usuarios.</div>
                    ) : searchResults.map(u => (
                      <button key={u.username} onClick={() => selectUser(u)}
                        style={{
                          display: "block", width: "100%", textAlign: "left" as const,
                          padding: "10px 16px", background: "none", border: "none",
                          borderBottom: "1px solid #1a2236", cursor: "pointer",
                          transition: "background .1s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#152035")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>{u.username}</span>
                            {u.has_affiliate_code && (
                              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#f6b53122", color: "#f6b531", border: "1px solid #f6b53144", fontWeight: 600 }}>
                                Ya afiliado
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#64748b" }}>
                            <span>{u.deposit_count > 0 ? `💰 ${u.deposit_count} dep.` : "Sin depósitos"}</span>
                            <span>📅 {parseUTC(u.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit", timeZone: AR })}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Input de código personalizado — aparece al seleccionar usuario */}
              {selectedUser && !selectedUser.has_affiliate_code && (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 3, minWidth: 160 }}>
                  <div style={{ position: "relative" }}>
                    <span style={{
                      position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                      fontSize: 11, fontWeight: 700, color: "#64748b", pointerEvents: "none",
                    }}>REF/</span>
                    <input
                      value={customCode}
                      onChange={e => handleCodeChange(e.target.value)}
                      placeholder="CODIGO"
                      maxLength={30}
                      style={{
                        width: "100%", boxSizing: "border-box" as const,
                        padding: "9px 12px 9px 38px", borderRadius: 8, fontSize: 14,
                        fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.05em",
                        border: `1px solid ${codeError ? "#f8717155" : "#253048"}`,
                        background: "#192236", color: "#f6b531", outline: "none",
                      }}
                    />
                  </div>
                  {codeError && <span style={{ fontSize: 11, color: "#f87171", paddingLeft: 4 }}>{codeError}</span>}
                </div>
              )}

              <button onClick={createAffiliate}
                disabled={creating || !selectedUser || selectedUser.has_affiliate_code || (customCode.length > 0 && customCode.length < 2)}
                style={{
                  padding: "9px 20px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14,
                  background: (selectedUser && !selectedUser.has_affiliate_code) ? "linear-gradient(180deg,#f6b531,#e9970d)" : "#1e2a3d",
                  color: (selectedUser && !selectedUser.has_affiliate_code) ? "#111" : "#3a5070",
                  cursor: (creating || !selectedUser || selectedUser.has_affiliate_code) ? "not-allowed" : "pointer",
                  opacity: creating ? 0.7 : 1, whiteSpace: "nowrap" as const,
                }}>
                {creating ? "Creando..." : "Crear afiliado"}
              </button>
              <button onClick={loadAffiliates} style={{ padding: "9px 14px", borderRadius: 8, background: "#1e2a3d", border: "1px solid #253048", color: "#94a3b8", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>🔄</button>
            </div>

            {/* Usuario seleccionado */}
            {selectedUser && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                {selectedUser.has_affiliate_code ? (
                  <span style={{ fontSize: 12, color: "#f6b531", background: "#f6b53118", padding: "4px 12px", borderRadius: 6, border: "1px solid #f6b53133" }}>
                    ⚠ <strong>{selectedUser.username}</strong> ya tiene un código de afiliado.
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "#29c46d", background: "#29c46d18", padding: "4px 12px", borderRadius: 6, border: "1px solid #29c46d33" }}>
                    ✔ Usuario seleccionado: <strong>{selectedUser.username}</strong>
                    {selectedUser.deposit_count > 0 && <span style={{ marginLeft: 8, color: "#4ade80", opacity: 0.8 }}>· {selectedUser.deposit_count} depósito{selectedUser.deposit_count !== 1 ? "s" : ""}</span>}
                  </span>
                )}
              </div>
            )}

            {createMsg && <p style={{ margin: "10px 0 0", color: createMsg.startsWith("Error") ? "#ff5b5b" : "#29c46d", fontSize: 13 }}>{createMsg}</p>}
          </div>

          {/* Error de borrado */}
          {deleteError && (
            <div style={{ marginBottom: 12, padding: "9px 14px", borderRadius: 8, background: "#f8717115", border: "1px solid #f8717144", color: "#f87171", fontSize: 13, fontWeight: 600 }}>
              ⚠ {deleteError}
            </div>
          )}

          {/* Buscador de afiliados */}
          {!loading && affiliates.length > 0 && (
            <div style={{ marginBottom: 14, position: "relative", maxWidth: 320 }}>
              <input
                value={affSearch}
                onChange={e => setAffSearch(e.target.value)}
                placeholder="Buscar afiliado por username..."
                style={{
                  width: "100%", boxSizing: "border-box" as const,
                  padding: "8px 34px 8px 14px", borderRadius: 8, fontSize: 13,
                  border: "1px solid #253048", background: "#0f1923", color: "#e2e8f0", outline: "none",
                }}
              />
              {affSearch && (
                <button
                  onClick={() => setAffSearch("")}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2,
                  }}>✕</button>
              )}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>Cargando afiliados...</div>
          ) : affiliates.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>No hay afiliados registrados todavía.</div>
          ) : sortedAffiliates.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
              No se encontraron afiliados para "<strong style={{ color: "#94a3b8" }}>{affSearch}</strong>".
            </div>
          ) : (
            <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #1e2a3d" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={headCell}          onClick={() => toggleAffSort("username")}>Streamer{arrow("username")}</th>
                    <th style={headCellNoSort}>Código / Link</th>
                    <th style={{ ...headCell, textAlign: "center" }} onClick={() => toggleAffSort("signups")}>Registros{arrow("signups")}</th>
                    <th style={{ ...headCell, textAlign: "center" }} onClick={() => toggleAffSort("ftds")}>FTDs{arrow("ftds")}</th>
                    <th style={headCell} onClick={() => toggleAffSort("deposit_amount")}>Depósitos{arrow("deposit_amount")}</th>
                    <th style={headCell} onClick={() => toggleAffSort("wager_amount")}>Apostado Total{arrow("wager_amount")}</th>
                    <th style={headCell} onClick={() => toggleAffSort("ngr")}>NGR Generado{arrow("ngr")}</th>
                    <th style={headCell} onClick={() => toggleAffSort("commission_earned")}>Earnings Est.{arrow("commission_earned")}</th>
                    <th style={headCell} onClick={() => toggleAffSort("last_activity")}>Última Actividad{arrow("last_activity")}</th>
                    <th style={headCellNoSort}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAffiliates.map(aff => {
                    const link   = `${origin}/?ref=${aff.ref_code}`;
                    const ngrVal = parseFloat(aff.ngr || "0");
                    const earnings = ngrVal > 0 ? ngrVal * 0.15 : 0;
                    const copiedKey = `${aff.username}-link`;
                    const isCopied = copiedLink === copiedKey;
                    return (
                      <tr key={aff.username} style={{ background: "#111827" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#152035")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#111827")}>

                        {/* Streamer */}
                        <td style={{ ...cell, fontWeight: 700, color: "#e2e8f0" }}>{aff.username}</td>

                        {/* Código + botón copiar link */}
                        <td style={cell}>
                          <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
                            <span style={{ background: "#1e2a3d", borderRadius: 6, padding: "2px 8px", fontFamily: "monospace", fontSize: 13, color: "#f6b531", display: "inline-block", width: "fit-content" }}>
                              {aff.ref_code}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: "#3a5070", fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                                {link}
                              </span>
                              <button
                                onClick={() => copyLink(copiedKey, link)}
                                title="Copiar link"
                                style={{
                                  display: "flex", alignItems: "center", gap: 2,
                                  padding: "1px 5px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                                  border: `1px solid ${isCopied ? "#29c46d44" : "#253048"}`,
                                  background: isCopied ? "#16a34a22" : "#1a2234",
                                  color: isCopied ? "#29c46d" : "#64748b",
                                  cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap" as const,
                                }}>
                                {isCopied
                                  ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="1,6 4.5,10 11,2" stroke="#29c46d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  : <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="1" y="3.5" width="7" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.4"/></svg>
                                }
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Registros */}
                        <td style={{ ...cell, textAlign: "center" }}>{aff.signups}</td>

                        {/* FTDs */}
                        <td style={{ ...cell, textAlign: "center" }}>
                          <span style={{
                            display: "inline-block", padding: "2px 10px", borderRadius: 5, fontSize: 12, fontWeight: 700,
                            background: aff.ftds > 0 ? "#16a34a22" : "#1a2234",
                            color: aff.ftds > 0 ? "#29c46d" : "#3a5070",
                            border: `1px solid ${aff.ftds > 0 ? "#29c46d44" : "#1e2a3d"}`,
                          }}>{aff.ftds}</span>
                        </td>

                        {/* Depósitos */}
                        <td style={cell}>${parseFloat(aff.deposit_amount || "0").toFixed(2)}</td>

                        {/* Apostado Total */}
                        <td style={{ ...cell, color: "#8a9bb8" }}>${parseFloat(aff.wager_amount || "0").toFixed(2)}</td>

                        {/* NGR Generado */}
                        <td style={{ ...cell, fontWeight: 700, color: ngrVal > 0 ? "#22c55e" : ngrVal < 0 ? "#f87171" : "#3a5070" }}>
                          {ngrVal === 0 ? "—" : `${ngrVal >= 0 ? "+" : ""}$${Math.abs(ngrVal).toFixed(2)}`}
                        </td>

                        {/* Earnings Est. (NGR * 15%, solo si NGR > 0, visual) */}
                        <td style={{ ...cell, color: earnings > 0 ? "#f6b531" : "#3a5070", fontWeight: earnings > 0 ? 700 : 400 }}>
                          {earnings > 0 ? `$${earnings.toFixed(2)}` : "—"}
                        </td>

                        {/* Última Actividad */}
                        <td style={{ ...cell, color: "#5a6e8a", fontSize: 12 }}>
                          {relativeTime(aff.last_activity)}
                        </td>

                        {/* Acciones */}
                        <td style={{ ...cell, textAlign: "right" as const }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => openPlayers(aff.username)}
                              style={{
                                padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                border: "1px solid #2563eb55", background: "#1d3a6e22",
                                color: "#60a5fa", cursor: "pointer", whiteSpace: "nowrap" as const,
                                transition: "all .15s",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = "#1d3a6e55"; e.currentTarget.style.borderColor = "#2563eb"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "#1d3a6e22"; e.currentTarget.style.borderColor = "#2563eb55"; }}>
                              👥 Jugadores
                            </button>
                          {confirmDeleteAff === aff.username ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                              <span style={{ fontSize: 11, color: "#f87171", whiteSpace: "nowrap" as const }}>¿Confirmar?</span>
                              <button
                                onClick={() => deleteAffiliate(aff.username)}
                                disabled={deletingAff === aff.username}
                                style={{ padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700, border: "1px solid #f8717155", background: "#f8717115", color: "#f87171", cursor: "pointer" }}>
                                {deletingAff === aff.username ? "..." : "Sí, borrar"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteAff(null)}
                                style={{ padding: "3px 8px", borderRadius: 5, fontSize: 11, border: "1px solid #253048", background: "none", color: "#64748b", cursor: "pointer" }}>
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteAff(aff.username)}
                              title="Eliminar afiliado"
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 5, color: "#3a5070", transition: "color .15s" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                              onMouseLeave={e => (e.currentTarget.style.color = "#3a5070")}>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M3.5 3.5l.667 7.5a.5.5 0 00.5.5h4.666a.5.5 0 00.5-.5L10.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Panel: Comisiones ───────────────────────────────────────────── */}
      {subtab === "commissions" && (
        <div>
          {/* Generar comisiones */}
          <div style={{ background: "#111827", border: "1px solid #1e2a3d", borderRadius: 10, padding: 20, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 4px", color: "#e2e8f0", fontSize: 15, fontWeight: 700 }}>Generar comisiones mensuales (15% NGR)</h3>
            <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 13 }}>Calcula el NGR real de cada afiliado desde game_bets e inserta comisiones sin duplicar.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" }}>
              <input type="month" value={genPeriod} onChange={e => setGenPeriod(e.target.value)}
                style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #253048", background: "#192236", color: "#e6edf3", fontSize: 14, outline: "none" }}
              />
              <button onClick={generateCommissions} disabled={generating || !genPeriod}
                style={{ padding: "9px 22px", borderRadius: 8, background: generating ? "#253048" : "linear-gradient(180deg,#22c55e,#16a34a)", border: "none", color: "#fff", fontWeight: 700, fontSize: 14, cursor: generating ? "not-allowed" : "pointer" }}>
                {generating ? "Calculando..." : "Generar comisiones"}
              </button>
              <button onClick={loadCommissions} style={{ padding: "9px 16px", borderRadius: 8, background: "#1e2a3d", border: "1px solid #253048", color: "#94a3b8", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>🔄</button>

              {/* Toggle: Ignorar mínimo */}
              <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" as const }}>
                <input type="checkbox" checked={bypassMinimum} onChange={e => setBypassMinimum(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: "#f6b531", cursor: "pointer" }} />
                <span style={{ fontSize: 12, color: bypassMinimum ? "#f6b531" : "#64748b", fontWeight: 600 }}>
                  Ignorar mínimo $50 {bypassMinimum && <span style={{ fontSize: 10, color: "#f6b531" }}>(modo test)</span>}
                </span>
              </label>
            </div>

            {/* Resultado resumen */}
            {genMsg && (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: genMsg.startsWith("Error") ? "#ff5b5b" : "#29c46d", fontWeight: 600 }}>
                {genMsg}
              </p>
            )}

            {/* Detalle por afiliado */}
            {genResults.length > 0 && (
              <div style={{ marginTop: 12, border: "1px solid #1e2a3d", borderRadius: 8, overflow: "hidden", overflowX: "auto" }}>
                <div style={{ padding: "8px 14px", background: "#0d1117", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" as const, display: "grid", gridTemplateColumns: "1fr 90px 90px 80px", minWidth: 360 }}>
                  <span>Afiliado</span>
                  <span style={{ textAlign: "right" }}>NGR</span>
                  <span style={{ textAlign: "right" }}>Comisión</span>
                  <span style={{ textAlign: "right" }}>Estado</span>
                </div>
                {genResults.map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 80px", minWidth: 360, padding: "8px 14px", borderTop: "1px solid #1a2236", background: r.skipped ? "transparent" : "#0d1f12", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#c8d8f0" }}>{r.referrer}</span>
                    <span style={{ fontSize: 13, textAlign: "right", color: parseFloat(r.ngr) > 0 ? "#22c55e" : "#f87171" }}>
                      {parseFloat(r.ngr) > 0 ? "+" : ""}${parseFloat(r.ngr).toFixed(2)}
                    </span>
                    <span style={{ fontSize: 13, textAlign: "right", fontWeight: 700, color: r.skipped ? "#3a5070" : "#f6b531" }}>
                      ${r.commission.toFixed(2)}
                    </span>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <span style={{
                        fontSize: 11, padding: "3px 8px", borderRadius: 4, fontWeight: 600, whiteSpace: "nowrap" as const,
                        background: r.skipped ? "#1a2234" : "#16a34a22",
                        color: r.skipped ? "#64748b" : "#29c46d",
                        border: `1px solid ${r.skipped ? "#1e2a3d" : "#29c46d44"}`,
                      }}>
                        {r.skipped ? "omitida" : "✔ OK"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filtro de estado */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["all","pending","paid"] as const).map(f => (
              <button key={f} onClick={() => setCommFilter(f)}
                style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #253048", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: commFilter === f ? "#1e3a5f" : "#0d1117", color: commFilter === f ? "#60a5fa" : "#64748b" }}>
                {f === "all" ? "Todas" : f === "pending" ? "Pendientes" : "Pagadas"}
              </button>
            ))}
          </div>

          {/* Lista de comisiones */}
          {commLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>Cargando comisiones...</div>
          ) : commissions.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>No hay comisiones para el filtro seleccionado.</div>
          ) : (
            <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #1e2a3d" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>{["Afiliado","Período","NGR del Mes","Comisión (15%)","Estado","Acción"].map(h => <th key={h} style={headCell}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {commissions.map(c => (
                    <tr key={c.id} style={{ background: "#111827" }} onMouseEnter={e => (e.currentTarget.style.background = "#152035")} onMouseLeave={e => (e.currentTarget.style.background = "#111827")}>
                      <td style={{ ...cell, fontWeight: 700, color: "#e2e8f0" }}>{c.referrer_username}</td>
                      <td style={{ ...cell, fontFamily: "monospace", color: "#94a3b8" }}>{c.period}</td>
                      <td style={cell}>${parseFloat(c.ngr_period || "0").toFixed(2)}</td>
                      <td style={{ ...cell, color: "#f6b531", fontWeight: 700 }}>${parseFloat(c.amount || "0").toFixed(2)}</td>
                      <td style={cell}>
                        <span style={{
                          display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                          background: c.status === "paid" ? "rgba(34,197,94,.15)" : "rgba(251,191,36,.15)",
                          color: c.status === "paid" ? "#22c55e" : "#fbbf24",
                        }}>{c.status === "paid" ? "Pagada" : "Pendiente"}</span>
                      </td>
                      <td style={cell}>
                        {c.status === "pending" ? (
                          <button onClick={() => markAsPaid(c.id)} disabled={payingId === c.id}
                            style={{ padding: "5px 14px", borderRadius: 7, background: "#16a34a", border: "none", color: "#fff", fontWeight: 600, fontSize: 12, cursor: payingId === c.id ? "not-allowed" : "pointer", opacity: payingId === c.id ? 0.7 : 1 }}>
                            {payingId === c.id ? "..." : "Marcar pagada"}
                          </button>
                        ) : (
                          <span style={{ color: "#22c55e", fontSize: 12 }}>✔ Pagada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>

    {/* ── Modal Jugadores ─────────────────────────────────────────────────── */}
    {playersModal && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }} onClick={() => setPlayersModal(null)}>
        <div style={{
          background: "#0d1117", border: "1px solid #1e2a3d", borderRadius: 10,
          width: "100%", maxWidth: 900, maxHeight: "85vh", display: "flex", flexDirection: "column" as const,
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #1e2a3d" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>
                👥 Jugadores de <span style={{ color: "#f6b531" }}>{playersModal}</span>
              </h2>
              <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 12 }}>
                {playersLoading ? "Cargando..." : `${playersData.length} jugador${playersData.length !== 1 ? "es" : ""} registrado${playersData.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            <button onClick={() => setPlayersModal(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "4px 8px", borderRadius: 6 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e2e8f0")}
              onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}>✕</button>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {playersLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: "#64748b", fontSize: 14 }}>Cargando jugadores...</div>
            ) : playersData.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#64748b", fontSize: 14 }}>Este afiliado no tiene jugadores registrados todavía.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr style={{ background: "#0d1117", position: "sticky", top: 0 }}>
                    {["Jugador","ID Mander","Registrado","FTD","Depósitos","Total Dep.","Último Dep.","Apostado","NGR","Balance"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#4a6080", textTransform: "uppercase" as const, letterSpacing: "0.04em", borderBottom: "1px solid #1e2a3d", whiteSpace: "nowrap" as const }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {playersData.map((p, i) => {
                    const ngr = parseFloat(p.ngr);
                    return (
                      <tr key={p.username} style={{ background: i % 2 === 0 ? "#0f1923" : "#111827" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#152035")}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#0f1923" : "#111827")}>

                        <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{p.username}</td>

                        <td style={{ padding: "9px 12px" }}>
                          {p.mander_id ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 11, color: "#3a5070", fontFamily: "monospace" }}>
                                {p.mander_id.slice(0, 12)}…
                              </span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(p.mander_id!);
                                  setCopiedManderId(p.mander_id);
                                  setTimeout(() => setCopiedManderId(null), 1500);
                                }}
                                title="Copiar ID completo"
                                style={{
                                  display: "flex", alignItems: "center", padding: "2px 5px",
                                  borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer",
                                  border: `1px solid ${copiedManderId === p.mander_id ? "#29c46d44" : "#1e2a3d"}`,
                                  background: copiedManderId === p.mander_id ? "#16a34a22" : "#1a2234",
                                  color: copiedManderId === p.mander_id ? "#29c46d" : "#4a6080",
                                  transition: "all .15s", flexShrink: 0,
                                }}>
                                {copiedManderId === p.mander_id
                                  ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="1,6 4.5,10 11,2" stroke="#29c46d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  : <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="3.5" width="7" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.5"/></svg>
                                }
                              </button>
                            </div>
                          ) : "—"}
                        </td>

                        <td style={{ padding: "9px 12px", fontSize: 12, color: "#5a6e8a" }}>
                          {p.joined_at ? parseUTC(p.joined_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: AR }) : "—"}
                        </td>

                        <td style={{ padding: "9px 12px", textAlign: "center" }}>
                          <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: p.is_ftd ? "#16a34a22" : "#1a2234", color: p.is_ftd ? "#29c46d" : "#3a5070", border: `1px solid ${p.is_ftd ? "#29c46d44" : "#1e2a3d"}` }}>
                            {p.is_ftd ? "Sí" : "No"}
                          </span>
                        </td>

                        <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 13, color: p.deposit_count > 0 ? "#e2e8f0" : "#3a5070" }}>{p.deposit_count}</td>

                        <td style={{ padding: "9px 12px", fontSize: 13, color: parseFloat(p.deposit_amount) > 0 ? "#22c55e" : "#3a5070", fontWeight: 600 }}>
                          {parseFloat(p.deposit_amount) > 0 ? `$${parseFloat(p.deposit_amount).toFixed(2)}` : "—"}
                        </td>

                        <td style={{ padding: "9px 12px", fontSize: 11, color: "#5a6e8a" }}>
                          {p.last_deposit ? parseUTC(p.last_deposit).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: AR }) : "—"}
                        </td>

                        <td style={{ padding: "9px 12px", fontSize: 13, color: "#8a9bb8" }}>
                          {parseFloat(p.wager_amount) > 0 ? `$${parseFloat(p.wager_amount).toFixed(2)}` : "—"}
                        </td>

                        <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 700, color: ngr > 0 ? "#22c55e" : ngr < 0 ? "#f87171" : "#3a5070" }}>
                          {ngr === 0 ? "—" : `${ngr >= 0 ? "+" : ""}$${Math.abs(ngr).toFixed(2)}`}
                        </td>

                        <td style={{ padding: "9px 12px", fontSize: 13, color: parseFloat(p.balance) > 0 ? "#f6b531" : "#3a5070", fontWeight: 600 }}>
                          {parseFloat(p.balance) > 0 ? `$${parseFloat(p.balance).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Support Tab ───────────────────────────────────────────────────────────────

interface SupportChat {
  chat_id: string; username: string; status: string; last_message: string; last_sender: string;
  updated_at: string; unread_count: number;
}
interface SupportMessage {
  id: number; chat_id: string; username: string; sender: string; message: string;
  is_read: boolean; created_at: string;
}

function SupportTab({ token }: { token: string }) {
  const [chats, setChats]         = useState<SupportChat[]>([]);
  const [activeChat, setActiveChat] = useState<SupportChat | null>(null);
  const [messages, setMessages]   = useState<SupportMessage[]>([]);
  const [reply, setReply]         = useState("");
  const [searchQ, setSearchQ]     = useState("");
  const [sending, setSending]     = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMsgs, setLoadingMsgs]   = useState(false);
  const [error, setError]         = useState("");
  const [joinedChats, setJoinedChats] = useState<Set<string>>(new Set());
  const [joinedChatsManagers, setJoinedChatsManagers] = useState<Map<string, string>>(new Map());
  const [joining, setJoining]       = useState(false);
  const [polishing, setPolishing]   = useState(false);
  const [polishTranslation, setPolishTranslation] = useState<string | null>(null);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Map<number, { text: string; lang: "en" | "es" }>>(new Map());
  const translatingRef = useRef<Set<number>>(new Set());
  const [selectedManager, setSelectedManager] = useState("Ashley");
  const MANAGERS = ["Ashley", "Alex", "Frank", "Wesley"];
  const [agentsActive, setAgentsActive] = useState<boolean>(true);
  const [settingAgents, setSettingAgents] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const isMobile = useIsMobile();
  // Manager locked to active ticket (if already joined), else free selection
  const activeManager = activeChat && joinedChatsManagers.has(activeChat.chat_id)
    ? joinedChatsManagers.get(activeChat.chat_id)!
    : selectedManager;
  const msgsEndRef        = useRef<HTMLDivElement>(null);
  const activeChatRef     = useRef<SupportChat | null>(null);
  const prevMsgCountRef   = useRef<number>(0);
  const chatsInFlightRef  = useRef(false);
  const msgsInFlightRef   = useRef(false);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  useEffect(() => {
    fetch("/api/support-chat/agents-status")
      .then(r => r.json())
      .then((d: { agents_active?: boolean }) => { if (typeof d.agents_active === "boolean") setAgentsActive(d.agents_active); })
      .catch(() => {});
  }, []);

  async function toggleAgents() {
    setSettingAgents(true);
    try {
      const r = await fetch("/api/support-chat/agents-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: !agentsActive }),
      });
      const d = await r.json() as { agents_active?: boolean };
      if (typeof d.agents_active === "boolean") setAgentsActive(d.agents_active);
    } catch {}
    setSettingAgents(false);
  }

  useEffect(() => {
    const prev = prevMsgCountRef.current;
    const curr = messages.length;
    prevMsgCountRef.current = curr;
    if (curr === 0) return;
    // On initial open (prev=0) → instant jump; on new message → smooth scroll
    const behavior: ScrollBehavior = prev === 0 ? "instant" : (curr > prev ? "smooth" : "instant");
    if (curr > prev || prev === 0) {
      msgsEndRef.current?.scrollIntoView({ behavior });
    }
  }, [messages]);

  async function loadChats(silent = false) {
    if (!silent) setLoadingChats(true);
    try {
      const r = await fetch("/api/admin/support/chats", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (r.status === 304) return;
      const text = await r.text();
      if (!text) return;
      const d = JSON.parse(text);
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      const fresh: SupportChat[] = Array.isArray(d) ? d : [];
      setChats(prev => {
        // Avoid re-render when nothing relevant changed (same IDs, counts, statuses)
        if (prev.length === fresh.length && prev.every((c, i) =>
          c.chat_id === fresh[i].chat_id &&
          c.unread_count === fresh[i].unread_count &&
          c.status === fresh[i].status &&
          c.last_message === fresh[i].last_message
        )) return prev;
        return fresh;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error de red";
      if (!silent && !msg.includes("JSON") && !msg.includes("Unexpected")) setError(msg);
    } finally { if (!silent) setLoadingChats(false); }
  }

  async function loadMessages(chatId: string, markRead = true, silent = false) {
    if (!silent) setLoadingMsgs(true);
    try {
      const r = await fetch(`/api/admin/support/chats/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (r.status === 304) return;
      const text = await r.text();
      if (!text) return;
      const d = JSON.parse(text);
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      const msgs: SupportMessage[] = Array.isArray(d) ? d : [];
      // Only update state when messages actually changed (avoids re-render on every poll)
      setMessages(prev => {
        if (
          prev.length === msgs.length &&
          (msgs.length === 0 || prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id)
        ) return prev;
        return msgs;
      });
      // Si ya hay mensajes de admin o mensaje de join, marcar como tomado
      const alreadyJoined = msgs.some(m => m.sender === "admin");
      if (alreadyJoined) {
        setJoinedChats(prev => {
          if (prev.has(chatId)) return prev; // already in set — no update
          return new Set([...prev, chatId]);
        });
        const joinMsg = msgs.find(m => m.sender === "admin" && m.message?.startsWith("🔵"));
        const nameMatch = joinMsg?.message?.match(/^🔵 (.+?) joined the conversation$/);
        if (nameMatch) {
          setJoinedChatsManagers(prev => {
            if (prev.get(chatId) === nameMatch[1]) return prev; // unchanged
            return new Map(prev).set(chatId, nameMatch[1]);
          });
        }
      }
      if (markRead) {
        await fetch(`/api/admin/support/chats/${chatId}/read`, {
          method: "PATCH", headers: { Authorization: `Bearer ${token}` },
        });
        setChats(prev => prev.map(c => c.chat_id === chatId ? { ...c, unread_count: 0 } : c));
      }
    } catch {} finally { if (!silent) setLoadingMsgs(false); }
  }

  function openChat(chat: SupportChat) {
    setActiveChat(chat);
    loadMessages(chat.chat_id);
  }

  async function sendReply() {
    if (!reply.trim() || !activeChat || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/support/chats/${activeChat.chat_id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim(), managerName: activeManager }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setReply(""); setPolishTranslation(null); setPolishError(null);
      loadMessages(activeChat.chat_id, false);
      loadChats();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al enviar");
    } finally { setSending(false); }
  }

  async function closeTicket() {
    if (!activeChat) return;
    try {
      await fetch(`/api/admin/support/chats/${activeChat.chat_id}/close`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setChats(prev => prev.filter(c => c.chat_id !== activeChat.chat_id));
      setActiveChat(null);
      setMessages([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cerrar");
    }
  }

  async function joinTicket() {
    if (!activeChat || joining) return;
    setJoining(true);
    try {
      const r = await fetch(`/api/admin/support/chats/${activeChat.chat_id}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ managerName: selectedManager }),
      });
      if (r.ok) {
        setJoinedChats(prev => new Set([...prev, activeChat.chat_id]));
        setJoinedChatsManagers(prev => new Map(prev).set(activeChat.chat_id, selectedManager));
        setReply(`Welcome to Manderbet! My name is ${selectedManager}. Could you please share more details about your issue so we can assist you as quickly as possible? 😊`);
        loadMessages(activeChat.chat_id, false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error joining ticket");
    } finally { setJoining(false); }
  }

  async function translateMessage(msgId: number, text: string) {
    if (translatingRef.current.has(msgId) || translations.has(msgId)) return;
    translatingRef.current.add(msgId);
    try {
      const r = await fetch("/api/admin/ai/translate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const d = await r.json();
      if (r.ok && d.translation && d.lang) {
        setTranslations(prev => new Map(prev).set(msgId, { text: d.translation, lang: d.lang }));
      }
    } catch {}
    finally { translatingRef.current.delete(msgId); }
  }

  // Auto-translate user messages when messages change
  useEffect(() => {
    messages.forEach(m => {
      if (m.sender !== "user") return;
      const text = m.message?.trim();
      if (!text || text.startsWith("[IMAGE:")) return;
      if (translations.has(m.id) || translatingRef.current.has(m.id)) return;
      translateMessage(m.id, text);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function polishMessage() {
    if (!reply.trim() || polishing) return;
    setPolishing(true);
    setPolishError(null);
    try {
      const r = await fetch("/api/admin/ai/polish", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const d = await r.json();
      if (r.ok && d.polished) {
        setReply(d.polished);
        setPolishTranslation(d.translation ?? null);
      } else {
        setPolishError(d.error ?? "Error al mejorar con IA");
      }
    } catch (err: unknown) {
      setPolishError(err instanceof Error ? err.message : "Error de conexión");
    }
    finally { setPolishing(false); }
  }

  useEffect(() => { loadChats(); }, []);

  // Auto-refresh every 15 seconds — in-flight guards prevent pile-up
  useEffect(() => {
    const id = setInterval(() => {
      if (!chatsInFlightRef.current) {
        chatsInFlightRef.current = true;
        loadChats(true).finally(() => { chatsInFlightRef.current = false; });
      }
      if (activeChatRef.current && !msgsInFlightRef.current) {
        msgsInFlightRef.current = true;
        loadMessages(activeChatRef.current.chat_id, false, true).finally(() => { msgsInFlightRef.current = false; });
      }
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const filteredChats = chats
    .filter(c =>
      c.status !== "closed" &&
      (!searchQ.trim() || c.username.toLowerCase().includes(searchQ.toLowerCase()))
    )
    .sort((a, b) => {
      // Escalated tickets always float to the top
      if (a.status === "escalated" && b.status !== "escalated") return -1;
      if (b.status === "escalated" && a.status !== "escalated") return 1;
      return 0;
    });

  const totalUnread = filteredChats.reduce((s, c) => s + c.unread_count, 0);

  const fmtTime = (iso: string) => {
    const d = parseUTC(iso);
    const now = new Date();
    const sameDay = d.toLocaleDateString("es-AR", { timeZone: AR }) === now.toLocaleDateString("es-AR", { timeZone: AR });
    return sameDay
      ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: AR })
      : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: AR });
  };

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Chat de Soporte</h2>
          {totalUnread > 0 && (
            <span style={{ background: "#dc2626", color: "#fff", borderRadius: 10, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
              {totalUnread} sin leer
            </span>
          )}
          <span style={{ color: "#64748b", fontSize: 13 }}>{filteredChats.length} conversaciones</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={toggleAgents}
            disabled={settingAgents}
            title={agentsActive ? "Desactivar agentes (el bot no escalará)" : "Activar agentes (el bot puede escalar)"}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 8, cursor: settingAgents ? "wait" : "pointer",
              border: `1px solid ${agentsActive ? "#166534" : "#7f1d1d"}`,
              background: agentsActive ? "#052e16" : "#1e0a0a",
              color: agentsActive ? "#4ade80" : "#f87171",
              fontSize: 13, fontWeight: 600, transition: "all 0.18s",
              opacity: settingAgents ? 0.6 : 1,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: agentsActive ? "#4ade80" : "#ef4444", display: "inline-block", flexShrink: 0 }} />
            Agentes {agentsActive ? "Activos" : "Inactivos"}
          </button>
          <button onClick={loadChats} disabled={loadingChats} style={btnSecondary}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 14 }}>
          {error}
          <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}>✕</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, height: isMobile ? "auto" : 620, flexDirection: isMobile ? "column" : "row" }}>
        {/* LEFT — Chat list */}
        <div style={{
          width: isMobile ? "100%" : 300, minWidth: isMobile ? 0 : 260,
          display: isMobile && mobileChatOpen ? "none" : "flex",
          flexDirection: "column", background: "#111827", border: "1px solid #1e2a3d",
          borderRadius: 10, overflow: "hidden",
          height: isMobile ? 420 : "100%",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #1e2a3d" }}>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Buscar usuario..."
              style={{ ...inputStyle, width: "100%", fontSize: 13 }}
            />
          </div>
          {/* Manager selector */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e2a3d", background: "#0e1623" }}>
            {(() => {
              const isLocked = !!(activeChat && joinedChatsManagers.has(activeChat.chat_id));
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Atendiendo como</div>
                    {isLocked && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        Bloqueado en este ticket
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                    {MANAGERS.map(name => {
                      const isActive = (isLocked ? activeManager : selectedManager) === name;
                      return (
                        <button
                          key={name}
                          onClick={() => { if (!isLocked) setSelectedManager(name); }}
                          disabled={isLocked}
                          style={{
                            padding: "4px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                            cursor: isLocked ? "default" : "pointer", border: "1px solid",
                            background: isActive ? "linear-gradient(135deg,#1d4ed8,#2563eb)" : "#111827",
                            color: isActive ? "#fff" : isLocked ? "#334155" : "#94a3b8",
                            borderColor: isActive ? "#2563eb" : "#1e2a3d",
                            opacity: isLocked && !isActive ? 0.35 : 1,
                            transition: "all .15s",
                          }}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {loadingChats && !chats.length ? (
              <div style={{ padding: "30px 0", textAlign: "center", color: "#64748b", fontSize: 13 }}>Cargando...</div>
            ) : filteredChats.length === 0 ? (
              <div style={{ padding: "40px 16px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
                {searchQ ? "Sin resultados" : "No hay conversaciones aún"}
              </div>
            ) : filteredChats.map(chat => {
              const isActive = activeChat?.chat_id === chat.chat_id;
              return (
                <div
                  key={chat.chat_id}
                  onClick={() => { openChat(chat); if (isMobile) setMobileChatOpen(true); }}
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #1a2234",
                    cursor: "pointer",
                    background: isActive ? "#1e3a5f" : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "#152035"; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 14 }}>{chat.username}</span>
                        <span style={{ fontSize: 10, color: "#334155", fontFamily: "monospace" }}>#{(parseInt(chat.chat_id.replace(/-/g,"").slice(0,12), 16) % 900000 + 100000).toString()}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                        background: chat.status === "closed" ? "#1a2234" : chat.status === "escalated" ? "#3b0a0a" : "#052e16",
                        color: chat.status === "closed" ? "#475569" : chat.status === "escalated" ? "#f87171" : "#4ade80",
                        border: `1px solid ${chat.status === "closed" ? "#1e2a3d" : chat.status === "escalated" ? "#7f1d1d" : "#166534"}`,
                      }}>
                        {chat.status === "closed" ? "cerrado" : chat.status === "escalated" ? "🔴 necesita agente" : "abierto"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {chat.unread_count > 0 && (
                        <span style={{ background: "#dc2626", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700, minWidth: 20, textAlign: "center" }}>
                          {chat.unread_count}
                        </span>
                      )}
                      <span style={{ color: "#475569", fontSize: 11 }}>{fmtTime(chat.updated_at)}</span>
                    </div>
                  </div>
                  {chat.last_message && (
                    <div style={{ color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {chat.last_sender === "admin" && <span style={{ color: "#60a5fa" }}>Tú: </span>}
                      {chat.last_message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Active chat */}
        <div style={{ flex: 1, display: isMobile && !mobileChatOpen ? "none" : "flex", flexDirection: "column", background: "#111827", border: "1px solid #1e2a3d", borderRadius: 10, overflow: "hidden", minHeight: isMobile ? 520 : undefined }}>
          {!activeChat ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#475569" }}>
              <div style={{ fontSize: 48 }}>💬</div>
              <div style={{ fontSize: 15 }}>Seleccioná una conversación</div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e2a3d", display: "flex", alignItems: "center", gap: 12 }}>
                {isMobile && (
                  <button onClick={() => setMobileChatOpen(false)} style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", padding: "4px 8px 4px 0", fontSize: 20, lineHeight: 1 }}>‹</button>
                )}
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#60a5fa", fontSize: 15 }}>
                  {activeChat.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 15 }}>{activeChat.username}</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    Ticket #{(parseInt(activeChat.chat_id.replace(/-/g,"").slice(0,12), 16) % 900000 + 100000).toString()} &bull; {fmtTime(activeChat.updated_at)}
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10,
                    background: activeChat.status === "closed" ? "#1a2234" : "#052e16",
                    color: activeChat.status === "closed" ? "#64748b" : "#4ade80",
                    border: `1px solid ${activeChat.status === "closed" ? "#1e2a3d" : "#166534"}`,
                  }}>
                    {activeChat.status === "closed" ? "● Cerrado" : "● Abierto"}
                  </span>
                  {activeChat.status !== "closed" && !joinedChats.has(activeChat.chat_id) && (
                    <button
                      onClick={joinTicket}
                      disabled={joining}
                      style={{
                        fontSize: 12, padding: "5px 14px", borderRadius: 8, fontWeight: 700,
                        background: "linear-gradient(135deg,#1d4ed8,#2563eb)",
                        color: "#fff", border: "none", cursor: joining ? "not-allowed" : "pointer",
                        opacity: joining ? 0.7 : 1, transition: "opacity .15s",
                      }}
                    >
                      {joining ? "Entrando..." : "🎧 Tomar ticket"}
                    </button>
                  )}
                  {joinedChats.has(activeChat.chat_id) && activeChat.status !== "closed" && (
                    <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>✓ En atención</span>
                  )}
                  {activeChat.status !== "closed" && (
                    <button
                      onClick={closeTicket}
                      style={{ ...btnSecondary, fontSize: 12, padding: "5px 12px", color: "#fca5a5", borderColor: "#7f1d1d" }}
                    >
                      Cerrar ticket
                    </button>
                  )}
                  {loadingMsgs && <span style={{ color: "#475569", fontSize: 12 }}>Cargando...</span>}
                </div>
              </div>

              {/* Escalation banner */}
              {activeChat.status === "escalated" && !joinedChats.has(activeChat.chat_id) && (
                <div style={{ margin: "0 18px 0", padding: "10px 16px", borderRadius: 10, background: "#3b0a0a", border: "1px solid #7f1d1d", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🔴</span>
                  <div>
                    <div style={{ color: "#fca5a5", fontWeight: 700, fontSize: 13 }}>Requiere atención humana</div>
                    <div style={{ color: "#f87171", fontSize: 12, marginTop: 2 }}>El bot no pudo resolver el problema. Toma el ticket para asistir al usuario.</div>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.length === 0 && !loadingMsgs ? (
                  <div style={{ textAlign: "center", color: "#475569", fontSize: 13, marginTop: 40 }}>Sin mensajes aún</div>
                ) : messages.map(m => {
                  const isUserMsg  = m.sender === "user";
                  const isAdminMsg = m.sender === "admin";
                  const isSystem   = m.sender === "system";
                  const isBot      = m.sender === "bot" || m.sender === "assistant";
                  const isSystemPill = isAdminMsg && (m.message?.startsWith("🔵") || m.message?.startsWith("🔒"));
                  // Parse operator name and clean message text
                  function stripOpSuffix(raw: string): { text: string; opName: string | null } {
                    const match = raw.match(/^([\s\S]*?)\n---MANDER_OP:(.+)---$/);
                    if (match) return { text: match[1], opName: match[2] };
                    return { text: raw, opName: null };
                  }
                  if (isSystem || isSystemPill) {
                    const label = m.message?.replace(/^🔵\s*|^🔒\s*/, "").trim() ?? m.message;
                    const isJoinPill = m.message?.startsWith("🔵");
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
                        <span style={{
                          fontSize: 11,
                          color: isJoinPill ? "#60a5fa" : "#fca5a5",
                          background: isJoinPill ? "#1e3a5f" : "#3b1010",
                          border: `1px solid ${isJoinPill ? "#1d4ed8" : "#7f1d1d"}`,
                          borderRadius: 10,
                          padding: "3px 14px", fontStyle: "italic",
                        }}>{label}</span>
                      </div>
                    );
                  }
                  const { text: msgText, opName } = isAdminMsg ? stripOpSuffix(m.message) : { text: m.message, opName: null };
                  return (
                    <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isUserMsg ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "72%",
                        background: isUserMsg ? "#1e40af" : isAdminMsg ? "#14532d" : isBot ? "#0f2a1a" : "#1e2a3d",
                        color: isBot ? "#86efac" : "#e2e8f0",
                        borderRadius: isUserMsg ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        padding: "10px 14px",
                        fontSize: 14,
                        lineHeight: 1.5,
                        wordBreak: "break-word",
                        border: isBot ? "1px solid #166534" : undefined,
                      }}>
                        {(()=>{
                          const imgMatch = msgText?.match(/^\[IMAGE:(https?:\/\/.+)\]$/);
                          if (imgMatch) return (
                            <img
                              src={imgMatch[1]}
                              alt="attachment"
                              style={{ maxWidth: "100%", borderRadius: 8, display: "block", cursor: "pointer" }}
                              onClick={() => window.open(imgMatch[1], "_blank")}
                            />
                          );
                          return msgText;
                        })()}
                      </div>
                      {/* Auto-translation for user messages */}
                      {!isAdminMsg && !isBot && (() => {
                        const tr = translations.get(m.id);
                        const inFlight = translatingRef.current.has(m.id);
                        if (!tr && !inFlight) return null;
                        const langLabel = tr?.lang === "es" ? "ES" : "EN";
                        const langColor = tr?.lang === "es" ? "#166534" : "#1e3a5f";
                        const langText  = tr?.lang === "es" ? "#4ade80" : "#60a5fa";
                        return (
                          <div style={{
                            marginTop: 5, padding: "6px 12px",
                            background: "#0e1623", border: "1px solid #1e2a3d",
                            borderRadius: "10px 0 10px 10px",
                            fontSize: 12, color: "#64748b", fontStyle: "italic",
                            maxWidth: "72%", wordBreak: "break-word",
                          }}>
                            {inFlight && !tr ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                Traduciendo...
                              </span>
                            ) : (
                              <span>
                                <span style={{
                                  background: langColor, color: langText,
                                  fontStyle: "normal", fontSize: 9, fontWeight: 700,
                                  padding: "1px 5px", borderRadius: 4, marginRight: 6,
                                  letterSpacing: "0.05em",
                                }}>{langLabel}</span>
                                {tr?.text}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <div style={{ fontSize: 10, color: "#475569", marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={isBot ? { color: "#4ade80" } : undefined}>{isAdminMsg ? (opName ?? "Admin") : isBot ? "🤖 Mander Bot" : m.username}</span>
                        <span>{fmtTime(m.created_at)}</span>
                        {m.sender === "user" && (
                          <span title={m.is_read ? "Leído" : "No leído"} style={{ color: m.is_read ? "#4ade80" : "#475569" }}>
                            {m.is_read ? "✓✓" : "✓"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={msgsEndRef} />
              </div>

              {/* Input */}
              {activeChat.status === "closed" ? (
                <div style={{ padding: "14px 18px", borderTop: "1px solid #1e2a3d", textAlign: "center", color: "#475569", fontSize: 13 }}>
                  Este ticket está cerrado. El usuario puede abrir uno nuevo.
                </div>
              ) : !joinedChats.has(activeChat.chat_id) ? (
                <div style={{ padding: "14px 18px", borderTop: "1px solid #1e2a3d", display: "flex", alignItems: "center", gap: 12, background: "#0f1a2e" }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span style={{ flex: 1, fontSize: 13, color: "#64748b" }}>Tomá el ticket para poder responder</span>
                  <button
                    onClick={joinTicket}
                    disabled={joining}
                    style={{
                      fontSize: 12, padding: "7px 16px", borderRadius: 8, fontWeight: 700,
                      background: "linear-gradient(135deg,#1d4ed8,#2563eb)",
                      color: "#fff", border: "none", cursor: joining ? "not-allowed" : "pointer",
                      opacity: joining ? 0.7 : 1, transition: "opacity .15s", whiteSpace: "nowrap",
                    }}
                  >
                    {joining ? "Entrando..." : "🎧 Tomar ticket"}
                  </button>
                </div>
              ) : (
                <div style={{ borderTop: "1px solid #1e2a3d" }}>
                  {/* Label row */}
                  <div style={{ padding: "8px 14px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Escribir respuesta</span>
                    <button
                      onClick={polishMessage}
                      disabled={polishing || !reply.trim()}
                      title="Mejorar con IA"
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: polishing ? "#1a2234" : "linear-gradient(135deg,#312e81,#4338ca)",
                        border: "1px solid #4338ca", borderRadius: 8,
                        color: polishing ? "#64748b" : "#c7d2fe",
                        fontSize: 11, fontWeight: 600, padding: "4px 10px",
                        cursor: polishing || !reply.trim() ? "not-allowed" : "pointer",
                        opacity: !reply.trim() ? 0.4 : 1,
                        transition: "opacity .15s, background .15s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {polishing ? (
                        <>
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          Mejorando...
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75z"/></svg>
                          Mejorar con IA
                        </>
                      )}
                    </button>
                  </div>
                  {/* Textarea + send */}
                  <div style={{ padding: "8px 14px 12px", display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <textarea
                        value={reply}
                        onChange={e => { setReply(e.target.value); setPolishTranslation(null); setPolishError(null); }}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                        placeholder="Escribir respuesta... (Enter para enviar)"
                        rows={2}
                        style={{
                          ...inputStyle,
                          width: "100%",
                          resize: "none",
                          fontSize: 14,
                          lineHeight: 1.5,
                          fontFamily: "'Inter', sans-serif",
                          boxSizing: "border-box",
                        }}
                      />
                      {polishTranslation && (
                        <div style={{
                          padding: "7px 11px",
                          background: "#0e1623",
                          border: "1px solid #1e2a3d",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "#94a3b8",
                          fontStyle: "italic",
                          lineHeight: 1.5,
                        }}>
                          <span style={{
                            background: "#166534", color: "#4ade80",
                            fontStyle: "normal", fontSize: 9, fontWeight: 700,
                            padding: "1px 5px", borderRadius: 4, marginRight: 6,
                            letterSpacing: "0.05em",
                          }}>ES</span>
                          {polishTranslation}
                        </div>
                      )}
                      {polishError && (
                        <div style={{
                          padding: "7px 11px",
                          background: "#1a0f0f",
                          border: "1px solid #7f1d1d",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "#f87171",
                          lineHeight: 1.5,
                        }}>
                          ⚠ {polishError}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={sendReply}
                      disabled={sending || !reply.trim()}
                      style={{
                        ...btnPrimary,
                        opacity: sending || !reply.trim() ? 0.5 : 1,
                        cursor: sending || !reply.trim() ? "not-allowed" : "pointer",
                        padding: "10px 18px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sending ? "..." : "Enviar"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Bets Tab ──────────────────────────────────────────────────────────────────

const GAMES = ["dice","plinko","keno","blackjack","mines","hilo","roulette","baccarat"];

interface Bet {
  id: string; username: string; game: string; currency: string;
  bet_usd: number; payout_usd: number; bonus_usd: number; profit_usd: number;
  multiplier: number; is_demo: boolean; created_at: string;
}
interface BetSummary {
  total_bet: number; total_payout: number; total_bonus: number; total_profit: number; count: number;
}

function BetsTab({ token }: { token: string }) {
  const [betType, setBetType] = useState<"real" | "demo">("real");
  const [isDemoSupported, setIsDemoSupported] = useState<boolean | null>(null);
  const [bets,    setBets]    = useState<Bet[]>([]);
  const [summary, setSummary] = useState<BetSummary | null>(null);
  const [total,   setTotal]   = useState(0);
  const [offset,  setOffset]  = useState(0);
  const LIMIT = 50;

  const [loading,  setLoading]  = useState(false);
  const [sumLoading, setSumLoading] = useState(false);
  const [error,    setError]    = useState("");
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  const [fUsername, setFUsername] = useState("");
  const [fGame,     setFGame]     = useState("");
  const [fFrom,     setFFrom]     = useState("");
  const [fTo,       setFTo]       = useState("");
  const [fMinBet,   setFMinBet]   = useState("");
  const [fMaxBet,   setFMaxBet]   = useState("");

  const [applied, setApplied] = useState({
    username: "", game: "", from: "", to: "", min_bet: "", max_bet: "",
  });

  function buildQS(filters: typeof applied, extra: Record<string, string> = {}) {
    const p = new URLSearchParams();
    if (filters.username) p.set("username", filters.username);
    if (filters.game)     p.set("game",     filters.game);
    if (filters.from)     p.set("from",     filters.from);
    if (filters.to)       p.set("to",       filters.to);
    if (filters.min_bet)  p.set("min_bet",  filters.min_bet);
    if (filters.max_bet)  p.set("max_bet",  filters.max_bet);
    p.set("is_demo", betType === "demo" ? "true" : "false");
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString() ? "?" + p.toString() : "";
  }

  async function load(filters: typeof applied, pageOffset = 0) {
    setLoading(true); setError("");
    try {
      const qs = buildQS(filters, { limit: String(LIMIT), offset: String(pageOffset) });
      const r = await fetch(`/api/admin/bets${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setBets(d.bets ?? []);
      setTotal(d.total ?? 0);
      setOffset(pageOffset);
      if (typeof d.is_demo_supported === "boolean") setIsDemoSupported(d.is_demo_supported);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally { setLoading(false); }
  }

  async function loadSummary(filters: typeof applied) {
    setSumLoading(true);
    try {
      const qs = buildQS(filters);
      const r = await fetch(`/api/admin/bets/summary${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setSummary(d);
    } catch { setSummary(null); }
    finally { setSumLoading(false); }
  }

  useEffect(() => { setOffset(0); load(applied, 0); loadSummary(applied); }, [betType]);

  function applyFilters() {
    const f = { username: fUsername.trim(), game: fGame, from: fFrom, to: fTo, min_bet: fMinBet.trim(), max_bet: fMaxBet.trim() };
    setApplied(f);
    load(f, 0);
    loadSummary(f);
  }

  function resetFilters() {
    setFUsername(""); setFGame(""); setFFrom(""); setFTo(""); setFMinBet(""); setFMaxBet("");
    const f = { username: "", game: "", from: "", to: "", min_bet: "", max_bet: "" };
    setApplied(f);
    load(f, 0);
    loadSummary(f);
  }

  function clickUsername(uname: string) {
    setFUsername(uname);
    const f = { ...applied, username: uname };
    setApplied(f);
    load(f, 0);
    loadSummary(f);
  }

  const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (iso: string) => parseUTC(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: AR });

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const inpS: React.CSSProperties = { ...inputStyle, width: "100%" };
  const labelS: React.CSSProperties = { fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4, display: "block" };

  const sumCard = (label: string, value: string, color: string, sub?: string) => (
    <div style={{ background: "#0d1117", border: "1px solid #1e2a3d", borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.ok ? "#15803d" : "#dc2626", color: "#fff", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.5)" }}>
          {toast.msg}
        </div>
      )}

      {/* Migration notice when is_demo column doesn't exist */}
      {isDemoSupported === false && (
        <div style={{ background: "#1a1500", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 10, padding: "10px 16px", marginBottom: 14, fontSize: 12, color: "#fbbf24", display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠️</span>
          <span>Migración pendiente: ejecutá <code style={{ background: "#111", borderRadius: 4, padding: "1px 6px" }}>ALTER TABLE game_bets ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;</code> en el editor SQL de Supabase. Hasta entonces, ambas pestañas muestran todas las apuestas.</span>
        </div>
      )}

      {/* Real / Demo tab switcher */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "#0d1117", border: "1px solid #1e2a3d", borderRadius: 10, padding: 4, alignSelf: "flex-start", width: "fit-content" }}>
        {(["real", "demo"] as const).map(t => (
          <button
            key={t}
            onClick={() => setBetType(t)}
            style={{
              padding: "8px 22px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.03em",
              transition: "background 0.15s, color 0.15s",
              background: betType === t ? (t === "real" ? "#1e3a5f" : "#2d1a3e") : "transparent",
              color: betType === t ? (t === "real" ? "#60a5fa" : "#c084fc") : "#64748b",
              boxShadow: betType === t ? "0 0 0 1px " + (t === "real" ? "rgba(96,165,250,0.3)" : "rgba(192,132,252,0.3)") : "none",
            }}
          >
            {t === "real" ? "💰 Apuestas Reales" : "🎭 Apuestas Demo"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>
            Historial de Apuestas{betType === "demo" && <span style={{ marginLeft: 10, fontSize: 13, background: "#2d1a3e", border: "1px solid rgba(192,132,252,0.4)", borderRadius: 6, color: "#c084fc", padding: "2px 10px", fontWeight: 700, verticalAlign: "middle" }}>DEMO</span>}
          </h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading ? "Cargando..." : `${total.toLocaleString("en-US")} apuestas encontradas`}
          </p>
        </div>
        <button onClick={() => { load(applied, offset); loadSummary(applied); }} disabled={loading} style={btnSecondary}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ background: "#111827", border: "1px solid #1e2a3d", borderRadius: 10, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelS}>Usuario</label>
            <input value={fUsername} onChange={e => setFUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && applyFilters()} placeholder="username..." style={inpS} />
          </div>
          <div>
            <label style={labelS}>Juego</label>
            <select value={fGame} onChange={e => setFGame(e.target.value)} style={inpS}>
              <option value="">Todos</option>
              {GAMES.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelS}>Desde</label>
            <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={inpS} />
          </div>
          <div>
            <label style={labelS}>Hasta</label>
            <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={inpS} />
          </div>
          <div>
            <label style={labelS}>Apuesta mín.</label>
            <input type="number" min="0" value={fMinBet} onChange={e => setFMinBet(e.target.value)} placeholder="0.00" style={inpS} />
          </div>
          <div>
            <label style={labelS}>Apuesta máx.</label>
            <input type="number" min="0" value={fMaxBet} onChange={e => setFMaxBet(e.target.value)} placeholder="999" style={inpS} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={applyFilters} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>Filtrar</button>
          <button onClick={resetFilters} style={btnSecondary}>Reset</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {sumLoading ? (
          <div style={{ color: "#64748b", fontSize: 13, padding: "20px 0" }}>Calculando totales...</div>
        ) : summary ? (
          <>
            {sumCard("Total Apostado",  fmtUSD(summary.total_bet),    "#e2e8f0", `${(summary.count ?? 0).toLocaleString("en-US")} rondas`)}
            {sumCard("Total Pagado",    fmtUSD(summary.total_payout), "#f87171")}
            {sumCard("Total Bonus",     fmtUSD(summary.total_bonus),  "#fb923c")}
            {sumCard(
              betType === "demo" ? "Resultado Demo" : "Profit Casa",
              fmtUSD(summary.total_profit),
              summary.total_profit >= 0 ? (betType === "demo" ? "#c084fc" : "#4ade80") : "#f87171",
              betType === "demo"
                ? (summary.total_profit >= 0 ? "▲ Casa gana (demo)" : "▼ Casa pierde (demo)")
                : (summary.total_profit >= 0 ? "▲ La casa gana" : "▼ La casa pierde")
            )}
          </>
        ) : null}
      </div>

      {error && (
        <div style={{ background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10, padding: "14px 18px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
          Error: {error}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>Cargando apuestas...</div>
      ) : bets.length === 0 ? (
        <div style={{ ...card, padding: "50px 0", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎰</div>
          <div style={{ color: "#64748b", fontSize: 14 }}>No hay apuestas para los filtros seleccionados.</div>
        </div>
      ) : (
        <div style={{ ...card, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr>
                {["Usuario","Juego","Moneda","Apuesta","Ganó","Mult.","Bonus","Profit","Fecha"].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bets.map(b => {
                const profitPos = b.profit_usd > 0;
                const profitNeg = b.profit_usd < 0;
                return (
                  <tr key={b.id}
                    onMouseEnter={e => (e.currentTarget.style.background = "#152035")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={td}>
                      <button
                        onClick={() => clickUsername(b.username)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#60a5fa", fontWeight: 700, fontSize: 13, padding: 0, fontFamily: "'Inter', sans-serif" }}
                        title="Filtrar por este usuario"
                      >
                        {b.username}
                      </button>
                    </td>
                    <td style={td}>
                      <span style={{ background: "#1e2a3d", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "capitalize" }}>
                        {b.game}
                      </span>
                    </td>
                    <td style={{ ...td, color: "#64748b" }}>{b.currency}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtUSD(b.bet_usd)}</td>
                    <td style={{ ...td, color: b.payout_usd > 0 ? "#4ade80" : "#64748b" }}>{fmtUSD(b.payout_usd)}</td>
                    <td style={{ ...td, color: b.multiplier > 1 ? "#a78bfa" : "#475569", fontWeight: 700 }}>
                      {b.multiplier > 0 ? `${b.multiplier.toFixed(2)}x` : "—"}
                    </td>
                    <td style={{ ...td, color: b.bonus_usd > 0 ? "#fb923c" : "#475569" }}>
                      {b.bonus_usd > 0 ? fmtUSD(b.bonus_usd) : "—"}
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: profitPos ? "#4ade80" : profitNeg ? "#f87171" : "#64748b" }}>
                      {profitPos ? "+" : ""}{fmtUSD(b.profit_usd)}
                    </td>
                    <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(b.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 20 }}>
          <button
            onClick={() => load(applied, Math.max(0, offset - LIMIT))}
            disabled={offset === 0 || loading}
            style={{ ...btnSecondary, opacity: offset === 0 ? 0.4 : 1, cursor: offset === 0 ? "not-allowed" : "pointer" }}>
            ← Anterior
          </button>
          <span style={{ color: "#64748b", fontSize: 13 }}>
            Página <strong style={{ color: "#e2e8f0" }}>{currentPage}</strong> de <strong style={{ color: "#e2e8f0" }}>{totalPages}</strong>
          </span>
          <button
            onClick={() => load(applied, offset + LIMIT)}
            disabled={offset + LIMIT >= total || loading}
            style={{ ...btnSecondary, opacity: offset + LIMIT >= total ? 0.4 : 1, cursor: offset + LIMIT >= total ? "not-allowed" : "pointer" }}>
            Siguiente →
          </button>
        </div>
      )}
    </>
  );
}

// ── IpsTab ────────────────────────────────────────────────────────────────────
interface IpEntry { userId: string; username: string; ips: string[]; lastIp: string; lastSeen: string; pending?: boolean; referred_by?: string | null; ref_code_used?: string | null; }
interface IpReport { duplicates: { ip: string; users: string[] }[]; all: IpEntry[]; }

function IpsTab({ token }: { token: string }) {
  const [report, setReport]     = useState<IpReport | null>(null);
  const [loading, setLoading]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [search, setSearch]     = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/ip-report", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setReport(await r.json());
    } finally { setLoading(false); }
  };

  const importHistory = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await fetch("/api/admin/ip-import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (r.ok) {
        setImportMsg(`✓ ${j.seeded} usuarios cargados. ${j.note}`);
        await load();
      } else {
        setImportMsg(`✗ Error: ${j.error}`);
      }
    } finally { setImporting(false); }
  };

  useEffect(() => { load(); }, []);

  const searchLow = search.toLowerCase().trim();

  // All usernames whose ref_code matches the search term
  const codeMatchUsers = new Set(
    searchLow
      ? (report?.all ?? [])
          .filter(e => (e.ref_code_used ?? "").toLowerCase() === searchLow)
          .map(e => e.username)
      : []
  );
  const isCodeFilter = searchLow.length > 0 && codeMatchUsers.size > 0;

  // Filter duplicates: if search matches a code → only show dups with a user from that code
  // Otherwise show all dups (or filter by username/IP partial match)
  const filteredDups = report?.duplicates.filter(d => {
    if (!searchLow) return true;
    if (isCodeFilter) return d.users.some(u => codeMatchUsers.has(u));
    // fallback: filter by IP or username partial match
    return d.ip.includes(searchLow) || d.users.some(u => u.toLowerCase().includes(searchLow));
  }) ?? [];

  const filtered = report?.all.filter(e => {
    if (!searchLow) return true;
    if (isCodeFilter) return codeMatchUsers.has(e.username) || filteredDups.some(d => d.users.includes(e.username));
    return (
      e.username.toLowerCase().includes(searchLow) ||
      e.ips.some(ip => ip.includes(searchLow)) ||
      (e.ref_code_used ?? "").toLowerCase().includes(searchLow) ||
      (e.referred_by ?? "").toLowerCase().includes(searchLow)
    );
  }) ?? [];

  const dupUsernames = new Set(report?.duplicates.flatMap(d => d.users) ?? []);

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:"#e2e8f0" }}>Detección de IPs Duplicadas</h2>
          <p style={{ margin:"4px 0 0", color:"#64748b", fontSize:13 }}>
            Se registran IPs al hacer login. Las cuentas que comparten IP pueden ser duplicadas.
          </p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={importHistory} disabled={importing || loading} style={{ padding:"8px 16px", borderRadius:6, border:"none", background:"#1e3a2f", color:"#86efac", fontWeight:600, fontSize:13, cursor: importing ? "wait" : "pointer", opacity: importing ? 0.7 : 1 }}>
            {importing ? "Importando…" : "⬇ Importar historial"}
          </button>
          <button onClick={load} disabled={loading} style={{ padding:"8px 16px", borderRadius:6, border:"none", background:"#1e3a5f", color:"#93c5fd", fontWeight:600, fontSize:13, cursor:"pointer" }}>
            {loading ? "Cargando…" : "↻ Actualizar"}
          </button>
        </div>
      </div>
      {importMsg && (
        <div style={{ marginBottom:16, padding:"10px 14px", borderRadius:6, background: importMsg.startsWith("✓") ? "#0a1a0a" : "#1a0a0a", border: `1px solid ${importMsg.startsWith("✓") ? "#14532d" : "#7f1d1d"}`, color: importMsg.startsWith("✓") ? "#86efac" : "#fca5a5", fontSize:13 }}>
          {importMsg}
        </div>
      )}

      {/* Buscador */}
      <div style={{ position:"relative", marginBottom:16 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filtrar por código (ej: VKNG), usuario o IP…"
          style={{ width:"100%", padding:"9px 12px 9px 36px", borderRadius:6, border:`1px solid ${isCodeFilter ? "#166534" : "#1e2a3d"}`, background:"#0d1520", color:"#e2e8f0", fontSize:13, boxSizing:"border-box" as const, transition:"border-color 0.2s" }}
        />
        <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color: isCodeFilter ? "#86efac" : "#475569", fontSize:14 }}>
          {isCodeFilter ? "🏷" : "🔍"}
        </span>
        {search && (
          <button onClick={() => setSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
        )}
      </div>
      {isCodeFilter && (
        <div style={{ marginBottom:12, padding:"6px 12px", borderRadius:6, background:"#0a1a0a", border:"1px solid #166534", color:"#86efac", fontSize:12 }}>
          Mostrando IPs duplicadas del código <strong style={{ fontFamily:"monospace" }}>{search.toUpperCase()}</strong> — {codeMatchUsers.size} usuario{codeMatchUsers.size !== 1 ? "s" : ""} con ese código
        </div>
      )}

      {/* Duplicados */}
      {report && filteredDups.length > 0 && (
        <div style={{ marginBottom:24, background:"#1a0a0a", border:"1px solid #7f1d1d", borderRadius:8, padding:16 }}>
          <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700, color:"#fca5a5" }}>
            ⚠ {filteredDups.length} IP{filteredDups.length > 1 ? "s" : ""} compartida{filteredDups.length > 1 ? "s" : ""} detectada{filteredDups.length > 1 ? "s" : ""}
            {isCodeFilter && <span style={{ fontWeight:400, color:"#f87171", marginLeft:8, fontSize:12 }}>(filtrado por {search.toUpperCase()})</span>}
          </h3>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filteredDups.map(d => (
              <div key={d.ip} style={{ background:"#2a0e0e", borderRadius:6, padding:"10px 14px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <span style={{ fontFamily:"monospace", fontSize:13, color:"#ef4444", fontWeight:700, minWidth:130 }}>{d.ip}</span>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {d.users.map(u => (
                    <span key={u} style={{ background: codeMatchUsers.has(u) ? "#14532d" : "#7f1d1d", color: codeMatchUsers.has(u) ? "#86efac" : "#fca5a5", borderRadius:4, padding:"2px 8px", fontSize:12, fontWeight:600 }}>{u}</span>
                  ))}
                </div>
                <span style={{ marginLeft:"auto", color:"#dc2626", fontSize:12 }}>{d.users.length} cuentas</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {report && filteredDups.length === 0 && !isCodeFilter && report.duplicates.length === 0 && (
        <div style={{ marginBottom:24, background:"#0a1a0a", border:"1px solid #14532d", borderRadius:8, padding:14, color:"#86efac", fontSize:13 }}>
          ✓ No se detectaron IPs compartidas entre cuentas.
        </div>
      )}
      {report && filteredDups.length === 0 && (isCodeFilter || searchLow) && report.duplicates.length > 0 && (
        <div style={{ marginBottom:24, background:"#0d1520", border:"1px solid #1e2a3d", borderRadius:8, padding:14, color:"#64748b", fontSize:13 }}>
          Sin IPs duplicadas para este filtro.
        </div>
      )}

      {/* Tabla de todos los usuarios */}
      {loading && !report && <div style={{ color:"#64748b", textAlign:"center", padding:40 }}>Cargando…</div>}
      {filtered.length === 0 && !loading && (
        <div style={{ color:"#64748b", textAlign:"center", padding:40, fontSize:13 }}>
          {report ? "Sin registros aún. Los IPs se capturan al hacer login." : ""}
        </div>
      )}
      {filtered.length > 0 && (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid #1e2a3d" }}>
                {["Usuario","Referido por","Última IP","Todas las IPs","Última vez"].map(h => (
                  <th key={h} style={{ textAlign:"left", padding:"8px 12px", color:"#64748b", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.userId} style={{ borderBottom:"1px solid #0e1826", background: dupUsernames.has(e.username) ? "#1a0d0d" : "transparent" }}>
                  <td style={{ padding:"9px 12px" }}>
                    <span style={{ fontWeight:600, color: dupUsernames.has(e.username) ? "#fca5a5" : "#e2e8f0" }}>
                      {dupUsernames.has(e.username) ? "⚠ " : ""}{e.username}
                    </span>
                  </td>
                  <td style={{ padding:"9px 12px" }}>
                    {e.ref_code_used
                      ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                          <span style={{ background:"#1a2a1a", border:"1px solid #166534", borderRadius:4, padding:"2px 7px", fontSize:12, fontFamily:"monospace", color:"#86efac", fontWeight:700, display:"inline-block" }}>
                            {e.ref_code_used}
                          </span>
                          {e.referred_by && (
                            <span style={{ color:"#475569", fontSize:11 }}>por {e.referred_by}</span>
                          )}
                        </div>
                      )
                      : <span style={{ color:"#334155", fontSize:12, fontStyle:"italic" }}>—</span>
                    }
                  </td>
                  <td style={{ padding:"9px 12px", fontFamily:"monospace", color: e.pending ? "#475569" : "#93c5fd" }}>
                    {e.pending ? <span style={{ color:"#475569", fontStyle:"italic", fontSize:12 }}>Sin IP aún</span> : e.lastIp}
                  </td>
                  <td style={{ padding:"9px 12px" }}>
                    {e.pending
                      ? <span style={{ color:"#475569", fontStyle:"italic", fontSize:12 }}>Se captura al hacer login</span>
                      : <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {e.ips.map(ip => (
                            <span key={ip} style={{ background:"#1e2a3d", borderRadius:4, padding:"1px 6px", fontSize:11, fontFamily:"monospace", color:"#94a3b8" }}>{ip}</span>
                          ))}
                        </div>
                    }
                  </td>
                  <td style={{ padding:"9px 12px", color:"#64748b", fontSize:12, whiteSpace:"nowrap" }}>
                    {e.pending ? "—" : new Date(e.lastSeen).toLocaleString("es-AR", { dateStyle:"short", timeStyle:"short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── DevicesTab ────────────────────────────────────────────────────────────────
// ─── Wallet Detection Tab ────────────────────────────────────────────────────

interface DepositNode { depositId:number; userId:string; username:string; address:string; txHash:string; network:string; currency:string; amount:number; amountUsd:number; createdAt:string; refCode:string; }
interface RiskFactor  { label:string; score:number; }
interface WalletCluster { id:string; reason:string; users:string[]; deposits:DepositNode[]; riskScore:number; riskFactors:RiskFactor[]; totalUsd:number; detectedAt:string; }
interface WalletAlert   { id:string; severity:"high"|"medium"|"low"; message:string; users:string[]; clusterId:string; detectedAt:string; resolved:boolean; }
interface WalletReport  { clusters:WalletCluster[]; alerts:WalletAlert[]; all:DepositNode[]; analyzedAt:string; }

const RISK_REASON: Record<string,string> = {
  shared_address:     "Dirección compartida",
  same_tx:            "TX hash duplicado",
  timing_amount:      "Timing + monto similar",
  affiliate_ip_device:"Afiliado + IP/Dispositivo",
};

function riskColor(score: number): string {
  if (score >= 100) return "#ef4444";
  if (score >= 70)  return "#f97316";
  return "#eab308";
}
function riskLabel(score: number): string {
  if (score >= 100) return "ALTO";
  if (score >= 70)  return "MEDIO";
  return "BAJO";
}
function riskBg(score: number): string {
  if (score >= 100) return "#2a0e0e";
  if (score >= 70)  return "#1f1205";
  return "#1a1a05";
}

// ── Mini SVG cluster graph ──────────────────────────────────────────────────
function ClusterGraph({ cluster }: { cluster: WalletCluster }) {
  const users = cluster.users.slice(0, 8);
  const cx = 90, cy = 90, r = 62;
  const color = riskColor(cluster.riskScore);
  return (
    <svg width={180} height={180} style={{ flexShrink: 0 }}>
      {/* center node */}
      <circle cx={cx} cy={cy} r={18} fill={riskBg(cluster.riskScore)} stroke={color} strokeWidth={2} />
      <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" fontSize={14}>🔗</text>
      {/* user nodes */}
      {users.map((u, i) => {
        const angle = (2 * Math.PI * i) / users.length - Math.PI / 2;
        const nx = cx + r * Math.cos(angle);
        const ny = cy + r * Math.sin(angle);
        return (
          <g key={u}>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={1} strokeOpacity={0.35} />
            <circle cx={nx} cy={ny} r={14} fill="#0d1520" stroke={color} strokeWidth={1.5} />
            <text x={nx} y={ny+1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#94a3b8"
              style={{ userSelect:"none" as const }}>{u.slice(0,7)}</text>
          </g>
        );
      })}
      {users.length < cluster.users.length && (
        <text x={cx} y={cy+72} textAnchor="middle" fontSize={9} fill="#64748b">+{cluster.users.length - users.length} más</text>
      )}
    </svg>
  );
}

// ── CSV export ───────────────────────────────────────────────────────────────
function exportWalletCsv(clusters: WalletCluster[]) {
  const rows = ["Risk,Score,Razón,Usuarios,Total USD,Dirección,TX Hash,Red,Detectado"];
  for (const c of clusters) {
    for (const d of c.deposits) {
      rows.push([
        riskLabel(c.riskScore), c.riskScore,
        RISK_REASON[c.reason] ?? c.reason,
        c.users.join("|"),
        c.totalUsd.toFixed(2),
        d.address, d.txHash, d.network,
        new Date(c.detectedAt).toLocaleString("es-AR"),
      ].join(","));
    }
  }
  const blob = new Blob([rows.join("\n")], { type:"text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `wallet-clusters-${Date.now()}.csv`;
  a.click();
}

function WalletDetectionTab({ token }: { token: string }) {
  const [report, setReport]   = useState<WalletReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all"|"high"|"medium"|"low">("all");
  const [expandedCluster, setExpandedCluster] = useState<string|null>(null);

  const load = async (force = false) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/wallet-report${force ? "?refresh=1" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setReport(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const q = search.toLowerCase().trim();
  const clusters = (report?.clusters ?? []).filter(c => {
    if (severityFilter !== "all") {
      const lbl = riskLabel(c.riskScore).toLowerCase();
      if (severityFilter === "high"   && lbl !== "alto")  return false;
      if (severityFilter === "medium" && lbl !== "medio") return false;
      if (severityFilter === "low"    && lbl !== "bajo")  return false;
    }
    if (!q) return true;
    return (
      c.users.some(u => u.toLowerCase().includes(q)) ||
      c.deposits.some(d => d.address.toLowerCase().includes(q) || d.txHash.toLowerCase().includes(q))
    );
  });

  const highCount   = (report?.clusters ?? []).filter(c => c.riskScore >= 100).length;
  const medCount    = (report?.clusters ?? []).filter(c => c.riskScore >= 70 && c.riskScore < 100).length;
  const alertsHigh  = (report?.alerts ?? []).filter(a => a.severity === "high");

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:"#e2e8f0" }}>Detección de Relaciones de Wallet</h2>
          <p style={{ margin:"4px 0 0", color:"#64748b", fontSize:13 }}>
            Análisis de patrones entre cuentas: dirección compartida, TX duplicado, timing, afiliado + IP/dispositivo.
          </p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {report && <button onClick={() => exportWalletCsv(clusters)} style={{ padding:"8px 14px", borderRadius:6, border:"none", background:"#14532d", color:"#86efac", fontWeight:600, fontSize:12, cursor:"pointer" }}>⬇ CSV</button>}
          <button onClick={() => load(true)} disabled={loading} style={{ padding:"8px 16px", borderRadius:6, border:"none", background:"#1e3a5f", color:"#93c5fd", fontWeight:600, fontSize:13, cursor:"pointer" }}>
            {loading ? "Analizando…" : "↻ Actualizar"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {report && (
        <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
          {[
            { label:"Clusters totales",   value: report.clusters.length,          color:"#93c5fd", bg:"#0d1520" },
            { label:"Alto riesgo",         value: highCount,                       color:"#ef4444", bg:"#1a0808" },
            { label:"Riesgo medio",        value: medCount,                        color:"#f97316", bg:"#1a0e05" },
            { label:"Alertas activas",     value: report.alerts.length,            color:"#facc15", bg:"#1a1800" },
            { label:"Depósitos analizados",value: report.all.length,               color:"#64748b", bg:"#0d1117" },
          ].map(c => (
            <div key={c.label} style={{ flex:"1 1 110px", minWidth:110, background:c.bg, border:`1px solid ${c.color}22`, borderRadius:8, padding:"12px 14px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:800, color:c.color }}>{c.value}</div>
              <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Active high-risk alerts */}
      {alertsHigh.length > 0 && (
        <div style={{ marginBottom:20, background:"#1a0808", border:"1px solid #7f1d1d", borderRadius:8, padding:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#fca5a5", marginBottom:10 }}>🚨 {alertsHigh.length} alertas de alto riesgo</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {alertsHigh.slice(0, 5).map(a => (
              <div key={a.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 10px", borderRadius:6, background:"#2a0e0e", border:"1px solid #991b1b" }}>
                <span style={{ fontSize:16, flexShrink:0 }}>⚠</span>
                <div style={{ flex:1 }}>
                  <div style={{ color:"#fca5a5", fontSize:12 }}>{a.message}</div>
                  <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
                    {a.users.map(u => <span key={u} style={{ background:"#7f1d1d", color:"#fca5a5", borderRadius:4, padding:"1px 7px", fontSize:11 }}>{u}</span>)}
                  </div>
                </div>
                <span style={{ fontSize:10, color:"#64748b", whiteSpace:"nowrap", flexShrink:0 }}>{new Date(a.detectedAt).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"})}</span>
              </div>
            ))}
            {alertsHigh.length > 5 && <div style={{ color:"#64748b", fontSize:12, textAlign:"center" }}>+{alertsHigh.length - 5} alertas más</div>}
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ position:"relative", flex:"1 1 220px" }}>
          <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:"#475569", fontSize:13 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por wallet, usuario o TX hash…"
            style={{ width:"100%", padding:"9px 12px 9px 32px", borderRadius:6, border:"1px solid #1e2a3d", background:"#0d1520", color:"#e2e8f0", fontSize:13, boxSizing:"border-box" as const, outline:"none" }}
          />
          {search && <button onClick={() => setSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:16 }}>×</button>}
        </div>
        {(["all","high","medium","low"] as const).map(s => (
          <button key={s} onClick={() => setSeverityFilter(s)} style={{
            padding:"8px 14px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
            background: severityFilter === s ? (s === "high" ? "#7f1d1d" : s === "medium" ? "#7c2d12" : s === "low" ? "#713f12" : "#1e3a5f") : "#0d1520",
            color: severityFilter === s ? "#fff" : "#64748b",
          }}>{s === "all" ? "Todos" : s === "high" ? "🔴 Alto" : s === "medium" ? "🟠 Medio" : "🟡 Bajo"}</button>
        ))}
      </div>

      {loading && !report && <div style={{ color:"#64748b", textAlign:"center", padding:60 }}>Analizando depósitos…</div>}

      {report && clusters.length === 0 && (
        <div style={{ background:"#0a1a0a", border:"1px solid #14532d", borderRadius:8, padding:20, color:"#86efac", fontSize:13, textAlign:"center" }}>
          ✓ {q ? "Sin clusters que coincidan con la búsqueda." : "No se detectaron relaciones sospechosas entre wallets."}
        </div>
      )}

      {/* Clusters list */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {clusters.map(c => {
          const isExpanded = expandedCluster === c.id;
          const color = riskColor(c.riskScore);
          return (
            <div key={c.id} style={{ background: riskBg(c.riskScore), border:`1px solid ${color}44`, borderRadius:8, overflow:"hidden" }}>
              {/* Cluster header */}
              <div
                onClick={() => setExpandedCluster(isExpanded ? null : c.id)}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", cursor:"pointer", flexWrap:"wrap" }}
              >
                <span style={{ background: riskBg(c.riskScore), border:`1px solid ${color}`, color, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:800, flexShrink:0 }}>
                  {riskLabel(c.riskScore)} {c.riskScore}pts
                </span>
                <span style={{ color:"#94a3b8", fontSize:12, flexShrink:0 }}>
                  {RISK_REASON[c.reason] ?? c.reason}
                </span>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", flex:1 }}>
                  {c.users.slice(0, 6).map(u => (
                    <span key={u} style={{ background:"#0d1520", color, borderRadius:4, padding:"1px 7px", fontSize:12, border:`1px solid ${color}33` }}>{u}</span>
                  ))}
                  {c.users.length > 6 && <span style={{ color:"#64748b", fontSize:12 }}>+{c.users.length - 6}</span>}
                </div>
                <div style={{ display:"flex", gap:16, alignItems:"center", flexShrink:0 }}>
                  <span style={{ color:"#64748b", fontSize:12 }}>${c.totalUsd.toFixed(2)} USD</span>
                  <span style={{ color:"#64748b", fontSize:11 }}>{new Date(c.detectedAt).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"})}</span>
                  <span style={{ color:"#475569", fontSize:16 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop:`1px solid ${color}22`, padding:"16px", display:"flex", gap:20, flexWrap:"wrap" }}>
                  {/* Graph */}
                  <ClusterGraph cluster={c} />

                  {/* Detail */}
                  <div style={{ flex:1, minWidth:220 }}>
                    {/* Risk factors */}
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:6, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>Factores de riesgo</div>
                      {c.riskFactors.map((f, i) => (
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                          <span style={{ fontSize:12, color:"#94a3b8" }}>{f.label}</span>
                          <span style={{ fontWeight:700, fontSize:12, color, background:`${color}22`, borderRadius:4, padding:"1px 7px" }}>+{f.score}</span>
                        </div>
                      ))}
                    </div>

                    {/* Deposits */}
                    <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:6, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>Depósitos vinculados</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {c.deposits.map(d => (
                        <div key={d.depositId} style={{ background:"#0d1520", borderRadius:6, padding:"8px 12px", fontSize:12 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                            <span style={{ fontWeight:700, color:"#e2e8f0" }}>{d.username}</span>
                            <span style={{ color:"#93c5fd" }}>{d.amountUsd.toFixed(2)} USD</span>
                          </div>
                          <div style={{ color:"#4a6fa5", fontFamily:"monospace", fontSize:11, marginBottom:2 }}>
                            📍 {d.address.slice(0,18)}…{d.address.slice(-6)}
                          </div>
                          {d.txHash && (
                            <div style={{ color:"#64748b", fontFamily:"monospace", fontSize:10 }}>
                              TX: {d.txHash.slice(0,16)}…
                            </div>
                          )}
                          <div style={{ display:"flex", gap:8, marginTop:4 }}>
                            <span style={{ background:"#1e2a3d", color:"#94a3b8", borderRadius:3, padding:"1px 6px", fontSize:10 }}>{d.network}</span>
                            <span style={{ background:"#1e2a3d", color:"#94a3b8", borderRadius:3, padding:"1px 6px", fontSize:10 }}>{d.currency}</span>
                            {d.refCode && <span style={{ background:"#14532d", color:"#86efac", borderRadius:3, padding:"1px 6px", fontSize:10 }}>🏷 {d.refCode}</span>}
                            <span style={{ color:"#334155", fontSize:10, marginLeft:"auto" }}>{new Date(d.createdAt).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"})}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DeviceEntry { hash: string; info: string; firstSeen: string; lastSeen: string; }
interface UserDeviceEntry { userId: string; username: string; devices: DeviceEntry[]; lastHash: string; lastInfo: string; lastSeen: string; referred_by?: string | null; ref_code_used?: string | null; }
interface DeviceReport { duplicates: { hash: string; info: string; users: string[] }[]; all: UserDeviceEntry[]; }

function DevicesTab({ token }: { token: string }) {
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [codeSearch, setCodeSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/device-report", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setReport(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const codeLow = codeSearch.toLowerCase().trim();
  const userLow = userSearch.toLowerCase().trim();
  const hasFilter = codeLow.length > 0 || userLow.length > 0;

  // ── Affiliate-code filter ─────────────────────────────────────────────────
  const codeMatchUsers = new Set(
    codeLow ? (report?.all ?? []).filter(e => (e.ref_code_used ?? "").toLowerCase() === codeLow).map(e => e.username) : []
  );
  const isCodeFilter = codeLow.length > 0 && codeMatchUsers.size > 0;

  // ── Username filter with "device sibling" expansion ───────────────────────
  const directMatchUsernames = new Set(
    userLow ? (report?.all ?? []).filter(e => e.username.toLowerCase().includes(userLow)).map(e => e.username) : []
  );
  const matchedHashes = new Set<string>();
  if (directMatchUsernames.size > 0) {
    for (const e of (report?.all ?? [])) {
      if (directMatchUsernames.has(e.username)) {
        for (const d of e.devices) matchedHashes.add(d.hash);
      }
    }
  }
  const siblingUsernames = new Set<string>();
  if (matchedHashes.size > 0) {
    for (const e of (report?.all ?? [])) {
      if (!directMatchUsernames.has(e.username) && e.devices.some(d => matchedHashes.has(d.hash))) {
        siblingUsernames.add(e.username);
      }
    }
  }
  const isUserFilter = directMatchUsernames.size > 0;

  const userSharedHashes = matchedHashes.size > 0
    ? [...matchedHashes].filter(h => {
        const usersWithHash = (report?.all ?? []).filter(e => e.devices.some(d => d.hash === h));
        return usersWithHash.length > 1;
      })
    : [];

  // ── Filtered duplicates — both filters combined (OR) ─────────────────────
  const filteredDups = report?.duplicates.filter(d => {
    if (!hasFilter) return true;
    if (isCodeFilter && d.users.some(u => codeMatchUsers.has(u))) return true;
    if (isUserFilter && d.users.some(u => directMatchUsernames.has(u) || siblingUsernames.has(u))) return true;
    if (!isCodeFilter && !isUserFilter)
      return d.users.some(u => u.toLowerCase().includes(userLow) || u.toLowerCase().includes(codeLow));
    return false;
  }) ?? [];

  // ── Filtered table rows — both filters combined (OR) ─────────────────────
  const filtered = report?.all.filter(e => {
    if (!hasFilter) return true;
    if (isCodeFilter && codeMatchUsers.has(e.username)) return true;
    if (isUserFilter && (directMatchUsernames.has(e.username) || siblingUsernames.has(e.username))) return true;
    if (!isCodeFilter && !isUserFilter) {
      return (
        e.username.toLowerCase().includes(userLow || codeLow) ||
        (e.ref_code_used ?? "").toLowerCase().includes(codeLow) ||
        (e.referred_by ?? "").toLowerCase().includes(userLow)
      );
    }
    return false;
  }) ?? [];

  const dupUsernames = new Set(report?.duplicates.flatMap(d => d.users) ?? []);

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:"#e2e8f0" }}>Detección de Dispositivos Compartidos</h2>
          <p style={{ margin:"4px 0 0", color:"#64748b", fontSize:13 }}>
            Fingerprint del browser (canvas, WebGL, resolución, timezone). Detecta misma máquina con diferente IP o cuenta.
          </p>
        </div>
        <button onClick={load} disabled={loading} style={{ padding:"8px 16px", borderRadius:6, border:"none", background:"#1e3a5f", color:"#93c5fd", fontWeight:600, fontSize:13, cursor:"pointer" }}>
          {loading ? "Cargando…" : "↻ Actualizar"}
        </button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color: isCodeFilter ? "#86efac" : "#475569", fontSize:13, userSelect:"none" as const }}>🏷</span>
          <input
            value={codeSearch} onChange={e => setCodeSearch(e.target.value)}
            placeholder="Código de afiliado (ej: VKNG)"
            style={{ width:"100%", padding:"9px 12px 9px 34px", borderRadius:6, border:`1px solid ${isCodeFilter ? "#166534" : "#1e2a3d"}`, background:"#0d1520", color:"#e2e8f0", fontSize:13, boxSizing:"border-box" as const, outline:"none" }}
          />
          {codeSearch && (
            <button onClick={() => setCodeSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
          )}
        </div>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color: isUserFilter ? "#93c5fd" : "#475569", fontSize:13, userSelect:"none" as const }}>👤</span>
          <input
            value={userSearch} onChange={e => setUserSearch(e.target.value)}
            placeholder="Nombre de usuario (ej: juanito23)"
            style={{ width:"100%", padding:"9px 12px 9px 34px", borderRadius:6, border:`1px solid ${isUserFilter ? "#1e3a5f" : "#1e2a3d"}`, background:"#0d1520", color:"#e2e8f0", fontSize:13, boxSizing:"border-box" as const, outline:"none" }}
          />
          {userSearch && (
            <button onClick={() => setUserSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
          )}
        </div>
      </div>

      {isCodeFilter && (
        <div style={{ marginBottom:10, padding:"6px 12px", borderRadius:6, background:"#0a1a0a", border:"1px solid #166534", color:"#86efac", fontSize:12 }}>
          🏷 Código <strong style={{ fontFamily:"monospace" }}>{codeSearch.toUpperCase()}</strong> — {codeMatchUsers.size} usuario{codeMatchUsers.size !== 1 ? "s" : ""} referido{codeMatchUsers.size !== 1 ? "s" : ""}
        </div>
      )}

      {isUserFilter && siblingUsernames.size > 0 && (
        <div style={{ marginBottom:16, padding:"12px 16px", borderRadius:8, background:"#1a0c0a", border:"1px solid #c2410c", display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:16 }}>🚨</span>
            <span style={{ color:"#fb923c", fontWeight:700, fontSize:14 }}>
              Mismo dispositivo detectado en {siblingUsernames.size + directMatchUsernames.size} cuenta{siblingUsernames.size + directMatchUsernames.size !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            {[...directMatchUsernames].map(u => (
              <span key={u} style={{ background:"#7c2d12", color:"#fed7aa", borderRadius:5, padding:"3px 10px", fontSize:13, fontWeight:700, border:"2px solid #ea580c" }}>🔍 {u}</span>
            ))}
            <span style={{ color:"#64748b", fontSize:13 }}>comparte dispositivo con</span>
            {[...siblingUsernames].map(u => (
              <span key={u} style={{ background:"#2a1506", color:"#fb923c", borderRadius:5, padding:"3px 10px", fontSize:13, fontWeight:600, border:"1px solid #c2410c" }}>⚠ {u}</span>
            ))}
          </div>
          {userSharedHashes.length > 0 && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:2 }}>
              {userSharedHashes.map(h => {
                const allUsers = (report?.all ?? []).filter(e => e.devices.some(d => d.hash === h));
                const info = allUsers[0]?.devices.find(d => d.hash === h)?.info ?? "";
                return (
                  <span key={h} style={{ background:"#0d1520", borderRadius:4, padding:"2px 8px", fontSize:11, color:"#ef4444", fontFamily:"monospace" }}>
                    {h} {info && <span style={{ fontFamily:"sans-serif", color:"#94a3b8" }}>— {info}</span>}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isUserFilter && siblingUsernames.size === 0 && userLow && (
        <div style={{ marginBottom:12, padding:"8px 14px", borderRadius:6, background:"#0a1a0a", border:"1px solid #166534", color:"#86efac", fontSize:13 }}>
          ✓ <strong>{userSearch}</strong> no comparte dispositivo con ninguna otra cuenta registrada.
        </div>
      )}

      {report && filteredDups.length > 0 && (
        <div style={{ marginBottom:24, background:"#1a0a0a", border:"1px solid #7f1d1d", borderRadius:8, padding:16 }}>
          <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700, color:"#fca5a5" }}>
            ⚠ {filteredDups.length} dispositivo{filteredDups.length > 1 ? "s" : ""} compartido{filteredDups.length > 1 ? "s" : ""} detectado{filteredDups.length > 1 ? "s" : ""}
          </h3>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filteredDups.map(d => (
              <div key={d.hash} style={{ background:"#2a0e0e", borderRadius:6, padding:"10px 14px", display:"flex", flexDirection:"column", gap:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <span style={{ fontFamily:"monospace", fontSize:12, color:"#ef4444", fontWeight:700 }}>{d.hash}</span>
                  <span style={{ fontSize:12, color:"#f87171" }}>{d.info}</span>
                  <span style={{ marginLeft:"auto", color:"#dc2626", fontSize:12, fontWeight:600 }}>{d.users.length} cuentas</span>
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {d.users.map(u => (
                    <span key={u} style={{
                      background: directMatchUsernames.has(u) ? "#7c2d12" : codeMatchUsers.has(u) ? "#14532d" : siblingUsernames.has(u) ? "#2a1506" : "#7f1d1d",
                      color:      directMatchUsernames.has(u) ? "#fed7aa" : codeMatchUsers.has(u) ? "#86efac" : siblingUsernames.has(u) ? "#fb923c" : "#fca5a5",
                      borderRadius:4, padding:"2px 8px", fontSize:12, fontWeight:600,
                      border: directMatchUsernames.has(u) ? "1px solid #ea580c" : "none",
                    }}>{directMatchUsernames.has(u) ? "🔍 " : siblingUsernames.has(u) ? "⚠ " : ""}{u}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report && filteredDups.length === 0 && !isCodeFilter && !isUserFilter && report.duplicates.length === 0 && (
        <div style={{ marginBottom:24, background:"#0a1a0a", border:"1px solid #14532d", borderRadius:8, padding:14, color:"#86efac", fontSize:13 }}>
          ✓ No se detectaron dispositivos compartidos entre cuentas.
        </div>
      )}
      {report && filteredDups.length === 0 && (isCodeFilter || userLow || codeLow) && !isUserFilter && report.duplicates.length > 0 && (
        <div style={{ marginBottom:24, background:"#0d1520", border:"1px solid #1e2a3d", borderRadius:8, padding:14, color:"#64748b", fontSize:13 }}>
          Sin dispositivos duplicados para este filtro.
        </div>
      )}

      {loading && !report && <div style={{ color:"#64748b", textAlign:"center", padding:40 }}>Cargando…</div>}
      {filtered.length === 0 && !loading && (
        <div style={{ color:"#64748b", textAlign:"center", padding:40, fontSize:13 }}>
          {report ? "Sin registros aún. Los fingerprints se capturan al hacer login." : ""}
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid #1e2a3d" }}>
                {["Usuario","Referido por","Último dispositivo","Hash","Dispositivos vistos","Última vez"].map(h => (
                  <th key={h} style={{ textAlign:"left", padding:"8px 12px", color:"#64748b", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const isSearched = directMatchUsernames.has(e.username);
                const isSibling  = siblingUsernames.has(e.username);
                const isDup      = dupUsernames.has(e.username);
                const rowBg = isSearched ? "#1e100a" : isSibling ? "#160d04" : isDup ? "#1a0d0d" : "transparent";
                const nameColor = isSearched ? "#fed7aa" : isSibling ? "#fb923c" : isDup ? "#fca5a5" : "#e2e8f0";
                const hashColor = isSearched ? "#ea580c" : isSibling ? "#fb923c" : isDup ? "#ef4444" : "#4a6fa5";
                const prefix = isSearched ? "🔍 " : isSibling ? "⚠ " : isDup ? "⚠ " : "";
                return (
                  <tr key={e.userId} style={{ borderBottom:"1px solid #0e1826", background: rowBg }}>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontWeight:700, color: nameColor }}>{prefix}{e.username}</span>
                      {isSibling && <span style={{ marginLeft:6, fontSize:10, color:"#c2410c", background:"#2a1506", borderRadius:3, padding:"1px 5px", verticalAlign:"middle" }}>misma máquina</span>}
                    </td>
                    <td style={{ padding:"9px 12px", color:"#94a3b8", fontSize:12 }}>
                      {e.referred_by
                        ? <><span style={{ color:"#64748b" }}>{e.referred_by}</span>{e.ref_code_used && <span style={{ marginLeft:4, background:"#1e3a2f", color:"#86efac", borderRadius:3, padding:"1px 5px", fontSize:11, fontFamily:"monospace" }}>{e.ref_code_used}</span>}</>
                        : <span style={{ color:"#334155" }}>—</span>}
                    </td>
                    <td style={{ padding:"9px 12px", color:"#94a3b8", fontSize:12, maxWidth:200 }}>{e.lastInfo || "—"}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontFamily:"monospace", fontSize:11, color: hashColor, background:"#0d1827", padding:"2px 6px", borderRadius:4 }}>{e.lastHash}</span>
                    </td>
                    <td style={{ padding:"9px 12px", color:"#64748b", fontSize:12 }}>{e.devices.length}</td>
                    <td style={{ padding:"9px 12px", color:"#64748b", fontSize:12, whiteSpace:"nowrap" }}>
                      {new Date(e.lastSeen).toLocaleString("es-AR", { dateStyle:"short", timeStyle:"short" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type TabId = "deposits" | "withdrawals" | "users" | "stats" | "alerts" | "transactions" | "affiliates" | "bets" | "support" | "ips" | "devices" | "wallets";

export default function AdminPanel({ token: initialToken, username }: { token: string; username?: string }) {
  const [tab, setTab] = useState<TabId>("stats");
  const [token, setToken] = useState(initialToken);

  // Al montar, asegurar que tanto el game-token como el session-token estén presentes.
  // El interceptor global de fetch bloquea peticiones autenticadas si no hay session-token.
  useEffect(() => {
    const u = username;
    if (!u) return;
    const lsKey = `mander_game_token_${u}`;
    const existing = localStorage.getItem(lsKey);
    const existingSession = localStorage.getItem("mander_session_token");
    // Fast path: both tokens present
    if (existing && existingSession) { setToken(existing); return; }
    // Fetch fresh tokens if either is missing
    fetch("/api/auth/local-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u }),
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.token) {
        localStorage.setItem(lsKey, data.token);
        setToken(data.token);
      } else if (existing) {
        setToken(existing);
      }
      if (data?.session_token) {
        localStorage.setItem("mander_session_token", data.session_token);
      }
    }).catch(() => { if (existing) setToken(existing); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "stats",        label: "Estadísticas",  icon: "📊" },
    { id: "alerts",       label: "Alertas",       icon: "🚨" },
    { id: "support",      label: "Soporte",       icon: "💬" },
    { id: "bets",         label: "Bets",          icon: "🎰" },
    { id: "deposits",     label: "Depósitos",     icon: "⬇" },
    { id: "withdrawals",  label: "Retiros",       icon: "⬆" },
    { id: "affiliates",   label: "Afiliados",     icon: "🔗" },
    { id: "users",        label: "Usuarios",      icon: "👤" },
    { id: "transactions", label: "Transacciones", icon: "🔍" },
    { id: "ips",          label: "IPs",           icon: "🌐" },
    { id: "devices",      label: "Dispositivos",  icon: "📱" },
    { id: "wallets",      label: "Wallets",       icon: "🕸" },
  ];

  return (
    <div style={{
      minHeight: "calc(100vh - 70px)", background: "#0d1117",
      padding: "24px 16px", fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ width: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#e2e8f0", letterSpacing: "-0.5px" }}>
            Panel Admin
          </h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
            Gestión de depósitos, retiros y usuarios
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid #1e2a3d",
          overflowX: "auto", WebkitOverflowScrolling: "touch" as unknown as undefined,
          scrollbarWidth: "none" as unknown as undefined, msOverflowStyle: "none" as unknown as undefined,
        }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: "transparent", border: "none",
              borderBottom: tab === t.id ? "2px solid #f59e0b" : "2px solid transparent",
              color: tab === t.id ? "#f59e0b" : "#64748b",
              cursor: "pointer", fontSize: 13, fontWeight: 600,
              padding: "10px 14px", transition: "all .15s",
              fontFamily: "'Inter', sans-serif",
              display: "flex", alignItems: "center", gap: 5,
              marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0,
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "stats"         && <StatsTab token={token} />}
        {tab === "alerts"        && <AlertsTab token={token} />}
        {tab === "support"       && <SupportTab token={token} />}
        {tab === "bets"          && <BetsTab token={token} />}
        {tab === "deposits"      && <DepositsTab />}
        {tab === "withdrawals"   && <WithdrawalsTab token={token} />}
        {tab === "affiliates"    && <AffiliatesTab token={token} />}
        {tab === "users"         && <UsersTab token={token} />}
        {tab === "transactions"  && <TransactionsTab token={token} />}
        {tab === "ips"           && <IpsTab token={token} />}
        {tab === "devices"       && <DevicesTab token={token} />}
        {tab === "wallets"       && <WalletDetectionTab token={token} />}
      </div>
    </div>
  );
}
