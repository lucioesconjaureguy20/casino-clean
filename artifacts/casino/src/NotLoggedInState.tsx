interface NotLoggedInStateProps {
  variant: "deposit" | "transactions";
  onLogin: () => void;
  onRegister: () => void;
}

export default function NotLoggedInState({ variant, onLogin, onRegister }: NotLoggedInStateProps) {
  const isDeposit = variant === "deposit";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "52px 24px 48px",
      textAlign: "center",
      animation: "nlsfadeIn .35s ease",
    }}>
      <div style={{ marginBottom: "22px", position: "relative" }}>
        <div style={{
          width: "72px", height: "72px",
          borderRadius: "50%",
          background: "rgba(246,181,49,.08)",
          border: "1px solid rgba(246,181,49,.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto",
        }}>
          <svg viewBox="0 0 36 36" width="34" height="34" fill="none">
            <rect x="7" y="16" width="22" height="15" rx="3.5"
              stroke="#f6b531" strokeWidth="1.6" fill="rgba(246,181,49,.1)"/>
            <path d="M11.5 16v-5a6.5 6.5 0 0 1 13 0v5"
              stroke="#f6b531" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="18" cy="23.5" r="2" fill="#f6b531"/>
            <line x1="18" y1="25.5" x2="18" y2="28"
              stroke="#f6b531" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{
          position: "absolute", top: "-4px", right: "calc(50% - 44px)",
          width: "10px", height: "10px", borderRadius: "50%",
          background: "rgba(246,181,49,.25)",
        }}/>
        <div style={{
          position: "absolute", bottom: "2px", left: "calc(50% - 44px)",
          width: "6px", height: "6px", borderRadius: "50%",
          background: "rgba(246,181,49,.2)",
        }}/>
      </div>

      <h3 style={{
        margin: "0 0 10px",
        fontSize: "17px",
        fontWeight: 700,
        color: "#e2e8f0",
        letterSpacing: "-0.2px",
      }}>
        {isDeposit
          ? "Inicia sesión para agregar fondos"
          : "Inicia sesión para ver tus transacciones"}
      </h3>

      <p style={{
        margin: "0 0 30px",
        fontSize: "13.5px",
        color: "#6a7a99",
        maxWidth: "260px",
        lineHeight: 1.65,
      }}>
        {isDeposit
          ? "Crea una cuenta o inicia sesión para depositar y gestionar tus fondos."
          : "Inicia sesión para ver tu historial completo de depósitos y retiros."}
      </p>

      <div style={{ display: "flex", gap: "10px", width: "100%", maxWidth: "270px" }}>
        <button
          onClick={onLogin}
          onMouseEnter={e => {
            e.currentTarget.style.filter = "brightness(1.1)";
            e.currentTarget.style.transform = "scale(1.03)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.filter = "";
            e.currentTarget.style.transform = "";
          }}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: "10px",
            border: "none",
            background: "linear-gradient(180deg,#f6b531,#ea9807)",
            color: "#111",
            fontWeight: 700,
            fontSize: "14px",
            cursor: "pointer",
            transition: "filter .15s, transform .15s",
            fontFamily: "inherit",
          }}>
          Iniciar sesión
        </button>
        <button
          onClick={onRegister}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#232d42";
            e.currentTarget.style.transform = "scale(1.03)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "#1a2235";
            e.currentTarget.style.transform = "";
          }}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: "10px",
            border: "1px solid #2a3650",
            background: "#1a2235",
            color: "#c8d4e8",
            fontWeight: 600,
            fontSize: "14px",
            cursor: "pointer",
            transition: "background .15s, transform .15s",
            fontFamily: "inherit",
          }}>
          Registro
        </button>
      </div>
    </div>
  );
}
