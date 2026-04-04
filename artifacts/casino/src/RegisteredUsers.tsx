import { useState, useMemo, useEffect } from "react";

interface UserRow {
  username: string;
  wagered: number;
  depositTotal: number;
  ngr: number;
  registeredAt: string | null;
}

type SortKey = "username" | "wagered" | "depositTotal" | "ngr" | "date";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

function getReferredUsers(referrer: string): UserRow[] {
  const rows: UserRow[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("referral_")) continue;
    const storedRef = localStorage.getItem(key) || "";
    if (storedRef.toLowerCase() !== referrer.toLowerCase()) continue;
    const username = key.slice("referral_".length);
    if (!username) continue;
    const wagered = parseFloat(localStorage.getItem("total_wagered_" + username) || "0");
    let depositTotal = 0;
    try {
      const txRaw = localStorage.getItem("transactions_" + username);
      if (txRaw) {
        const txs: { type: string; status: string; usdAmount?: number; amount?: number }[] = JSON.parse(txRaw);
        depositTotal = txs
          .filter(t => t.type === "deposit" && t.status === "completed")
          .reduce((s, t) => s + (t.usdAmount ?? t.amount ?? 0), 0);
      }
    } catch {}
    const registeredAt = localStorage.getItem("registered_at_" + username);
    const ngr = wagered * 0.05 - depositTotal * 0.02;
    rows.push({ username, wagered, depositTotal, ngr, registeredAt });
  }
  return rows;
}

