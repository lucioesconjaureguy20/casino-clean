import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { getVipInfo, VIP_RANKS } from "./vipSystem";

interface ProfilePageProps {
  currentUser: string;
  balance: number;
  fmtMoney: (usd: number) => string;
  totalWagered: number;
  totalWins: number;
  winRate: number;
  totalBets: number;
  statsRange: "7d" | "30d" | "all";
  setStatsRange: (r: "7d" | "30d" | "all") => void;
  onLogout: () => void;
  onOpenCashier: () => void;
  displayCurrency: string;
  onPrivateModeChange?: (val: boolean) => void;
  vipWagered?: number;
  onForgotPassword: () => void;
  userEmail?: string;
  accountStatus?: string;
  profileDetails?: {
    country?: string; currency?: string; last_ip?: string;
    device_info?: string; notes?: string; referrer_id?: string; username?: string; created_at?: string;
  };
}

const RANKS = [
  { name: "Bronze 1", minXp: 1000,    nextXp: 5000,    color: "#cd7f32", gradient: "linear-gradient(135deg,#cd7f32,#8b4513)" },
  { name: "Bronze 2", minXp: 5000,    nextXp: 10000,   color: "#cd7f32", gradient: "linear-gradient(135deg,#cd7f32,#8b4513)" },
  { name: "Bronze 3", minXp: 10000,   nextXp: 25000,   color: "#cd7f32", gradient: "linear-gradient(135deg,#cd7f32,#8b4513)" },
  { name: "Silver 1", minXp: 25000,   nextXp: 50000,   color: "#a8a8b8", gradient: "linear-gradient(135deg,#c0c0c0,#808090)" },
  { name: "Silver 2", minXp: 50000,   nextXp: 100000,  color: "#a8a8b8", gradient: "linear-gradient(135deg,#c0c0c0,#808090)" },
  { name: "Silver 3", minXp: 100000,  nextXp: 250000,  color: "#a8a8b8", gradient: "linear-gradient(135deg,#c0c0c0,#808090)" },
  { name: "Gold 1",   minXp: 250000,  nextXp: 500000,  color: "#f4a91f", gradient: "linear-gradient(135deg,#f4a91f,#c07800)" },
  { name: "Gold 2",   minXp: 500000,  nextXp: 1000000, color: "#f4a91f", gradient: "linear-gradient(135deg,#f4a91f,#c07800)" },
  { name: "Gold 3",   minXp: 1000000, nextXp: 1000000, color: "#f4a91f", gradient: "linear-gradient(135deg,#f4a91f,#c07800)" },
];

function getRankInfo(xp: number) {
  let rankIdx = -1;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].minXp) rankIdx = i;
    else break;
  }
  const rank = rankIdx >= 0 ? RANKS[rankIdx] : null;
  const nextRank = rankIdx < RANKS.length - 1 ? RANKS[rankIdx + 1] : RANKS[RANKS.length - 1];
  const prevXp = rank ? rank.minXp : 0;
  const nextXp = rank ? nextRank.minXp : RANKS[0].minXp;
  const pct = nextXp > prevXp ? Math.min(100, ((xp - prevXp) / (nextXp - prevXp)) * 100) : 100;
  return { rank, nextRank, pct, xp, nextXp };
}

