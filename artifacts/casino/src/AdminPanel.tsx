import { useEffect, useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface UserBalance { currency: string; balance: number; }

interface AdminUser {
  id: string;
  mander_id: string;
  username: string;
  created_at: string;
  balances: UserBalance[];
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
}

interface Withdrawal {
  id: string;
  user_id: string;
  mander_id: string;
  username: string;
  amount: number;
  currency: string;
  network: string;
  wallet: string;
  status: "pending" | "approved" | "paid" | "rejected";
  tx_hash: string | null;
  created_at: string;
}

interface ConfirmInputs { amount: string; txHash: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtBal(b: number) {
  if (b === 0) return "0";
  if (b < 0.0001) return b.toExponential(2);
  if (b < 1) return b.toFixed(6).replace(/\.?0+$/, "");
  return b.toLocaleString("en-US", { maximumFractionDigits: 4 });
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
};

const td: React.CSSProperties = {
  padding: "12px 16px", fontSize: "13px", color: "#e2e8f0",
  borderBottom: "1px solid #131d30", verticalAlign: "middle",
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
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
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
        borderRadius: 16, padding: 28, width: "100%", maxWidth: 400,
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

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({ token }: { token: string }) {
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [search, setSearch]       = useState("");
  const [adjusting, setAdjusting] = useState<AdminUser | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/users");
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      setUsers(data.users ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const filtered = users.filter(u =>
    !search || u.username.toLowerCase().includes(search.toLowerCase()) || u.mander_id.includes(search)
  );

  return (
    <>
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Usuarios</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading ? "Cargando..." : `${users.length} usuario${users.length !== 1 ? "s" : ""} registrado${users.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="text" placeholder="Buscar por username o ID..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 220 }} />
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
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>Cargando usuarios...</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: "50px 0", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>👤</div>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 15 }}>
            {search ? "No se encontraron usuarios" : "Sin usuarios registrados"}
          </div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Usuario</th>
                  <th style={th}>Mander ID</th>
                  <th style={th}>Balances</th>
                  <th style={th}>Registro</th>
                  <th style={{ ...th, textAlign: "center" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}
                    onMouseEnter={e => (e.currentTarget.style.background = "#131d30")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    style={{ transition: "background .15s" }}
                  >
                    <td style={td}><div style={{ fontWeight: 700, color: "#f59e0b" }}>{u.username}</div></td>
                    <td style={td}><span style={{ fontFamily: "monospace", fontSize: 11, color: "#475569" }}>{u.mander_id || "—"}</span></td>
                    <td style={td}>
                      {u.balances.length === 0 ? (
                        <span style={{ color: "#475569", fontSize: 12 }}>Sin saldo</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {u.balances.map(b => (
                            <span key={b.currency} style={{
                              background: "#1e2a3d", border: "1px solid #2a3550",
                              borderRadius: 6, padding: "2px 8px", fontSize: 12, color: "#94a3b8",
                            }}>
                              <strong style={{ color: "#e2e8f0" }}>{fmtBal(b.balance)}</strong> {b.currency}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(u.created_at)}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <button onClick={() => setAdjusting(u)} style={{
                        background: "#1e2a3d", border: "1px solid #2a3550",
                        borderRadius: 8, color: "#f59e0b", cursor: "pointer",
                        fontSize: 12, fontWeight: 600, padding: "7px 14px",
                        transition: "all .15s", fontFamily: "'Inter', sans-serif",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#f59e0b"; e.currentTarget.style.color = "#0d1117"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#1e2a3d"; e.currentTarget.style.color = "#f59e0b"; }}
                      >Ajustar</button>
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

function DepositsTab() {
  const [deposits, setDeposits]     = useState<PendingDeposit[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [inputs, setInputs]         = useState<Record<number, ConfirmInputs>>({});
  const [confirming, setConfirming] = useState<number | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/pending-deposits");
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
  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function confirm(d: PendingDeposit) {
    const { amount, txHash } = getInput(d.id);
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast("Ingresá el monto recibido antes de confirmar", false); return;
    }
    setConfirming(d.id);
    try {
      const r = await fetch("/api/deposit/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit_id: String(d.id), amount: parsedAmount, tx_hash: txHash.trim() || undefined }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error ?? `Error ${r.status}`);
      showToast(`Depósito #${d.id} confirmado — ${parsedAmount} ${d.currency} acreditado a ${d.username} ✓`, true);
      setDeposits(prev => prev.filter(dep => dep.id !== d.id));
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error al confirmar", false);
    } finally { setConfirming(null); }
  }

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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Depósitos Pendientes</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading ? "Cargando..." : deposits.length === 0 ? "No hay depósitos pendientes"
              : `${deposits.length} depósito${deposits.length !== 1 ? "s" : ""} esperando confirmación`}
          </p>
        </div>
        <button onClick={load} disabled={loading} style={btnSecondary}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Actualizar
        </button>
      </div>

      {error && (
        <div style={{ background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10, padding: "14px 18px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>Cargando depósitos...</div>
      ) : deposits.length === 0 ? (
        <div style={{ ...card, padding: "60px 0", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Sin depósitos pendientes</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>Todos los depósitos están al día.</div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>#ID</th>
                  <th style={th}>Usuario</th>
                  <th style={th}>Moneda / Red</th>
                  <th style={th}>Fecha</th>
                  <th style={{ ...th, minWidth: 130 }}>Monto recibido *</th>
                  <th style={{ ...th, minWidth: 190 }}>TX Hash (opcional)</th>
                  <th style={{ ...th, textAlign: "center" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => {
                  const inp = getInput(d.id);
                  const busy = confirming === d.id;
                  return (
                    <tr key={d.id}
                      onMouseEnter={e => (e.currentTarget.style.background = "#131d30")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      style={{ transition: "background .15s" }}
                    >
                      <td style={{ ...td, color: "#64748b", fontFamily: "monospace" }}>#{d.id}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{d.username}</div>
                        {d.mander_id && <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>{d.mander_id}</div>}
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{d.currency}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{d.network}</div>
                      </td>
                      <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(d.created_at)}</td>
                      <td style={td}>
                        <input type="number" placeholder="0.00" step="any" min="0"
                          value={inp.amount} onChange={e => setField(d.id, "amount", e.target.value)}
                          style={{ ...inputStyle, width: 120 }} />
                      </td>
                      <td style={td}>
                        <input type="text" placeholder="TxHash (opcional)"
                          value={inp.txHash} onChange={e => setField(d.id, "txHash", e.target.value)}
                          style={{ ...inputStyle, width: 180 }} />
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <button onClick={() => confirm(d)} disabled={busy} style={{
                          ...btnPrimary, fontSize: 12, padding: "8px 14px",
                          background: busy ? "#374151" : "#f59e0b",
                          color: busy ? "#9ca3af" : "#0d1117",
                          cursor: busy ? "not-allowed" : "pointer",
                        }}>
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

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/withdrawals", {
        headers: { Authorization: `Bearer ${token}` },
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

  async function action(endpoint: string, withdrawal_id: string, extra?: Record<string, string>) {
    setActing(withdrawal_id);
    try {
      const r = await fetch(`/api${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ withdrawal_id, ...extra }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      showToast(data.message || "Operación exitosa", true);
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error desconocido", false);
    } finally { setActing(null); }
  }

  const filtered = filter === "all" ? withdrawals : withdrawals.filter(w => w.status === filter);
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Retiros</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading ? "Cargando..." : `${withdrawals.length} retiro${withdrawals.length !== 1 ? "s" : ""} en total`}
            {counts.pending ? <span style={{ color: "#f59e0b", marginLeft: 8, fontWeight: 600 }}>· {counts.pending} pendiente{counts.pending !== 1 ? "s" : ""}</span> : null}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Usuario</th>
                  <th style={th}>Monto</th>
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
                        <div style={{ fontWeight: 700, color: "#f59e0b" }}>{w.username}</div>
                        <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{w.mander_id?.slice(0,12)}…</div>
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0" }}>{fmtBal(w.amount)}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{w.currency}</div>
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
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <input type="text" placeholder="TX hash (opcional)"
                              value={txVal}
                              onChange={e => setTxInputs(prev => ({ ...prev, [w.id]: e.target.value }))}
                              style={{ ...inputStyle, width: 140, fontSize: 11 }}
                            />
                            <button onClick={() => action("/admin/withdraw/pay", w.id, txVal ? { tx_hash: txVal } : {})} disabled={busy} style={{
                              background: "#0d2224", border: "1px solid #0891b2", borderRadius: 7,
                              color: "#22d3ee", cursor: busy ? "not-allowed" : "pointer",
                              fontSize: 12, fontWeight: 600, padding: "6px 12px",
                              fontFamily: "'Inter', sans-serif", transition: "all .15s", whiteSpace: "nowrap",
                            }}>
                              {busy ? "..." : "Pagar ✓"}
                            </button>
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

// ── Stats Tab ─────────────────────────────────────────────────────────────────

type Period = "day" | "week" | "month";

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
  topPlayers:           { username: string; volume: number; deposits: number; withdrawals: number }[];
  newUsers:             { day: number; week: number; month: number; total: number };
}
interface PeriodStat { count: number; total: number; }

const PERIOD_LABELS: Record<Period, string> = { day: "Hoy", week: "7 días", month: "30 días" };

function StatCard({ label, value, sub, color = "#f59e0b", icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: string;
}) {
  return (
    <div style={{
      background: "#111827", border: "1px solid #1e2a3d", borderRadius: 12,
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
  const maxVol   = Math.max(...data.topPlayers.map(p => p.volume), 1);

  const wStatusItems = [
    { label: "Pendientes",  value: data.withdrawalsByStatus.pending,  color: "#f59e0b" },
    { label: "Aprobados",   value: data.withdrawalsByStatus.approved, color: "#4ade80" },
    { label: "Pagados",     value: data.withdrawalsByStatus.paid,     color: "#22d3ee" },
    { label: "Rechazados",  value: data.withdrawalsByStatus.rejected, color: "#f87171" },
  ];

  const genAt = new Date(data.generatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Estadísticas</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Actualizado a las {genAt}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard icon="👥" label="Usuarios totales"  value={data.newUsers.total}   sub={`+${data.newUsers[period]} en ${PERIOD_LABELS[period].toLowerCase()}`} color="#e2e8f0" />
        <StatCard icon="🟢" label="Usuarios activos"  value={data.activeUsers[period]} sub={PERIOD_LABELS[period]} color="#4ade80" />
        <StatCard icon="⬇" label="Depósitos"          value={`$${txD.dep.total}`}   sub={`${txD.dep.count} operaciones`} color="#22d3ee" />
        <StatCard icon="⬆" label="Retiros pagados"    value={`$${txD.wit.total}`}   sub={`${txD.wit.count} operaciones`} color="#f87171" />
        <StatCard icon="🔒" label="Retiros pendientes" value={data.withdrawalsByStatus.pending + data.withdrawalsByStatus.approved} sub="pending + aprobados" color="#f59e0b" />
      </div>

      {/* Row 2 — Balance + Tx breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

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

      {/* Row 3 — Top players */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ padding: "16px 20px 12px", fontSize: 13, fontWeight: 700, color: "#e2e8f0", borderBottom: "1px solid #1e2a3d" }}>
          🏆 Top Jugadores por Volumen — {PERIOD_LABELS[period]}
        </div>
        {data.topPlayers.length === 0 ? (
          <div style={{ padding: "30px 20px", color: "#64748b", fontSize: 13 }}>Sin actividad en este período.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 36 }}>#</th>
                  <th style={th}>Usuario</th>
                  <th style={th}>Volumen total</th>
                  <th style={th}>Depósitos</th>
                  <th style={th}>Retiros</th>
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
                    <td style={{ ...td, fontWeight: 700 }}>${fmtBal(p.volume)}</td>
                    <td style={{ ...td, color: "#22d3ee" }}>${fmtBal(p.deposits)}</td>
                    <td style={{ ...td, color: "#f87171" }}>${fmtBal(p.withdrawals)}</td>
                    <td style={{ ...td, minWidth: 140 }}>
                      <Bar value={p.volume} max={maxVol} color="#f59e0b" />
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
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

// ── AdminPanel ────────────────────────────────────────────────────────────────

type TabId = "deposits" | "withdrawals" | "users" | "stats";

export default function AdminPanel({ token }: { token: string }) {
  const [tab, setTab] = useState<TabId>("stats");

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "stats",       label: "Estadísticas", icon: "📊" },
    { id: "deposits",    label: "Depósitos",    icon: "⬇" },
    { id: "withdrawals", label: "Retiros",      icon: "⬆" },
    { id: "users",       label: "Usuarios",     icon: "👤" },
  ];

  return (
    <div style={{
      minHeight: "calc(100vh - 70px)", background: "#0d1117",
      padding: "24px 16px", fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

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
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid #1e2a3d", paddingBottom: 0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: "transparent", border: "none",
              borderBottom: tab === t.id ? "2px solid #f59e0b" : "2px solid transparent",
              color: tab === t.id ? "#f59e0b" : "#64748b",
              cursor: "pointer", fontSize: 14, fontWeight: 600,
              padding: "10px 18px", transition: "all .15s",
              fontFamily: "'Inter', sans-serif",
              display: "flex", alignItems: "center", gap: 7,
              marginBottom: -1,
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "stats"       && <StatsTab token={token} />}
        {tab === "deposits"    && <DepositsTab />}
        {tab === "withdrawals" && <WithdrawalsTab token={token} />}
        {tab === "users"       && <UsersTab token={token} />}
      </div>
    </div>
  );
}