function fmt(val: number) {
  return "$" + Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" }) + ", " +
    d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export default function RegisteredUsers({ referrer }: { referrer: string }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const users = useMemo(() => getReferredUsers(referrer), [referrer]);

  const filtered = useMemo(() => {
    let list = users.filter(u =>
      u.username.toLowerCase().includes(search.toLowerCase())
    );
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "username") cmp = a.username.localeCompare(b.username);
      else if (sortKey === "wagered") cmp = a.wagered - b.wagered;
      else if (sortKey === "depositTotal") cmp = a.depositTotal - b.depositTotal;
      else if (sortKey === "ngr") cmp = a.ngr - b.ngr;
      else {
        const da = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
        const db = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
        cmp = da - db;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [users, search, sortKey, sortDir]);

  useEffect(() => { setPage(0); }, [search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  const btnStyle = (active: boolean, disabled?: boolean): React.CSSProperties => ({
    width: "32px", height: "32px", borderRadius: "7px",
    border: active ? "none" : "1px solid #253045",
    background: active ? "linear-gradient(160deg,#f6b531,#d4870a)" : "transparent",
    color: disabled ? "#253045" : active ? "#fff" : "#8aa0c0",
    fontWeight: active ? 700 : 400, fontSize: "13px",
    cursor: disabled ? "default" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  });

  const COLS = "1fr 130px 130px 120px 160px";

  return (
    <div style={{ width:"100%", boxSizing:"border-box" as const, marginTop:"16px" }}>
    <div style={{ background:"#161d2b",border:"1px solid #20283a",borderRadius:"14px",overflow:"hidden",marginBottom:"14px" }}>

      {/* Header */}
      <div style={{ display:"flex",alignItems:"center",gap:"12px",padding:"16px 20px",borderBottom:"1px solid #20283a",flexWrap:"wrap" as const }}>
        <span style={{ fontWeight:700,fontSize:"16px",color:"#e2e8f0",flexShrink:0 }}>Jugadores</span>
        <div style={{ position:"relative",flex:"1",minWidth:"180px",maxWidth:"280px" }}>
          <svg style={{ position:"absolute",left:"10px",top:"50%",transform:"translateY(-50%)",color:"#5a6e8a",pointerEvents:"none" }}
            viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuarios..."
            style={{ width:"100%",paddingLeft:"32px",paddingRight:"10px",paddingTop:"8px",paddingBottom:"8px",background:"#1a2336",border:"1px solid #2a3650",borderRadius:"8px",color:"#c8d8f0",fontSize:"13px",outline:"none",fontFamily:"inherit",boxSizing:"border-box" as const }}
          />
        </div>
      </div>

      {/* Table header */}
      <div style={{ display:"grid",gridTemplateColumns:COLS,padding:"10px 20px",borderBottom:"1px solid #1a2336" }}>
        {([
          ["Usuario","username"],
          ["Depósito","depositTotal"],
          ["Apostado","wagered"],
          ["NGR","ngr"],
          ["Fecha","date"],
        ] as [string, SortKey][]).map(([label, key]) => (
          <div key={key} onClick={() => toggleSort(key)}
            style={{ fontSize:"11px",fontWeight:600,color:"#3a5070",letterSpacing:"0.8px",textTransform:"uppercase" as const,cursor:"pointer",userSelect:"none" as const }}>
            {label}{arrow(key)}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div>
        {pageData.length === 0 ? (
          <div style={{ padding:"32px 20px",textAlign:"center" as const,color:"#3a4e68",fontSize:"13px",fontStyle:"italic" }}>
            {search ? "No se encontraron usuarios con ese nombre." : "Aún no hay jugadores registrados."}
          </div>
        ) : pageData.map((u, i) => {
          const ngrPositive = u.ngr >= 0;
          return (
            <div key={u.username}
              style={{ display:"grid",gridTemplateColumns:COLS,padding:"12px 20px",borderBottom:"1px solid #1a2236",background: i%2===0?"#161d2b":"#172030",transition:"background .12s",cursor:"default" }}
              onMouseEnter={e=>(e.currentTarget.style.background="#1e2a40")}
              onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?"#161d2b":"#172030")}>

              {/* Usuario */}
              <div style={{ display:"flex",alignItems:"center",gap:"10px" }}>
                <div style={{ width:"30px",height:"30px",borderRadius:"50%",background:"linear-gradient(135deg,#2a3a5a,#1a2a42)",border:"1px solid #2a3650",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:700,color:"#c8d8f0",flexShrink:0 }}>
                  {u.username.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize:"13px",fontWeight:600,color:"#c8d8f0" }}>{u.username}</span>
              </div>

              {/* Depósito */}
              <div style={{ fontSize:"13px",color:"#8a9bb8",display:"flex",alignItems:"center" }}>
                {u.depositTotal > 0 ? fmt(u.depositTotal) : "—"}
              </div>

              {/* Apostado */}
              <div style={{ fontSize:"13px",color:"#8a9bb8",display:"flex",alignItems:"center" }}>
                {u.wagered > 0 ? fmt(u.wagered) : "—"}
              </div>

              {/* NGR */}
              <div style={{ fontSize:"13px",fontWeight:600,display:"flex",alignItems:"center",
                color: u.wagered === 0 ? "#3a4e68" : ngrPositive ? "#22c55e" : "#f87171" }}>
                {u.wagered === 0 ? "—" : `${ngrPositive ? "+" : "-"}${fmt(u.ngr)}`}
              </div>

              {/* Fecha */}
              <div style={{ fontSize:"12px",color:"#5a6e8a",display:"flex",alignItems:"center" }}>
                {fmtDate(u.registeredAt)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: count + pagination */}
      <div style={{ padding:"12px 20px",borderTop:"1px solid #1a2236",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",flexWrap:"wrap" as const }}>
        <span style={{ fontSize:"12px",color:"#3a5070" }}>
          {filtered.length} {filtered.length===1?"jugador":"jugadores"}
          {search ? ` encontrados de ${users.length} total` : " registrados"}
          {totalPages > 1 && ` · Página ${safePage+1} de ${totalPages}`}
        </span>

        {totalPages > 1 && (
          <div style={{ display:"flex",alignItems:"center",gap:"4px" }}>
            <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={safePage===0}
              style={btnStyle(false, safePage===0)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => {
              if (totalPages <= 7 || i === 0 || i === totalPages-1 || Math.abs(i - safePage) <= 1)
                return <button key={i} onClick={()=>setPage(i)} style={btnStyle(i===safePage)}>{i+1}</button>;
              if (Math.abs(i - safePage) === 2)
                return <span key={i} style={{ color:"#3a5070",fontSize:"13px",padding:"0 2px" }}>…</span>;
              return null;
            })}
            <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={safePage===totalPages-1}
              style={btnStyle(false, safePage===totalPages-1)}>›</button>
          </div>
        )}

      </div>
    </div>
    </div>
  );
}
