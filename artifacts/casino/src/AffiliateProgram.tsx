import { useState, useEffect, useCallback } from "react";
import RegisteredUsers from "./RegisteredUsers";

interface AffiliateStats {
  clicks: number;
  signups: number;
  ftds: number;
  ftd_conversion: string;
  deposit_count: number;
  deposit_amount: string;
  wager_amount: string;
  ngr: string;
  commission_earned: string;
  commission_paid: string;
  commission_balance: string;
  commission_rate: number;
}

interface Referral {
  referred_username: string;
  created_at: string;
  is_ftd: boolean;
  deposit_count: number;
  deposit_amount: string;
  wager_amount: string;
  ngr: string;
}

interface Commission {
  id: number;
  amount: string;
  type: string;
  status: string;
  created_at: string;
}

function getLocalReferrals(referrer: string): Referral[] {
  const results: Referral[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("referral_")) continue;
    const storedRef = localStorage.getItem(key) || "";
    if (storedRef.toLowerCase() !== referrer.toLowerCase()) continue;
    const referred_username = key.slice("referral_".length);
    if (!referred_username) continue;
    const wagered = parseFloat(localStorage.getItem("total_wagered_" + referred_username) || "0");
    let deposit_count = 0;
    let deposit_amount = 0;
    try {
      const txs: { type: string; status: string; amount: number }[] =
        JSON.parse(localStorage.getItem("transactions_" + referred_username) || "[]");
      const deps = txs.filter(t => t.type === "deposit" && t.status === "completed");
      deposit_count = deps.length;
      deposit_amount = deps.reduce((s, t) => s + (t.amount || 0), 0);
    } catch {}
    const is_ftd = deposit_count > 0;
    const created_at = localStorage.getItem("registered_at_" + referred_username) || new Date().toISOString();
    const ngr = Math.max(0, wagered * 0.05 - deposit_amount * 0.02);
    results.push({
      referred_username,
      created_at,
      is_ftd,
      deposit_count,
      deposit_amount: deposit_amount.toFixed(2),
      wager_amount: wagered.toFixed(2),
      ngr: ngr.toFixed(2),
    });
  }
  return results;
}

const defaultStats: AffiliateStats = {
  clicks: 0, signups: 0, ftds: 0, ftd_conversion: "0.00",
  deposit_count: 0, deposit_amount: "0.00", wager_amount: "0.00",
  ngr: "0.00", commission_earned: "0.00", commission_paid: "0.00",
  commission_balance: "0.00", commission_rate: 0.15,
};

function getLocalStats(referrer: string): AffiliateStats {
  const refs = getLocalReferrals(referrer);
  const signups = refs.length;
  const ftds = refs.filter(r => r.is_ftd).length;
  const ftd_conversion = signups > 0 ? ((ftds / signups) * 100).toFixed(2) : "0.00";
  const deposit_count = refs.reduce((s, r) => s + r.deposit_count, 0);
  const deposit_amount = refs.reduce((s, r) => s + parseFloat(r.deposit_amount), 0);
  const wager_amount = refs.reduce((s, r) => s + parseFloat(r.wager_amount), 0);
  const ngr = refs.reduce((s, r) => s + parseFloat(r.ngr), 0);
  const commission_earned = ngr * 0.15;
  return {
    clicks: 0,
    signups,
    ftds,
    ftd_conversion,
    deposit_count,
    deposit_amount: deposit_amount.toFixed(2),
    wager_amount: wager_amount.toFixed(2),
    ngr: ngr.toFixed(2),
    commission_earned: commission_earned.toFixed(2),
    commission_paid: "0.00",
    commission_balance: commission_earned.toFixed(2),
    commission_rate: 0.15,
  };
}

function fmt(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
}

const IC = {
  size: (s = 22) => ({ width: s, height: s, flexShrink: 0 as const }),
  props: (s = 22, color = "currentColor") => ({
    width: s, height: s, viewBox: "0 0 24 24",
    fill: "none", stroke: color, strokeWidth: 1.6,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    style: { flexShrink: 0 as const, display: "block" as const },
  }),
};

