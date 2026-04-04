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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mander_id: user.mander_id,
          username:  user.username,
          amount:    parsed,
          currency,
          notes:     notes.trim() || undefined,
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
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#111827", border: "1px solid #2a3550",
        borderRadius: 16, padding: 28, width: "100%", maxWidth: 400,
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>
            Ajustar balance
          </h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            Usuario: <strong style={{ color: "#f59e0b" }}>{user.username}</strong>
          </p>
        </div>

        {/* Balances actuales */}
        {user.balances.length > 0 && (
          <div style={{
            background: "#0d1525", borderRadius: 8, padding: "10px 14px",
            marginBottom: 16, fontSize: 12, color: "#64748b",
          }}>
            <div style={{ fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>Balance actual:</div>
            {user.balances.map(b => (
              <div key={b.currency} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{b.currency}</span>
                <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{fmtBal(b.balance)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Amount */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>
            Monto <span style={{ color: "#64748b", fontWeight: 400 }}>(positivo = sumar, negativo = restar)</span>
          </label>
          <input
            type="number"
            placeholder="ej: 50  o  -10"
            step="any"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{
              ...inputStyle,
              borderColor: isPositive ? "#15803d" : isNegative ? "#dc2626" : "#2a3550",
              color: isPositive ? "#4ade80" : isNegative ? "#f87171" : "#e2e8f0",
            }}
          />
          {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) !== 0 && (
            <div style={{ fontSize: 11, marginTop: 4, color: isPositive ? "#4ade80" : "#f87171" }}>
              {isPositive ? `▲ Sumar ${Math.abs(parseFloat(amount))} ${currency}` : `▼ Restar ${Math.abs(parseFloat(amount))} ${currency}`}
            </div>
          )}
        </div>

        {/* Currency */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>
            Moneda
          </label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            style={{ ...inputStyle }}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>
            Nota <span style={{ color: "#64748b", fontWeight: 400 }}>(opcional)</span>
          </label>
          <input
            type="text"
            placeholder="Motivo del ajuste..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={submit}
            disabled={loading}
            style={{
              ...btnPrimary, flex: 1,
              background: loading ? "#374151" : "#f59e0b",
              color: loading ? "#9ca3af" : "#0d1117",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Guardando..." : "Confirmar ajuste"}
          </button>
          <button onClick={onClose} style={{ ...btnSecondary }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({ token }: { token: string }) {
  const [users, setUsers]           = useState<AdminUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [search, setSearch]         = useState("");
  const [adjusting, setAdjusting]   = useState<AdminUser | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/users");
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      setUsers(data.users ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
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
        <AdjustModal
          user={adjusting}
          token={token}
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
          fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.5)",
          maxWidth: 420,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Usuarios</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading ? "Cargando..." : `${users.length} usuario${users.length !== 1 ? "s" : ""} registrado${users.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Buscar por username o ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, width: 220 }}
          />
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
        <div style={{
          background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10,
          padding: "14px 18px", color: "#fca5a5", fontSize: 13, marginBottom: 16,
        }}>
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
                    {/* Username */}
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: "#f59e0b" }}>{u.username}</div>
                    </td>

                    {/* Mander ID */}
                    <td style={td}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#475569" }}>
                        {u.mander_id || "—"}
                      </span>
                    </td>

                    {/* Balances */}
                    <td style={td}>
                      {u.balances.length === 0 ? (
                        <span style={{ color: "#475569", fontSize: 12 }}>Sin saldo</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {u.balances.map(b => (
                            <span key={b.currency} style={{
                              background: "#1e2a3d", border: "1px solid #2a3550",
                              borderRadius: 6, padding: "2px 8px", fontSize: 12,
                              color: "#94a3b8", whiteSpace: "nowrap",
                            }}>
                              <strong style={{ color: "#e2e8f0" }}>{fmtBal(b.balance)}</strong> {b.currency}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Fecha */}
                    <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                      {fmt(u.created_at)}
                    </td>

                    {/* Acción */}
                    <td style={{ ...td, textAlign: "center" }}>
                      <button
                        onClick={() => setAdjusting(u)}
                        style={{
                          background: "#1e2a3d", border: "1px solid #2a3550",
                          borderRadius: 8, color: "#f59e0b", cursor: "pointer",
                          fontSize: 12, fontWeight: 600, padding: "7px 14px",
                          transition: "all .15s", fontFamily: "'Inter', sans-serif",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = "#f59e0b";
                          e.currentTarget.style.color = "#0d1117";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = "#1e2a3d";
                          e.currentTarget.style.color = "#f59e0b";
                        }}
                      >
                        Ajustar
                      </button>
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
    } finally {
      setLoading(false);
    }
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
      showToast("Ingresá el monto recibido antes de confirmar", false);
      return;
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
    } finally {
      setConfirming(null);
    }
  }

  return (
    <>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? "#15803d" : "#dc2626",
          color: "#fff", borderRadius: 10, padding: "12px 20px",
          fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.5)",
          maxWidth: 420,
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Depósitos Pendientes</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading ? "Cargando..." : deposits.length === 0
              ? "No hay depósitos pendientes"
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
        <div style={{
          background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10,
          padding: "14px 18px", color: "#fca5a5", fontSize: 13, marginBottom: 16,
        }}>
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
                        <span style={{ background: "#1e2a3d", border: "1px solid #2a3550", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700, color: "#94a3b8", display: "inline-block", marginBottom: 4 }}>
                          {d.currency}
                        </span>
                        <div style={{ fontSize: 11, color: "#475569" }}>{d.network}</div>
                      </td>
                      <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(d.created_at)}</td>
                      <td style={td}>
                        <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 4, fontWeight: 600 }}>¿Cuánto envió?</div>
                        <input type="number" placeholder="ej: 100" min="0" step="any" value={inp.amount}
                          onChange={e => setField(d.id, "amount", e.target.value)}
                          style={{ ...inputStyle, borderColor: inp.amount ? "#2a3550" : "#374151" }}
                        />
                        {inp.amount && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{inp.amount} {d.currency}</div>}
                      </td>
                      <td style={td}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Hash de la tx (opcional)</div>
                        <input type="text" placeholder="0x..." value={inp.txHash}
                          onChange={e => setField(d.id, "txHash", e.target.value)}
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                        />
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <button onClick={() => confirm(d)} disabled={busy}
                          style={{ background: busy ? "#1a2235" : "#15803d", border: "none", borderRadius: 8, color: busy ? "#64748b" : "#fff", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, padding: "9px 18px", transition: "all .15s", whiteSpace: "nowrap", fontFamily: "'Inter', sans-serif" }}
                        >
                          {busy ? "Confirmando..." : "Confirmar ✓"}
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

      <div style={{ marginTop: 20, background: "#0d1525", border: "1px solid #1a2235", borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.9 }}>
          <strong style={{ color: "#94a3b8" }}>¿Cómo funciona?</strong><br />
          1. El usuario abre el panel de depósito → se genera la dirección wallet.<br />
          2. El usuario envía la cripto desde su billetera a esa dirección.<br />
          3. Vos ves la transacción en la blockchain → ingresás el <strong style={{ color: "#f59e0b" }}>monto real recibido</strong> y opcionalmente el TX hash.<br />
          4. Apretás <strong>Confirmar</strong> → el balance se acredita automáticamente.
        </div>
      </div>
    </>
  );
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────

interface AdminPanelProps { token?: string; }

export default function AdminPanel({ token = "" }: AdminPanelProps) {
  const [tab, setTab] = useState<"deposits" | "users">("deposits");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px", borderRadius: 8, cursor: "pointer",
    fontSize: 14, fontWeight: active ? 700 : 500,
    color: active ? "#f59e0b" : "#64748b",
    background: active ? "#1e2a3d" : "transparent",
    border: active ? "1px solid #2a3550" : "1px solid transparent",
    transition: "all .15s", fontFamily: "'Inter', sans-serif",
  });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 16px 64px", fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#e2e8f0" }}>
          Panel Admin
        </h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
          Gestión de usuarios y depósitos
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid #1e2a3d", paddingBottom: 16 }}>
        <button style={tabStyle(tab === "deposits")} onClick={() => setTab("deposits")}>
          💰 Depósitos Pendientes
        </button>
        <button style={tabStyle(tab === "users")} onClick={() => setTab("users")}>
          👥 Usuarios
        </button>
      </div>

      {tab === "deposits" && <DepositsTab />}
      {tab === "users" && <UsersTab token={token} />}
    </div>
  );
}