function RankBadge({ rank, size = 48 }: { rank: typeof RANKS[0] | null; size?: number }) {
  if (!rank) return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#2a3348", border: "2px solid #3a4460", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="#5a6a88" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    </div>
  );
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: rank.gradient, border: `2px solid ${rank.color}40`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 12px ${rank.color}40` }}>
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
      </svg>
    </div>
  );
}

const accent = "#f4a91f";
const cardBg = "#161d2b";
const cardBorder = "#20283a";
const inputBg = "#0e1826";
const mutedText = "#7a8faa";
const gold = (opacity = 1) => `rgba(244,169,31,${opacity})`;

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "14px", padding: "20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
        <span style={{ color: mutedText }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: "13px", letterSpacing: "0.8px", textTransform: "uppercase", color: "#c8d8ec", fontFamily: "'Inter',sans-serif" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function ActionBtn({ onClick, children, variant = "secondary", small }: { onClick?: () => void; children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; small?: boolean }) {
  const bg: Record<string, string> = { primary: accent, secondary: "#252f45", danger: "#3d1a1a" };
  const col: Record<string, string> = { primary: "#111", secondary: "#c8d8ec", danger: "#ff6b6b" };
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? (variant === "primary" ? "#f6c140" : variant === "danger" ? "#4d2020" : "#2e3d5c") : bg[variant],
        color: col[variant], border: "none", borderRadius: "8px",
        height: small ? "40px" : "40px",
        padding: small ? "0 16px" : "0 18px", fontSize: small ? "12px" : "13px",
        fontWeight: 600, cursor: "pointer", transition: "background .15s",
        fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" as const,
        display: "inline-flex", alignItems: "center", flexShrink: 0,
      }}
    >{children}</button>
  );
}

function Toast({ visible }: { visible: boolean }) {
  const [opacity, setOpacity] = useState(0);
  const [translateY, setTranslateY] = useState(-12);

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        setOpacity(1);
        setTranslateY(0);
      });
    } else {
      setOpacity(0);
      setTranslateY(-12);
    }
  }, [visible]);

  if (!visible && opacity === 0) return null;

  return createPortal(
    <div style={{
      position: "fixed", top: "72px", right: "20px", zIndex: 99999,
      background: "#1a2a1e", border: "1px solid #22c55e40",
      borderRadius: "10px", padding: "12px 16px",
      display: "flex", alignItems: "center", gap: "10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      opacity, transform: `translateY(${translateY}px)`,
      transition: "opacity 0.25s ease, transform 0.25s ease",
      maxWidth: "340px", pointerEvents: "none",
      fontFamily: "'Inter',sans-serif",
    }}>
      <div style={{ flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%", background: "#163a25", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
        </svg>
      </div>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", marginBottom: "2px" }}>Correo enviado</div>
        <div style={{ fontSize: "11px", color: "#7a9a80", lineHeight: 1.4 }}>
          Correo para restablecer la contraseña enviado. Por favor, revisa tu bandeja de entrada.
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ProfilePage({
  currentUser, balance, fmtMoney, totalWagered, totalWins, winRate, totalBets,
  statsRange, setStatsRange, onLogout, onOpenCashier, displayCurrency, onPrivateModeChange,
  vipWagered = 0, onForgotPassword, userEmail = "", accountStatus = "activo", profileDetails = {},
}: ProfilePageProps) {
  const xp = Math.floor(totalWagered);
  const { rank, pct, nextXp } = getRankInfo(xp);

  const [privateMode, setPrivateMode] = useState(() => localStorage.getItem("privateMode_" + currentUser) === "1");
  const [displayName, setDisplayName] = useState(() => localStorage.getItem("displayName_" + currentUser) || currentUser);
  const [copied, setCopied] = useState(false);

  const manderId = (() => {
    const key = "mander_id_" + currentUser;
    let id = localStorage.getItem(key);
    if (!id) {
      const chars = "0123456789abcdef";
      id = Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * 16)]).join("");
      localStorage.setItem(key, id);
    }
    return id;
  })();

  const handleChangePassword = useCallback(() => {
    onForgotPassword();
  }, [onForgotPassword]);

  const handlePrivateMode = (val: boolean) => {
    setPrivateMode(val);
    localStorage.setItem("privateMode_" + currentUser, val ? "1" : "0");
    onPrivateModeChange?.(val);
  };

  const handleNameBlur = () => {
    localStorage.setItem("displayName_" + currentUser, displayName);
  };

  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "0 20px 40px", fontFamily: "'Inter',sans-serif" }}>

      {/* Profile header */}
      {(() => {
        const vInfo = getVipInfo(vipWagered);
        const vRank = vInfo.rank;
        const isMax = vInfo.isMax;
        const nextRankName = isMax ? null : (VIP_RANKS[vInfo.idx + 1]?.name ?? null);
        const nextWager = isMax ? 0 : (vRank.nextWager - vipWagered);
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "14px", padding: "20px 24px", marginBottom: "16px", position: "relative", overflow: "hidden" }}>
            {/* subtle rank-colored glow in top-right */}
            <div style={{ position: "absolute", top: 0, right: 0, width: "180px", height: "180px", borderRadius: "50%", background: vRank.color + "18", filter: "blur(40px)", pointerEvents: "none" }} />

            <div style={{ display: "flex", alignItems: "center", gap: "18px", position: "relative" }}>
              {/* Badge image */}
              <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", border: `2px solid ${vRank.color}55`, boxShadow: `0 0 16px ${vRank.color}40`, flexShrink: 0, background: "#0e1826" }}>
                <img src={vRank.image} alt={vRank.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>

              {/* Text block */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Username row */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                  <span style={{ fontSize: "20px", fontWeight: 800, color: "#e8f0fc", letterSpacing: "-0.3px" }}>{displayName}</span>
                  {/* Rakeback pill */}
                  <span style={{ background: vRank.color + "22", border: `1px solid ${vRank.color}55`, color: vRank.color, borderRadius: "999px", padding: "2px 10px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px" }}>
                    {(vRank.rakebackPct * 100).toFixed(1)}% Rakeback
                  </span>
                </div>

                {/* Rank name */}
                <div style={{ fontSize: "13px", fontWeight: 700, color: vRank.color, letterSpacing: "0.5px", marginBottom: "8px", textTransform: "uppercase" as const }}>
                  {vRank.name}
                </div>

                {/* Progress bar */}
                {!isMax ? (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "10px", color: "#5a6e8a" }}>Próximo rango: <span style={{ color: "#8a9bb8", fontWeight: 600 }}>{nextRankName}</span></span>
                      <span style={{ fontSize: "10px", color: "#5a6e8a" }}>${nextWager.toLocaleString("en-US", { maximumFractionDigits: 0 })} restantes</span>
                    </div>
                    <div style={{ height: "5px", borderRadius: "999px", background: "#0e1826", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${vInfo.pct}%`, background: vRank.gradient, borderRadius: "999px", transition: "width .5s ease", boxShadow: vInfo.pct > 0 ? `0 0 8px ${vRank.color}55` : "none" }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "#4dd890", fontWeight: 700 }}>✦ Rango Máximo</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Juegos Favoritos ─────────────────────────────────────── */}
      {(() => {
        const GAME_DEFS = [
          { name: "Dice",      key: "dice_stats",     image: "/dice-card.jpg",        sub: "Mander Original", bg: "#0d1e3a", accent: "#3a7aff" },
          { name: "Plinko",    key: "plinko_stats",   image: "/plinko-thumb.jpg",     sub: "Mander Original", bg: "#2a0a0a", accent: "#e03020" },
          { name: "Keno",      key: "keno_stats",     image: "/keno-thumb.jpg",       sub: "Mander Original", bg: "#18082e", accent: "#9b5cf6" },
          { name: "Mines",     key: "mines_stats",    image: "/mines-card.jpg",       sub: "Mander Original", bg: "#081e10", accent: "#22c55e" },
          { name: "Blackjack", key: "bj_stats",       image: "/blackjack-thumb.jpg",  sub: "Mander Original", bg: "#1a1408", accent: "#f4a91f" },
          { name: "Hilo",      key: "hilo_stats",     image: "/hilo-card.jpg",        sub: "Mander Original", bg: "#081a28", accent: "#06b6d4" },
          { name: "Roulette",  key: "roulette_stats", image: "/roulette-card.jpg",    sub: "Mander Original", bg: "#2a0810", accent: "#e01a50" },
          { name: "Baccarat",  key: "baccarat_stats", image: "/baccarat-card.jpg",    sub: "Mander Original", bg: "#081428", accent: "#6366f1" },
        ];
        const allGames = GAME_DEFS.map(g => {
          const raw = localStorage.getItem(`${g.key}_${currentUser}`);
          const data = raw ? JSON.parse(raw) : {};
          const wagered = parseFloat(data.wagered) || 0;
          const bets = (parseInt(data.wins) || 0) + (parseInt(data.losses) || 0);
          return { ...g, wagered, bets };
        }).filter(g => g.wagered > 0 || g.bets > 0).sort((a, b) => b.wagered - a.wagered);
        const top = allGames.slice(0, 3);
        const rankColors  = ["#f4a91f", "#94a3b8", "#cd7f32"];
        const rankBgs     = [
          "linear-gradient(135deg, #0a1838 0%, #1a3a7a 100%)",   // #1
          "linear-gradient(135deg, #08142e 0%, #13305e 100%)",   // #2
          "linear-gradient(135deg, #070f20 0%, #0d2040 100%)",   // #3
        ];
        const rankAccents = ["#2a6ad0", "#1e50a0", "#152e60"];
        // Always render 3 slots — pad with nulls for locked slots
        const slots: (typeof top[0] | null)[] = [
          top[0] ?? null,
          top[1] ?? null,
          top[2] ?? null,
        ];
        const lockedMessages = [
          "Juega para revelar\ntu juego favorito",
          "Sigue apostando para\ndesbloquear este lugar",
          "Un juego más para\ncompletar el podio",
        ];
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "14px", padding: "20px 24px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#f4a91f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", color: "#5a6e8a", textTransform: "uppercase" as const }}>Juegos Favoritos</span>
            </div>
            <div style={{ display: "flex", flexDirection: "row" as const, gap: "10px" }}>
              {slots.map((g, idx) => g ? (
                /* ── Filled slot ── */
                <div key={g.name} style={{
                  flex: 1,
                  position: "relative" as const,
                  background: rankBgs[idx],
                  border: `1px solid ${rankAccents[idx]}55`,
                  borderRadius: "12px",
                  overflow: "hidden",
                  padding: "14px 16px",
                  minHeight: "110px",
                  display: "flex",
                  flexDirection: "column" as const,
                  justifyContent: "space-between",
                  minWidth: 0,
                }}>
                  <div style={{ position: "absolute" as const, inset: 0, background: `radial-gradient(ellipse at 90% 50%, ${rankAccents[idx]}35 0%, transparent 60%)`, pointerEvents: "none" as const }} />
                  <div style={{ position: "absolute" as const, top: "10px", right: "10px", width: "80px", height: "80px", borderRadius: "10px", overflow: "hidden", boxShadow: `0 4px 16px ${rankAccents[idx]}60` }}>
                    <img src={g.image} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
                  </div>
                  <div>
                    <span style={{ display: "inline-block", background: rankColors[idx] + "33", border: `1px solid ${rankColors[idx]}88`, borderRadius: "6px", padding: "1px 7px", fontSize: "11px", fontWeight: 800, color: rankColors[idx], letterSpacing: "0.3px" }}>#{idx + 1}</span>
                  </div>
                  <div style={{ marginTop: "8px", position: "relative" as const, zIndex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: 800, color: "#e8f0fa", letterSpacing: "0.2px", whiteSpace: "nowrap" as const }}>{g.name}</div>
                    <div style={{ fontSize: "10px", color: "#5a6e8a", marginTop: "2px", fontWeight: 500 }}>{g.sub}</div>
                  </div>
                  <div style={{ display: "flex", gap: "20px", marginTop: "12px", position: "relative" as const, zIndex: 1 }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#c8d8ec" }}>{g.bets.toLocaleString()}</div>
                      <div style={{ fontSize: "8px", color: "#4a6080", letterSpacing: "1px", textTransform: "uppercase" as const, marginTop: "1px" }}>Apuestas</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#f4a91f" }}>${g.wagered.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: "8px", color: "#4a6080", letterSpacing: "1px", textTransform: "uppercase" as const, marginTop: "1px" }}>Apostado</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Empty / locked slot ── */
                <div key={`locked-${idx}`} style={{
                  flex: 1,
                  position: "relative" as const,
                  background: "#0d1420",
                  border: "1.5px dashed #1e2e46",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  minHeight: "110px",
                  display: "flex",
                  flexDirection: "column" as const,
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  minWidth: 0,
                }}>
                  {/* Rank badge — muted */}
                  <span style={{ display: "inline-block", background: "#1a2438", border: "1px solid #2a3a55", borderRadius: "6px", padding: "1px 7px", fontSize: "11px", fontWeight: 800, color: "#2e4060", letterSpacing: "0.3px" }}>#{idx + 1}</span>

                  {/* Lock icon + message centered */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", width: "100%", gap: "6px", padding: "8px 0" }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#2e4060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <div style={{ fontSize: "10px", color: "#3a5070", fontWeight: 600, textAlign: "center" as const, lineHeight: 1.4, whiteSpace: "pre-line" as const }}>
                      {lockedMessages[idx]}
                    </div>
                  </div>

                  {/* Bottom placeholder bars */}
                  <div style={{ display: "flex", gap: "12px", width: "70%" }}>
                    <div style={{ height: "8px", flex: 1, background: "#1a2438", borderRadius: "4px" }} />
                    <div style={{ height: "8px", flex: 1.4, background: "#1a2438", borderRadius: "4px" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Tus Estadísticas ──────────────────────────────────────────── */}
      {(() => {
        const fmtUsd2 = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const BET_KEYS = [
          { name: "Plinko",    betsKey: "plinko_bets",   hasMult: true },
          { name: "Keno",      betsKey: "keno_bets",     hasMult: true },
          { name: "Dice",      betsKey: "dice_bets",     hasMult: false },
          { name: "Hilo",      betsKey: "hilo_bets",     hasMult: true },
        ];
        const cutoff = statsRange === "all" ? 0 : Date.now() - (statsRange === "7d" ? 7 : 30) * 86400000;
        let bestLuck: { gameName: string; amount: number; payout: number; multiplier: number } | null = null;
        let bestWin:  { gameName: string; amount: number; payout: number; multiplier: number } | null = null;
        BET_KEYS.forEach(({ name, betsKey, hasMult }) => {
          const allBets: { amount?: number; multiplier?: number; win?: boolean; payout?: number; createdAt?: string }[] =
            JSON.parse(localStorage.getItem(`${betsKey}_${currentUser}`) || "[]");
          const bets = cutoff > 0
            ? allBets.filter(b => b.createdAt ? new Date(b.createdAt).getTime() >= cutoff : false)
            : allBets;
          bets.forEach(b => {
            if (!b.win || !b.payout || !b.amount) return;
            const mult = hasMult && b.multiplier ? b.multiplier : (b.payout / b.amount);
            if (!bestLuck || mult > bestLuck.multiplier)
              bestLuck = { gameName: name, amount: b.amount, payout: b.payout, multiplier: mult };
            if (!bestWin || b.payout > bestWin.payout)
              bestWin = { gameName: name, amount: b.amount, payout: b.payout, multiplier: mult };
          });
        });
        const HighlightCard = ({ badge, record, accentColor }: {
          badge: string;
          record: { gameName: string; amount: number; payout: number; multiplier: number } | null;
          accentColor: string;
        }) => (
          <div style={{ flex: 1, background: "#0a1020", border: `1px solid ${cardBorder}`, borderRadius: "12px", padding: "16px 18px", position: "relative" as const, overflow: "hidden" }}>
            <div style={{ position: "absolute" as const, inset: 0, background: `radial-gradient(ellipse at 85% 20%, ${accentColor}14 0%, transparent 55%)`, pointerEvents: "none" as const }} />
            <div style={{ marginBottom: "8px", position: "relative" as const, zIndex: 1 }}>
              <span style={{ fontSize: "10px", fontWeight: 800, color: accentColor, background: accentColor + "22", border: `1px solid ${accentColor}44`, borderRadius: "999px", padding: "2px 8px", letterSpacing: "0.3px" }}>{badge}</span>
            </div>
            {record ? (
              <>
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#22c55e", letterSpacing: "-0.5px", lineHeight: 1, marginBottom: "6px", position: "relative" as const, zIndex: 1 }}>{fmtUsd2(record.payout)}</div>
                <div style={{ fontSize: "11px", color: "#5a6e8a", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" as const, position: "relative" as const, zIndex: 1 }}>
                  <span style={{ color: "#7a8faa", fontWeight: 600 }}>{record.gameName}</span>
                  <span>·</span>
                  <span>Apuesta: {fmtUsd2(record.amount)}</span>
                  <span>·</span>
                  <span style={{ background: "#1a2338", borderRadius: "5px", padding: "1px 6px", fontWeight: 700, color: "#94a3b8" }}>{record.multiplier.toFixed(2)}x</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: "13px", color: "#2e3e58", paddingTop: "4px", position: "relative" as const, zIndex: 1 }}>Sin datos aún</div>
            )}
          </div>
        );
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "14px", padding: "20px 24px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#f4a91f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", color: "#5a6e8a", textTransform: "uppercase" as const }}>Tus Estadísticas</span>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {(["7d", "30d", "all"] as const).map(r => (
                  <button key={r} onClick={() => setStatsRange(r)}
                    style={{ padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: 700, background: statsRange === r ? "#f4a91f" : "#1a2338", color: statsRange === r ? "#111" : "#4a5e78", transition: "all .15s", fontFamily: "'Inter',sans-serif" }}>
                    {r === "all" ? "Todo" : r}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "12px" }}>
              {([
                { label: "Total Apostado",   value: fmtUsd2(totalWagered),                        valueColor: "#e2e8f0" },
                { label: "Total Ganado",     value: fmtUsd2(totalWins),                            valueColor: "#e2e8f0" },
                { label: "Total Apuestas",   value: totalBets.toLocaleString(),                    valueColor: "#e2e8f0" },
              ] as { label: string; value: string; valueColor: string }[]).map(({ label, value, valueColor }) => (
                <div key={label} style={{ background: "#0a1020", border: `1px solid ${cardBorder}`, borderRadius: "10px", padding: "16px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#3a5070", letterSpacing: "0.8px", textTransform: "uppercase" as const, fontWeight: 700 }}>{label}</span>
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 900, color: valueColor, letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <HighlightCard
                badge="Mayor Suerte"
                record={bestLuck}
                accentColor="#22c55e"
              />
              <HighlightCard
                badge="Mayor Ganancia"
                record={bestWin}
                accentColor="#f4a91f"
              />
            </div>
          </div>
        );
      })()}

      {/* ── Información de la Cuenta ──────────────────────────────── */}
      {(() => {
        const acc = profileDetails as { username?: string; created_at?: string };
        const registeredDate = acc.created_at
          ? new Date(acc.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
          : null;
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "14px", padding: "20px 24px", marginBottom: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#f4a91f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", color: "#5a6e8a", textTransform: "uppercase" as const }}>Información de la Cuenta</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
              {/* Email */}
              <div style={{ background: "#0a1020", border: `1px solid ${cardBorder}`, borderRadius: "10px", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#5a6e8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "#3a5070", letterSpacing: "0.8px", textTransform: "uppercase" as const }}>Email</span>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#c8d8ec", wordBreak: "break-all" as const }}>
                  {userEmail || <span style={{ color: "#3a5070", fontStyle: "italic" }}>No disponible</span>}
                </div>
                <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
                  <span style={{ fontSize: "10px", color: "#22c55e", fontWeight: 600 }}>Verificado</span>
                </div>
              </div>

              {/* Miembro desde */}
              <div style={{ background: "#0a1020", border: `1px solid ${cardBorder}`, borderRadius: "10px", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#5a6e8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "#3a5070", letterSpacing: "0.8px", textTransform: "uppercase" as const }}>Miembro Desde</span>
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#c8d8ec" }}>
                  {registeredDate || <span style={{ color: "#3a5070", fontStyle: "italic" }}>Sin registro</span>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Detalles del Perfil (profile_details) ─────────────────── */}
      {(() => {
        const det = profileDetails as { country?: string; currency?: string; last_ip?: string; device_info?: string; notes?: string; referrer_id?: string; username?: string };
        const DetailCard = ({ icon, label, value, mono = false, fallback = "Sin datos" }: {
          icon: React.ReactNode; label: string; value?: string; mono?: boolean; fallback?: string;
        }) => (
          <div style={{ background: "#0a1020", border: `1px solid ${cardBorder}`, borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              {icon}
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#3a5070", letterSpacing: "0.8px", textTransform: "uppercase" as const }}>{label}</span>
            </div>
            {value ? (
              <div style={{ fontSize: mono ? "11px" : "13px", fontWeight: 600, color: "#c8d8ec", fontFamily: mono ? "'Courier New',monospace" : "'Inter',sans-serif", wordBreak: "break-all" as const, lineHeight: 1.4 }}>
                {value}
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "#2e3e58", fontStyle: "italic" }}>{fallback}</div>
            )}
          </div>
        );
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "14px", padding: "20px 24px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#f4a91f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", color: "#5a6e8a", textTransform: "uppercase" as const }}>Detalles del Perfil</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              <DetailCard
                icon={<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#5a6e8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                label="Username" value={det.username} fallback="Sin username"
              />
              <DetailCard
                icon={<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#5a6e8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
                label="País" value={det.country} fallback="No configurado"
              />
              <DetailCard
                icon={<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#5a6e8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                label="Referido por" value={det.referrer_id} mono fallback="Sin referidor"
              />
            </div>
          </div>
        );
      })()}

      {/* Configuración del perfil */}
      <SectionCard title="Configuración del Perfil" icon={
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
        </svg>
      }>
        {/* Shared styles */}
        {(() => {
          const btnW = "500px";
          const inputStyle: React.CSSProperties = { flex: 1, height: "40px", background: inputBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "0 12px", color: "#7a8faa", fontSize: "13px", fontFamily: "'Inter',sans-serif", outline: "none", boxSizing: "border-box" };
          const rowStyle: React.CSSProperties = { display: "flex", gap: "8px", alignItems: "center" };
          return (
            <>
              {/* Email — sin botón, placeholder del mismo ancho que los botones */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", color: mutedText, marginBottom: "6px" }}>Email</label>
                <div style={rowStyle}>
                  <input value={userEmail || currentUser} readOnly style={inputStyle} />
                  <div style={{ width: btnW, flexShrink: 0 }} />
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", color: mutedText, marginBottom: "6px" }}>Contraseña</label>
                <div style={rowStyle}>
                  <input value="••••••••••" readOnly type="text" style={inputStyle} />
                  <div style={{ width: btnW, flexShrink: 0 }}>
                    <ActionBtn small onClick={handleChangePassword}>Cambiar contraseña</ActionBtn>
                  </div>
                </div>
              </div>

              {/* Mander ID */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", color: mutedText, marginBottom: "6px" }}>Mander ID</label>
                <div style={rowStyle}>
                  <div style={{ ...inputStyle, display: "flex", alignItems: "center", color: "#7a8faa", letterSpacing: "0.5px", fontFamily: "'Courier New',monospace", fontSize: "12px" }}>
                    {manderId}
                  </div>
                  <div style={{ width: btnW, flexShrink: 0, display: "flex", justifyContent: "flex-start" }}>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(manderId).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1800);
                        });
                      }}
                      style={{
                        height: "40px", padding: "0 14px",
                        display: "inline-flex", alignItems: "center", gap: "6px",
                        background: copied ? "#163a25" : "#252f45",
                        border: copied ? "1px solid #22c55e40" : "none",
                        borderRadius: "8px", cursor: "pointer",
                        color: copied ? "#22c55e" : "#c8d8ec",
                        fontSize: "12px", fontWeight: 600,
                        fontFamily: "'Inter',sans-serif", transition: "all .2s",
                      }}>
                      {copied ? (
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      )}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Nombre de usuario */}
              <div style={{ marginBottom: "4px" }}>
                <label style={{ display: "block", fontSize: "12px", color: mutedText, marginBottom: "6px" }}>Nombre de usuario</label>
                <div style={{ ...rowStyle, alignItems: "flex-start" }}>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    onBlur={handleNameBlur}
                    maxLength={20}
                    style={{ ...inputStyle, color: "#e2e8f0" }}
                  />
                  <div style={{ width: btnW, flexShrink: 0 }}>
                    <div style={{ height: "40px", display: "flex", alignItems: "center", gap: "10px" }}>
                      <button
                        onClick={() => handlePrivateMode(!privateMode)}
                        style={{
                          width: "42px", height: "22px", borderRadius: "999px", border: "none", cursor: "pointer", flexShrink: 0,
                          background: privateMode ? accent : "#252f45",
                          position: "relative", transition: "background .2s",
                        }}>
                        <div style={{
                          position: "absolute", top: "3px", left: privateMode ? "22px" : "3px",
                          width: "16px", height: "16px", borderRadius: "50%", background: "white", transition: "left .2s",
                        }} />
                      </button>
                      <span style={{ fontSize: "13px", color: "#c8d8ec", fontWeight: 600 }}>Modo privado</span>
                    </div>
                    <div style={{ fontSize: "11px", color: mutedText, lineHeight: 1.5, marginTop: "4px", whiteSpace: "nowrap" }}>Al activarlo, tu identidad aparecerá como Anónimo en el sitio. Tu nombre seguirá visible en el chat.</div>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </SectionCard>


      {/* Cerrar sesión */}
      <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "14px", padding: "20px" }}>
        <button
          onClick={onLogout}
          style={{ display: "flex", alignItems: "center", gap: "8px", background: "#1a0e0e", border: "1px solid #3d1a1a", color: "#ff6b6b", borderRadius: "8px", padding: "10px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#2a1414"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1a0e0e"; }}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
