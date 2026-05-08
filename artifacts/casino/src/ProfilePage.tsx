import { assetUrl } from "./lib/assetUrl";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { gt } from "./lib/gameLabels";
import { createPortal } from "react-dom";
import { getVipInfo, VIP_RANKS } from "./vipSystem";

const COUNTRY_NAMES: Record<string, string> = {
  AR:"Argentina",BR:"Brasil",MX:"México",CO:"Colombia",PE:"Perú",CL:"Chile",VE:"Venezuela",
  EC:"Ecuador",BO:"Bolivia",PY:"Paraguay",UY:"Uruguay",CR:"Costa Rica",PA:"Panamá",
  GT:"Guatemala",HN:"Honduras",SV:"El Salvador",NI:"Nicaragua",DO:"Rep. Dominicana",
  CU:"Cuba",PR:"Puerto Rico",US:"Estados Unidos",CA:"Canadá",ES:"España",DE:"Alemania",
  FR:"Francia",IT:"Italia",GB:"Reino Unido",PT:"Portugal",RU:"Rusia",CN:"China",JP:"Japón",
  KR:"Corea del Sur",IN:"India",AU:"Australia",NL:"Países Bajos",SE:"Suecia",NO:"Noruega",
  PL:"Polonia",TR:"Turquía",UA:"Ucrania",ZA:"Sudáfrica",NG:"Nigeria",EG:"Egipto",
  MA:"Marruecos",KE:"Kenia",PH:"Filipinas",ID:"Indonesia",TH:"Tailandia",VN:"Vietnam",
  MY:"Malasia",SG:"Singapur",NZ:"Nueva Zelanda",HU:"Hungría",CZ:"Rep. Checa",
  RO:"Rumanía",GR:"Grecia",BE:"Bélgica",CH:"Suiza",AT:"Austria",FI:"Finlandia",DK:"Dinamarca",
  IL:"Israel",AE:"Emiratos Árabes",SA:"Arabia Saudita",PK:"Pakistán",BD:"Bangladesh",
  HK:"Hong Kong",TW:"Taiwán",LT:"Lituania",LV:"Letonia",EE:"Estonia",SK:"Eslovaquia",
  SI:"Eslovenia",HR:"Croacia",RS:"Serbia",BG:"Bulgaria",BY:"Bielorrusia",KZ:"Kazajistán",
};
function countryName(code?: string | null): string | undefined {
  if (!code) return undefined;
  return COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase();
}

// Abbreviates large dollar values for narrow mobile cards: $22,078,229 → $22.1M
function fmtCompactStat(formatted: string): string {
  const num = parseFloat(formatted.replace(/[$,]/g, ""));
  if (!isFinite(num)) return formatted;
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000)     return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 10_000)        return `$${(num / 1_000).toFixed(1)}K`;
  return formatted;
}

type ServerStatsType = {
  total_wagered: number; total_won: number; total_bets: number;
  win_rate: number; biggest_win: number; biggest_win_bet: number; biggest_win_game: string;
  game_summary: { game: string; wagered: number; won: number; bets: number; wins: number; losses: number }[];
  recent_bets:  { amount: number; winAmount: number; game: string; createdAt: string }[];
};

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
  lang?: string;
  serverStats?: ServerStatsType | null;
  recentBets?: { game: string; amount: number; winAmount: number; win: boolean; multiplier: number; createdAt: string }[];
  profileDetails?: {
    country?: string; currency?: string; last_ip?: string;
    device_info?: string; notes?: string; referrer_id?: string; username?: string; created_at?: string;
  };
}

