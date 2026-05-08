const GOLD = "#D6B25E";
const GOLD_HOVER = "#E3C978";
const BG = "#0B0D12";
const CARD = "#121620";
const BORDER = "#1C2330";
const MUTED = "#4A5568";
const TEXT = "#E2E8F0";
const TEXT_DIM = "#718096";

const games = [
  { name: "Dice", color: "#4F8EF7", emoji: "🎲" },
  { name: "Plinko", color: "#9B59B6", emoji: "🔮" },
  { name: "Mines", color: "#E74C3C", emoji: "💣" },
  { name: "Keno", color: "#1ABC9C", emoji: "🎯" },
  { name: "HiLo", color: "#F39C12", emoji: "🃏" },
  { name: "Roulette", color: "#E67E22", emoji: "🎡" },
];

const recentWins = [
  { game: "Mines", user: "cry***", amount: "+$6.50", color: "#E74C3C" },
  { game: "Keno", user: "vip***", amount: "+$14.61", color: "#1ABC9C" },
  { game: "Dice", user: "pla***", amount: "+$3.54", color: "#4F8EF7" },
];

export function Mobile() {
  return (
    <div style={{ width: 390, height: 844, background: BG, display: "flex", flexDirection: "column", fontFamily: "'Inter', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>

      {/* HEADER */}
      <div style={{ height: 52, background: `${CARD}f0`, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", backdropFilter: "blur(12px)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 24, height: 24, background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HOVER})`, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>♛</div>
          <span style={{ color: GOLD, fontWeight: 800, fontSize: 16 }}>Mander</span>
          <span style={{ color: TEXT, fontWeight: 300, fontSize: 16 }}>Bet</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${BORDER}`, background: "transparent", color: TEXT, fontSize: 12, fontWeight: 500 }}>Sign In</button>
          <button style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HOVER})`, color: "#0B0D12", fontSize: 12, fontWeight: 700, boxShadow: `0 3px 12px ${GOLD}30` }}>Register</button>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 20, paddingBottom: 70 }}>

        {/* Hero */}
        <div style={{ borderRadius: 14, background: `linear-gradient(120deg, #0D1018 0%, #13192A 100%)`, border: `1px solid ${BORDER}`, padding: "22px 20px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -30, right: -10, width: 120, height: 120, background: `${GOLD}08`, borderRadius: "50%", filter: "blur(40px)" }} />
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "2px", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>No Waiting. Just Play.</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, lineHeight: 1.2, marginBottom: 6 }}>Fast Deposits &<br />Withdrawals</div>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 18 }}>Your money moves faster than the reels.</div>
          <button style={{ padding: "9px 20px", borderRadius: 9, background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HOVER})`, color: "#0B0D12", fontWeight: 700, fontSize: 13, border: "none", boxShadow: `0 4px 16px ${GOLD}30` }}>Join Now →</button>
        </div>

        {/* Recent Wins */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <div style={{ width: 3, height: 14, background: GOLD, borderRadius: 2 }} />
            <span style={{ color: TEXT, fontWeight: 600, fontSize: 13 }}>Recent Wins</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {recentWins.map((w) => (
              <div key={w.game} style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: w.color }} />
                  <span style={{ color: TEXT_DIM, fontSize: 10 }}>{w.game}</span>
                </div>
                <span style={{ color: TEXT, fontSize: 11, display: "block" }}>{w.user}</span>
                <span style={{ color: "#48BB78", fontSize: 12, fontWeight: 700 }}>{w.amount}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Games Grid */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <div style={{ width: 3, height: 14, background: GOLD, borderRadius: 2 }} />
            <span style={{ color: TEXT, fontWeight: 600, fontSize: 13 }}>Mander Originals</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {games.map((g) => (
              <div key={g.name} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ height: 72, background: `linear-gradient(135deg, ${g.color}22, ${g.color}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, transparent 50%, ${CARD})` }} />
                  {g.emoji}
                </div>
                <div style={{ padding: "7px 8px" }}>
                  <div style={{ color: TEXT, fontWeight: 600, fontSize: 11 }}>{g.name}</div>
                  <div style={{ color: TEXT_DIM, fontSize: 10 }}>Originals</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* VIP Banner */}
        <div style={{ borderRadius: 12, border: `1px solid ${GOLD}30`, background: `${GOLD}08`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>👑</div>
          <div>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>VIP Rewards</div>
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 2 }}>Earn points with every bet</div>
          </div>
          <div style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 7, background: `linear-gradient(135deg, ${GOLD}, ${GOLD_HOVER})`, color: "#0B0D12", fontSize: 11, fontWeight: 700 }}>Join</div>
        </div>

      </div>

      {/* BOTTOM NAV */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: `${CARD}f8`, borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-around", backdropFilter: "blur(12px)" }}>
        {[
          { icon: "🏠", label: "Home", active: true },
          { icon: "🎮", label: "Games", active: false },
          { icon: "🏆", label: "Rewards", active: false },
          { icon: "👤", label: "Profile", active: false },
          { icon: "💬", label: "Support", active: false },
        ].map(({ icon, label, active }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ fontSize: 9, color: active ? GOLD : TEXT_DIM, fontWeight: active ? 600 : 400 }}>{label}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
