import { useEffect, useState, useCallback } from "react";

interface PendingDeposit {
  id: number;
  user_id: string;
  username: string;
  mander_id: string;
  amount: number;
  currency: string;
  network: string;
  address: string;
  created_at: string;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminPanel() {
  const [deposits, setDeposits] = useState<PendingDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [txInputs, setTxInputs] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

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

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function confirm(depositId: number) {
    const txHash = (txInputs[depositId] ?? "").trim();
    setConfirming(depositId);
    try {
      const r = await fetch("/api/deposit/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit_id: String(depositId), tx_hash: txHash || undefined }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error ?? `Error ${r.status}`);
      showToast(`Depósito #${depositId} confirmado ✓`, true);
      setDeposits((prev) => prev.filter((d) => d.id !== depositId));
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
    verticalAlign: "middle",
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 16px 64px", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#e2e8f0" }}>
            Panel Admin — Depósitos Pendientes
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {deposits.length === 0 && !loading
              ? "No hay depósitos pendientes"
              : `${deposits.length} depósito${deposits.length !== 1 ? "s" : ""} esperando confirmación`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: "transparent",
            border: "1px solid #2a3550",
            borderRadius: 8,
            color: "#94a3b8",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 13,
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all .15s",
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
          animation: "nlsfadeIn .2s ease",
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
                  <th style={th}>Monto</th>
                  <th style={th}>Moneda</th>
                  <th style={th}>Red</th>
                  <th style={th}>Fecha</th>
                  <th style={{ ...th, minWidth: 200 }}>TX Hash (opcional)</th>
                  <th style={{ ...th, textAlign: "center" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id} style={{ transition: "background .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#131d30")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ ...td, color: "#64748b", fontFamily: "monospace" }}>#{d.id}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{d.username}</div>
                      {d.mander_id && (
                        <div style={{ fontSize: 11, color: "#475569", marginTop: 2, fontFamily: "monospace" }}>
                          {d.mander_id}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, color: "#22d3ee", fontWeight: 700, fontSize: 15 }}>
                      {Number(d.amount).toLocaleString("es-AR")}
                    </td>
                    <td style={td}>
                      <span style={{
                        background: "#1e2a3d", border: "1px solid #2a3550",
                        borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 600,
                        color: "#94a3b8",
                      }}>
                        {d.currency}
                      </span>
                    </td>
                    <td style={{ ...td, color: "#94a3b8", fontSize: 12 }}>{d.network}</td>
                    <td style={{ ...td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                      {fmt(d.created_at)}
                    </td>
                    <td style={td}>
                      <input
                        type="text"
                        placeholder="0x... (dejar vacío si no tenés)"
                        value={txInputs[d.id] ?? ""}
                        onChange={e => setTxInputs(prev => ({ ...prev, [d.id]: e.target.value }))}
                        style={{
                          width: "100%", background: "#0d1525", border: "1px solid #2a3550",
                          borderRadius: 8, padding: "8px 10px", color: "#e2e8f0",
                          fontSize: 12, outline: "none", fontFamily: "monospace",
                          boxSizing: "border-box",
                        }}
                      />
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <button
                        onClick={() => confirm(d.id)}
                        disabled={confirming === d.id}
                        style={{
                          background: confirming === d.id ? "#1a2235" : "#15803d",
                          border: "none", borderRadius: 8,
                          color: confirming === d.id ? "#64748b" : "#fff",
                          cursor: confirming === d.id ? "not-allowed" : "pointer",
                          fontSize: 13, fontWeight: 600, padding: "9px 18px",
                          transition: "all .15s", whiteSpace: "nowrap",
                        }}
                        onMouseEnter={e => { if (confirming !== d.id) e.currentTarget.style.background = "#166534"; }}
                        onMouseLeave={e => { if (confirming !== d.id) e.currentTarget.style.background = "#15803d"; }}
                      >
                        {confirming === d.id ? "Confirmando..." : "Confirmar ✓"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info footer */}
      <div style={{ marginTop: 24, background: "#0d1525", border: "1px solid #1a2235", borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.7 }}>
          <strong style={{ color: "#94a3b8" }}>¿Cómo funciona?</strong><br />
          1. El usuario inicia un depósito desde el panel → queda en estado <em>pending</em>.<br />
          2. El usuario envía la cripto a la dirección generada.<br />
          3. Vos verificás la transacción en la blockchain y apretás <strong>Confirmar</strong> (con el TX hash si querés).<br />
          4. El balance del usuario se acredita automáticamente.
        </div>
      </div>
    </div>
  );
}