function IconTrendUp({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  );
}
function IconWallet({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <path d="M1 10h22"/>
      <circle cx="17" cy="15" r="1.5" fill={color} stroke="none"/>
    </svg>
  );
}
function IconBarChart({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  );
}
function IconShieldCheck({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  );
}
function IconGlobe({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}
function IconZap({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}
function IconEye({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function IconUsers({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconCoin({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 7v10"/>
      <path d="M14.5 9.5c-.5-.9-1.4-1.5-2.5-1.5a2.5 2.5 0 0 0 0 5c1.38 0 2.5 1.12 2.5 2.5a2.5 2.5 0 0 1-2.5 2.5c-1.1 0-2-.6-2.5-1.5"/>
    </svg>
  );
}
function IconPercent({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <line x1="19" y1="5" x2="5" y2="19"/>
      <circle cx="6.5" cy="6.5" r="2.5"/>
      <circle cx="17.5" cy="17.5" r="2.5"/>
    </svg>
  );
}
function IconCreditCard({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  );
}
function IconCopy({ size = 14, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}
function IconShare({ size = 14, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}
function IconClipboard({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  );
}
function IconDollarCircle({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <circle cx="12" cy="12" r="10"/>
      <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700"
        fill={color} stroke="none" fontFamily="Arial, sans-serif">$</text>
    </svg>
  );
}
function IconDeposit({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <path d="M12 2v10m0 0l-3-3m3 3l3-3"/>
      <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>
    </svg>
  );
}
function IconDice({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <rect x="2" y="2" width="20" height="20" rx="4" ry="4"/>
      <circle cx="8" cy="8" r="1.5" fill={color} stroke="none"/>
      <circle cx="16" cy="8" r="1.5" fill={color} stroke="none"/>
      <circle cx="8" cy="16" r="1.5" fill={color} stroke="none"/>
      <circle cx="16" cy="16" r="1.5" fill={color} stroke="none"/>
      <circle cx="12" cy="12" r="1.5" fill={color} stroke="none"/>
    </svg>
  );
}
function IconAward({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <circle cx="12" cy="8" r="6"/>
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  );
}

function IconCalendarClock({ size = 22, color = "currentColor" }) {
  return (
    <svg {...IC.props(size, color)}>
      <rect x="3" y="4" width="18" height="17" rx="2"/>
      <path d="M16 2v4M8 2v4M3 9h18"/>
      <circle cx="15.5" cy="15.5" r="3.5"/>
      <path d="M15.5 13.5v2l1.2 1.2"/>
    </svg>
  );
}

function IconTelegram({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13"/>
      <path d="M22 2L15 22 11 13 2 9l20-7z"/>
    </svg>
  );
}

function IconLink({ size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function IconMail({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M2 7l10 7 10-7"/>
    </svg>
  );
}

interface Props {
  username: string;
  t: (key: string) => string;
  dashboardOnly?: boolean;
  onRegister?: () => void;
}

export default function AffiliateProgram({ username, t, dashboardOnly, onRegister }: Props) {
  const [tab, setTab] = useState<"overview" | "dashboard">(dashboardOnly ? "dashboard" : "overview");
  const [refCode, setRefCode] = useState("");
  const [refLink, setRefLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [hoverCopyCode, setHoverCopyCode] = useState(false);
  const [hoverCopyLink, setHoverCopyLink] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeSaving, setCodeSaving] = useState(false);
  const [codeSaved, setCodeSaved] = useState(false);
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [stats, setStats] = useState<AffiliateStats>(defaultStats);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [periodType, setPeriodType] = useState<"all"|"month"|"custom">("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [periodDropOpen, setPeriodDropOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingCode, setLoadingCode] = useState(true);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const fetchLink = useCallback(async () => {
    if (!username) return;
    try {
      const res = await fetch(`/api/affiliate/link/${encodeURIComponent(username)}`);
      const data = await res.json();
      const code = data.ref_code || "";
      setRefCode(code);
      setCodeInput(code);
      if (code) setRefLink(`${window.location.origin}/?ref=${code}`);
    } catch {
      setRefCode("");
      setCodeInput("");
      setRefLink("");
    } finally {
      setLoadingCode(false);
    }
  }, [username]);

  async function saveCode() {
    setCodeError("");
    const clean = codeInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (clean.length < 3) { setCodeError(t("affMinChars")); return; }
    setCodeSaving(true);
    try {
      const res = await fetch(`/api/affiliate/link/${encodeURIComponent(username)}/set-code`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      const data = await res.json();
      if (!res.ok) { setCodeError(data.error || t("affSaveError")); return; }
      setRefCode(data.ref_code);
      setCodeInput(data.ref_code);
      setRefLink(`${window.location.origin}/?ref=${data.ref_code}`);
      setCodeSaved(true);
      setShowCodeForm(false);
      setTimeout(() => setCodeSaved(false), 3000);
    } catch {
      setCodeError(t("affConnError"));
    } finally {
      setCodeSaving(false);
    }
  }

  const fetchStats = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    try {
      let statsUrl = `/api/affiliate/stats/${encodeURIComponent(username)}`;
      if (periodType === "month") statsUrl += `?month=${selectedMonth}`;
      else if (periodType === "custom" && customFrom && customTo) statsUrl += `?from=${customFrom}&to=${customTo}`;
      const [statsRes, referralsRes, commissionsRes] = await Promise.all([
        fetch(statsUrl),
        fetch(`/api/affiliate/referrals/${encodeURIComponent(username)}`),
        fetch(`/api/affiliate/commissions/${encodeURIComponent(username)}`),
      ]);
      const [s, r, c] = await Promise.all([statsRes.json(), referralsRes.json(), commissionsRes.json()]);
      const apiReferrals: Referral[] = Array.isArray(r) ? r : [];
      const localReferrals = getLocalReferrals(username);
      const apiNames = new Set(apiReferrals.map(x => x.referred_username.toLowerCase()));
      const merged = [...apiReferrals, ...localReferrals.filter(l => !apiNames.has(l.referred_username.toLowerCase()))];
      setReferrals(merged);
      setCommissions(Array.isArray(c) ? c : []);
      const localStats = getLocalStats(username);
      setStats((s.signups ?? 0) > 0 ? s : localStats);
    } catch {
      const localRefs = getLocalReferrals(username);
      setReferrals(localRefs);
      setStats(getLocalStats(username));
    } finally {
      setLoading(false);
    }
  }, [username, periodType, selectedMonth, customFrom, customTo]);

  useEffect(() => {
    fetchLink();
    fetchStats();
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchLink, fetchStats]);

  function copyLink() {
    if (!refLink) return;
    navigator.clipboard.writeText(refLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyCode() {
    if (!refCode) return;
    navigator.clipboard.writeText(refCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  }

  function shareLink() {
    if (navigator.share) {
      navigator.share({ title: "Join the casino!", url: refLink });
    } else {
      copyLink();
    }
  }

  const monthOptions = Array.from({ length: 3 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return { value: `${y}-${m}`, label: d.toLocaleString("es-ES", { month: "long", year: "numeric" }) };
  });

  const currentPeriodLabel =
    periodType === "all" ? t("affAllTime")
    : periodType === "custom" ? t("affCustomDate")
    : (monthOptions.find(m => m.value === selectedMonth)?.label ?? selectedMonth);

  const cardStyle = {
    background: "#161d2b",
    border: "1px solid #20283a",
    borderRadius: "12px",
    padding: "16px",
  };

  const statCardStyle = {
    background: "#111827",
    border: "1px solid #1e2a3d",
    borderRadius: "12px",
    padding: "16px 18px",
    flex: 1,
    minWidth: 0,
  };

  const tabStyle = (active: boolean) => ({
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid #f6b531" : "2px solid transparent",
    color: active ? "#f6b531" : "#94a3b8",
    padding: "10px 4px",
    fontSize: "14px",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "color 0.2s",
  });

  const primaryBtn = {
    background: "linear-gradient(180deg,#f6b531,#e9970d)",
    border: "none",
    borderRadius: "8px",
    color: "#111",
    fontWeight: 600,
    fontSize: "13px",
    padding: "8px 14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap" as const,
  };

  const outlineBtn = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontWeight: 500,
    fontSize: "13px",
    padding: "8px 14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap" as const,
  };

  const iconBg = {
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  const features = [
    { Icon: IconTrendUp, title: t("affFeat1"), desc: t("affFeat1Desc") },
    { Icon: IconCalendarClock, title: t("affFeat2"), desc: t("affFeat2Desc") },
    { Icon: IconBarChart, title: t("affFeat3"), desc: t("affFeat3Desc") },
    { Icon: IconShieldCheck, title: t("affFeat4"), desc: t("affFeat4Desc") },
    { Icon: IconGlobe, title: t("affFeat5"), desc: t("affFeat5Desc") },
    { Icon: IconZap, title: t("affFeat6"), desc: t("affFeat6Desc") },
  ];

  const steps = [
    { num: "1", title: t("affStep1"), desc: t("affStep1Desc") },
    { num: "2", title: t("affStep2"), desc: t("affStep2Desc") },
    { num: "3", title: t("affStep3"), desc: t("affStep3Desc") },
  ];

  const statCards = [
    { label: t("affVisits"), val: stats.clicks, Icon: IconEye, hint: "Unique number of times your referral link was clicked during the selected period." },
    { label: t("affSignUps"), val: stats.signups, Icon: IconUsers, hint: "Number of players who created an account using your referral link during the selected period." },
    { label: t("affFTDs"), val: stats.ftds, Icon: IconDeposit, hint: "First Time Deposits — number of referred players who made at least one deposit during the selected period." },
    { label: t("affFTDConv"), val: `${stats.ftd_conversion}%`, Icon: IconPercent, hint: "Percentage of sign-ups who made their first deposit. Calculated as FTDs ÷ Sign Ups × 100." },
  ];

  // NGR real: calculado desde game_bets a través del endpoint de referrals (fuente de verdad)
  const ngrNum = referrals.reduce((s, r) => s + parseFloat(r.ngr || "0"), 0);
  const totalWager = referrals.reduce((s, r) => s + parseFloat(r.wager_amount || "0"), 0);
  const totalDeposit = referrals.reduce((s, r) => s + parseFloat(r.deposit_amount || "0"), 0);
  const monoCards = [
    { label: t("affDepAmt"), val: fmt(totalDeposit), raw: null, Icon: IconDollarCircle, hint: "Total amount deposited by your referred users during the selected period." },
    { label: t("affBetAmt"), val: fmt(totalWager), raw: null, Icon: IconDice, hint: "Total amount wagered by your referred users during the selected period." },
    { label: t("affNetWL"), val: (ngrNum >= 0 ? "+" : "-") + "$" + Math.abs(ngrNum).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), raw: ngrNum, Icon: IconTrendUp, hint: "The net result of your referred players' bets during the selected period. Negative value = players lost (platform profit). Positive value = players won." },
  ];

  const iconColor = "#8fa3be";

  const codePanel = username ? (
    <div style={{ border: "1px solid #1a2234", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", background: "#0d1219", borderBottom: "1px solid #1a2234" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#64748b" }}>⚙</span>
          <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
            {t("affYourCode")}
          </span>
        </div>
        <span style={{ background: "#1a2234", color: "#64748b", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 6, minWidth: 36, textAlign: "center" as const }}>
          {refCode ? "1/1" : "0/1"}
        </span>
      </div>

      {/* ── Content ── */}
      <div style={{ background: "#0f1623", padding: "16px 16px" }}>
        {/* Estado vacío: botón dashed naranja (solo si ya terminó de cargar) */}
        {!loadingCode && !refCode && !showCodeForm && (
          <button
            onClick={() => { setShowCodeForm(true); setCodeInput(""); setCodeError(""); }}
            style={{
              display: "flex", flexDirection: "column" as const,
              alignItems: "center", justifyContent: "center", gap: 6,
              width: "100%", padding: "28px 20px",
              background: "transparent",
              border: "1.5px dashed #f6b53180",
              borderRadius: 8,
              cursor: "pointer",
              transition: "border-color .15s, background .15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#f6b531"; (e.currentTarget as HTMLButtonElement).style.background = "#f6b5310a"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#f6b53180"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <span style={{ color: "#64748b", fontSize: 12 }}>{t("affNoCode")}</span>
            <span style={{ color: "#f6b531", fontSize: 14, fontWeight: 600, letterSpacing: "0.02em" }}>{t("affAddCode")}</span>
          </button>
        )}

        {/* Item de código existente */}
        {refCode && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 4px" }}>
            <div>
              <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, letterSpacing: "0.03em" }}>
                {refCode.toUpperCase()}
              </div>
              <div style={{ color: "#374151", fontSize: 12, marginTop: 2, fontFamily: "monospace" }}>
                {refLink || `${window.location.origin}/?ref=${refCode}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {/* Copiar código */}
              <div style={{ position: "relative" as const }}>
                {(hoverCopyCode || copiedCode) && (
                  <div style={{
                    position: "absolute" as const, bottom: "calc(100% + 6px)", left: "50%",
                    transform: "translateX(-50%)", whiteSpace: "nowrap" as const,
                    background: copiedCode ? "#16a34a" : "#1e2a3d",
                    color: copiedCode ? "#fff" : "#cbd5e1",
                    fontSize: 11, fontWeight: 600, padding: "4px 10px",
                    borderRadius: 6, pointerEvents: "none" as const,
                    boxShadow: "0 2px 8px #0008",
                    zIndex: 99,
                  }}>
                    {copiedCode ? t("affCopied") : t("affCopyCode")}
                  </div>
                )}
                <button
                  onClick={copyCode}
                  onMouseEnter={() => setHoverCopyCode(true)}
                  onMouseLeave={() => setHoverCopyCode(false)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 36, height: 36, borderRadius: 7,
                    background: copiedCode ? "#16a34a22" : hoverCopyCode ? "#253048" : "#1a2234",
                    border: `1px solid ${copiedCode ? "#29c46d55" : hoverCopyCode ? "#4a6080" : "#253048"}`,
                    cursor: "pointer", transition: "all .15s",
                  }}
                >
                  <IconCopy size={14} color={copiedCode ? "#29c46d" : hoverCopyCode ? "#cbd5e1" : "#64748b"} />
                </button>
              </div>

              {/* Copiar link */}
              <div style={{ position: "relative" as const }}>
                {(hoverCopyLink || copied) && (
                  <div style={{
                    position: "absolute" as const, bottom: "calc(100% + 6px)", left: "50%",
                    transform: "translateX(-50%)", whiteSpace: "nowrap" as const,
                    background: copied ? "#f6b531" : "#1e2a3d",
                    color: copied ? "#111" : "#cbd5e1",
                    fontSize: 11, fontWeight: 600, padding: "4px 10px",
                    borderRadius: 6, pointerEvents: "none" as const,
                    boxShadow: "0 2px 8px #0008",
                    zIndex: 99,
                  }}>
                    {copied ? t("affCopied") : t("affCopyLink")}
                  </div>
                )}
                <button
                  onClick={copyLink}
                  onMouseEnter={() => setHoverCopyLink(true)}
                  onMouseLeave={() => setHoverCopyLink(false)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 36, height: 36, borderRadius: 7,
                    background: copied ? "#f6b53122" : hoverCopyLink ? "#253048" : "#1a2234",
                    border: `1px solid ${copied ? "#f6b53155" : hoverCopyLink ? "#4a6080" : "#253048"}`,
                    cursor: "pointer", transition: "all .15s",
                  }}
                >
                  <IconLink size={14} color={copied ? "#f6b531" : hoverCopyLink ? "#cbd5e1" : "#64748b"} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Formulario inline para crear código */}
        {showCodeForm && (
          <div>
            <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 12 }}>
              {t("affCodeHint")}
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
              <input
                autoFocus
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")); setCodeError(""); }}
                placeholder=""
                maxLength={30}
                onKeyDown={e => { if (e.key === "Enter") saveCode(); if (e.key === "Escape") { setShowCodeForm(false); setCodeError(""); } }}
                style={{
                  flex: 1, minWidth: 150, padding: "9px 12px", borderRadius: 8,
                  border: codeError ? "1px solid #ef4444" : "1px solid #253048",
                  background: "#0a1018", color: "#e2e8f0", fontSize: 14,
                  outline: "none", fontFamily: "monospace", letterSpacing: "0.05em",
                }}
              />
              <button onClick={() => { setShowCodeForm(false); setCodeError(""); }} style={{
                padding: "9px 14px", borderRadius: 8, background: "none",
                border: "1px solid #253048", color: "#64748b", fontSize: 13, cursor: "pointer",
              }}>
                {t("affCancel")}
              </button>
              <button onClick={saveCode} disabled={codeSaving || !codeInput} style={{
                padding: "9px 18px", borderRadius: 8,
                background: "linear-gradient(180deg,#f6b531,#e9970d)",
                border: "none", color: "#111", fontWeight: 700, fontSize: 13,
                cursor: codeSaving || !codeInput ? "not-allowed" : "pointer",
                opacity: !codeInput ? 0.5 : 1,
              }}>
                {codeSaving ? t("affSaving") : t("affSave")}
              </button>
            </div>
            {codeInput && (
              <p style={{ margin: "8px 0 0", color: "#374151", fontSize: 11, fontFamily: "monospace" }}>
                {window.location.origin}/?ref={codeInput}
              </p>
            )}
            {codeError && <p style={{ margin: "6px 0 0", color: "#ef4444", fontSize: 12 }}>{codeError}</p>}
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <section style={{ maxWidth: "1080px", margin: "0 auto", padding: "0 20px 40px" }}>


      {!dashboardOnly && (
        <div style={{ display: "flex", gap: "20px", borderBottom: "1px solid #20283a", marginBottom: "20px" }}>
          <button className="aff-tab-btn" style={tabStyle(tab === "overview")} onClick={() => setTab("overview")}>{t("affOverview")}</button>
          {username && <button className="aff-tab-btn" style={tabStyle(tab === "dashboard")} onClick={() => setTab("dashboard")}>{t("affDashboard")}</button>}
        </div>
      )}

      {tab === "overview" && (
        <div>
          {/* Hero Banner + Commission Card */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "16px", alignItems: "stretch" }}>
            {/* Banner */}
            <div style={{
              flex: 1,
              borderRadius: "14px",
              overflow: "hidden",
              border: "1px solid #3a2800",
              minHeight: "170px",
              display: "flex",
            }}>
              <img
                src="/referral-banner.jpg"
                alt="Referral Banner"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>

            {/* Commission Card */}
            <div style={{
              backgroundImage: "url(/affiliate-bg.jpg)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              border: "1px solid #3a2800",
              borderRadius: "14px",
              padding: "24px 32px",
              minWidth: "160px",
              textAlign: "center",
              overflow: "hidden",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <div style={{ position:"absolute",inset:0,background:"rgba(10,8,0,0.52)",borderRadius:"14px",pointerEvents:"none" }} />
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "3px",
                background: "linear-gradient(90deg, #f6b531, #e9970d)",
                borderRadius: "14px 14px 0 0",
              }} />
              <p style={{ margin: "0 0 6px", color: "#c4bfb5", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", position: "relative", zIndex: 1 }}>
                {t("affEarnUpTo")}
              </p>
              <div style={{ fontSize: "52px", fontWeight: 900, color: "#fff", lineHeight: 1, position: "relative", zIndex: 1 }}>
                15%
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "14px", fontWeight: 600, color: "#f6b531", position: "relative", zIndex: 1 }}>
                {t("affCommission")}
              </p>
            </div>
          </div>

          {/* Sign-up prompt for guests */}
          {!username && (
            <div style={{
              background: "#0d1220",
              border: "1px solid #1e2a3d",
              borderRadius: "12px",
              padding: "14px 20px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
              flexWrap: "wrap",
              marginBottom: "20px",
            }}>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                {t("affSignUpPrompt")}
              </span>
              <button onClick={onRegister} style={{
                background: "linear-gradient(135deg,#f6b531,#d4870a)",
                border: "none", borderRadius: "8px",
                padding: "9px 20px",
                color: "#fff", fontWeight: 700, fontSize: "13px",
                cursor: "pointer", whiteSpace: "nowrap",
              }}>
                {t("affRegisterEarn")}
              </button>
            </div>
          )}

          {/* Introduction */}
          <div style={{ marginBottom: "40px" }}>
            <p style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("affIntroTitle")}</p>
            <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.7, margin: "0 0 8px" }}>
              {t("affIntroPara1")}
            </p>
            <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.7, margin: 0 }}>
              {t("affIntroPara2")}
            </p>
          </div>

          {/* Features */}
          <div style={{ marginBottom: "40px" }}>
            <p style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>
              {t("affWhyJoin")}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px" }}>
              {features.map(({ Icon, title, desc }, i) => (
                <div key={i} style={{ ...cardStyle, display: "flex", alignItems: "flex-start", gap: "14px", padding: "14px 16px" }}>
                  <div style={iconBg}>
                    <Icon size={20} color={iconColor} />
                  </div>
                  <div>
                    <div style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>{title}</div>
                    <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* How to Enroll */}
          <div>
            <p style={{ color: "#e2e8f0", fontSize: "16px", fontWeight: 800, marginBottom: "32px", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {t("affHowItWorks")}
            </p>

            {/* Circles row with connecting line */}
            <div style={{ position: "relative", display: "flex", justifyContent: "space-around", marginBottom: "20px" }}>
              {/* Connecting line */}
              <div style={{
                position: "absolute", top: "50%", left: "calc(100% / 6)", right: "calc(100% / 6)",
                height: "1px", background: "#20283a", transform: "translateY(-50%)", zIndex: 0,
              }} />
              {steps.map((s, i) => (
                <div key={i} style={{ position: "relative", zIndex: 1 }}>
                  <div style={{
                    width: "44px", height: "44px", borderRadius: "50%",
                    border: "2px solid #f6b531",
                    background: "#111827",
                    color: "#f6b531", fontWeight: 700, fontSize: "16px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {s.num}
                  </div>
                </div>
              ))}
            </div>

            {/* Text row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", textAlign: "center" }}>
              {steps.map((s, i) => (
                <div key={i}>
                  <div style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {s.title}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: 1.6 }}>
                    {s.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          {(() => {
            const faqs = [
              {
                q: t("affFaq1Q"),
                a: t("affFaq1A"),
              },
              {
                q: t("affFaq2Q"),
                a: t("affFaq2A"),
              },
              {
                q: t("affFaq3Q"),
                a: t("affFaq3A"),
              },
              {
                q: t("affFaq4Q"),
                a: (
                  <div>
                    <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: "13px", lineHeight: 1.7 }}>
                      {t("affFaq4ContactText")}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <a href="mailto:partners@manderbet.com" className="aff-contact-link" style={{
                        display: "inline-flex", alignItems: "center", gap: "10px",
                        color: "#e2e8f0", fontSize: "13px", textDecoration: "none", transition: "color 0.15s ease",
                      }}>
                        <div className="aff-contact-icon" style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(246,181,49,0.1)", border: "1px solid rgba(246,181,49,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s ease, border-color 0.15s ease" }}>
                          <IconMail size={15} color="#f6b531" />
                        </div>
                        <span><span style={{ color: "#94a3b8" }}>Email:</span> partners@manderbet.com</span>
                      </a>
                    </div>
                  </div>
                ),
              },
            ];
            return (
              <div style={{ marginTop: "48px" }}>
                <p style={{ color: "#e2e8f0", fontSize: "16px", fontWeight: 800, marginBottom: "28px", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("affFaq")}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {faqs.map((faq, i) => (
                    <div
                      key={i}
                      style={{
                        background: "#161d2b",
                        border: "1px solid #1e2a3d",
                        borderRadius: "10px",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                        className="aff-faq-btn"
                        style={{
                          width: "100%", background: "none", border: "none",
                          padding: "16px 20px", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                          color: "#e2e8f0", fontSize: "13px", fontWeight: 600, textAlign: "left",
                          transition: "background 0.15s ease",
                        }}
                      >
                        <span>{faq.q}</span>
                        <svg
                          width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{
                            flexShrink: 0,
                            transform: faqOpen === i ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s ease",
                          }}
                        >
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>
                      {faqOpen === i && (
                        <div style={{
                          padding: "0 20px 18px",
                          color: "#94a3b8", fontSize: "13px", lineHeight: 1.7,
                          whiteSpace: "pre-line",
                          animation: "pwdReqIn 0.18s ease",
                        }}>
                          {faq.a}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {tab === "dashboard" && (
        <div>
          {activeTooltip && (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 98 }}
              onClick={() => setActiveTooltip(null)}
            />
          )}
          {/* Filter Bar */}
          <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", padding: "12px 16px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ color: "#94a3b8", fontSize: "13px" }}>{t("affFilterDate")}</span>

              {/* Custom dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setPeriodDropOpen(o => !o)}
                  className="aff-period-btn"
                  style={{ background: "#0e1623", border: "1px solid #1e2a3d", borderRadius: "8px", color: "#e2e8f0", padding: "6px 28px 6px 12px", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", minWidth: "170px", justifyContent: "space-between", position: "relative" }}
                >
                  <span>{currentPeriodLabel}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition:"transform .2s", transform: periodDropOpen ? "rotate(180deg)" : "rotate(0deg)", flexShrink:0 }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                {periodDropOpen && (
                  <>
                    <div style={{ position:"fixed", inset:0, zIndex:199 }} onClick={() => setPeriodDropOpen(false)} />
                    <div style={{ position:"absolute", top:"calc(100% + 6px)", left:0, minWidth:"200px", background:"#111827", border:"1px solid #1e2a3d", borderRadius:"10px", zIndex:200, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,0.5)" }}>
                      {/* All Time */}
                      <div
                        onClick={() => { setPeriodType("all"); setPeriodDropOpen(false); }}
                        style={{ padding:"9px 14px", fontSize:"13px", color: periodType==="all" ? "#f6b531" : "#e2e8f0", cursor:"pointer", background: periodType==="all" ? "rgba(246,181,49,0.08)" : "transparent", fontWeight: periodType==="all" ? 600 : 400 }}
                        onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.04)")}
                        onMouseLeave={e=>(e.currentTarget.style.background=periodType==="all"?"rgba(246,181,49,0.08)":"transparent")}
                      >{t("affAllTime")}</div>
                      {/* Custom Date */}
                      <div
                        onClick={() => { setPeriodType("custom"); setPeriodDropOpen(false); }}
                        style={{ padding:"9px 14px", fontSize:"13px", color: periodType==="custom" ? "#f6b531" : "#e2e8f0", cursor:"pointer", background: periodType==="custom" ? "rgba(246,181,49,0.15)" : "transparent", fontWeight: periodType==="custom" ? 600 : 400, borderBottom:"1px solid #1e2a3d" }}
                        onMouseEnter={e=>(e.currentTarget.style.background=periodType==="custom"?"rgba(246,181,49,0.15)":"rgba(255,255,255,0.04)")}
                        onMouseLeave={e=>(e.currentTarget.style.background=periodType==="custom"?"rgba(246,181,49,0.15)":"transparent")}
                      >{t("affCustomDate")}</div>
                      {/* Month options */}
                      {monthOptions.map(m => (
                        <div
                          key={m.value}
                          onClick={() => { setPeriodType("month"); setSelectedMonth(m.value); setPeriodDropOpen(false); }}
                          style={{ padding:"9px 14px", fontSize:"13px", color: periodType==="month" && selectedMonth===m.value ? "#f6b531" : "#94a3b8", cursor:"pointer", background: periodType==="month" && selectedMonth===m.value ? "rgba(246,181,49,0.08)" : "transparent" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.04)")}
                          onMouseLeave={e=>(e.currentTarget.style.background=periodType==="month"&&selectedMonth===m.value?"rgba(246,181,49,0.08)":"transparent")}
                        >{m.label}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Custom date range picker */}
              {periodType === "custom" && (
                <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
                  {/* Desde — input invisible covers full box; CSS makes calendar indicator fill it */}
                  <div className="aff-date-box" style={{ position:"relative", display:"flex", alignItems:"center", gap:"6px", background:"#0e1623", border:"1px solid #1e2a3d", borderRadius:"8px", padding:"5px 10px", cursor:"pointer", minWidth:"170px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, pointerEvents:"none" }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span style={{ color:"#94a3b8", fontSize:"12px", pointerEvents:"none" }}>{t("affFrom")}</span>
                    <span style={{ color: customFrom ? "#e2e8f0" : "#556070", fontSize:"13px", pointerEvents:"none" }}>
                      {customFrom ? customFrom.split("-").reverse().join("/") : "dd/mm/aaaa"}
                    </span>
                    <input
                      type="date"
                      className="aff-date-input"
                      value={customFrom}
                      max={customTo || new Date().toISOString().slice(0,10)}
                      onChange={e => {
                        const val = e.target.value;
                        setCustomFrom(val);
                        if (customTo && val > customTo) setCustomTo("");
                      }}
                      style={{ position:"absolute", inset:0, opacity:0, width:"100%", height:"100%", cursor:"pointer", colorScheme:"dark" }}
                    />
                  </div>
                  <span style={{ color:"#556070", fontSize:"13px" }}>—</span>
                  {/* Hasta */}
                  <div className="aff-date-box" style={{ position:"relative", display:"flex", alignItems:"center", gap:"6px", background:"#0e1623", border:"1px solid #1e2a3d", borderRadius:"8px", padding:"5px 10px", cursor:"pointer", minWidth:"170px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, pointerEvents:"none" }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span style={{ color:"#94a3b8", fontSize:"12px", pointerEvents:"none" }}>{t("affTo")}</span>
                    <span style={{ color: customTo ? "#e2e8f0" : "#556070", fontSize:"13px", pointerEvents:"none" }}>
                      {customTo ? customTo.split("-").reverse().join("/") : "dd/mm/aaaa"}
                    </span>
                    <input
                      type="date"
                      className="aff-date-input"
                      value={customTo}
                      min={customFrom || undefined}
                      max={new Date().toISOString().slice(0,10)}
                      onChange={e => setCustomTo(e.target.value)}
                      style={{ position:"absolute", inset:0, opacity:0, width:"100%", height:"100%", cursor:"pointer", colorScheme:"dark" }}
                    />
                  </div>
                </div>
              )}
            </div>
            <span style={{ color: "#94a3b8", fontSize: "12px" }}>
              {loading ? t("affLoading") : t("affDataUpdates")}
            </span>
          </div>

          {codePanel}

          {/* Traffic & Conversion */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}>{t("affTraffic")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
              {statCards.map(({ label, val, Icon, hint }, i) => {
                const tKey = `stat-${i}`;
                return (
                  <div key={i} style={{ ...statCardStyle, position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                      <span style={{ color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === tKey ? null : tKey); }}
                          className="aff-info-btn"
                          style={{ background: "none", border: "none", padding: "0 2px", cursor: "pointer", color: activeTooltip === tKey ? "#f6b531" : "#556070", fontSize: "13px", lineHeight: 1, display: "flex", alignItems: "center", transition: "color 0.15s ease" }}
                        >ⓘ</button>
                        {activeTooltip === tKey && (
                          <div style={{
                            position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                            transform: "translateX(-50%)", width: "220px",
                            background: "#0e1623", border: "1px solid #1e2a3d",
                            borderRadius: "10px", padding: "12px 14px",
                            color: "#c4bfb5", fontSize: "12px", lineHeight: 1.6,
                            zIndex: 99, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                            animation: "tooltipIn 0.18s ease forwards",
                            pointerEvents: "none",
                          }}>
                            {hint}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ color: "#f2f3f7", fontSize: "22px", fontWeight: 700 }}>{val}</span>
                      <div style={{ opacity: 0.3 }}>
                        <Icon size={28} color="#ffffff" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monetization */}
          <div style={{ marginBottom: "24px" }}>
            <p style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}>{t("affMonetization")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
              {monoCards.map(({ label, val, raw, Icon, hint }, i) => {
                const tKey = `mono-${i}`;
                const valColor = raw === null ? "#f2f3f7" : raw >= 0 ? "#22c55e" : "#f87171";
                return (
                  <div key={i} style={{ ...statCardStyle, position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                      <span style={{ color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === tKey ? null : tKey); }}
                          className="aff-info-btn"
                          style={{ background: "none", border: "none", padding: "0 2px", cursor: "pointer", color: activeTooltip === tKey ? "#f6b531" : "#556070", fontSize: "13px", lineHeight: 1, display: "flex", alignItems: "center", transition: "color 0.15s ease" }}
                        >ⓘ</button>
                        {activeTooltip === tKey && (
                          <div style={{
                            position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                            transform: "translateX(-50%)", width: "220px",
                            background: "#0e1623", border: "1px solid #1e2a3d",
                            borderRadius: "10px", padding: "12px 14px",
                            color: "#c4bfb5", fontSize: "12px", lineHeight: 1.6,
                            zIndex: 99, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                            animation: "tooltipIn 0.18s ease forwards",
                            pointerEvents: "none",
                          }}>
                            {hint}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ color: valColor, fontSize: "20px", fontWeight: 700 }}>{val}</span>
                      <div style={{ opacity: 0.25 }}>
                        <Icon size={24} color="#ffffff" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}
      {tab === "dashboard" && username && <RegisteredUsers referrer={username} referrals={referrals} t={t} />}

    </section>
  );
}
