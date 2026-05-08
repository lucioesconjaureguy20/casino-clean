import { useState, useMemo, useEffect } from "react";
import { VIP_RANKS, getRankIndex } from "./vipSystem";

interface Referral {
  referred_username: string;
  created_at: string;
  is_ftd: boolean;
  deposit_count: number;
  deposit_amount: string;
  wager_amount: string;
  ngr: string;
}

type SortKey = "username" | "wagered" | "depositTotal" | "ngr" | "date";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

const LANG_LOCALE: Record<string, string> = {
  es:"es-ES", en:"en-US", pt:"pt-BR", de:"de-DE", fr:"fr-FR",
  id:"id-ID", it:"it-IT", ko:"ko-KR", nl:"nl-NL", pl:"pl-PL", ru:"ru-RU", tr:"tr-TR",
};

function fmt(val: number) {
  return "$" + Math.abs(val).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null, locale: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" }) + ", " +
    d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export default function RegisteredUsers({ referrer, referrals, t, lang = "es", totalCount }: { referrer: string; referrals: Referral[]; t: (key: string) => string; lang?: string; totalCount?: number }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let list = referrals.filter(r =>
      r.referred_username.toLowerCase().includes(search.toLowerCase())
    );
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "username") cmp = a.referred_username.localeCompare(b.referred_username);
      else if (sortKey === "wagered") cmp = parseFloat(a.wager_amount || "0") - parseFloat(b.wager_amount || "0");
      else if (sortKey === "depositTotal") cmp = parseFloat(a.deposit_amount || "0") - parseFloat(b.deposit_amount || "0");
      else if (sortKey === "ngr") cmp = parseFloat(a.ngr || "0") - parseFloat(b.ngr || "0");
      else {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        cmp = da - db;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [referrals, search, sortKey, sortDir]);

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
    border: active ? "none" : "1px solid #1e1535",
    background: active ? "linear-gradient(160deg,#f6b531,#d4870a)" : "transparent",
    color: disabled ? "#1e1535" : active ? "#fff" : "#8aa0c0",
    fontWeight: active ? 700 : 400, fontSize: "13px",
    cursor: disabled ? "default" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  });

  const COLS = "minmax(130px,1fr) 70px 100px 100px 90px 140px";
  const TABLE_MIN_W = 660;

  const HEADERS: [string, SortKey, boolean][] = [
    [t("affColUser"),    "username",     false],
    ["FTD",              "depositTotal", true ],
    [t("affColDeposit"), "depositTotal", true ],
    [t("affColWagered"), "wagered",      true ],
    ["NGR",              "ngr",          true ],
    [t("affColDate"),    "date",         true ],
  ];

  const displayTotal = totalCount ?? referrals.length;

  return (
    <div style={{ width:"100%", boxSizing:"border-box" as const, marginTop:"16px" }}>
    <div style={{ background:"#161d2b",border:"1px solid #130d26",borderRadius:"6px",overflow:"hidden",marginBottom:"14px" }}>

      {/* Header — stays outside scroll so search bar is always accessible */}
      <div style={{ display:"flex",alignItems:"center",gap:"12px",padding:"16px 20px",borderBottom:"1px solid #130d26",flexWrap:"wrap" as const }}>
        <span style={{ fontWeight:700,fontSize:"16px",color:"#e2e8f0",flexShrink:0 }}>{t("affReferredPlayers")}</span>
        <span style={{ background:"#1a2234",color:"#64748b",fontSize:11,fontWeight:700,padding:"2px 10px",borderRadius:6 }}>
          {displayTotal.toLocaleString("es-ES")}
        </span>
        <div style={{ position:"relative",flex:"1",minWidth:"160px",maxWidth:"280px" }}>
          <svg style={{ position:"absolute",left:"10px",top:"50%",transform:"translateY(-50%)",color:"#5a6e8a",pointerEvents:"none" }}
            viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("affSearchUsers")}
            style={{ width:"100%",paddingLeft:"32px",paddingRight:"10px",paddingTop:"8px",paddingBottom:"8px",background:"#1a2336",border:"1px solid #2a3650",borderRadius:"8px",color:"#c8d8f0",fontSize:"13px",outline:"none",fontFamily:"inherit",boxSizing:"border-box" as const }}
          />
        </div>
      </div>

      {/* Scrollable table area */}
      <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" } as React.CSSProperties}>
        <div style={{ minWidth:`${TABLE_MIN_W}px` }}>

          {/* Table header */}
          <div style={{ display:"grid",gridTemplateColumns:COLS,padding:"10px 20px",borderBottom:"1px solid #1a2336" }}>
            {HEADERS.map(([label, key, centered], idx) => (
              <div key={label + idx}
                onClick={() => toggleSort(key)}
                style={{
                  fontSize:"11px",fontWeight:600,color:"#3a5070",letterSpacing:"0.8px",
                  textTransform:"uppercase" as const,
                  display:"flex",alignItems:"center",
                  justifyContent: centered ? "center" : "flex-start",
                  textAlign: centered ? "center" : "left",
                  whiteSpace:"nowrap" as const,
                  cursor: "pointer",
                  userSelect: "none" as const,
                }}>
                {label}{arrow(key)}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div>
            {pageData.length === 0 ? (
              <div style={{ padding:"32px 20px",textAlign:"center" as const,color:"#3a4e68",fontSize:"13px",fontStyle:"italic" }}>
                {search ? t("affNoResults") : t("affNoReferrals")}
              </div>
            ) : pageData.map((r, i) => {
              const ngr = parseFloat(r.ngr || "0");
              const depositTotal = parseFloat(r.deposit_amount || "0");
              const wagered = parseFloat(r.wager_amount || "0");
              const hasDeposit = (r.deposit_count || 0) > 0;
              const ngrPositive = ngr >= 0;

              const rankIdx  = getRankIndex(wagered);
              const rank     = VIP_RANKS[rankIdx];

              return (
                <div key={r.referred_username}
                  style={{ display:"grid",gridTemplateColumns:COLS,padding:"12px 20px",borderBottom:"1px solid #1a2236",background: i%2===0?"#161d2b":"#172030",transition:"background .12s",cursor:"default" }}
                  onMouseEnter={e=>(e.currentTarget.style.background="#1e2a40")}
                  onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?"#161d2b":"#172030")}>

                  {/* Usuario con avatar + badge de rango */}
                  <div style={{ display:"flex",alignItems:"center",gap:"10px",minWidth:0 }}>
                    <div style={{ position:"relative",flexShrink:0,width:"32px",height:"32px" }}>
                      <div style={{
                        width:"32px",height:"32px",borderRadius:"6px",
                        background:"linear-gradient(135deg,#2a3a5a,#1a2a42)",
                        border:`2px solid ${rank.color}44`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:"13px",fontWeight:700,color:"#c8d8f0",
                      }}>
                        {r.referred_username.charAt(0).toUpperCase()}
                      </div>
                      <img
                        src={rank.image}
                        alt={rank.name}
                        title={rank.name}
                        style={{
                          position:"absolute",bottom:"-4px",right:"-6px",
                          width:"18px",height:"18px",
                          borderRadius:"50%",
                          objectFit:"cover",
                          border:"1px solid #161d2b",
                          background:"#1a2234",
                        }}
                      />
                    </div>
                    <span style={{ fontSize:"13px",fontWeight:600,color:"#c8d8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const }}>{r.referred_username}</span>
                  </div>

                  {/* FTD badge — centrado */}
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"center" }}>
                    <span style={{
                      fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,
                      background: hasDeposit ? "#16a34a22" : "#1a2234",
                      color: hasDeposit ? "#29c46d" : "#374151",
                      border: `1px solid ${hasDeposit ? "#29c46d44" : "#1e2a3d"}`,
                      whiteSpace:"nowrap" as const,
                    }}>
                      {hasDeposit ? t("affYes") : t("affNo")}
                    </span>
                  </div>

                  {/* Dep. Total — centrado */}
                  <div style={{ fontSize:"13px",color:"#8a9bb8",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap" as const }}>
                    {depositTotal > 0 ? fmt(depositTotal) : "—"}
                  </div>

                  {/* Apostado — centrado */}
                  <div style={{ fontSize:"13px",color:"#8a9bb8",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap" as const }}>
                    {wagered > 0 ? fmt(wagered) : "—"}
                  </div>

                  {/* NGR — centrado */}
                  <div style={{ fontSize:"13px",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap" as const,
                    color: wagered === 0 ? "#3a4e68" : ngrPositive ? "#22c55e" : "#f87171" }}>
                    {wagered === 0 ? "—" : `${ngrPositive ? "+" : "-"}${fmt(ngr)}`}
                  </div>

                  {/* Fecha — centrado */}
                  <div style={{ fontSize:"12px",color:"#5a6e8a",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap" as const }}>
                    {fmtDate(r.created_at, LANG_LOCALE[lang] ?? "es-ES")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fila de totales */}
          {filtered.length > 0 && (() => {
            const totalFTD   = filtered.filter(r => (r.deposit_count || 0) > 0).length;
            const totalDep   = filtered.reduce((s, r) => s + parseFloat(r.deposit_amount || "0"), 0);
            const totalWag   = filtered.reduce((s, r) => s + parseFloat(r.wager_amount   || "0"), 0);
            const totalNGR   = filtered.reduce((s, r) => s + parseFloat(r.ngr            || "0"), 0);
            const ngrPos     = totalNGR >= 0;
            return (
              <div style={{
                display:"grid",gridTemplateColumns:COLS,padding:"11px 20px",
                borderTop:"2px solid #1e1535",background:"#111827",
              }}>
                <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
                  <span style={{ fontSize:"11px",fontWeight:700,color:"#64748b",letterSpacing:"0.8px",textTransform:"uppercase" as const,whiteSpace:"nowrap" as const }}>
                    {t("affTotal")}
                  </span>
                  <span style={{ fontSize:"10px",color:"#3a5070",fontWeight:600 }}>({displayTotal.toLocaleString("es-ES")})</span>
                </div>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <span style={{
                    fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,
                    background: totalFTD > 0 ? "#16a34a22" : "#1a2234",
                    color: totalFTD > 0 ? "#29c46d" : "#374151",
                    border: `1px solid ${totalFTD > 0 ? "#29c46d44" : "#1e2a3d"}`,
                  }}>
                    {totalFTD}
                  </span>
                </div>
                <div style={{ fontSize:"13px",fontWeight:600,color:"#c8d8f0",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap" as const }}>
                  {totalDep > 0 ? fmt(totalDep) : "—"}
                </div>
                <div style={{ fontSize:"13px",fontWeight:600,color:"#c8d8f0",display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap" as const }}>
                  {totalWag > 0 ? fmt(totalWag) : "—"}
                </div>
                <div style={{
                  fontSize:"13px",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap" as const,
                  color: totalWag === 0 ? "#3a4e68" : ngrPos ? "#22c55e" : "#f87171",
                }}>
                  {totalWag === 0 ? "—" : `${ngrPos ? "+" : "-"}${fmt(totalNGR)}`}
                </div>
                <div />
              </div>
            );
          })()}

        </div>{/* end minWidth wrapper */}
      </div>{/* end scroll container */}

      {/* Footer: count + pagination — outside scroll */}
      <div style={{ padding:"12px 20px",borderTop:"1px solid #1a2236",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",flexWrap:"wrap" as const }}>
        <span style={{ fontSize:"12px",color:"#3a5070" }}>
          {displayTotal.toLocaleString("es-ES")} {displayTotal===1 ? t("affPlayer") : t("affPlayers")}
          {search ? ` ${t("affFoundOf")} ${referrals.length}` : ` ${t("affRegistered")}`}
          {totalPages > 1 && ` · ${t("affPage")} ${safePage+1} ${t("affOf")} ${totalPages}`}
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
