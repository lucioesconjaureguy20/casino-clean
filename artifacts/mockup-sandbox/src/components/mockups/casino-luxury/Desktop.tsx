const GOLD = "#D6B25E";
const GOLD_HOVER = "#E3C978";
const BG = "#0B0D12";
const CARD = "#121620";
const BORDER = "#1C2330";
const MUTED = "#4A5568";
const TEXT = "#E2E8F0";
const TEXT_DIM = "#718096";

const games = [
  { name: "Dice", tag: "Mander Originals", color: "#4F8EF7", emoji: "🎲" },
  { name: "Plinko", tag: "Mander Originals", color: "#9B59B6", emoji: "🔮" },
  { name: "Mines", tag: "Mander Originals", color: "#E74C3C", emoji: "💣" },
  { name: "Keno", tag: "Mander Originals", color: "#1ABC9C", emoji: "🎯" },
  { name: "HiLo", tag: "Mander Originals", color: "#F39C12", emoji: "🃏" },
  { name: "Roulette", tag: "Mander Originals", color: "#E67E22", emoji: "🎡" },
  { name: "Blackjack", tag: "Mander Originals", color: "#27AE60", emoji: "♠️" },
  { name: "Limbo", tag: "Mander Originals", color: "#3498DB", emoji: "🚀" },
];

const navItems = [
  { icon: "🏠", label: "Home", active: true },
  { icon: "🎮", label: "Originals", active: false },
  { icon: "🏆", label: "Rewards", active: false },
  { icon: "👥", label: "Referrals", active: false },
  { icon: "🔒", label: "Fairness", active: false },
  { icon: "ℹ️", label: "About Us", active: false },
  { icon: "✉️", label: "Contact", active: false },
  { icon: "💬", label: "Live Support", active: false },
];

const recentWins = [
  { game: "Mines", user: "crypto***", amount: "+$6.50", color: "#E74C3C" },
  { game: "Keno", user: "mand***", amount: "+$14.61", color: "#1ABC9C" },
  { game: "Dice", user: "play***", amount: "+$3.54", color: "#4F8EF7" },
  { game: "Plinko", user: "vip***", amount: "+$9.20", color: "#9B59B6" },
  { game: "HiLo", user: "fast***", amount: "+$2.30", color: "#F39C12" },
];

