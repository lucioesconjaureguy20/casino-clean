import { useEffect, useState, useCallback } from "react";

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

interface ConfirmInputs {
  amount: string;
  txHash: string;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0d1525",
  border: "1px solid #2a3550",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#e2e8f0",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "'Inter', sans-serif",
};

export default function AdminPanel() {
  const [deposits, setDeposits]   = useState<PendingDeposit[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [inputs, setInputs]       = useState<Record<number, ConfirmInputs>>({});
  const [confirming, setConfirming] = useState<number | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
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

  function getInput(id: number): ConfirmInputs {
    return inputs[id] ?? { amount: "", txHash: "" };
  }

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
        body: JSON.stringify({
          deposit_id: String(d.id),
          amount: parsedAmount,
          tx_hash: txHash.trim() || undefined,
        }),
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

  const card: React.CSSProperties = {
    background: "#111827",
    border: "1px solid #1e2a3d",
    borderRadius: "14px",
    overflow: "hidden",
  };

  const th: React.CSSProperties = {
    padding: "12px 16px",
    textAlign: "left",
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    borderBottom: "1px solid #1e2a3d",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "14px 16px",
    fontSize: "13px",
    color: "#e2e8f0",
    borderBottom: "1px solid #131d30",
    verticalAlign: "top",
  };

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "32px 16px 64px", fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#e2e8f0" }}>
            Panel Admin — Depósitos Pendientes
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {loading ? "Cargando..." : deposits.length === 0
              ? "No hay depósitos pendientes"
              : `${deposits.length} depósito${deposits.length !== 1 ? "s" : ""} esperando confirmación`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: "transparent", border: "1px solid #2a3550", borderRadius: 8,
            color: "#94a3b8", cursor: loading ? "not-allowed" : "pointer",
            fontSize: 13, padding: "8px 16px", display: "flex", alignItems: "center",
            gap: 6, transition: "all .15s", fontFamily: "'Inter', sans-serif",
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Actualizar
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.ok ? "#15803d" : "#dc2626",
          color: "#fff", borderRadius: 10, padding: "12px 20px",
          fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.5)",
          animation: "nlsfadeIn .2s ease", maxWidth: 400,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: "#1e1215", border: "1px solid #7f1d1d", borderRadius: 10,
          padding: "14px 18px", color: "#fca5a5", fontSize: 13, marginBottom: 20,
        }}>
          Error: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b", fontSize: 14 }}>
          Cargando depósitos...
        </div>
      )}

      {/* Empty */}
      {!loading && !error && deposits.length === 0 && (
        <div style={{ ...card, padding: "60px 0", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
            Sin depósitos pendientes
          </div>
          <div style={{ color: "#64748b", fontSize: 13 }}>
            Todos los depósitos están al día.
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && deposits.length > 0 && (
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
                      {/* ID */}
                      <td style={{ ...td, color: "#64748b", fontFamily: "monospace", paddingTop: 18 }}>
                        #{d.id}
                      </td>

                      {/* Usuario */}
                      <td style={{ ...td, paddingTop: 18 }}>
                        <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{d.username}</div>
                        {d.mander_id && (
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 2, fontFamily: "monospace" }}>
                            {d.mander_id}
                          </div>
                        )}
                      </td>

                      {/* Moneda / Red */}
                      <td style={{ ...td, paddingTop: 18 }}>
                        <span style={{
                          background: "#1e2a3d", border: "1px solid #2a3550",
                          borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700,
                          color: "#94a3b8", display: "inline-block", marginBottom: 4,
                        }}>
                          {d.currency}
                        </span>
                        <div style={{ fontSize: 11, color: "#475569" }}>{d.network}</div>
                      </td>

                      {/* Fecha */}
                      <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap", paddingTop: 18 }}>
                        {fmt(d.created_at)}
                      </td>

                      {/* Monto real — lo ingresa el admin */}
                      <td style={td}>
                        <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 4, fontWeight: 600 }}>
                          ¿Cuánto envió?
                        </div>
                        <input
                          type="number"
                          placeholder={`ej: 100`}
                          min="0"
                          step="any"
                          value={inp.amount}
                          onChange={e => setField(d.id, "amount", e.target.value)}
                          style={{ ...inputStyle, borderColor: inp.amount ? "#2a3550" : "#374151" }}
                        />
                        {inp.amount && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                            {inp.amount} {d.currency}
                          </div>
                        )}
                      </td>

                      {/* TX Hash */}
                      <td style={td}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                          Hash de la tx (opcional)
                        </div>
                        <input
                          type="text"
                          placeholder="0x..."
                          value={inp.txHash}
                          onChange={e => setField(d.id, "txHash", e.target.value)}
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                        />
                      </td>

                      {/* Botón confirmar */}
                      <td style={{ ...td, textAlign: "center", paddingTop: 26 }}>
                        <button
                          onClick={() => confirm(d)}
                          disabled={busy}
                          style={{
                            background: busy ? "#1a2235" : "#15803d",
                            border: "none", borderRadius: 8,
                            color: busy ? "#64748b" : "#fff",
                            cursor: busy ? "not-allowed" : "pointer",
                            fontSize: 13, fontWeight: 600, padding: "9px 18px",
                            transition: "all .15s", whiteSpace: "nowrap",
                            fontFamily: "'Inter', sans-serif",
                          }}
                          onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "#166534"; }}
                          onMouseLeave={e => { if (!busy) e.currentTarget.style.background = "#15803d"; }}
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

      {/* Footer info */}
      <div style={{ marginTop: 24, background: "#0d1525", border: "1px solid #1a2235", borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.9 }}>
          <strong style={{ color: "#94a3b8" }}>¿Cómo funciona?</strong><br />
          1. El usuario abre el panel de depósito → se genera la dirección wallet.<br />
          2. El usuario envía la cripto desde su billetera a esa dirección.<br />
          3. Vos ves la transacción en la blockchain → ingresás el <strong style={{ color: "#f59e0b" }}>monto real recibido</strong> y opcionalmente el TX hash.<br />
          4. Apretás <strong>Confirmar</strong> → el balance se acredita automáticamente.
        </div>
      </div>
    </div>
  );
}