const RANKS = [
  { name: "Bronze 1", minXp: 1000,    nextXp: 5000,    color: "#9945FF", gradient: "linear-gradient(135deg,#9945FF,#5b21b6)" },
  { name: "Bronze 2", minXp: 5000,    nextXp: 10000,   color: "#9945FF", gradient: "linear-gradient(135deg,#9945FF,#5b21b6)" },
  { name: "Bronze 3", minXp: 10000,   nextXp: 25000,   color: "#9945FF", gradient: "linear-gradient(135deg,#9945FF,#5b21b6)" },
  { name: "Silver 1", minXp: 25000,   nextXp: 50000,   color: "#a090c8", gradient: "linear-gradient(135deg,#c0c0c0,#8b7ab8)" },
  { name: "Silver 2", minXp: 50000,   nextXp: 100000,  color: "#a090c8", gradient: "linear-gradient(135deg,#c0c0c0,#8b7ab8)" },
  { name: "Silver 3", minXp: 100000,  nextXp: 250000,  color: "#a090c8", gradient: "linear-gradient(135deg,#c0c0c0,#8b7ab8)" },
  { name: "Gold 1",   minXp: 250000,  nextXp: 500000,  color: "#A855F7", gradient: "linear-gradient(135deg,#A855F7,#7C3AED)" },
  { name: "Gold 2",   minXp: 500000,  nextXp: 1000000, color: "#A855F7", gradient: "linear-gradient(135deg,#A855F7,#7C3AED)" },
  { name: "Gold 3",   minXp: 1000000, nextXp: 1000000, color: "#A855F7", gradient: "linear-gradient(135deg,#A855F7,#7C3AED)" },
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
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#1e1535", border: "2px solid #2d1f52", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="#7c6d9e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

const accent = "#A855F7";
const cardBg = "#0D0F1A";
const cardBorder = "#130d26";
const inputBg = "#0D0F1A";
const mutedText = "#9b8bc4";
const gold = (opacity = 1) => `rgba(168,85,247,${opacity})`;

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
        <span style={{ color: mutedText }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: "13px", letterSpacing: "0.8px", textTransform: "uppercase", color: "#e2d4f8", fontFamily: "'Inter',sans-serif" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function ActionBtn({ onClick, children, variant = "secondary", small }: { onClick?: () => void; children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; small?: boolean }) {
  const bg: Record<string, string> = { primary: accent, secondary: "#1e1535", danger: "#2d0a50" };
  const col: Record<string, string> = { primary: "#111", secondary: "#e2d4f8", danger: "#ff6b6b" };
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? (variant === "primary" ? "#A855F7" : variant === "danger" ? "#2d0a50" : "#2d1f52") : bg[variant],
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

function Toast({ visible, lang }: { visible: boolean; lang?: string }) {
  const T = (k: string) => gt(lang, k);
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
      background: "#130d26", border: "1px solid #22c55e40",
      borderRadius: "6px", padding: "12px 16px",
      display: "flex", alignItems: "center", gap: "10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      opacity, transform: `translateY(${translateY}px)`,
      transition: "opacity 0.25s ease, transform 0.25s ease",
      maxWidth: "340px", pointerEvents: "none",
      fontFamily: "'Inter',sans-serif",
    }}>
      <div style={{ flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%", background: "#1a1035", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
        </svg>
      </div>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2d4f8", marginBottom: "2px" }}>{T("profEmailSent")}</div>
        <div style={{ fontSize: "11px", color: "#9b8bc4", lineHeight: 1.4 }}>
          {T("profEmailSentDesc")}
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
  lang, serverStats: serverStatsProp = undefined, recentBets = [],
}: ProfilePageProps) {
  const T = (k: string) => gt(lang, k);

  // ── Server stats: prefer prop from App.tsx (has valid auth token), fall back to self-fetch ──
  const [serverStatsFetched, setServerStatsFetched] = useState<ServerStatsType | null>(null);

  useEffect(() => {
    if (serverStatsProp != null) return; // App.tsx provided valid stats, no need to self-fetch
    if (!currentUser) return;
    const sbToken = (() => {
      try {
        const keys = Object.keys(localStorage).filter(k => k.includes("supabase") && k.includes("auth"));
        for (const k of keys) {
          const v = JSON.parse(localStorage.getItem(k) || "{}");
          if (v?.access_token) return v.access_token as string;
        }
      } catch {}
      return null;
    })();
    if (!sbToken) return;
    fetch("/api/stats", { headers: { Authorization: `Bearer ${sbToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setServerStatsFetched(data); })
      .catch(() => {});
  }, [currentUser, serverStatsProp]);

  const serverStats = serverStatsProp ?? serverStatsFetched;

  // Prefer server stats, fall back to localStorage-backed props while loading
  const dispWagered  = serverStats?.total_wagered  ?? totalWagered;
  const dispWon      = serverStats?.total_won       ?? totalWins;
  const dispBets     = serverStats?.total_bets      ?? totalBets;
  const dispWinRate  = serverStats?.win_rate        ?? winRate;

  const xp = Math.floor(dispWagered);
  const { rank, pct, nextXp } = getRankInfo(xp);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: isMobile ? "0 0 80px" : "0 20px 40px", fontFamily: "'Inter',sans-serif", overflowX: "hidden" }}>

      {/* Profile header */}
      {(() => {
        const vInfo = getVipInfo(vipWagered);
        const vRank = vInfo.rank;
        const isMax = vInfo.isMax;
        const nextRankName = isMax ? null : (VIP_RANKS[vInfo.idx + 1]?.name ?? null);
        const nextWager = isMax ? 0 : (vRank.nextWager - vipWagered);
        const tierKeys: Record<string, string> = { Bronze:"tierBronze", Silver:"tierSilver", Gold:"tierGold", Platinum:"tierPlatinum", Emerald:"tierEmerald" };
        const translateRank = (name: string | null) => {
          if (!name) return name;
          const [tier, ...rest] = name.split(" ");
          const key = tierKeys[tier];
          return key ? `${T(key as any)} ${rest.join(" ")}` : name;
        };
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "20px 24px", marginBottom: "16px", position: "relative", overflow: "hidden" }}>

            <div style={{ display: "flex", alignItems: "center", gap: "18px", position: "relative" }}>
              {/* Badge image */}
              <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", border: `2px solid ${vRank.color}55`, boxShadow: `0 0 16px ${vRank.color}40`, flexShrink: 0, background: "#0D0F1A" }}>
                <img loading="lazy" decoding="async" src={vRank.image} alt={vRank.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>

              {/* Text block */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Username row */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                  <span style={{ fontSize: "20px", fontWeight: 800, color: "#ead4fc", letterSpacing: "-0.3px" }}>{displayName}</span>
                  {/* Rakeback pill */}
                  <span style={{ background: vRank.color + "22", border: `1px solid ${vRank.color}55`, color: vRank.color, borderRadius: "6px", padding: "2px 10px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px" }}>
                    {(vRank.rakebackPct * 100).toFixed(1)}% {T("rakeback")}
                  </span>
                </div>

                {/* Rank name */}
                <div style={{ fontSize: "13px", fontWeight: 700, color: vRank.color, letterSpacing: "0.5px", marginBottom: "8px", textTransform: "uppercase" as const }}>
                  {translateRank(vRank.name)}
                </div>

                {/* Progress bar */}
                {!isMax ? (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "10px", color: "#6b5f8c" }}>{T("profNextRank")} <span style={{ color: "#9b8bc4", fontWeight: 600 }}>{translateRank(nextRankName)}</span></span>
                      <span style={{ fontSize: "10px", color: "#6b5f8c" }}>${nextWager.toLocaleString("en-US", { maximumFractionDigits: 0 })} {T("profRemaining")}</span>
                    </div>
                    <div style={{ height: "5px", borderRadius: "999px", background: "#0D0F1A", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${vInfo.pct}%`, background: vRank.gradient, borderRadius: "999px", transition: "width .5s ease", boxShadow: vInfo.pct > 0 ? `0 0 8px ${vRank.color}55` : "none" }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "#4dd890", fontWeight: 700 }}>{T("profMaxRank")}</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Juegos Favoritos ─────────────────────────────────────── */}
      {(() => {
        const GAME_DEFS = [
          { name: T("gameDice"),      key: "dice_stats",     image: "/dice-card.webp",        sub: T("manderOriginals"), bg: "#0A0A12", accent: "#A855F7" },
          { name: T("gamePlinko"),    key: "plinko_stats",   image: assetUrl("/plinko-thumb.webp"),     sub: T("manderOriginals"), bg: "#1a0a30", accent: "#FF3B5C" },
          { name: T("gameKeno"),      key: "keno_stats",     image: assetUrl("/keno-thumb.webp"),       sub: T("manderOriginals"), bg: "#130d26", accent: "#9b5cf6" },
          { name: T("gameMines"),     key: "mines_stats",    image: "/mines-card.webp",       sub: T("manderOriginals"), bg: "#0A0A12", accent: "#22c55e" },
          { name: T("gameBlackjack"), key: "bj_stats",       image: assetUrl("/blackjack-thumb.webp"),  sub: T("manderOriginals"), bg: "#130d26", accent: "#A855F7" },
          { name: T("gameHilo"),      key: "hilo_stats",     image: assetUrl("/hilo-card.webp"),        sub: T("manderOriginals"), bg: "#0A0A12", accent: "#22D3EE" },
          { name: T("gameRoulette"),  key: "roulette_stats", image: "/roulette-card.webp",    sub: T("manderOriginals"), bg: "#1a0a30", accent: "#FF3B5C" },
          { name: T("gameBaccarat"),  key: "baccarat_stats", image: assetUrl("/baccarat-card.webp"),    sub: T("manderOriginals"), bg: "#0A0A12", accent: "#818cf8" },
          { name: T("gameLimbo"),     key: "limbo_stats",    image: assetUrl("/limbo-thumb.webp"),      sub: T("manderOriginals"), bg: "#0A0A12", accent: "#22D3EE" },
        ];
        // Map server game names → ProfilePage keys
        const SERVER_GAME_MAP: Record<string, string> = {
          "Dice": "dice_stats", "Plinko": "plinko_stats", "Keno": "keno_stats",
          "Mines": "mines_stats", "Blackjack": "bj_stats", "Hilo": "hilo_stats",
          "Roulette": "roulette_stats", "Baccarat": "baccarat_stats", "Limbo": "limbo_stats",
        };
        const serverSummaryByKey: Record<string, { wagered: number; bets: number }> = {};
        if (serverStats?.game_summary) {
          for (const gs of serverStats.game_summary) {
            const k = SERVER_GAME_MAP[gs.game];
            if (k) serverSummaryByKey[k] = { wagered: gs.wagered, bets: gs.bets };
          }
        }
        const allGames = GAME_DEFS.map(g => {
          // Prefer server data; fall back to localStorage while loading
          if (serverSummaryByKey[g.key]) {
            return { ...g, wagered: serverSummaryByKey[g.key].wagered, bets: serverSummaryByKey[g.key].bets };
          }
          const raw = localStorage.getItem(`${g.key}_${currentUser}`);
          const data = raw ? JSON.parse(raw) : {};
          const wagered = parseFloat(data.wagered) || 0;
          const bets = (parseInt(data.wins) || 0) + (parseInt(data.losses) || 0);
          return { ...g, wagered, bets };
        }).filter(g => g.wagered > 0 || g.bets > 0).sort((a, b) => b.bets - a.bets || b.wagered - a.wagered);
        const top = allGames.slice(0, 3);
        const rankColors  = ["#A855F7", "#9b8bc4", "#9945FF"];
        const rankBgs     = [
          "linear-gradient(135deg, #0A0A12 0%, #5b21b6 100%)",   // #1
          "linear-gradient(135deg, #0A0A12 0%, #1e1535 100%)",   // #2
          "linear-gradient(135deg, #0A0A12 0%, #0D0F1A 100%)",   // #3
        ];
        const rankAccents = ["#7C3AED", "#5b21b6", "#1e1535"];
        // Always render 3 slots — pad with nulls for locked slots
        const slots: (typeof top[0] | null)[] = [
          top[0] ?? null,
          top[1] ?? null,
          top[2] ?? null,
        ];
        const lockedMessages = [
          T("profPlayReveal"),
          T("profKeepPlaying"),
          T("profOnePodium"),
        ];
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "20px 24px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#A855F7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", color: "#6b5f8c", textTransform: "uppercase" as const }}>{T("profFavGames")}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "row" as const, gap: isMobile ? "6px" : "10px" }}>
              {slots.map((g, idx) => g ? (
                /* ── Filled slot ── */
                <div key={g.name} style={{
                  flex: 1,
                  position: "relative" as const,
                  background: rankBgs[idx],
                  border: `1px solid ${rankAccents[idx]}55`,
                  borderRadius: "6px",
                  overflow: "hidden",
                  padding: isMobile ? "10px 8px" : "14px 16px",
                  minHeight: isMobile ? "120px" : "110px",
                  display: "flex",
                  flexDirection: "column" as const,
                  justifyContent: "space-between",
                  alignItems: isMobile ? "center" : "flex-start",
                  minWidth: 0,
                }}>
                  <div style={{ position: "absolute" as const, inset: 0, background: `radial-gradient(ellipse at 90% 50%, ${rankAccents[idx]}35 0%, transparent 60%)`, pointerEvents: "none" as const }} />
                  {!isMobile && (
                    <div style={{ position: "absolute" as const, top: "10px", right: "10px", width: "80px", height: "80px", borderRadius: "6px", overflow: "hidden", boxShadow: `0 4px 16px ${rankAccents[idx]}60` }}>
                      <img loading="lazy" decoding="async" src={g.image} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
                    </div>
                  )}
                  <div>
                    <span style={{ display: "inline-block", background: rankColors[idx] + "33", border: `1px solid ${rankColors[idx]}88`, borderRadius: "6px", padding: "1px 6px", fontSize: "10px", fontWeight: 800, color: rankColors[idx], letterSpacing: "0.3px" }}>#{idx + 1}</span>
                  </div>
                  <div style={{ marginTop: "6px", position: "relative" as const, zIndex: 1, textAlign: isMobile ? "center" as const : "left" as const, width: "100%" }}>
                    <div style={{ fontSize: isMobile ? "11px" : "14px", fontWeight: 800, color: "#f5eeff", letterSpacing: "0.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{g.name}</div>
                    {!isMobile && <div style={{ fontSize: "10px", color: "#6b5f8c", marginTop: "2px", fontWeight: 500 }}>{g.sub}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" as const : "row" as const, gap: isMobile ? "4px" : "20px", marginTop: isMobile ? "6px" : "12px", position: "relative" as const, zIndex: 1, alignItems: isMobile ? "center" : "flex-start", width: "100%" }}>
                    <div style={{ textAlign: isMobile ? "center" as const : "left" as const }}>
                      <div style={{ fontSize: isMobile ? "12px" : "13px", fontWeight: 800, color: "#e2d4f8" }}>{g.bets.toLocaleString()}</div>
                      <div style={{ fontSize: "8px", color: "#4a3070", letterSpacing: "0.8px", textTransform: "uppercase" as const, marginTop: "1px" }}>{T("profBetsLabel")}</div>
                    </div>
                    <div style={{ textAlign: isMobile ? "center" as const : "left" as const }}>
                      <div style={{ fontSize: isMobile ? "11px" : "13px", fontWeight: 800, color: "#A855F7" }}>${g.wagered.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: "8px", color: "#4a3070", letterSpacing: "0.8px", textTransform: "uppercase" as const, marginTop: "1px" }}>{T("profWageredLbl")}</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Empty / locked slot ── */
                <div key={`locked-${idx}`} style={{
                  flex: 1,
                  position: "relative" as const,
                  background: "#0A0A12",
                  border: "1.5px dashed #1a1035",
                  borderRadius: "6px",
                  padding: isMobile ? "10px 8px" : "14px 16px",
                  minHeight: isMobile ? "120px" : "110px",
                  display: "flex",
                  flexDirection: "column" as const,
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  minWidth: 0,
                }}>
                  {/* Rank badge — muted */}
                  <span style={{ display: "inline-block", background: "#1a1035", border: "1px solid #2d1f52", borderRadius: "6px", padding: "1px 6px", fontSize: "10px", fontWeight: 800, color: "#2d1f52", letterSpacing: "0.3px" }}>#{idx + 1}</span>

                  {/* Lock icon + message centered */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", width: "100%", gap: "5px", padding: "6px 0" }}>
                    <svg viewBox="0 0 24 24" width={isMobile ? 16 : 20} height={isMobile ? 16 : 20} fill="none" stroke="#2d1f52" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <div style={{ fontSize: "9px", color: "#2d1f52", fontWeight: 600, textAlign: "center" as const, lineHeight: 1.4 }}>
                      {lockedMessages[idx]}
                    </div>
                  </div>

                  {/* Bottom placeholder bars */}
                  {!isMobile && (
                    <div style={{ display: "flex", gap: "10px" }}>
                      {Array.from({ length: idx + 1 }).map((_, i) => (
                        <div key={i} style={{ height: "8px", width: "90px", background: "#1a1035", borderRadius: "4px", flexShrink: 0 }} />
                      ))}
                    </div>
                  )}
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

        // Helper: process a bet array (from server stats or live poll) into bestLuck/bestWin
        const processBets = (bets: { game: string; amount: number; winAmount: number; createdAt?: string }[]) => {
          const filtered = cutoff > 0
            ? bets.filter(b => b.createdAt ? new Date(b.createdAt).getTime() >= cutoff : false)
            : bets;
          filtered.forEach(b => {
            if (!b.winAmount || !b.amount || b.winAmount <= b.amount) return;
            const mult   = b.amount > 0 ? b.winAmount / b.amount : 1;
            const profit = b.winAmount - b.amount;
            if (!bestLuck || mult > bestLuck.multiplier)
              bestLuck = { gameName: b.game, amount: b.amount, payout: b.winAmount, multiplier: mult };
            if (!bestWin || profit > ((bestWin as any).payout - (bestWin as any).amount))
              bestWin = { gameName: b.game, amount: b.amount, payout: b.winAmount, multiplier: mult };
          });
        };

        if (serverStats && serverStats.recent_bets.length > 0) {
          // Primary source: /api/stats snapshot (up to 500 bets)
          processBets(serverStats.recent_bets);
          // Also use the server's pre-computed biggest_win for the "all time" case
          if (statsRange === "all" && serverStats.biggest_win > 0 && serverStats.biggest_win_bet > 0) {
            const payout = serverStats.biggest_win + serverStats.biggest_win_bet;
            const mult   = serverStats.biggest_win_bet > 0 ? payout / serverStats.biggest_win_bet : 1;
            if (!bestWin || serverStats.biggest_win > ((bestWin as any).payout - (bestWin as any).amount))
              bestWin = { gameName: serverStats.biggest_win_game, amount: serverStats.biggest_win_bet, payout, multiplier: mult };
          }
        } else {
          // Fallback: localStorage (until server data arrives)
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
        }
        // Secondary source: live 5-second poll (always overlays on top of the snapshot above)
        // This ensures recent wins appear in Best Luck / Best Win within ~5 s of being placed,
        // without waiting for the heavier /api/stats call to complete.
        if (recentBets.length > 0) processBets(recentBets);
        const HighlightCard = ({ badge, record, accentColor }: {
          badge: string;
          record: { gameName: string; amount: number; payout: number; multiplier: number } | null;
          accentColor: string;
        }) => (
          <div style={{ flex: 1, background: "#0A0A12", border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: isMobile ? "14px 12px" : "16px 18px", position: "relative" as const, overflow: "hidden", textAlign: isMobile ? "center" as const : "left" as const }}>
            <div style={{ marginBottom: "8px", position: "relative" as const, zIndex: 1, display: "flex", justifyContent: isMobile ? "center" : "flex-start" }}>
              <span style={{ fontSize: "10px", fontWeight: 800, color: accentColor, background: accentColor + "22", border: `1px solid ${accentColor}44`, borderRadius: "6px", padding: "2px 8px", letterSpacing: "0.3px" }}>{badge}</span>
            </div>
            {record ? (
              <>
                <div style={{ fontSize: isMobile ? "18px" : "22px", fontWeight: 900, color: "#22c55e", letterSpacing: "-0.5px", lineHeight: 1, marginBottom: "6px", position: "relative" as const, zIndex: 1, wordBreak: "break-all" as const }}>{fmtUsd2(record.payout)}</div>
                <div style={{ fontSize: "11px", color: "#6b5f8c", display: "flex", alignItems: "center", justifyContent: isMobile ? "center" : "flex-start", gap: "6px", flexWrap: "wrap" as const, position: "relative" as const, zIndex: 1 }}>
                  <span style={{ color: "#9b8bc4", fontWeight: 600 }}>{record.gameName}</span>
                  <span>·</span>
                  <span>{T("profBetLbl")}: {fmtUsd2(record.amount)}</span>
                  <span>·</span>
                  <span style={{ background: "#130d26", borderRadius: "5px", padding: "1px 6px", fontWeight: 700, color: "#9b8bc4" }}>{record.multiplier.toFixed(2)}x</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: "13px", color: "#2d1f52", paddingTop: "4px", position: "relative" as const, zIndex: 1 }}>{T("profNoData")}</div>
            )}
          </div>
        );
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: isMobile ? "16px 14px" : "20px 24px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: isMobile ? "10px" : "0", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#A855F7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", color: "#6b5f8c", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>{T("profStatsTitle")}</span>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {(["7d", "30d", "all"] as const).map(r => (
                  <button key={r} onClick={() => setStatsRange(r)}
                    style={{ padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: 700, background: statsRange === r ? "#A855F7" : "#130d26", color: statsRange === r ? "#111" : "#6b5f8c", transition: "all .15s", fontFamily: "'Inter',sans-serif" }}>
                    {r === "all" ? T("statsAll") : r}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: isMobile ? "6px" : "10px", marginBottom: "12px" }}>
              {([
                { label: T("profTotalWagered"),   value: fmtUsd2(dispWagered),             valueColor: "#e2d4f8" },
                { label: T("profTotalWon"),        value: fmtUsd2(dispWon),                 valueColor: "#e2d4f8" },
                { label: T("profTotalBets"),       value: dispBets.toLocaleString(),         valueColor: "#e2d4f8" },
              ] as { label: string; value: string; valueColor: string }[]).map(({ label, value, valueColor }) => (
                <div key={label} style={{ background: "#0A0A12", border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: isMobile ? "10px 6px" : "16px 16px", textAlign: isMobile ? "center" as const : "left" as const, minHeight: isMobile ? "72px" : undefined, display: "flex", flexDirection: "column" as const, justifyContent: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "center" : "flex-start", gap: "5px", marginBottom: isMobile ? "5px" : "10px" }}>
                    <span style={{ fontSize: isMobile ? "8px" : "10px", color: "#2d1f52", letterSpacing: "0.6px", textTransform: "uppercase" as const, fontWeight: 700, lineHeight: 1.3 }}>{label}</span>
                  </div>
                  <div style={{ fontSize: isMobile ? "12px" : "20px", fontWeight: 900, color: valueColor, letterSpacing: "-0.3px", lineHeight: 1, whiteSpace: "nowrap" as const }}>{isMobile ? fmtCompactStat(value) : value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <HighlightCard
                badge={T("badgeLuck")}
                record={bestLuck}
                accentColor="#6b5f8c"
              />
              <HighlightCard
                badge={T("badgeProfit")}
                record={bestWin}
                accentColor="#6b5f8c"
              />
            </div>
          </div>
        );
      })()}

      {/* ── Información de la Cuenta ──────────────────────────────── */}
      {(() => {
        const acc = profileDetails as { username?: string; created_at?: string };
        const registeredDate = acc.created_at
          ? new Date(acc.created_at).toLocaleDateString(({ es:"es-ES", en:"en-US", pt:"pt-BR", de:"de-DE", fr:"fr-FR", id:"id-ID", it:"it-IT", ko:"ko-KR", nl:"nl-NL", pl:"pl-PL", ru:"ru-RU", tr:"tr-TR" }[lang ?? "es"] ?? "es-ES"), { day: "2-digit", month: "long", year: "numeric" })
          : null;
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: isMobile ? "16px 14px" : "20px 24px", marginBottom: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#A855F7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", color: "#6b5f8c", textTransform: "uppercase" as const }}>{T("profAccountInfo")}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {/* Email */}
              <div style={{ background: "#0A0A12", border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "14px 12px", display: "flex", flexDirection: "column" as const, boxSizing: "border-box" as const, minWidth: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" style={{ flexShrink: 0 }} fill="none" stroke="#6b5f8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "#2d1f52", letterSpacing: "0.8px", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{T("profEmail")}</span>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2d4f8", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {userEmail || <span style={{ color: "#2d1f52", fontStyle: "italic" }}>{T("profNotAvail")}</span>}
                </div>
                <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                  <span style={{ fontSize: "10px", color: "#22c55e", fontWeight: 600 }}>{T("profVerified")}</span>
                </div>
              </div>

              {/* Miembro desde */}
              <div style={{ background: "#0A0A12", border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "14px 12px", display: "flex", flexDirection: "column" as const, boxSizing: "border-box" as const, minWidth: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" style={{ flexShrink: 0 }} fill="none" stroke="#6b5f8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "#2d1f52", letterSpacing: "0.8px", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{T("profMemberSince")}</span>
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2d4f8", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {registeredDate || <span style={{ color: "#2d1f52", fontStyle: "italic" }}>{T("profNoRecord")}</span>}
                </div>
                {/* Spacer to visually match height of Email card's Verified badge row */}
                <div style={{ marginTop: "6px", height: "14px" }} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Detalles del Perfil (profile_details) ─────────────────── */}
      {(() => {
        const det = profileDetails as { country?: string; currency?: string; last_ip?: string; device_info?: string; notes?: string; referrer_id?: string; username?: string };
        const DetailCard = ({ icon, label, value, mono = false, fallback = T("noData") }: {
          icon: React.ReactNode; label: string; value?: string; mono?: boolean; fallback?: string;
        }) => (
          <div style={{ background: "#0A0A12", border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", overflow: "hidden" }}>
              {icon}
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#2d1f52", letterSpacing: "0.8px", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
            </div>
            {value ? (
              <div style={{ fontSize: mono ? "11px" : "13px", fontWeight: 600, color: "#e2d4f8", fontFamily: mono ? "'Courier New',monospace" : "'Inter',sans-serif", wordBreak: "break-all" as const, lineHeight: 1.4 }}>
                {value}
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "#2d1f52", fontStyle: "italic" }}>{fallback}</div>
            )}
          </div>
        );
        return (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "20px 24px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#A855F7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", color: "#6b5f8c", textTransform: "uppercase" as const }}>{T("profDetails")}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "10px" }}>
              <DetailCard
                icon={<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#6b5f8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                label={T("profUsername")} value={det.username} fallback={T("noData")}
              />
              <DetailCard
                icon={<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#6b5f8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
                label={T("profCountry")} value={countryName(det.country)} fallback={T("noData")}
              />
              <DetailCard
                icon={<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#6b5f8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                label={T("profReferredBy")} value={det.referrer_id} fallback={T("noData")}
              />
            </div>
          </div>
        );
      })()}

      {/* Configuración del perfil */}
      <SectionCard title={T("profConfig")} icon={
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
        </svg>
      }>
        {(() => {
          const ROW_H = 40;
          const inputStyle: React.CSSProperties = {
            flex: 1, minWidth: 0,
            height: `${ROW_H}px`, minHeight: `${ROW_H}px`, maxHeight: `${ROW_H}px`,
            background: inputBg,
            border: `1px solid ${cardBorder}`, borderRadius: "8px",
            padding: "0 12px", color: "#9b8bc4", fontSize: "13px",
            fontFamily: "'Inter',sans-serif", outline: "none",
            boxSizing: "border-box" as const,
            appearance: "none" as const, WebkitAppearance: "none" as any,
          };
          const rowWrap: React.CSSProperties = {
            marginBottom: "10px",
          };
          const rowFlex: React.CSSProperties = {
            display: "flex", gap: "8px", alignItems: "center",
            height: `${ROW_H}px`,
          };
          const labelStyle: React.CSSProperties = {
            display: "block", fontSize: "11px", fontWeight: 600,
            color: mutedText, marginBottom: "5px", letterSpacing: "0.3px",
          };
          const actionBtnStyle: React.CSSProperties = {
            height: "30px", minHeight: "30px", maxHeight: "30px",
            padding: "0 12px", background: "#1e1535", color: "#e2d4f8",
            border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
            cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" as const,
            display: "inline-flex", alignItems: "center", flexShrink: 0,
            boxSizing: "border-box" as const,
          };
          const iconBtn: React.CSSProperties = {
            height: `${ROW_H}px`, minHeight: `${ROW_H}px`, maxHeight: `${ROW_H}px`,
            width: `${ROW_H}px`, flexShrink: 0, display: "inline-flex",
            alignItems: "center", justifyContent: "center",
            background: copied ? "#1a1035" : "#1e1535",
            border: copied ? "1px solid #22c55e40" : `1px solid ${cardBorder}`,
            borderRadius: "8px", cursor: "pointer",
            color: copied ? "#22c55e" : "#e2d4f8", transition: "all .2s",
            boxSizing: "border-box" as const,
          };
          const fieldStyle: React.CSSProperties = {
            position: "relative" as const, width: "100%",
          };
          const fullInput: React.CSSProperties = {
            ...inputStyle, flex: "unset", width: "100%",
          };
          return (
            <div style={{ maxWidth: "400px" }}>
              {/* Email */}
              <div style={rowWrap}>
                <label style={labelStyle}>{T("profEmail")}</label>
                <div style={fieldStyle}>
                  <input value={userEmail || currentUser} readOnly style={fullInput} />
                </div>
              </div>

              {/* Password */}
              <div style={rowWrap}>
                <label style={labelStyle}>{T("profPassword")}</label>
                <div style={fieldStyle}>
                  <input value="••••••••••" readOnly type="text" style={{ ...fullInput, paddingRight: "148px" }} />
                  <button
                    onClick={handleChangePassword}
                    style={{ ...actionBtnStyle, position: "absolute" as const, right: "4px", top: "50%", transform: "translateY(-50%)" }}
                  >{T("changePassword")}</button>
                </div>
              </div>

              {/* Mander ID */}
              <div style={rowWrap}>
                <label style={labelStyle}>Mander ID</label>
                <div style={fieldStyle}>
                  <div style={{ ...fullInput, display: "flex", alignItems: "center", paddingRight: "42px", letterSpacing: "0.4px", fontFamily: "'Courier New',monospace", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {manderId}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(manderId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}
                    style={{ ...iconBtn, position: "absolute" as const, right: "4px", top: "50%", transform: "translateY(-50%)", width: "30px", height: "30px", minHeight: "30px", maxHeight: "30px", borderRadius: "6px" }}
                  >
                    {copied
                      ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    }
                  </button>
                </div>
              </div>

              {/* Display name */}
              <div style={rowWrap}>
                <label style={labelStyle}>{T("profUsername")}</label>
                <div style={fieldStyle}>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    onBlur={handleNameBlur}
                    maxLength={20}
                    style={{ ...fullInput, color: "#e2d4f8" }}
                  />
                </div>
              </div>

              {/* Modo privado */}
              <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={() => handlePrivateMode(!privateMode)}
                  style={{
                    width: "42px", height: "22px", borderRadius: "999px", border: "none", cursor: "pointer", flexShrink: 0,
                    background: privateMode ? accent : "#1e1535",
                    position: "relative" as const, transition: "background .2s",
                  }}>
                  <div style={{ position: "absolute", top: "3px", left: privateMode ? "22px" : "3px", width: "16px", height: "16px", borderRadius: "50%", background: "white", transition: "left .2s" }} />
                </button>
                <div>
                  <div style={{ fontSize: "13px", color: "#e2d4f8", fontWeight: 600 }}>{T("profPrivateMode")}</div>
                  <div style={{ fontSize: "11px", color: mutedText, lineHeight: 1.5, marginTop: "2px" }}>{T("profPrivateDesc")}</div>
                </div>
              </div>
            </div>
          );
        })()}
      </SectionCard>


      {/* Cerrar sesión */}
      <div style={{ maxWidth: "420px" }}>
        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "16px 20px" }}>
          <button
            onClick={onLogout}
            style={{ display: "flex", alignItems: "center", gap: "8px", background: "#130d26", border: "1px solid #2d0a50", color: "#ff6b6b", borderRadius: "8px", padding: "10px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#2d0a50"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#130d26"; }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {T("profLogout")}
          </button>
        </div>
      </div>
    </div>
  );
}