export function Desktop() {
  return (
    <div style={{ width: 1280, height: 900, background: BG, display: "flex", flexDirection: "column", fontFamily: "'Inter', system-ui, sans-serif", overflow: "hidden" }}>

      {/* NAVBAR */}
      <div style={{ height: 56, background: `${CARD}ee`, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 20, backdropFilter: "blur(12px)", zIndex: 10, flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 16 }}>
          <div style={{ width: 28, height: 28, background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HOVER})`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>♛</div>
          <span style={{ color: GOLD, fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px" }}>Mander</span>
          <span style={{ color: TEXT, fontWeight: 300, fontSize: 18 }}>Bet</span>
        </div>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
          {["Casino", "Originals", "Live"].map((item, i) => (
            <div key={item} style={{ padding: "6px 14px", borderRadius: 6, color: i === 0 ? GOLD : TEXT_DIM, fontWeight: i === 0 ? 600 : 400, fontSize: 13, cursor: "pointer", background: i === 0 ? `${GOLD}14` : "transparent", borderBottom: i === 0 ? `1.5px solid ${GOLD}` : "1.5px solid transparent" }}>
              {item}
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0D1018", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 12px", width: 200 }}>
          <span style={{ color: MUTED, fontSize: 13 }}>🔍</span>
          <span style={{ color: MUTED, fontSize: 13 }}>Search games...</span>
        </div>

        {/* Auth buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ padding: "7px 18px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "transparent", color: TEXT, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Sign In</button>
          <button style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HOVER})`, color: "#0B0D12", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 16px ${GOLD}30` }}>Register</button>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* SIDEBAR */}
        <div style={{ width: 200, background: CARD, borderRight: `1px solid ${BORDER}`, padding: "16px 0", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          {navItems.map(({ icon, label, active }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", margin: "0 8px", borderRadius: 8, background: active ? `${GOLD}12` : "transparent", borderLeft: active ? `2px solid ${GOLD}` : "2px solid transparent", cursor: "pointer" }}>
              <span style={{ fontSize: 15 }}>{icon}</span>
              <span style={{ color: active ? GOLD : TEXT_DIM, fontSize: 13, fontWeight: active ? 600 : 400 }}>{label}</span>
            </div>
          ))}

          <div style={{ flex: 1 }} />

          {/* Language selector */}
          <div style={{ margin: "0 8px", padding: "9px 16px", borderRadius: 8, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>🇺🇸</span>
            <span style={{ color: TEXT_DIM, fontSize: 12 }}>English</span>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 28 }}>

          {/* Hero banner */}
          <div style={{ borderRadius: 16, background: `linear-gradient(120deg, #0D1018 0%, #13192A 50%, #0B0D12 100%)`, border: `1px solid ${BORDER}`, padding: "32px 36px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -40, right: 120, width: 200, height: 200, background: `${GOLD}08`, borderRadius: "50%", filter: "blur(60px)" }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "2px", color: GOLD, textTransform: "uppercase", marginBottom: 10 }}>No Waiting. Just Play.</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: TEXT, lineHeight: 1.2, marginBottom: 8 }}>Fast Deposits &<br />Withdrawals</div>
              <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 24 }}>Your money moves faster than the reels.</div>
              <button style={{ padding: "10px 24px", borderRadius: 10, background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HOVER})`, color: "#0B0D12", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer", boxShadow: `0 6px 20px ${GOLD}35` }}>Join Now →</button>
            </div>
            <div style={{ fontSize: 80, opacity: 0.15 }}>💰</div>
          </div>

          {/* Recent Wins */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 3, height: 16, background: GOLD, borderRadius: 2 }} />
              <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>Recent Wins</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {recentWins.map((w) => (
                <div key={w.game} style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: w.color }} />
                    <span style={{ color: TEXT_DIM, fontSize: 11 }}>{w.game}</span>
                  </div>
                  <span style={{ color: TEXT, fontSize: 12, fontWeight: 500 }}>{w.user}</span>
                  <span style={{ color: "#48BB78", fontSize: 13, fontWeight: 700 }}>{w.amount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Originals section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 3, height: 16, background: GOLD, borderRadius: 2 }} />
              <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>Mander Originals</span>
              <div style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 6, border: `1px solid ${BORDER}`, color: TEXT_DIM, fontSize: 12, cursor: "pointer" }}>View all →</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {games.map((g) => (
                <div key={g.name} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", cursor: "pointer", transition: "all .2s" }}>
                  <div style={{ height: 100, background: `linear-gradient(135deg, ${g.color}22, ${g.color}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, transparent 60%, ${CARD})` }} />
                    {g.emoji}
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ color: TEXT, fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                    <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 2 }}>{g.tag}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT PANEL — Welcome */}
        <div style={{ width: 240, background: CARD, borderLeft: `1px solid ${BORDER}`, padding: 20, display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: "center", paddingBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", color: TEXT_DIM, marginBottom: 4 }}>Welcome to</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              <span style={{ color: TEXT }}>Mander</span>
              <span style={{ color: GOLD }}>!</span>
            </div>
          </div>
          <button style={{ width: "100%", padding: "11px 0", borderRadius: 10, background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HOVER})`, color: "#0B0D12", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer", boxShadow: `0 4px 16px ${GOLD}30` }}>Join Now</button>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Provably Fair", desc: "Verified randomness" },
              { label: "Fast Withdrawals", desc: "Crypto in minutes" },
              { label: "VIP Rewards", desc: "Earn as you play" },
            ].map((f) => (
              <div key={f.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ color: TEXT, fontSize: 12, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ color: TEXT_DIM, fontSize: 11 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
