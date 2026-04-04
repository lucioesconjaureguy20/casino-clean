import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase, authSignUp, authLogin, authLogout, authForgotPassword, getOrRefreshSession, clearSession, type AuthSession } from "./auth";
import BlackjackGame, { BJStats, bjStatsDefault } from "./BlackjackGame";
import MinesGame, { MinesStats, minesStatsDefault } from "./MinesGame";
import HiloGame, { HiloStats, hiloStatsDefault } from "./HiloGame";
import RouletteGame, { RouletteStats, rouletteStatsDefault } from "./RouletteGame";
import BaccaratGame, { BaccaratStats, baccaratStatsDefault } from "./BaccaratGame";
import AffiliateProgram from "./AffiliateProgram";
import RegisteredUsers from "./RegisteredUsers";
import AdminPanel from "./AdminPanel";
import ProfilePage from "./ProfilePage";
import NotLoggedInState from "./NotLoggedInState";
import { VIP_RANKS, getRankIndex, getVipInfo, getRakebackBalances, distributeRakeback, claimInstantRakeback, claimPeriodicRakeback, canClaimInstant, canClaimPeriodic, timeUntilInstant, timeUntilClaim, saveRewardClaim, getRewardHistory } from "./vipSystem";
import type { RewardRecord } from "./vipSystem";
import { getHouseEdge } from "./houseEdge";
import Matter from "matter-js";
import "flag-icons/css/flag-icons.min.css";

// ─── TRANSLATIONS ────────────────────────────────────────────────────────────
const LANGS: Record<string, Record<string, string>> = {
  es: {
    login:"Iniciar Sesión", register:"Registrarse", username:"Usuario", password:"Contraseña",
    enter:"Entrar", noAccount:"¿No tenés cuenta?", createAccount:"Crear Cuenta",
    createAccountBtn:"Crear cuenta", back:"Volver", accountCreated:"Cuenta creada correctamente",
    errUser:"Usuario no encontrado", errPass:"Contraseña incorrecta",
    errFillAll:"Completa todos los campos", errUserExists:"El usuario ya existe",
    home:"Home", casino:"Casino", originals:"Juegos Originales", rewards:"Recompensas",
    referrals:"Referidos", providers:"Proveedores", fairness:"Fairness", support:"Soporte",
    deposit:"Depositar", withdraw:"Retirar",
    history:"Historial", profile:"Perfil", transactions:"Transacciones",
    betAmount:"Monto de Apuesta", toWin:"Al ganar", bet:"Apostar", clear:"Limpiar",
    rolling:"⏳ Tirando...", insufficientBalance:"Saldo insuficiente",
    manual:"Manual", automatic:"Automático", numberOfBets:"Número de Apuestas",
    startAuto:"Iniciar Auto", stopAuto:"Detener Auto",
    profitLabel:"Beneficio", won:"Ganadas", wagered:"Apostado", lostLabel:"Perdidas",
    balance:"Saldo", game:"Juego", amount:"Apuesta", multiplier:"Multiplicador",
    result:"Resultado", date:"Fecha", win:"Ganancia", loss:"Pérdida",
    noHistory:"Todavía no hiciste apuestas.", profileTitle:"Perfil", myProfile:"Mi Perfil",
    creditedAmount:"Monto acreditado", noDeposits:"Todavía no hiciste depósitos.",
    lastDeposit:"Último depósito", totalWagered:"TOTAL APOSTADO", totalWins:"TOTAL GANANCIAS",
    rollOver:"Roll Over", rollUnder:"Roll Under", multiplierLabel:"Multiplicador",
    chance:"Probabilidad", liveStats:"Estadísticas en Vivo",
    searchPlaceholder:"Buscar juego...", allGames:"Todos los Juegos",
    depositTitle:"Depósito", coin:"Crypto", network:"Red", address:"Dirección",
    copyAddress:"Copiar dirección", addressCopied:"¡Dirección copiada!", minDeposit:"Mínimo:",
    withdrawTitle:"Retiro", withdrawAmount:"Monto a retirar", withdrawAddress:"Dirección de retiro",
    withdrawBtn:"Solicitar Retiro", available:"Disponible:", fee:"Comisión:",
    vipTitle:"VIP & Recompensas", verified:"Verificado", notVerified:"No Verificado",
    currentBalance:"Saldo actual", memberSince:"Miembro desde",
    referralLink:"Tu link de referido",
    referralDesc:"Compartí tu link y ganá recompensas por cada amigo que se una.",
    copy:"Copiar", infiniteLabel:"Infinitas", search:"Buscar",
    rollOverLabel:"Roll Over", rollUnderLabel:"Roll Under",
    tipsBonuses:"Bonos & Propinas", noTransactions:"Sin transacciones.",
    language:"Idioma",
    myBets:"Mis Apuestas", time:"Hora", drawing:"Sorteando...",
    selectNumbers:"Seleccioná números", autoQuickPick:"Selección\nAutomática",
    clearBoard:"Limpiar Mesa", selectedNums:"Números Seleccionados",
    minBet:"Mínimo de apuesta:", minBetsCount:"Ingresá un número de apuestas válido (mínimo 1)",
    noBetsYet:"Sin apuestas todavía",
  },
  en: {
    login:"Sign In", register:"Register", username:"Username", password:"Password",
    enter:"Sign In", noAccount:"Don't have an account?", createAccount:"Create Account",
    createAccountBtn:"Create Account", back:"Back", accountCreated:"Account created successfully",
    errUser:"User not found", errPass:"Incorrect password",
    errFillAll:"Please fill in all fields", errUserExists:"Username already exists",
    home:"Home", casino:"Casino", originals:"Original Games", rewards:"Rewards",
    referrals:"Referrals", providers:"Providers", fairness:"Fairness", support:"Support",
    deposit:"Deposit", withdraw:"Withdraw",
    history:"History", profile:"Profile", transactions:"Transactions",
    betAmount:"Bet Amount", toWin:"To Win", bet:"Bet", clear:"Clear",
    rolling:"⏳ Rolling...", insufficientBalance:"Insufficient Balance",
    manual:"Manual", automatic:"Automatic", numberOfBets:"Number of Bets",
    startAuto:"Start Auto", stopAuto:"Stop Auto",
    profitLabel:"Profit", won:"Won", wagered:"Wagered", lostLabel:"Lost",
    balance:"Balance", game:"Game", amount:"Bet", multiplier:"Multiplier",
    result:"Result", date:"Date", win:"Win", loss:"Loss",
    noHistory:"You haven't placed any bets yet.", profileTitle:"Profile", myProfile:"My Profile",
    creditedAmount:"Credited Amount", noDeposits:"No deposits yet.",
    lastDeposit:"Last Deposit", totalWagered:"TOTAL WAGERED", totalWins:"TOTAL WINS",
    rollOver:"Roll Over", rollUnder:"Roll Under", multiplierLabel:"Multiplier",
    chance:"Win Chance", liveStats:"Live Statistics",
    searchPlaceholder:"Search game...", allGames:"All Games",
    depositTitle:"Deposit", coin:"Crypto", network:"Network", address:"Address",
    copyAddress:"Copy address", addressCopied:"Address copied!", minDeposit:"Minimum:",
    withdrawTitle:"Withdraw", withdrawAmount:"Amount to withdraw", withdrawAddress:"Withdrawal address",
    withdrawBtn:"Request Withdrawal", available:"Available:", fee:"Fee:",
    vipTitle:"VIP & Rewards", verified:"Verified", notVerified:"Not Verified",
    currentBalance:"Current Balance", memberSince:"Member since",
    referralLink:"Your referral link",
    referralDesc:"Share your link and earn rewards for every friend who joins.",
    copy:"Copy", infiniteLabel:"Infinite", search:"Search",
    rollOverLabel:"Roll Over", rollUnderLabel:"Roll Under",
    tipsBonuses:"Bonuses & Tips", noTransactions:"No transactions.",
    language:"Language",
    myBets:"My Bets", time:"Time", drawing:"Drawing...",
    selectNumbers:"Select numbers", autoQuickPick:"Auto\nPick",
    clearBoard:"Clear Board", selectedNums:"Selected Numbers",
    minBet:"Minimum bet:", minBetsCount:"Enter a valid number of bets (min 1)",
    noBetsYet:"No bets yet",
  },
  pt: {
    login:"Entrar", register:"Registrar", username:"Usuário", password:"Senha",
    enter:"Entrar", noAccount:"Não tem uma conta?", createAccount:"Criar Conta",
    createAccountBtn:"Criar conta", back:"Voltar", accountCreated:"Conta criada com sucesso",
    errUser:"Usuário não encontrado", errPass:"Senha incorreta",
    errFillAll:"Preencha todos os campos", errUserExists:"Usuário já existe",
    home:"Início", casino:"Casino", originals:"Jogos Originais", rewards:"Recompensas",
    referrals:"Referências", providers:"Provedores", fairness:"Fairness", support:"Suporte",
    deposit:"Depositar", withdraw:"Sacar",
    history:"Histórico", profile:"Perfil", transactions:"Transações",
    betAmount:"Valor da Aposta", toWin:"Ao Ganhar", bet:"Apostar", clear:"Limpar",
    rolling:"⏳ Rolando...", insufficientBalance:"Saldo Insuficiente",
    manual:"Manual", automatic:"Automático", numberOfBets:"Número de Apostas",
    startAuto:"Iniciar Auto", stopAuto:"Parar Auto",
    profitLabel:"Lucro", won:"Ganhas", wagered:"Apostado", lostLabel:"Perdidas",
    balance:"Saldo", game:"Jogo", amount:"Aposta", multiplier:"Multiplicador",
    result:"Resultado", date:"Data", win:"Vitória", loss:"Derrota",
    noHistory:"Você ainda não fez apostas.", profileTitle:"Perfil", myProfile:"Meu Perfil",
    creditedAmount:"Valor Creditado", noDeposits:"Nenhum depósito ainda.",
    lastDeposit:"Último Depósito", totalWagered:"TOTAL APOSTADO", totalWins:"TOTAL DE GANHOS",
    rollOver:"Acima de", rollUnder:"Abaixo de", multiplierLabel:"Multiplicador",
    chance:"Chance de Ganhar", liveStats:"Estatísticas ao Vivo",
    searchPlaceholder:"Buscar jogo...", allGames:"Todos os Jogos",
    depositTitle:"Depósito", coin:"Cripto", network:"Rede", address:"Endereço",
    copyAddress:"Copiar endereço", addressCopied:"Endereço copiado!", minDeposit:"Mínimo:",
    withdrawTitle:"Saque", withdrawAmount:"Valor a sacar", withdrawAddress:"Endereço de saque",
    withdrawBtn:"Solicitar Saque", available:"Disponível:", fee:"Taxa:",
    vipTitle:"VIP & Recompensas", verified:"Verificado", notVerified:"Não Verificado",
    currentBalance:"Saldo Atual", memberSince:"Membro desde",
    referralLink:"Seu link de referência",
    referralDesc:"Compartilhe seu link e ganhe recompensas por cada amigo que se juntar.",
    copy:"Copiar", infiniteLabel:"Infinitas", search:"Buscar",
    rollOverLabel:"Acima de", rollUnderLabel:"Abaixo de",
    tipsBonuses:"Bônus & Gorjetas", noTransactions:"Sem transações.",
    language:"Idioma",
    myBets:"Minhas Apostas", time:"Hora", drawing:"Sorteando...",
    selectNumbers:"Selecione números", autoQuickPick:"Seleção\nAuto",
    clearBoard:"Limpar Mesa", selectedNums:"Números Selecionados",
    minBet:"Aposta mínima:", minBetsCount:"Insira um número válido de apostas (mínimo 1)",
    noBetsYet:"Sem apostas ainda",
  },
  de: {
    login:"Anmelden", register:"Registrieren", username:"Benutzername", password:"Passwort",
    enter:"Anmelden", noAccount:"Kein Konto?", createAccount:"Konto erstellen",
    createAccountBtn:"Konto erstellen", back:"Zurück", accountCreated:"Konto erfolgreich erstellt",
    errUser:"Benutzer nicht gefunden", errPass:"Falsches Passwort",
    errFillAll:"Bitte alle Felder ausfüllen", errUserExists:"Benutzername existiert bereits",
    home:"Home", casino:"Casino", originals:"Original Spiele", rewards:"Belohnungen",
    referrals:"Empfehlungen", providers:"Anbieter", fairness:"Fairness", support:"Support",
    deposit:"Einzahlen", withdraw:"Abheben",
    history:"Verlauf", profile:"Profil", transactions:"Transaktionen",
    betAmount:"Einsatz", toWin:"Gewinn", bet:"Wetten", clear:"Löschen",
    rolling:"⏳ Würfeln...", insufficientBalance:"Unzureichendes Guthaben",
    manual:"Manuell", automatic:"Automatisch", numberOfBets:"Anzahl der Wetten",
    startAuto:"Auto starten", stopAuto:"Auto stoppen",
    profitLabel:"Gewinn", won:"Gewonnen", wagered:"Gesetzt", lostLabel:"Verloren",
    balance:"Guthaben", game:"Spiel", amount:"Einsatz", multiplier:"Multiplikator",
    result:"Ergebnis", date:"Datum", win:"Gewinn", loss:"Verlust",
    noHistory:"Noch keine Wetten.", profileTitle:"Profil", myProfile:"Mein Profil",
    creditedAmount:"Gutgeschriebener Betrag", noDeposits:"Noch keine Einzahlungen.",
    lastDeposit:"Letzte Einzahlung", totalWagered:"GESAMT GESETZT", totalWins:"GESAMT GEWONNEN",
    rollOver:"Über", rollUnder:"Unter", multiplierLabel:"Multiplikator",
    chance:"Gewinnchance", liveStats:"Live-Statistiken",
    searchPlaceholder:"Spiel suchen...", allGames:"Alle Spiele",
    depositTitle:"Einzahlung", coin:"Krypto", network:"Netzwerk", address:"Adresse",
    copyAddress:"Adresse kopieren", addressCopied:"Adresse kopiert!", minDeposit:"Minimum:",
    withdrawTitle:"Abhebung", withdrawAmount:"Abhebungsbetrag", withdrawAddress:"Abhebungsadresse",
    withdrawBtn:"Abhebung beantragen", available:"Verfügbar:", fee:"Gebühr:",
    vipTitle:"VIP & Belohnungen", verified:"Verifiziert", notVerified:"Nicht verifiziert",
    currentBalance:"Aktuelles Guthaben", memberSince:"Mitglied seit",
    referralLink:"Dein Empfehlungslink",
    referralDesc:"Teile deinen Link und verdiene Belohnungen für jeden Freund der beitritt.",
    copy:"Kopieren", infiniteLabel:"Unendlich", search:"Suchen",
    rollOverLabel:"Über", rollUnderLabel:"Unter",
    tipsBonuses:"Boni & Trinkgelder", noTransactions:"Keine Transaktionen.",
    language:"Sprache",
    myBets:"Meine Wetten", time:"Uhrzeit", drawing:"Läuft...",
    selectNumbers:"Zahlen wählen", autoQuickPick:"Auto\nWahl",
    clearBoard:"Brett leeren", selectedNums:"Ausgewählte Zahlen",
    minBet:"Mindesteinsatz:", minBetsCount:"Gib eine gültige Anzahl von Wetten ein (min. 1)",
    noBetsYet:"Noch keine Wetten",
  },
  fr: {
    login:"Connexion", register:"S'inscrire", username:"Nom d'utilisateur", password:"Mot de passe",
    enter:"Connexion", noAccount:"Pas de compte?", createAccount:"Créer un compte",
    createAccountBtn:"Créer un compte", back:"Retour", accountCreated:"Compte créé avec succès",
    errUser:"Utilisateur introuvable", errPass:"Mot de passe incorrect",
    errFillAll:"Veuillez remplir tous les champs", errUserExists:"Nom d'utilisateur déjà pris",
    home:"Accueil", casino:"Casino", originals:"Jeux Originaux", rewards:"Récompenses",
    referrals:"Parrainages", providers:"Fournisseurs", fairness:"Équité", support:"Support",
    deposit:"Déposer", withdraw:"Retirer",
    history:"Historique", profile:"Profil", transactions:"Transactions",
    betAmount:"Mise", toWin:"Gain potentiel", bet:"Miser", clear:"Effacer",
    rolling:"⏳ En cours...", insufficientBalance:"Solde insuffisant",
    manual:"Manuel", automatic:"Automatique", numberOfBets:"Nombre de mises",
    startAuto:"Démarrer Auto", stopAuto:"Arrêter Auto",
    profitLabel:"Profit", won:"Gagnées", wagered:"Misé", lostLabel:"Perdues",
    balance:"Solde", game:"Jeu", amount:"Mise", multiplier:"Multiplicateur",
    result:"Résultat", date:"Date", win:"Gain", loss:"Perte",
    noHistory:"Vous n'avez pas encore misé.", profileTitle:"Profil", myProfile:"Mon Profil",
    creditedAmount:"Montant crédité", noDeposits:"Aucun dépôt.",
    lastDeposit:"Dernier dépôt", totalWagered:"TOTAL MISÉ", totalWins:"TOTAL GAGNÉ",
    rollOver:"Au-dessus de", rollUnder:"En-dessous de", multiplierLabel:"Multiplicateur",
    chance:"Chance de gain", liveStats:"Statistiques en direct",
    searchPlaceholder:"Rechercher un jeu...", allGames:"Tous les jeux",
    depositTitle:"Dépôt", coin:"Crypto", network:"Réseau", address:"Adresse",
    copyAddress:"Copier l'adresse", addressCopied:"Adresse copiée!", minDeposit:"Minimum:",
    withdrawTitle:"Retrait", withdrawAmount:"Montant à retirer", withdrawAddress:"Adresse de retrait",
    withdrawBtn:"Demander un retrait", available:"Disponible:", fee:"Frais:",
    vipTitle:"VIP & Récompenses", verified:"Vérifié", notVerified:"Non vérifié",
    currentBalance:"Solde actuel", memberSince:"Membre depuis",
    referralLink:"Votre lien de parrainage",
    referralDesc:"Partagez votre lien et gagnez des récompenses pour chaque ami qui s'inscrit.",
    copy:"Copier", infiniteLabel:"Infini", search:"Rechercher",
    rollOverLabel:"Au-dessus de", rollUnderLabel:"En-dessous de",
    tipsBonuses:"Bonus & Pourboires", noTransactions:"Aucune transaction.",
    language:"Langue",
    myBets:"Mes Mises", time:"Heure", drawing:"En cours...",
    selectNumbers:"Sélectionnez des numéros", autoQuickPick:"Sélection\nAuto",
    clearBoard:"Effacer la table", selectedNums:"Numéros sélectionnés",
    minBet:"Mise minimale:", minBetsCount:"Entrez un nombre de mises valide (min 1)",
    noBetsYet:"Aucune mise pour l'instant",
  },
};

const COUNTRY_LANG: Record<string, string> = {
  ar:"es", mx:"es", co:"es", cl:"es", pe:"es", ve:"es", ec:"es", bo:"es",
  py:"es", uy:"es", cr:"es", pa:"es", gt:"es", hn:"es", sv:"es", ni:"es",
  do:"es", cu:"es", es:"es", pr:"es",
  br:"pt", pt:"pt",
  de:"de", at:"de", ch:"de",
  fr:"fr", be:"fr", lu:"fr",
};

function detectLang(): string {
  const saved = localStorage.getItem("mander_lang");
  if (saved && LANGS[saved]) return saved;
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("pt")) return "pt";
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("de")) return "de";
  if (nav.startsWith("fr")) return "fr";
  return "en";
}

function tl(lang: string, key: string): string {
  return LANGS[lang]?.[key] ?? LANGS.en?.[key] ?? key;
}

const LANG_NAMES: Record<string, string> = {
  es:"Español", en:"English", pt:"Português", de:"Deutsch", fr:"Français",
};
const LANG_CODES: Record<string, string> = {
  es:"ES", en:"US", pt:"BR", de:"DE", fr:"FR",
};
const LANG_FLAG_CC: Record<string, string> = {
  es:"es", en:"us", pt:"br", de:"de", fr:"fr",
};
const flagImg = (code: string, h = 15) => (
  <span className={`fi fi-${LANG_FLAG_CC[code] ?? code}`}
        style={{ fontSize:`${h}px`, borderRadius:"2px", display:"inline-block", verticalAlign:"middle", flexShrink:0 }} />
);


const exchangeRates: Record<string, number> = { USD: 1, EUR: 0.8654, ARS: 1391.5543 };

const WALLET_CURRENCIES: { code: string; name: string; symbol: string; color: string }[] = [
  { code:"USD", name:"Dólar estadounidense",  symbol:"$",    color:"#2563eb" },
  { code:"EUR", name:"Euro",                  symbol:"€",    color:"#2563eb" },
  { code:"ARS", name:"Peso argentino",        symbol:"AR$",  color:"#0d9488" },
  { code:"BRL", name:"Real brasileño",        symbol:"R$",   color:"#16a34a" },
  { code:"CLP", name:"Peso chileno",          symbol:"$",    color:"#dc2626" },
  { code:"GBP", name:"Libra esterlina",       symbol:"£",    color:"#2563eb" },
  { code:"RUB", name:"Rublo ruso",            symbol:"₽",    color:"#dc2626" },
  { code:"INR", name:"Rupia india",           symbol:"₹",    color:"#ea580c" },
  { code:"AUD", name:"Dólar australiano",     symbol:"$",    color:"#2563eb" },
  { code:"BDT", name:"Taka bangladesí",       symbol:"৳",    color:"#16a34a" },
  { code:"BGN", name:"Lev búlgaro",           symbol:"лв.",  color:"#16a34a" },
  { code:"CAD", name:"Dólar canadiense",      symbol:"$",    color:"#dc2626" },
  { code:"CHF", name:"Franco suizo",          symbol:"Fr.",  color:"#dc2626" },
  { code:"CNY", name:"Yuan chino",            symbol:"¥",    color:"#dc2626" },
  { code:"COP", name:"Peso colombiano",       symbol:"$",    color:"#d97706" },
  { code:"CZK", name:"Corona checa",          symbol:"Kč",   color:"#2563eb" },
  { code:"DKK", name:"Corona danesa",         symbol:"kr",   color:"#dc2626" },
  { code:"HUF", name:"Forinto húngaro",       symbol:"Ft",   color:"#16a34a" },
  { code:"IDR", name:"Rupia indonesia",       symbol:"Rp",   color:"#dc2626" },
  { code:"JPY", name:"Yen japonés",           symbol:"¥",    color:"#dc2626" },
  { code:"KES", name:"Chelín keniano",        symbol:"KSh",  color:"#16a34a" },
  { code:"KRW", name:"Won surcoreano",        symbol:"₩",    color:"#1d4ed8" },
  { code:"MXN", name:"Peso mexicano",         symbol:"$",    color:"#16a34a" },
  { code:"MYR", name:"Ringgit malayo",        symbol:"RM",   color:"#2563eb" },
  { code:"NGN", name:"Naira nigeriana",       symbol:"₦",    color:"#16a34a" },
  { code:"NOK", name:"Corona noruega",        symbol:"kr",   color:"#dc2626" },
  { code:"NZD", name:"Dólar neozelandés",     symbol:"$",    color:"#2563eb" },
  { code:"PEN", name:"Sol peruano",           symbol:"S/.",  color:"#dc2626" },
  { code:"PHP", name:"Peso filipino",         symbol:"₱",    color:"#2563eb" },
  { code:"PKR", name:"Rupia pakistaní",       symbol:"Rs",   color:"#dc2626" },
  { code:"PLN", name:"Złoty polaco",          symbol:"zł",   color:"#dc2626" },
  { code:"RON", name:"Leu rumano",            symbol:"lei",  color:"#dc2626" },
  { code:"RSD", name:"Dinar serbio",          symbol:"РСД",  color:"#dc2626" },
  { code:"SEK", name:"Corona sueca",          symbol:"kr",   color:"#1e3a8a" },
  { code:"SGD", name:"Dólar de Singapur",     symbol:"S$",   color:"#16a34a" },
  { code:"THB", name:"Baht tailandés",        symbol:"฿",    color:"#2563eb" },
  { code:"TRY", name:"Lira turca",            symbol:"₺",    color:"#dc2626" },
  { code:"UAH", name:"Grivna ucraniana",      symbol:"₴",    color:"#d97706" },
  { code:"VND", name:"Dong vietnamita",       symbol:"₫",    color:"#dc2626" },
  { code:"ZAR", name:"Rand sudafricano",      symbol:"R",    color:"#16a34a" },
];

const FALLBACK_RATES: Record<string,number> = {
  USD:1, EUR:0.8655, GBP:0.7494, RUB:83.64, INR:93.63,
  BRL:5.26, ARS:1452, AUD:1.42, BDT:123, BGN:1.69,
  CAD:1.37, CHF:0.7884, CLP:913, CNY:6.90, COP:3698,
  CZK:21.19, DKK:6.46, HUF:340, IDR:16964, JPY:159,
  KES:129, KRW:1501, MXN:17.88, MYR:3.94, NGN:1356,
  NOK:9.56, NZD:1.71, PEN:3.47, PHP:59.92, PKR:279,
  PLN:3.70, RON:4.41, RSD:102, SEK:9.35, SGD:1.28,
  THB:32.83, TRY:44.30, UAH:43.89, VND:26167, ZAR:16.98,
};


const coinDisplayMap: Record<string, { name: string; badgeClass: string; badgeText: string; icon?: string }> = {
  USDT: { name: "Tether",        badgeClass: "coin-usdt", badgeText: "₮", icon: "/coins/usdt.svg" },
  USDC: { name: "USD Coin",      badgeClass: "coin-usdc", badgeText: "$", icon: "/coins/usdc.svg" },
  BTC:  { name: "Bitcoin",       badgeClass: "coin-btc",  badgeText: "₿", icon: "/coins/btc.svg"  },
  ETH:  { name: "Ethereum",      badgeClass: "coin-eth",  badgeText: "◆", icon: "/coins/eth.svg"  },
  LTC:  { name: "Litecoin",      badgeClass: "coin-ltc",  badgeText: "Ł", icon: "/coins/ltc.svg"  },
  SOL:  { name: "Solana",        badgeClass: "coin-sol",  badgeText: "≋", icon: "/coins/sol.svg"  },
  TRX:  { name: "Tron",          badgeClass: "coin-trx",  badgeText: "△", icon: "/coins/trx.svg"  },
  BNB:  { name: "BNB",           badgeClass: "coin-bnb",  badgeText: "⬢", icon: "/coins/bnb.svg"  },
  POL:  { name: "Polygon",       badgeClass: "coin-pol",  badgeText: "∞", icon: "/coins/matic.svg" },
  ARS:  { name: "Peso Argentino",badgeClass: "coin-ars",  badgeText: "🇦🇷" },
};

const coinConfig: Record<string, { priceUsd: number; minDepositUsd: number; minWithdrawUsd: number; networks: string[] }> = {
  USDT: { priceUsd: 1.00,    minDepositUsd: 5,   minWithdrawUsd: 5,   networks: ["TRC20","ERC20","BEP20"] },
  BTC:  { priceUsd: 66431,   minDepositUsd: 50,  minWithdrawUsd: 50,  networks: ["BTC"] },
  BNB:  { priceUsd: 585,     minDepositUsd: 5,   minWithdrawUsd: 5,   networks: ["BEP20","Beacon"] },
  TRX:  { priceUsd: 0.315,   minDepositUsd: 5,   minWithdrawUsd: 5,   networks: ["TRC20"] },
  LTC:  { priceUsd: 52,      minDepositUsd: 10,  minWithdrawUsd: 10,  networks: ["LTC"] },
  ETH:  { priceUsd: 2044,    minDepositUsd: 5,   minWithdrawUsd: 5,   networks: ["ERC20","Arbitrum","Optimism"] },
  USDC: { priceUsd: 1.00,    minDepositUsd: 5,   minWithdrawUsd: 5,   networks: ["ERC20","BEP20","SOL"] },
  SOL:  { priceUsd: 79,      minDepositUsd: 5,   minWithdrawUsd: 5,   networks: ["SOL"] },
  POL:  { priceUsd: 0.093,   minDepositUsd: 5,   minWithdrawUsd: 5,   networks: ["ERC20"] },
};

const networkIconMap: Record<string, string> = {
  "TRC20":    "/coins/trx.svg",
  "ERC20":    "/coins/eth.svg",
  "BEP20":    "/coins/bnb.svg",
  "BTC":      "/coins/btc.svg",
  "LTC":      "/coins/ltc.svg",
  "SOL":      "/coins/sol.svg",
  "Beacon":   "/coins/bnb.svg",
  "Arbitrum": "/coins/arbitrum.svg",
  "Optimism": "/coins/optimism.svg",
};

// CoinGecko IDs para precios en tiempo real
const COINGECKO_IDS: Record<string, string> = {
  USDT: "tether",
  USDC: "usd-coin",
  BTC:  "bitcoin",
  ETH:  "ethereum",
  BNB:  "binancecoin",
  SOL:  "solana",
  LTC:  "litecoin",
  TRX:  "tron",
  POL:  "polygon-ecosystem-token",
};

// Límites por moneda+red (USD) — fuente: tabla de configuración del operador
type NetLimit = { minDep: number; maxDep: number; minWith: number; maxWith: number; wFee: number; };
const networkLimits: Record<string, Record<string, NetLimit>> = {
  USDT: {
    TRC20:    { minDep:5,  maxDep:10000,  minWith:5,  maxWith:5000,  wFee:1   },
    ERC20:    { minDep:10, maxDep:10000,  minWith:10, maxWith:5000,  wFee:2   },
    BEP20:    { minDep:5,  maxDep:10000,  minWith:5,  maxWith:5000,  wFee:0.5 },
  },
  BTC: {
    BTC:      { minDep:50, maxDep:100000, minWith:50, maxWith:50000, wFee:1   },
  },
  ETH: {
    ERC20:    { minDep:10, maxDep:50000,  minWith:10, maxWith:25000, wFee:1.5 },
    Arbitrum: { minDep:5,  maxDep:50000,  minWith:5,  maxWith:25000, wFee:0.5 },
    Optimism: { minDep:5,  maxDep:50000,  minWith:5,  maxWith:25000, wFee:0.5 },
  },
  TRX: {
    TRC20:    { minDep:5,  maxDep:20000,  minWith:5,  maxWith:10000, wFee:0.2 },
  },
  BNB: {
    BEP20:    { minDep:5,  maxDep:20000,  minWith:5,  maxWith:10000, wFee:0.5 },
    Beacon:   { minDep:5,  maxDep:20000,  minWith:5,  maxWith:10000, wFee:0.5 },
  },
  SOL: {
    SOL:      { minDep:5,  maxDep:5000,   minWith:5,  maxWith:2000,  wFee:0.1 },
  },
  POL: {
    ERC20:    { minDep:5,  maxDep:10000,  minWith:5,  maxWith:5000,  wFee:0.2 },
  },
  USDC: {
    ERC20:    { minDep:5,  maxDep:10000,  minWith:5,  maxWith:5000,  wFee:0.5 },
    BEP20:    { minDep:5,  maxDep:10000,  minWith:5,  maxWith:5000,  wFee:0.5 },
    SOL:      { minDep:5,  maxDep:10000,  minWith:5,  maxWith:5000,  wFee:0.1 },
  },
  LTC: {
    LTC:      { minDep:10, maxDep:50000,  minWith:10, maxWith:20000, wFee:1   },
  },
};
function getNetLimit(coin: string, network: string): NetLimit {
  return networkLimits[coin]?.[network] ?? {
    minDep: coinConfig[coin]?.minDepositUsd ?? 5,
    maxDep: 10000,
    minWith: coinConfig[coin]?.minWithdrawUsd ?? 10,
    maxWith: 5000,
    wFee: 0,
  };
}
function minDepositNative(coin: string, network = ""): number {
  const c = coinConfig[coin]; if (!c) return 0;
  const lim = getNetLimit(coin, network);
  return +(lim.minDep / c.priceUsd).toPrecision(3);
}
function minWithdrawNative(coin: string, network = ""): number {
  const c = coinConfig[coin]; if (!c) return 0;
  const lim = getNetLimit(coin, network);
  return +(lim.minWith / c.priceUsd).toPrecision(3);
}

const fakeSlots = [
  { name:"Dice",       provider:"Originals", category:"Originals", bg:"linear-gradient(135deg,#0f5cd6,#101f43)", type:"dice" },
  { name:"Plinko",     provider:"Originals", category:"Originals", bg:"linear-gradient(135deg,#7e262a,#ff596d)", type:"plinko" },
  { name:"Keno",       provider:"Originals", category:"Originals", bg:"linear-gradient(135deg,#f4a91f,#c4780a)", type:"keno" },
  { name:"Blackjack",  provider:"Originals", category:"Originals", bg:"linear-gradient(135deg,#f3a428,#613210)", type:"blackjack" },
  { name:"Mines",      provider:"Originals", category:"Originals", bg:"linear-gradient(135deg,#0a1e3a,#1a4d8a)", type:"mines" },
  { name:"Hilo",       provider:"Originals", category:"Originals", bg:"linear-gradient(135deg,#004a2a,#00a85a)", type:"hilo" },
  { name:"Roulette",   provider:"Originals", category:"Originals", bg:"linear-gradient(135deg,#1a0a2e,#4a1a7a)", type:"roulette" },
  { name:"Baccarat",   provider:"Originals", category:"Originals", bg:"linear-gradient(135deg,#001830,#003a7a)", type:"baccarat" },
];

// ─── External games (iframe + new-tab fallback) ──────────────────────────────
const EXTERNAL_GAMES = [
  { name:"Sweet Candy",   image:"https://via.placeholder.com/300x200/c2185b/ffffff?text=Sweet+Candy",   url:"https://demoslot.pragmaticplay.net/gs2c/open.do?gameSymbol=vs20fruitsw&lang=en&jurisdiction=99&lobbyURL=about:blank&currency=USD&mode=demo",       tag:"HOT 🔥",  tagColor:"#ef4444", label:"Pragmatic Play", bg:"linear-gradient(135deg,#c2185b,#ff69b4,#ff9fcb)" },
  { name:"Fruit Blast",   image:"https://via.placeholder.com/300x200/16a34a/ffffff?text=Fruit+Blast",   url:"https://demoslot.pragmaticplay.net/gs2c/open.do?gameSymbol=vs20fruitparty&lang=en&jurisdiction=99&lobbyURL=about:blank&currency=USD&mode=demo",   tag:"NEW ✨",  tagColor:"#22c55e", label:"Pragmatic Play", bg:"linear-gradient(135deg,#15803d,#4ade80,#bbf7d0)" },
  { name:"Gates of Fire", image:"https://via.placeholder.com/300x200/b45309/ffffff?text=Gates+of+Fire", url:"https://demoslot.pragmaticplay.net/gs2c/open.do?gameSymbol=vs20olympgate&lang=en&jurisdiction=99&lobbyURL=about:blank&currency=USD&mode=demo",    tag:"HOT 🔥",  tagColor:"#ef4444", label:"Pragmatic Play", bg:"linear-gradient(135deg,#92400e,#f59e0b,#fde68a)" },
  { name:"Sugar Rush X",  image:"https://via.placeholder.com/300x200/7c3aed/ffffff?text=Sugar+Rush+X",  url:"https://demoslot.pragmaticplay.net/gs2c/open.do?gameSymbol=vs20sugarrush&lang=en&jurisdiction=99&lobbyURL=about:blank&currency=USD&mode=demo",     tag:"RTP 96%", tagColor:"#1a9fff", label:"Pragmatic Play", bg:"linear-gradient(135deg,#4c1d95,#a855f7,#f0abfc)" },
];

const ORIGINALS_FEED = [
  { game:"Dice",      img:"/dice-card.jpg" },
  { game:"Plinko",    img:"/plinko-thumb.jpg" },
  { game:"Keno",      img:"/keno-thumb.jpg" },
  { game:"Blackjack", img:"/blackjack-thumb.jpg" },
  { game:"Mines",     img:"/mines-card.jpg" },
  { game:"Hilo",      img:"/hilo-card.jpg" },
  { game:"Roulette",  img:"/roulette-card.jpg" },
  { game:"Baccarat",  img:"/baccarat-card.jpg" },
];

// ── Horario Argentina (UTC-3, sin DST) ──────────────────────────────────────
function getArgHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}
// Multiplicador de delay según hora: <1 = más gente (más rápido), >1 = menos gente (más lento)
function getArgActivityMult(): number {
  const h = getArgHour();
  if (h >= 0  && h < 5)  return 5.5;  // 00-05 madrugada — muy poca gente
  if (h >= 5  && h < 8)  return 3.5;  // 05-08 amanecer — poca gente
  if (h >= 8  && h < 11) return 1.7;  // 08-11 mañana — moderado
  if (h >= 11 && h < 14) return 1.0;  // 11-14 mediodía — activo
  if (h >= 14 && h < 18) return 0.65; // 14-18 tarde — pico máximo
  if (h >= 18 && h < 22) return 0.75; // 18-22 noche — muy activo
  return 1.8;                          // 22-24 noche tardía — bajando
}

const _INIT_PROFITS = [0.31,0.42,0.58,0.73,0.88,1.00,1.25,1.47,1.83,2.00,2.36,2.78,3.14,3.90,5.00,5.36,7.50,10.00,12.17,15.63,20.00,25.50,50.00];
const _INIT_USERS_POOL = ["matiaslots","luchitox","fedeplay","tincho77","nicobets","franito","tomiwin","facuplay","agusito","dieguito","pablitoo","ramiroo","gonzaa","maxiwins","tobiasx","brunito","kevo23","rodriwin","marquitos","enzoo","ivansito","gabywin","carlitoss","andresito","miguelito","javierin","victorx","danielr","richar","ferchu","sergito","walterin","gustiwin","eduardito","luisito","raulito","maty77","lucasss","fran22","nico77","tomi23","facu99","agus10","gonza21","lean98","maxi07","tobi22","bruno23","kevin17","rodri10","marcos21","enzo91","ivan22","gabi10","cristian23","dylan07","joaco99","lauta10","rami22","dami23","alex77","adri21","tobi98","juli10","lucho77","slotero","ruletin","cartitas","casinero","girito","suertudo","tirador","apuestin","spinero","ruletazo","tragamon","winito","suertin","jugadita","platinero","doblete","luckito","winwin","betitoo","slotin","fichitas","tiradita","platinito","suertetaa","xLuchoX","matiux","nicozz","frannn","tomiux","facux","aguszz","leanz","gonzita","maxii","tobita","brunox","kevito","rodrix","marqui","enzito","ivancito","gabito","dylanz","joaquinn","lautii","ramirox","damianx","alexito","adrianoo","julito","luchitoo","randomnico","elgonzita","matute","tinchoide","facundito","agustinok","leanmart","gonzalito","maximil","tobiasr","brunelli","kevind","rodrigox","marcosss","enzooo","ivand","gabrielx","dylannn","joaquind","lautaron","ramirito","damianok","alexanderx","adrianok","julianok","luchok"];
function makeFakeWin(ts?: string): LiveWin {
  const g = ORIGINALS_FEED[Math.floor(Math.random()*ORIGINALS_FEED.length)];
  const profit = _INIT_PROFITS[Math.floor(Math.random()*_INIT_PROFITS.length)];
  return { user: _INIT_USERS_POOL[Math.floor(Math.random()*_INIT_USERS_POOL.length)], game: g.game, betUsd: profit * 0.5, win: true, profitUsd: profit, createdAt: ts ?? new Date().toISOString() };
}

function makeFakeWins(count: number): LiveWin[] {
  return Array.from({length:count}, (_,i)=>makeFakeWin(new Date(Date.now()-i*15000).toISOString()));
}

const searchCategories = ["All","Originals"];

const FAKE_USERS = [
  "matiaslots","luchitox","fedeplay","tincho77","nicobets","franito","tomiwin",
  "facuplay","agusito","dieguito","pablitoo","ramiroo","joaquin77","leanbets",
  "gonzaa","maxiwins","tobiasx","brunito","kevo23","rodriwin","marquitos","enzoo",
  "ivansito","gabywin","cristianr","dylancito","juancito","santii","julianr",
  "hernancito","oscarsito","carlitoss","andresito","miguelito","javierin","victorx",
  "danielr","richar","ferchu","sergito","walterin","gustiwin","eduardito","luisito",
  "raulito","maty77","lucasss","fran22","nico77","tomi23","facu99","agus10",
  "gonza21","lean98","maxi07","tobi22","bruno23","kevin17","rodri10","marcos21",
  "enzo91","ivan22","gabi10","cristian23","dylan07","joaco99","lauta10","rami22",
  "dami23","alex77","adri21","tobi98","juli10","lucho77","slotero","ruletin",
  "cartitas","casinero","girito","suertudo","tirador","apuestin","spinero","ruletazo",
  "tragamon","winito","suertin","jugadita","platinero","doblete","luckito","winwin",
  "betitoo","slotin","fichitas","tiradita","platinito","suertetaa","xLuchoX","matiux",
  "nicozz","frannn","tomiux","facux","aguszz","leanz","gonzita","maxii","tobita",
  "brunox","kevito","rodrix","marqui","enzito","ivancito","gabito","dylanz","joaquinn",
  "lautii","ramirox","damianx","alexito","adrianoo","julito","luchitoo","randomnico",
  "elgonzita","matute","tinchoide","facundito","agustinok","leanmart","gonzalito",
  "maximil","tobiasr","brunelli","kevind","rodrigox","marcosss","enzooo","ivand",
  "gabrielx","dylannn","joaquind","lautaron","ramirito","damianok","alexanderx",
  "adrianok","julianok","luchok",
];
const FAKE_PROFITS = [
  0.31,0.37,0.42,0.50,0.58,0.73,0.88,
  1.00,1.25,1.47,1.83,
  2.00,2.36,2.78,
  3.14,3.90,
  5.00,5.36,5.82,
  7.50,7.89,
  10.00,10.44,12.17,
  15.63,18.90,
  20.00,25.50,
  50.00,
];

function generateManderId(): string {
  const chars = "0123456789abcdef";
  let id = "";
  for (let i = 0; i < 24; i++) id += chars[Math.floor(Math.random() * 16)];
  return id;
}

function validatePassword(password: string) {
  const errors: string[] = [];
  if (password.length < 8) errors.push("8 caracteres");
  if (!/[A-Z]/.test(password)) errors.push("1 mayúscula");
  if (!/[0-9]/.test(password)) errors.push("1 número");
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) errors.push("1 símbolo");
  return errors;
}

function formatNumber(v: number) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function getCurrencySymbol(c: string) { return WALLET_CURRENCIES.find(w=>w.code===c)?.symbol ?? "$"; }

const CURRENCY_FLAGS: Record<string,string> = {
  USD:"🇺🇸", EUR:"🇪🇺", ARS:"🇦🇷", BRL:"🇧🇷", CLP:"🇨🇱", GBP:"🇬🇧", RUB:"🇷🇺",
  INR:"🇮🇳", AUD:"🇦🇺", BDT:"🇧🇩", BGN:"🇧🇬", CAD:"🇨🇦", CHF:"🇨🇭", CNY:"🇨🇳",
  COP:"🇨🇴", CZK:"🇨🇿", DKK:"🇩🇰", HUF:"🇭🇺", IDR:"🇮🇩", JPY:"🇯🇵", KES:"🇰🇪",
  KRW:"🇰🇷", MXN:"🇲🇽", MYR:"🇲🇾", NGN:"🇳🇬", NOK:"🇳🇴", NZD:"🇳🇿", PEN:"🇵🇪",
  PHP:"🇵🇭", PKR:"🇵🇰", PLN:"🇵🇱", RON:"🇷🇴", RSD:"🇷🇸", SEK:"🇸🇪", SGD:"🇸🇬",
  THB:"🇹🇭", TRY:"🇹🇷", UAH:"🇺🇦", VND:"🇻🇳", ZAR:"🇿🇦",
};

function makeFakeAddress(coin: string, network: string) {
  const prefixMap: Record<string, string> = {
    BTC:"bc1q", ETH:"0x",
    USDT: network==="TRC20"?"T":network==="ERC20"?"0x":"bnb",
    USDC: network==="SOL"?"So":network==="BEP20"?"bnb":"0x",
    LTC:"ltc1", SOL:"So", TRX:"T", BNB:"bnb", POL:"0x",
  };
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";
  let r = "";
  for (let i = 0; i < 24; i++) r += chars[Math.floor(Math.random()*chars.length)];
  return (prefixMap[coin]||"0x") + r;
}

interface DiceStats {
  profit: number; wagered: number; wins: number; losses: number;
  history: { value: number; win: boolean; profit: number }[];
  autoRemaining: number;
}

interface Transaction {
  id?: string; type: string; coin: string; network: string; usdAmount: number; coinAmount?: number;
  address?: string; status: string; createdAt: string; display_id?: number;
}

// ── Contadores globales de IDs visibles por tipo de transacción ───────────────
// Depósitos  → secuencia propia desde #4643
// Retiros    → secuencia propia desde #2100
// Compartidos entre todos los usuarios del mismo dispositivo.
const TX_COUNTER: Record<"deposit"|"withdraw", { key: string; start: number }> = {
  deposit:  { key: "tx_display_counter_dep", start: 4643 },
  withdraw: { key: "tx_display_counter_wd",  start: 2100 },
};
function nextDisplayId(type: "deposit"|"withdraw"): number {
  const { key, start } = TX_COUNTER[type];
  const current = parseInt(localStorage.getItem(key) || String(start - 1));
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return next;
}

interface Bet { amount: number; winAmount: number; createdAt: string; }
interface LiveWin { user: string; game: string; betUsd: number; win: boolean; profitUsd: number; createdAt: string; }
interface AppNotification { id: string; type: "deposit"|"withdraw"|"bonus"|"info"; title: string; message: string; createdAt: string; read: boolean; }

interface GameBetRecord {
  amount: number; multiplier: number; win: boolean; payout: number; createdAt: string;
}
interface DiceBetRecord {
  amount: number; multiplier: number; rollValue: number;
  win: boolean; payout: number; createdAt: string;
}

interface PlinkoStats {
  profit: number; wagered: number; wins: number; losses: number;
  history: { multiplier: number; win: boolean; profit: number }[];
}
interface PlinkoBetRecord {
  amount: number; multiplier: number; win: boolean; payout: number; slot: number; createdAt: string;
}

interface KenoStats {
  profit: number; wagered: number; wins: number; losses: number;
  history: { picks: number; hits: number; multiplier: number; win: boolean; profit: number }[];
}
interface KenoBetRecord {
  amount: number; picks: number; hits: number; multiplier: number;
  win: boolean; payout: number; drawnNumbers: number[]; pickedNumbers: number[]; createdAt: string;
}
interface PendingPlinkoball {
  id: number;
  targetSlot: number; // pre-selected landing slot (RTP-controlled)
  rows: number;
  risk: string;
  multiplier: number;
  betUsd: number;     // bet in USD — used for deferred payout on landing
  launchedAt: number; // Date.now() when the ball was dropped — used to estimate remaining fall time
}

// Estimated total fall duration in ms for a ball with `rows` rows
function plinkoBallFallMs(rows: number): number {
  // timeScale=0.45 on original physics → ~2.2× slower: 8 rows ≈ 4.4 s, 16 rows ≈ 7.1 s
  return 1800 + rows * 335;
}

// ─── Plinko multiplier tables (Stake.com visual values) ─────────────────────
// Displayed multipliers are identical to Stake.com's UI.
// House edge is enforced via per-config house factors computed from custom
// probability distributions. Effective RTP = 96.5% for all 15 configs.
const PLINKO_MULTS: Record<string, Record<number, number[]>> = {
  low: {
    8:  [5.6,  2.1,  1.1,  1.0,  0.5,  1.0,  1.1,  2.1,  5.6],
    10: [8.9,  3.0,  1.4,  1.1,  1.0,  0.5,  1.0,  1.1,  1.4,  3.0,  8.9],
    12: [10,   3.0,  1.6,  1.4,  1.1,  1.0,  0.5,  1.0,  1.1,  1.4,  1.6,  3.0,  10],
    14: [7.1,  4.0,  1.9,  1.4,  1.3,  1.1,  1.0,  0.5,  1.0,  1.1,  1.3,  1.4,  1.9,  4.0,  7.1],
    16: [16,   9.0,  2.0,  1.4,  1.4,  1.2,  1.1,  1.0,  0.5,  1.0,  1.1,  1.2,  1.4,  1.4,  2.0,  9.0,  16],
  },
  medium: {
    8:  [13,   3.0,  1.3,  0.7,  0.4,  0.7,  1.3,  3.0,  13],
    10: [22,   5.0,  2.0,  1.4,  0.6,  0.4,  0.6,  1.4,  2.0,  5.0,  22],
    12: [33,   11,   4.0,  2.0,  1.1,  0.6,  0.3,  0.6,  1.1,  2.0,  4.0,  11,   33],
    14: [58,   15,   7.0,  3.0,  1.3,  0.7,  0.4,  0.2,  0.4,  0.7,  1.3,  3.0,  7.0,  15,   58],
    16: [110,  41,   10,   5.0,  3.0,  1.5,  1.0,  0.5,  0.3,  0.5,  1.0,  1.5,  3.0,  5.0,  10,   41,   110],
  },
  high: {
    8:  [29,   4.0,  1.5,  0.3,  0.2,  0.3,  1.5,  4.0,  29],
    10: [76,   10,   3.0,  0.9,  0.3,  0.2,  0.3,  0.9,  3.0,  10,   76],
    12: [170,  24,   8.1,  2.0,  0.7,  0.2,  0.2,  0.2,  0.7,  2.0,  8.1,  24,   170],
    14: [420,  56,   18,   5.0,  1.9,  0.3,  0.2,  0.2,  0.2,  0.3,  1.9,  5.0,  18,   56,   420],
    16: [1000, 130,  26,   9.0,  4.0,  2.0,  0.2,  0.2,  0.2,  0.2,  0.2,  2.0,  4.0,  9.0,  26,   130,  1000],
  },
};

// ─── Plinko house-factor system ──────────────────────────────────────────────
// Ball path: PURE BINOMIAL — 50/50 left/right at every peg (fair RNG, no bias).
// Effective RTP = 96.5% enforced via a per-config multiplicative house factor:
//   factor[risk][rows] = 0.965 / Σ P_binom(k) × mult[k]
// Factor is always < 1 because base RTP (Stake mults + binomial) ≈ 98.9–99.3%.
// Applied in settlePlinkoLanding: actual_payout = bet × displayed_mult × factor.

function _computePlinkoFactors(): Record<string, Record<number, number>> {
  const TARGET = 0.965;
  const result: Record<string, Record<number, number>> = {};
  for (const risk of ['low', 'medium', 'high']) {
    result[risk] = {};
    for (const n of [8, 10, 12, 14, 16]) {
      const mults = PLINKO_MULTS[risk][n];
      const total = Math.pow(2, n);
      let c = 1, baseRTP = 0;
      for (let k = 0; k <= n; k++) {
        if (k > 0) c = c * (n - k + 1) / k;
        baseRTP += (c / total) * mults[k];
      }
      result[risk][n] = TARGET / baseRTP; // always < 1 for Stake multipliers
    }
  }
  return result;
}

const PLINKO_FACTORS = _computePlinkoFactors();

// ─── LS helpers ────────────────────────────────────────────────────────────
const ls = {
  get: (k: string) => localStorage.getItem(k),
  set: (k: string, v: string) => localStorage.setItem(k, v),
  rm: (k: string) => localStorage.removeItem(k),
  getBalance: (u: string) => parseFloat(localStorage.getItem("balance_"+u)||"0"),
  setBalance: (u: string, v: number) => localStorage.setItem("balance_"+u, String(v)),
  getBets: (u: string): Bet[] => JSON.parse(localStorage.getItem("bets_"+u)||"[]"),
  saveBets: (u: string, b: Bet[]) => localStorage.setItem("bets_"+u, JSON.stringify(b)),
  getTx: (u: string): Transaction[] => JSON.parse(localStorage.getItem("transactions_"+u)||"[]"),
  saveTx: (u: string, t: Transaction[]) => localStorage.setItem("transactions_"+u, JSON.stringify(t)),
  updateTxStatus: (u: string, id: string, status: string) => {
    const arr: Transaction[] = JSON.parse(localStorage.getItem("transactions_"+u)||"[]");
    const idx = arr.findIndex(t => t.id === id);
    if (idx !== -1) { arr[idx] = { ...arr[idx], status }; localStorage.setItem("transactions_"+u, JSON.stringify(arr)); }
    return arr;
  },
  getNotifs: (u: string): AppNotification[] => { try { return JSON.parse(localStorage.getItem("notifs_"+u)||"[]"); } catch { return []; } },
  saveNotifs: (u: string, n: AppNotification[]) => localStorage.setItem("notifs_"+u, JSON.stringify(n)),
  getDice: (u: string): DiceStats => JSON.parse(localStorage.getItem("dice_stats_"+u)||'{"profit":0,"wagered":0,"wins":0,"losses":0,"history":[],"autoRemaining":0}'),
  saveDice: (u: string, d: DiceStats) => localStorage.setItem("dice_stats_"+u, JSON.stringify(d)),
  getDiceBets: (u: string): DiceBetRecord[] => JSON.parse(localStorage.getItem("dice_bets_"+u)||"[]"),
  saveDiceBets: (u: string, b: DiceBetRecord[]) => localStorage.setItem("dice_bets_"+u, JSON.stringify(b)),
  getPlinko: (u: string): PlinkoStats => JSON.parse(localStorage.getItem("plinko_stats_"+u)||'{"profit":0,"wagered":0,"wins":0,"losses":0,"history":[]}'),
  savePlinko: (u: string, d: PlinkoStats) => localStorage.setItem("plinko_stats_"+u, JSON.stringify(d)),
  getPlinkoBets: (u: string): PlinkoBetRecord[] => JSON.parse(localStorage.getItem("plinko_bets_"+u)||"[]"),
  savePlinkoBets: (u: string, b: PlinkoBetRecord[]) => localStorage.setItem("plinko_bets_"+u, JSON.stringify(b)),
  getKeno: (u: string): KenoStats => JSON.parse(localStorage.getItem("keno_stats_"+u)||'{"profit":0,"wagered":0,"wins":0,"losses":0,"history":[]}'),
  saveKeno: (u: string, d: KenoStats) => localStorage.setItem("keno_stats_"+u, JSON.stringify(d)),
  getKenoBets: (u: string): KenoBetRecord[] => JSON.parse(localStorage.getItem("keno_bets_"+u)||"[]"),
  saveKenoBets: (u: string, b: KenoBetRecord[]) => localStorage.setItem("keno_bets_"+u, JSON.stringify(b)),
  getMines: (u: string): MinesStats => JSON.parse(localStorage.getItem("mines_stats_"+u)||'{"wins":0,"losses":0,"profit":0,"wagered":0,"history":[]}'),
  saveMines: (u: string, d: MinesStats) => localStorage.setItem("mines_stats_"+u, JSON.stringify(d)),
  getMinesBets: (u: string): GameBetRecord[] => JSON.parse(localStorage.getItem("mines_bets_"+u)||"[]"),
  saveMinesBets: (u: string, b: GameBetRecord[]) => localStorage.setItem("mines_bets_"+u, JSON.stringify(b)),
  getBJBets: (u: string): GameBetRecord[] => JSON.parse(localStorage.getItem("bj_bets_"+u)||"[]"),
  saveBJBets: (u: string, b: GameBetRecord[]) => localStorage.setItem("bj_bets_"+u, JSON.stringify(b)),
  getHilo: (u: string): HiloStats => JSON.parse(localStorage.getItem("hilo_stats_"+u)||'{"wins":0,"losses":0,"profit":0,"wagered":0,"history":[]}'),
  saveHilo: (u: string, d: HiloStats) => localStorage.setItem("hilo_stats_"+u, JSON.stringify(d)),
  getHiloBets: (u: string): GameBetRecord[] => JSON.parse(localStorage.getItem("hilo_bets_"+u)||"[]"),
  saveHiloBets: (u: string, b: GameBetRecord[]) => localStorage.setItem("hilo_bets_"+u, JSON.stringify(b)),
  getRoulette: (u: string): RouletteStats => JSON.parse(localStorage.getItem("roulette_stats_"+u)||'{"wins":0,"losses":0,"profit":0,"wagered":0,"history":[]}'),
  saveRoulette: (u: string, d: RouletteStats) => localStorage.setItem("roulette_stats_"+u, JSON.stringify(d)),
  getRouletteBets: (u: string): GameBetRecord[] => JSON.parse(localStorage.getItem("roulette_bets_"+u)||"[]"),
  saveRouletteBets: (u: string, b: GameBetRecord[]) => localStorage.setItem("roulette_bets_"+u, JSON.stringify(b)),
  getBaccarat: (u: string): BaccaratStats => JSON.parse(localStorage.getItem("baccarat_stats_"+u)||'{"wins":0,"losses":0,"ties":0,"profit":0,"wagered":0,"history":[]}'),
  saveBaccarat: (u: string, d: BaccaratStats) => localStorage.setItem("baccarat_stats_"+u, JSON.stringify(d)),
  getBaccaratBets: (u: string): GameBetRecord[] => JSON.parse(localStorage.getItem("baccarat_bets_"+u)||"[]"),
  saveBaccaratBets: (u: string, b: GameBetRecord[]) => localStorage.setItem("baccarat_bets_"+u, JSON.stringify(b)),
  getCoinBalances:  (u: string): Record<string,number> => { try { return JSON.parse(localStorage.getItem("coin_balances_"+u)||"{}"); } catch { return {}; } },
  saveCoinBalances: (u: string, b: Record<string,number>) => localStorage.setItem("coin_balances_"+u, JSON.stringify(b)),
  getWagerReq:        (u: string) => parseFloat(localStorage.getItem("wager_req_"+u)||"0"),
  setWagerReq:        (u: string, amt: number) => localStorage.setItem("wager_req_"+u, String(+Math.max(0,amt).toFixed(4))),
  addWagerReq:        (u: string, amt: number) => {
    const prev = parseFloat(localStorage.getItem("wager_req_"+u)||"0");
    const next = +(prev + amt).toFixed(4);
    localStorage.setItem("wager_req_"+u, String(next));
    // Acumular también el total requerido (para barra de progreso)
    const prevInit = parseFloat(localStorage.getItem("wager_req_initial_"+u)||"0");
    localStorage.setItem("wager_req_initial_"+u, String(+(prevInit + amt).toFixed(4)));
  },
  // wager_req_initial = total acumulado de depósitos que requirieron wagering (para la barra de progreso)
  getWagerReqInitial: (u: string) => parseFloat(localStorage.getItem("wager_req_initial_"+u)||"0"),
  setWagerReqInitial: (u: string, amt: number) => localStorage.setItem("wager_req_initial_"+u, String(+Math.max(0,amt).toFixed(4))),
  getTotalWagered:  (u: string) => parseFloat(localStorage.getItem("total_wagered_"+u)||"0"),
  addTotalWagered:  (u: string, amt: number) => localStorage.setItem("total_wagered_"+u, String(+(parseFloat(localStorage.getItem("total_wagered_"+u)||"0") + amt).toFixed(4))),
  getTotalBetsCount:(u: string) => parseInt(localStorage.getItem("total_bets_count_"+u)||"0"),
  addTotalBetsCount:(u: string) => localStorage.setItem("total_bets_count_"+u, String(parseInt(localStorage.getItem("total_bets_count_"+u)||"0") + 1)),
};

// ─── Demo seed (module-level, runs once before any component renders) ────────
;(() => {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem("demo_users_seeded_v2")) return;
  const demos = [
    { u:"carlos_suerte", wagered:4820.50, dep:1200, bal:380, daysAgo:5 },
  ];
  demos.forEach(({ u, wagered, dep, bal, daysAgo }) => {
    if (localStorage.getItem("user_" + u)) return;
    const regDate = new Date(Date.now() - daysAgo * 86400_000).toISOString();
    const txDate  = new Date(Date.now() - (daysAgo - 1) * 86400_000).toISOString();
    localStorage.setItem("user_" + u, "Demo1234!");
    localStorage.setItem("email_" + u, u + "@example.com");
    localStorage.setItem("mander_id_" + u, "MND" + Math.random().toString(36).slice(2, 8).toUpperCase());
    localStorage.setItem("registered_at_" + u, regDate);
    localStorage.setItem("referral_" + u, "lucio123");
    localStorage.setItem("balance_" + u, String(bal));
    localStorage.setItem("total_wagered_" + u, String(wagered));
    localStorage.setItem("transactions_" + u, JSON.stringify([
      { id:"tx_demo_1", type:"deposit", amount:dep, status:"completed", date:txDate, method:"USDT" },
    ]));
  });
  localStorage.setItem("demo_users_seeded_v2", "1");
})();

// ─── Capture URL hash at module load time ──────────────────────────────────
// This runs ONCE before React renders and before Supabase can call
// window.history.replaceState, so window.location.hash is guaranteed intact.
// We use these flags in the auth useEffect to detect email-confirmation and
// password-recovery redirects without racing against the Supabase client.
const _INIT_HASH     = window.location.hash;
const _HASH_PARAMS   = new URLSearchParams(_INIT_HASH.replace(/^#/, ""));
const _IS_EMAIL_CONFIRM = _INIT_HASH.includes("access_token") && _HASH_PARAMS.get("type") === "signup";
const _IS_RECOVERY      = _INIT_HASH.includes("access_token") && _HASH_PARAMS.get("type") === "recovery";

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  // ─── LANGUAGE ────────────────────────────────────────────────────────────
  const [lang, setLangRaw] = useState<string>(() => detectLang());
  const t = useCallback((key: string) => tl(lang, key), [lang]);
  const setLang = (l: string) => {
    localStorage.setItem("mander_lang", l);
    setLangRaw(l);
  };
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("mander_lang")) return;
    fetch("https://ipapi.co/json/")
      .then(r => r.json())
      .then(d => {
        const c = (d.country_code || "").toLowerCase();
        const detected = COUNTRY_LANG[c] || "en";
        setLangRaw(detected);
      })
      .catch(() => {});
  }, []);

  // ─── AUTH ─────────────────────────────────────────────────────────────────
  const [supaSession, setSupaSession] = useState<AuthSession | null>(null);
  // Ref para acceder a la sesión dentro de callbacks sin problemas de stale closure
  const supaSessionRef = useRef<AuthSession | null>(null);
  // Ref que almacena el UUID real de Supabase del depósito pendiente en cuanto
  // la API responde — evita la race condition al confirmar antes de que resuelva el POST
  const pendingDepositServerIdRef = useRef<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authModal, setAuthModal] = useState<""|"login"|"register"|"forgot"|"reset">(""); 
  const [resetToken, setResetToken] = useState("");
  const [resetNewPass, setResetNewPass] = useState("");
  const [resetConfirmPass, setResetConfirmPass] = useState("");
  const [showResetNew, setShowResetNew] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [regUser, setRegUser] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regReferral, setRegReferral] = useState("");
  const [regTerms, setRegTerms] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);
  const [regPassFocused, setRegPassFocused] = useState(false);
  const [regEmailFocused, setRegEmailFocused] = useState(false);

  const [currentUser, setCurrentUser] = useState(() => ls.get("currentUser")||"");
  const [privateMode, setPrivateMode] = useState(() => localStorage.getItem("privateMode_" + (ls.get("currentUser")||"")) === "1");
  const [vipWagered, setVipWagered] = useState(() => ls.getTotalWagered(ls.get("currentUser")||""));
  const [totalBetsCount, setTotalBetsCount] = useState(() => ls.getTotalBetsCount(ls.get("currentUser")||""));
  const [rbInstant, setRbInstant] = useState(() => getRakebackBalances(ls.get("currentUser")||"").instant);
  const [rbWeekly,  setRbWeekly]  = useState(() => getRakebackBalances(ls.get("currentUser")||"").weekly);
  const [rbMonthly, setRbMonthly] = useState(() => getRakebackBalances(ls.get("currentUser")||"").monthly);
  const [userEmail,      setUserEmail]      = useState("");
  const [accountStatus,  setAccountStatus]  = useState("activo");
  const [profileDetails, setProfileDetails] = useState<{
    country?: string; currency?: string; last_ip?: string;
    device_info?: string; notes?: string; referrer_id?: string; username?: string; created_at?: string;
  }>({});
  const [rbTick,    setRbTick]    = useState(0); // ticks every second to refresh countdown displays
  const [rankPendingReward, setRankPendingReward] = useState<{ amount: number; rankName: string; gradient: string; color: string; image: string } | null>(() => {
    const user = ls.get("currentUser") || "";
    if (!user) return null;
    const raw = localStorage.getItem("rank_pending_reward_" + user);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed[0] ?? null;
      // Migrar formato antiguo (objeto único) a array
      localStorage.setItem("rank_pending_reward_" + user, JSON.stringify([parsed]));
      return parsed;
    } catch { return null; }
  });
  const [rankCreditToast, setRankCreditToast] = useState<{ amount: number; rankName: string; gradient: string; color: string } | null>(null);
  const [balance, setBalanceState] = useState(0);
  const [displayedBalance, setDisplayedBalance] = useState(0);
  const balanceAnimRef = useRef<number|null>(null);
  const balanceInstantRef = useRef(false);
  const displayedBalRef = useRef(0);

  // ── Precios en tiempo real desde CoinGecko ──────────────────────────────────
  const livePricesRef = useRef<Record<string, number>>(
    Object.fromEntries(Object.entries(coinConfig).map(([k, v]) => [k, v.priceUsd]))
  );
  const [livePrices, setLivePrices] = useState<Record<string, number>>(livePricesRef.current);

  const getPriceUsd = (coin: string): number =>
    livePricesRef.current[coin] ?? coinConfig[coin]?.priceUsd ?? 1;

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = Object.values(COINGECKO_IDS).join(",");
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return;
        const data = await res.json();
        const updated: Record<string, number> = { ...livePricesRef.current };
        for (const [coin, id] of Object.entries(COINGECKO_IDS)) {
          if ((data as Record<string, { usd?: number }>)[id]?.usd) {
            updated[coin] = (data as Record<string, { usd: number }>)[id].usd;
          }
        }
        livePricesRef.current = updated;
        // También actualizar coinConfig para que funciones auxiliares (minDepositNative, etc.) usen precios reales
        for (const [coin, price] of Object.entries(updated)) {
          if (coinConfig[coin]) coinConfig[coin].priceUsd = price;
        }
        setLivePrices(updated);
        console.log("[Prices] Live prices updated:", updated);
      } catch {
        // Silently fail — keep using last known prices
      }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const [bjStats, setBjStats] = useState<BJStats>(bjStatsDefault);
  const [bjBetHistory, setBjBetHistory] = useState<GameBetRecord[]>([]);
  const [hiloStats, setHiloStats] = useState<HiloStats>(hiloStatsDefault);
  const [hiloBetHistory, setHiloBetHistory] = useState<GameBetRecord[]>([]);
  const [rouletteStats, setRouletteStats] = useState<RouletteStats>(rouletteStatsDefault);
  const [rouletteBetHistory, setRouletteBetHistory] = useState<GameBetRecord[]>([]);
  const [baccaratStats, setBaccaratStats] = useState<BaccaratStats>(baccaratStatsDefault);
  const [baccaratBetHistory, setBaccaratBetHistory] = useState<GameBetRecord[]>([]);
  const [minesStats, setMinesStats] = useState<MinesStats>(minesStatsDefault);
  const [minesBetHistory, setMinesBetHistory] = useState<GameBetRecord[]>([]);
  const [diceStats, setDiceStats] = useState<DiceStats>({ profit:0,wagered:0,wins:0,losses:0,history:[],autoRemaining:0 });
  const [diceBetHistory, setDiceBetHistory] = useState<DiceBetRecord[]>([]);
  const [diceVol, setDiceVol] = useState(70);
  const diceVolRef = useRef(70);

  // ── Plinko state ──────────────────────────────────────────────────────────
  const [plinkoStats, setPlinkoStats] = useState<PlinkoStats>({ profit:0,wagered:0,wins:0,losses:0,history:[] });
  const [plinkoBetHistory, setPlinkoBetHistory] = useState<PlinkoBetRecord[]>([]);
  const [plinkoBet, setPlinkoBet] = useState("1.00");
  const [plinkoRows, setPlinkoRows] = useState(8);
  const [plinkoRisk, setPlinkoRisk] = useState<"low"|"medium"|"high">("medium");
  const [plinkoAutoCount, setPlinkoAutoCount] = useState("10");
  const [plinkoAutoRemaining, setPlinkoAutoRemaining] = useState(0);
  const [plinkoAutoRunning, setPlinkoAutoRunning] = useState(false);
  const [pendingPlinkoBalls, setPendingPlinkoBalls] = useState<PendingPlinkoball[]>([]);
  const plinkoDropIdRef = useRef(0);
  const plinkoAutoRunRef = useRef(false);
  const [plinkoVol, setPlinkoVol]         = useState(70);
  const plinkoVolRef                      = useRef(70);
  const plinkoAudioCtxRef                 = useRef<AudioContext | null>(null);
  const [showPlinkoVol, setShowPlinkoVol] = useState(false);
  const plinkoLoopIdRef = useRef(0);

  // ── Keno state ────────────────────────────────────────────────────────────
  const [kenoStats, setKenoStats] = useState<KenoStats>({ profit:0,wagered:0,wins:0,losses:0,history:[] });
  const [kenoBetHistory, setKenoBetHistory] = useState<KenoBetRecord[]>([]);
  const [kenoBet, setKenoBet] = useState("1.00");
  const [kenoPickedNums, setKenoPickedNums] = useState<number[]>([]);
  const [kenoDrawnNums, setKenoDrawnNums] = useState<number[]>([]);
  const [kenoIsDrawing, setKenoIsDrawing] = useState(false);
  const [kenoAutoCount, setKenoAutoCount] = useState("10");
  const [kenoAutoRemaining, setKenoAutoRemaining] = useState(0);
  const [kenoAutoRunning, setKenoAutoRunning] = useState(false);
  const [kenoLastResult, setKenoLastResult] = useState<{hits:number;multiplier:number;payout:number;win:boolean}|null>(null);
  const [minesGameActive, setMinesGameActive] = useState(false);
  const [hiloGameActive, setHiloGameActive] = useState(false);
  const [bjGameActive, setBjGameActive] = useState(false);
  const [rouletteGameActive, setRouletteGameActive] = useState(false);
  const [baccaratGameActive, setBaccaratGameActive] = useState(false);
  const kenoAutoRunRef = useRef(false);
  const kenoLoopIdRef = useRef(0);
  const baccaratStopRef = useRef<(() => void) | null>(null);
  const [kenoRisk, setKenoRisk] = useState<"low"|"medium"|"high"|"classic">("classic");

  const [liveWins, setLiveWins] = useState<LiveWin[]>(()=>{
    try { const s = localStorage.getItem("mander_live_wins"); const saved = s ? JSON.parse(s) : []; return saved.length > 0 ? saved : makeFakeWins(14); } catch { return makeFakeWins(14); }
  });

  const [section, setSection] = useState("home");
  const [homeView, setHomeView] = useState<"dashboard"|"dice"|"plinko"|"slot"|"keno"|"blackjack"|"mines"|"originals"|"hilo"|"roulette"|"baccarat">("dashboard");
  const [homeCategory, setHomeCategory] = useState("Lobby");
  const [extGameModal, setExtGameModal] = useState<{name:string;url:string;image:string}|null>(null);
  const extIframeRef = useRef<HTMLIFrameElement|null>(null);
  const extFallbackTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const [balanceDropOpen, setBalanceDropOpen] = useState(false);
  const [coinBalances, setCoinBalances] = useState<Record<string,number>>({});
  const coinBalancesRef = useRef<Record<string,number>>({});
  const [displayInFiat, setDisplayInFiat] = useState(false);
  const [hideZeroBalances, setHideZeroBalances] = useState(false);
  const [fiatCurrPickerOpen, setFiatCurrPickerOpen] = useState(false);
  const [fiatCurrSearch, setFiatCurrSearch] = useState("");
  const [currencyFade, setCurrencyFade] = useState(1);
  const isFirstCurrRender = useRef(true);
  const [profileDropOpen, setProfileDropOpen] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [rewardsDropOpen, setRewardsDropOpen] = useState(false);
  const notifPanelRef = useRef<HTMLDivElement|null>(null);
  const rewardsDropRef = useRef<HTMLDivElement|null>(null);
  const profileDropRef = useRef<HTMLDivElement|null>(null);
  const autoGenKeySet = useRef<Set<string>>(new Set());
  const depositGenCounter = useRef(0);
  const [rwPage, setRwPage] = useState(0);
  const [txFilter, setTxFilter] = useState<"deposit"|"withdraw">("deposit");
  const [txPage, setTxPage] = useState(0);
  const [bhFilter, setBhFilter] = useState<string>("all");
  const [bhPage, setBhPage] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<{ title:string; message:string; type:AppNotification["type"]|"win"|"confirm" }|null>(null);
  const [toastExiting, setToastExiting] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const toastExitTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [wagerAlert, setWagerAlert] = useState<{ required: number; wagered: number; remaining: number }|null>(null);

  const [walletConfigOpen, setWalletConfigOpen] = useState(false);
  const [walletSearch, setWalletSearch] = useState("");
  const [liveRates, setLiveRates] = useState<Record<string,number>>(FALLBACK_RATES);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<Date|null>(null);

  const [cashierOpen, setCashierOpen] = useState(false);
  const [cashierTab, setCashierTab] = useState<"deposit"|"withdraw">("deposit");
  const [depositCoin, setDepositCoin] = useState("USDT");
  const depositCoinRef = useRef("USDT");
  const balanceSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard: no sincronizar balance al servidor hasta que fetchRemoteBalance haya cargado al menos una vez.
  // Evita que eventos de juego stale borren balances reales durante el arranque.
  const hasRemoteBalanceLoadedRef = useRef(false);
  // Mantener coinBalancesRef sincronizado para evitar closures stale en setCoinBalanceUsd
  useEffect(() => { coinBalancesRef.current = coinBalances; }, [coinBalances]);

  // When the user switches coins, re-derive the displayed balance for the active coin
  useEffect(() => {
    depositCoinRef.current = depositCoin;
    // Persist active coin so it can be restored on next login
    if (currentUser) ls.set("deposit_coin_" + currentUser, depositCoin);
    // Reset withdrawal network to first valid network for the new active coin
    const firstNet = coinConfig[depositCoin]?.networks?.[0];
    if (firstNet) setWithdrawNetwork(firstNet);
    if (Object.keys(coinBalances).length === 0) return;
    // Active coin USD — los juegos necesitan esto en localStorage para deducir correctamente
    const activePriceUsd = getPriceUsd(depositCoin);
    const activeCoinUsd = (coinBalances[depositCoin] ?? 0) * activePriceUsd;
    balanceInstantRef.current = true;
    setBalanceState(activeCoinUsd);
    displayedBalRef.current = activeCoinUsd;
    setDisplayedBalance(activeCoinUsd);
    ls.setBalance(currentUser, activeCoinUsd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositCoin]);
  const [depositNetwork, setDepositNetwork] = useState("TRC20");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositError, setDepositError] = useState("");
  const [depositView, setDepositView] = useState<"select"|"generated">("select");
  const [pendingDeposit, setPendingDeposit] = useState<Transaction|null>(null);
  const [addressCopied, setAddressCopied] = useState(false);

  // withdrawCoin siempre sigue a la moneda activa — el network se resetea en el useEffect de depositCoin
  const withdrawCoin = depositCoin;
  const [withdrawNetwork, setWithdrawNetwork] = useState("TRC20");
  const [showCoinDrop, setShowCoinDrop] = useState(false);
  const [showNetDrop, setShowNetDrop] = useState(false);
  const [showWNetDrop, setShowWNetDrop] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawError, setWithdrawError] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [fairnessGame, setFairnessGame] = useState("Dice");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [originalsMenuOpen, setOriginalsMenuOpen] = useState(false);

  // ── Support Chat ──────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [chatScreen, setChatScreen] = useState<"lobby"|"chat">("lobby");
  const [chatVerified, setChatVerified] = useState(false);
  const [chatAuthUser, setChatAuthUser] = useState("");
  const [chatAuthInput, setChatAuthInput] = useState("");
  const [chatAuthError, setChatAuthError] = useState("");
  const [chatMessages, setChatMessages] = useState<{role:"user"|"assistant";content:string;system?:boolean}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLastActivity, setChatLastActivity] = useState<number|null>(null);
  const [chatWarnShown, setChatWarnShown] = useState(false);
  const [chatSessions, setChatSessions] = useState<{id:number;date:string;messages:{role:"user"|"assistant";content:string}[]}[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const [chatEmojiOpen, setChatEmojiOpen] = useState(false);
  const [chatPendingFile, setChatPendingFile] = useState<{name:string;size:string}|null>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [chatMessages, chatLoading]);

  useEffect(() => {
    function onCasinoNav(e: Event) {
      const dest = (e as CustomEvent<string>).detail;
      if (dest === "support") { setChatOpen(true); if (currentUser) loadChatSessions(currentUser); return; }
      window.scrollTo({ top: 0, behavior: "instant" });
      if (dest === "privacy") { setSection("privacy"); }
      else if (dest === "terms") { setSection("terms"); }
      else if (dest === "fairness") { setSection("fairness"); }
      else { openSection(dest); }
    }
    window.addEventListener("casino-nav", onCasinoNav);
    return () => window.removeEventListener("casino-nav", onCasinoNav);
  }, [currentUser]);

  function playChatSound() {
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.08);
      osc1.connect(gain);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.5);
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.07);
      osc2.frequency.exponentialRampToValueAtTime(1480, ctx.currentTime + 0.15);
      const gain2 = ctx.createGain();
      gain2.connect(ctx.destination);
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.07);
      gain2.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc2.connect(gain2);
      osc2.start(ctx.currentTime + 0.07);
      osc2.stop(ctx.currentTime + 0.5);
    } catch {}
  }

  function loadChatSessions(username: string) {
    try {
      const raw = localStorage.getItem(`chat_sessions_${username}`);
      setChatSessions(raw ? JSON.parse(raw) : []);
    } catch { setChatSessions([]); }
  }

  function saveChatSession(username: string, messages: {role:"user"|"assistant";content:string}[]) {
    if (!username || messages.filter(m=>m.role==="user").length === 0) return;
    try {
      const raw = localStorage.getItem(`chat_sessions_${username}`);
      const sessions = raw ? JSON.parse(raw) : [];
      const ticketId = Math.floor(10000000 + Math.random() * 90000000);
      sessions.unshift({ id: Date.now(), date: new Date().toISOString(), ticketId, messages });
      localStorage.setItem(`chat_sessions_${username}`, JSON.stringify(sessions.slice(0, 10)));
      setChatSessions(sessions.slice(0, 10));
    } catch {}
  }

  function goChat() { setChatScreen("chat"); }
  function goLobby() { setChatScreen("lobby"); }

  function closeChat(username?: string) {
    const u = username || chatAuthUser;
    setChatMessages(prev => {
      saveChatSession(u, prev.filter(m=>!m.system));
      return [];
    });
    setChatVerified(false);
    setChatInput("");
    setChatLastActivity(null);
    setChatWarnShown(false);
    setChatEmojiOpen(false);
    setChatPendingFile(null);
    goLobby();
  }

  function handleChatFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kb = file.size / 1024;
    const size = kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb/1024).toFixed(1)} MB`;
    setChatPendingFile({ name: file.name, size });
    e.target.value = "";
  }

  function sendFileMessage() {
    if (!chatPendingFile) return;
    const msg = `📎 ${chatPendingFile.name} (${chatPendingFile.size})`;
    setChatPendingFile(null);
    setChatInput(prev => prev ? `${prev} ${msg}` : msg);
  }

  const CHAT_EMOJIS = ["😀","😂","😍","😎","🤔","😅","😭","🥰","😤","🤗","👍","👎","🙏","❤️","🎉","🎲","💰","🏆","😮","😱","🤣","💪","🔥","✅","❌","💯","🎁","🤝","😴","🤑","🎯","🍀","🤞","😏","🤩","🥳","🎰","💎","🃏","🎴"];

  useEffect(() => {
    if (!chatVerified || chatScreen !== "chat") return;
    const id = setInterval(() => {
      setChatLastActivity(prev => {
        if (prev === null) return prev;
        const elapsed = Date.now() - prev;
        if (elapsed >= 5 * 60 * 1000) {
          closeChat(chatAuthUser);
          clearInterval(id);
        } else if (elapsed >= 3 * 60 * 1000) {
          setChatWarnShown(w => {
            if (!w) {
              setChatMessages(msgs => [
                ...msgs,
                { role:"assistant" as const, content:"⚠️ Tu sesión se cerrará en 2 minutos por inactividad. ¡Escribe algo para mantenerla activa!", system: true },
              ]);
              return true;
            }
            return w;
          });
        }
        return prev;
      });
    }, 10_000);
    return () => clearInterval(id);
  }, [chatVerified, chatScreen, chatAuthUser]);

  function verifyChatUser() {
    const name = chatAuthInput.trim();
    if (!name) return setChatAuthError("Ingresá tu nombre de usuario");
    if (!ls.get("user_"+name)) return setChatAuthError("Usuario no encontrado");
    setChatAuthUser(name);
    setChatVerified(true);
    setChatAuthError("");
    setChatLastActivity(Date.now());
    setChatWarnShown(false);
    setChatMessages([{ role:"assistant", content:`¡Hola ${name}! Soy Mia, tu agente de soporte de Mander Casino 🎲. ¿En qué puedo ayudarte hoy?` }]);
    loadChatSessions(name);
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatLastActivity(Date.now());
    setChatWarnShown(false);
    const newMessages = [...chatMessages.filter(m=>!m.system), { role:"user" as const, content:userMsg }];
    setChatMessages([...chatMessages.filter(m=>!m.system), { role:"user" as const, content:userMsg }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/support-chat", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ messages: newMessages, username: chatAuthUser }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = "";
      setChatMessages(prev => [...prev, { role:"assistant", content:"" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.content) {
            assistantMsg += data.content;
            const displayMsg = assistantMsg.replace("[CERRAR_CHAT]", "").trimEnd();
            setChatMessages(prev => {
              const updated = [...prev];
              updated[updated.length-1] = { role:"assistant", content:displayMsg };
              return updated;
            });
          }
        }
      }
      if (assistantMsg.includes("[CERRAR_CHAT]")) {
        const cleanMsg = assistantMsg.replace("[CERRAR_CHAT]", "").trimEnd();
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length-1] = { role:"assistant", content:cleanMsg };
          return updated;
        });
        setTimeout(() => closeChat(), 2200);
      }
    } catch {
      setChatMessages(prev => [...prev, { role:"assistant", content:"Error al conectar. Intentá de nuevo." }]);
    } finally {
      setChatLoading(false);
      playChatSound();
    }
  }
  const [bannerSlide, setBannerSlide] = useState(0);
  const [searchCategory, setSearchCategory] = useState("All");
  const [searchQ, setSearchQ] = useState("");

  const [statsRange, setStatsRange] = useState<"7d"|"30d"|"all">("7d");
  const [bets, setBets] = useState<Bet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Dice state
  const [diceBet, setDiceBet] = useState("0.01");
  const [diceMultiplier, setDiceMultiplier] = useState("2.0000");
  const [diceTarget, setDiceTarget] = useState("50.50");
  const [diceChance, setDiceChance] = useState("49.5000");
  const [diceAutoCount, setDiceAutoCount] = useState("10");
  const [diceAutoRemaining, setDiceAutoRemaining] = useState(0);
  const [diceMarkerLeft, setDiceMarkerLeft] = useState(5);
  const [diceMarkerTransition, setDiceMarkerTransition] = useState("none");
  const [diceBubbleVal, setDiceBubbleVal] = useState("49.10");
  const [diceBubbleWin, setDiceBubbleWin] = useState<boolean|null>(null);
  const diceMarkerAnimRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [diceAutoRunning, setDiceAutoRunning] = useState(false);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceMode, setDiceMode] = useState<"over"|"under">("over");
  const autoRunRef    = useRef(false);
  const loopIdRef     = useRef(0);
  const manualBetRef  = useRef(false);


  const convertUsd = useCallback((v: number) => v * (liveRates[displayCurrency]||1), [displayCurrency, liveRates]);
  const fmtMoney = useCallback((v: number) => {
    const converted = convertUsd(v);
    const sym = getCurrencySymbol(displayCurrency);
    const rate = FALLBACK_RATES[displayCurrency] || 1;
    const decimals = rate >= 10000 ? 0 : 2;
    const amount = converted.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${sym}${amount} ${displayCurrency}`;
  }, [convertUsd, displayCurrency]);

  // ── Obtiene el balance real desde la tabla "balances" de Supabase ────────────
  // Llama a GET /api/balance y actualiza el estado + localStorage.
  // Se invoca: al cargar usuario, después de cada transacción completada.
  const fetchRemoteBalance = useCallback(async (u: string, { postDeposit = false }: { postDeposit?: boolean } = {}) => {
    if (!u) return;
    const sess = supaSessionRef.current;
    // Intentar con Supabase session primero (si existe y es del mismo usuario)
    let token: string | null = null;
    if (sess?.access_token) {
      const sessionUser = sess.user?.user_metadata?.username || sess.user?.email || "";
      if (!sessionUser || sessionUser === u || sessionUser.startsWith(u + "@")) {
        token = sess.access_token;
      }
    }
    // Fallback: usar game-token (funciona para todos los usuarios, sin Supabase Auth)
    if (!token) token = localStorage.getItem(`mander_game_token_${u}`);
    // Si tampoco hay game-token almacenado, intentar obtenerlo ahora (cubre race condition del primer login)
    if (!token) {
      try {
        const tr = await fetch("/api/auth/local-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u }) });
        const td = tr.ok ? await tr.json() : null;
        if (td?.token) { localStorage.setItem(`mander_game_token_${u}`, td.token); token = td.token; }
      } catch {}
    }
    if (!token) return;
    try {
      const res = await fetch("/api/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      console.log("Fetched balance:", data.total_usd, "| breakdown:", data.balances);
      if (Array.isArray(data.balances)) {
        const map: Record<string,number> = {};
        // Acumular con + para tolerar filas duplicadas en la tabla balances.
        // Ignorar filas con balance = 0 (monedas de apuestas pasadas) para que no
        // aparezcan en el selector al volver a entrar.
        for (const row of data.balances) {
          const amt = Number(row.balance) || 0;
          if (amt > 0) map[row.currency] = (map[row.currency] ?? 0) + amt;
        }
        // Marcar que ya cargamos balance real del servidor — ahora balance/sync puede correr
        hasRemoteBalanceLoadedRef.current = true;
        // RACE CONDITION GUARD: Si hay una apuesta pendiente de sincronizar (balanceSyncTimerRef
        // activo), el servidor aún no sabe del bet — no sobreescribir el balance local con el
        // valor stale del servidor. El balance/sync enviará el valor correcto en ~800ms y el
        // cache se actualizará en ese momento (ver setCoinBalanceUsd).
        if (balanceSyncTimerRef.current !== null) return;
        coinBalancesRef.current = map; // actualizar ref de inmediato (sin esperar re-render)
        setCoinBalances(map);
        ls.saveCoinBalances(u, map); // cache local para restaurar al próximo login sin flash de $0
        const activeCoin = depositCoinRef.current;
        const activePriceUsd = getPriceUsd(activeCoin);
        // Siempre mostrar solo el valor de la moneda activa (nativo × precio).
        // stored_usd es el total de todas las criptos y no debe usarse para el display.
        const activeCoinUsd = (map[activeCoin] ?? 0) * activePriceUsd;
        if (activeCoinUsd >= 0) {
          ls.setBalance(u, activeCoinUsd);
          setBalanceState(activeCoinUsd);
          displayedBalRef.current = activeCoinUsd;
          setDisplayedBalance(activeCoinUsd);
        }
      }
    } catch (e) {
      console.error("[fetchRemoteBalance] error:", e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRemoteBalanceRef = useRef(fetchRemoteBalance);
  useEffect(() => { fetchRemoteBalanceRef.current = fetchRemoteBalance; }, [fetchRemoteBalance]);

  const loadUser = useCallback(async (u: string) => {
    const cur = ls.get("display_currency_"+u) || "USD";
    const dice = ls.getDice(u);
    const userBets = ls.getBets(u);
    let userTx = ls.getTx(u);
    // Asignar display_id a transacciones históricas que no lo tengan aún
    const needsPatch = userTx.some(tx => (tx.type==="deposit"||tx.type==="withdraw") && !tx.display_id);
    if (needsPatch) {
      userTx = userTx.map(tx => {
        if ((tx.type==="deposit"||tx.type==="withdraw") && !tx.display_id) {
          return { ...tx, display_id: nextDisplayId(tx.type as "deposit"|"withdraw") };
        }
        return tx;
      });
      ls.saveTx(u, userTx);
    }
    const userDiceBets = ls.getDiceBets(u);
    const plinko = ls.getPlinko(u);
    const userPlinkoBets = ls.getPlinkoBets(u);
    const keno = ls.getKeno(u);
    const userKenoBets = ls.getKenoBets(u);
    const mines = ls.getMines(u);
    const userMinesBets = ls.getMinesBets(u);
    const userBJBets = ls.getBJBets(u);
    const hilo = ls.getHilo(u);
    const userHiloBets = ls.getHiloBets(u);
    // Restore active deposit coin from last session before fetchRemoteBalance fires
    const savedCoin = ls.get("deposit_coin_" + u);
    if (savedCoin) {
      depositCoinRef.current = savedCoin;
      setDepositCoin(savedCoin);
    }
    // Restaurar balances cacheados por moneda para evitar el flash de $0 al iniciar sesión.
    // fetchRemoteBalance sobreescribirá con los valores reales del servidor en ~1-2s.
    const cachedCoins = ls.getCoinBalances(u);
    if (Object.keys(cachedCoins).length > 0) {
      coinBalancesRef.current = cachedCoins;
      setCoinBalances(cachedCoins);
      const activeCoin = savedCoin || depositCoinRef.current;
      const cachedPrice = getPriceUsd(activeCoin); // usa coinConfig como fallback si live prices no cargaron aún
      const cachedUsd = (cachedCoins[activeCoin] ?? 0) * cachedPrice;
      setBalanceState(cachedUsd);
      ls.setBalance(u, cachedUsd);
      displayedBalRef.current = cachedUsd;
      setDisplayedBalance(cachedUsd);
    } else {
      setBalanceState(0);
      displayedBalRef.current = 0;
      setDisplayedBalance(0);
    }
    setDisplayCurrency(cur);
    setNotifications(ls.getNotifs(u));
    setDiceStats({ ...dice, autoRemaining: dice.autoRemaining||0 });
    setBets(userBets);
    setTransactions(userTx);
    setDiceBetHistory(userDiceBets);
    setPlinkoStats({ ...plinko });
    setPlinkoBetHistory(userPlinkoBets);
    setKenoStats({ ...keno });
    setKenoBetHistory(userKenoBets);
    setMinesStats({ ...mines });
    setMinesBetHistory(userMinesBets);
    setBjBetHistory(userBJBets);
    setHiloStats({ ...hilo });
    setHiloBetHistory(userHiloBets);
    const roulette = ls.getRoulette(u);
    const userRouletteBets = ls.getRouletteBets(u);
    setRouletteStats({ ...roulette });
    setRouletteBetHistory(userRouletteBets);
    const baccarat = ls.getBaccarat(u);
    const userBaccaratBets = ls.getBaccaratBets(u);
    setBaccaratStats({ ...baccaratStatsDefault, ...baccarat });
    setBaccaratBetHistory(userBaccaratBets);
    const vipW = ls.getTotalWagered(u);
    setVipWagered(vipW);
    setTotalBetsCount(ls.getTotalBetsCount(u));
    const rb = getRakebackBalances(u);
    setRbInstant(rb.instant);
    setRbWeekly(rb.weekly);
    setRbMonthly(rb.monthly);
    const pendingRaw = localStorage.getItem("rank_pending_reward_" + u);
    if (pendingRaw) {
      try {
        const parsed = JSON.parse(pendingRaw);
        if (Array.isArray(parsed)) {
          setRankPendingReward(parsed[0] ?? null);
        } else {
          // Migrar formato antiguo (objeto único) a array
          localStorage.setItem("rank_pending_reward_" + u, JSON.stringify([parsed]));
          setRankPendingReward(parsed);
        }
      } catch { setRankPendingReward(null); }
    } else {
      setRankPendingReward(null);
    }

    // ── Sync transacciones + balance desde Supabase en segundo plano ─────────
    const sess = supaSessionRef.current;
    // Determinar el token disponible: Supabase session o game-token
    const loadToken = sess?.access_token || localStorage.getItem(`mander_game_token_${u}`);
    if (loadToken) {
      try {
        // Transacciones (solo con sesión Supabase, el game-token no la tiene aún en /api/transactions)
        if (sess?.access_token) {
          const res = await fetch("/api/transactions", {
            headers: { Authorization: `Bearer ${sess.access_token}` },
          });
          if (res.ok) {
            const { transactions: serverTxs } = await res.json();
            const localTxs: Transaction[] = ls.getTx(u);
            const localById      = new Map(localTxs.map(t => [t.id, t]));
            const localByAddress = new Map(
              localTxs.filter(t => t.address).map(t => [t.address!, t])
            );
            const STATUS_RANK: Record<string, number> = { pending: 0, failed: 1, cancelled: 1, completed: 2 };
            const serverIds      = new Set<string>();
            const serverAddresses = new Set<string>();
            const mapped: Transaction[] = (serverTxs as any[]).map((tx: any) => {
              serverIds.add(tx.id);
              if (tx.external_tx_id) serverAddresses.add(tx.external_tx_id);
              const localTx =
                localById.get(tx.id) ??
                (tx.external_tx_id ? localByAddress.get(tx.external_tx_id) : undefined);
              const serverRank = STATUS_RANK[tx.status] ?? 0;
              const localRank  = localTx ? (STATUS_RANK[localTx.status] ?? 0) : -1;
              const finalStatus = localRank > serverRank ? localTx!.status : tx.status;
              return {
                id:         tx.id,
                type:       tx.type === "withdrawal" ? "withdraw" : tx.type,
                coin:       tx.currency,
                network:    tx.network,
                usdAmount:  tx.amount,
                coinAmount: localTx?.coinAmount,
                address:    tx.external_tx_id || localTx?.address || "",
                status:     finalStatus,
                createdAt:  tx.created_at,
                display_id: tx.display_id ?? localTx?.display_id,
              } as Transaction;
            });
            const localOnly = localTxs.filter(
              t => t.id && !serverIds.has(t.id) && (!t.address || !serverAddresses.has(t.address))
            );
            const merged = [...mapped, ...localOnly].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            ls.saveTx(u, merged);
            setTransactions(merged);
          }
        }
        // Balance: funciona tanto con Supabase session como con game-token
        await fetchRemoteBalanceRef.current(u);
      } catch { /* fallback silencioso: se mantienen los datos locales */ }
    }
  }, []);

  useEffect(() => {
    if (currentUser) loadUser(currentUser);
    setPrivateMode(localStorage.getItem("privateMode_" + currentUser) === "1");
  }, [currentUser, loadUser]);

  // Mantener supaSessionRef sincronizado con el estado
  useEffect(() => { supaSessionRef.current = supaSession; }, [supaSession]);

  // Restore Supabase session on mount
  useEffect(() => {
    getOrRefreshSession().then(s => { if (s) setSupaSession(s); });
  }, []);

  // Carga inicial desde Supabase cuando la sesión está disponible (incluyendo recarga de página)
  // profileLoadedRef se pone true DESPUÉS del fetch, para bloquear el sync de balance durante la carga
  const profileLoadedRef = useRef(false);
  const currencyFromDbRef = useRef(false); // evita que setDisplayCurrency desde DB dispare el sync
  useEffect(() => {
    if (!supaSession?.access_token || !currentUser || profileLoadedRef.current) return;
    (async () => {
      try {
        const profileRes = await fetch("/api/profile", {
          headers: { Authorization: `Bearer ${supaSession.access_token}` },
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData?.profile?.mander_id) {
            localStorage.setItem("mander_id_" + currentUser, profileData.profile.mander_id);
          }
          if (profileData?.profile?.email) setUserEmail(profileData.profile.email);
          if (profileData?.profile?.status) setAccountStatus(profileData.profile.status);
          setProfileDetails(prev => ({ ...prev, ...(profileData?.details || {}), created_at: profileData?.profile?.created_at || prev.created_at }));
          if (profileData?.details?.currency) {
            currencyFromDbRef.current = true;
            setDisplayCurrency(profileData.details.currency);
          }
          // Restaurar wager_req restante desde el servidor (nuevo modelo: saldo pendiente de apostar)
          const serverTotalDep = profileData?.stats?.total_deposit ?? 0;
          const serverWagered  = profileData?.stats?.wagered_total ?? 0;
          const serverRemaining = Math.max(0, serverTotalDep - serverWagered);
          // Migración única: la primera vez que cargamos con el nuevo modelo,
          // reemplazar cualquier valor legacy por el remanente correcto del servidor.
          const migrated = !!localStorage.getItem("wager_req_v2_" + currentUser);
          if (!migrated) {
            ls.setWagerReq(currentUser, serverRemaining);
            ls.setWagerReqInitial(currentUser, serverTotalDep);
            localStorage.setItem("wager_req_v2_" + currentUser, "1");
          } else if (serverRemaining > ls.getWagerReq(currentUser)) {
            ls.setWagerReq(currentUser, serverRemaining);
            ls.setWagerReqInitial(currentUser, Math.max(serverTotalDep, ls.getWagerReqInitial(currentUser)));
          }
        }
        // Sobrescribir con balance real de la tabla "balances" (tiene prioridad sobre profiles.balance)
        await fetchRemoteBalance(currentUser);
      } catch {}
      // Habilitamos el sync de balance solo después de que el perfil fue cargado
      profileLoadedRef.current = true;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supaSession, currentUser]);

  // Sincronizar displayCurrency → profile_details cuando el jugador cambia de moneda
  const currencySyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!currentUser || !supaSession?.access_token) return;
    if (!profileLoadedRef.current) return;
    // Si la moneda vino de la DB, no re-sincronizar (evitar loop)
    if (currencyFromDbRef.current) { currencyFromDbRef.current = false; return; }
    const token = supaSession.access_token;
    if (currencySyncTimer.current) clearTimeout(currencySyncTimer.current);
    currencySyncTimer.current = setTimeout(() => {
      fetch("/api/profile/details", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currency: displayCurrency }),
      }).catch(() => {});
    }, 1500);
    return () => { if (currencySyncTimer.current) clearTimeout(currencySyncTimer.current); };
  }, [displayCurrency, currentUser, supaSession]);

  // Sincronizar profile_stats → backend (wagered, depósitos, retiros, rakeback)
  const statsSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!currentUser || !supaSession?.access_token || !profileLoadedRef.current) return;
    const token = supaSession.access_token;
    if (statsSyncTimer.current) clearTimeout(statsSyncTimer.current);
    statsSyncTimer.current = setTimeout(() => {
      const wagered_total   = vipWagered; // usar state = lo mismo que muestra la UI
      const txs             = ls.getTx(currentUser);
      const total_deposit   = txs.filter(t => t.type === "deposit"  && t.status === "completed").reduce((s, t) => s + (t.usdAmount || 0), 0);
      const total_withdraw  = txs.filter(t => t.type === "withdraw" && t.status === "completed").reduce((s, t) => s + (t.usdAmount || 0), 0);
      // Solo rakeback ya reclamado (historial) — no sumar el disponible pendiente
      const rakeback_earned = parseFloat(getRewardHistory(currentUser).reduce((s, r) => s + (r.amount || 0), 0).toFixed(4));
      fetch("/api/profile/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wagered_total, total_deposit, total_withdraw, rakeback_earned }),
      }).catch(() => {});
    }, 2000);
    return () => { if (statsSyncTimer.current) clearTimeout(statsSyncTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vipWagered, transactions, rbInstant, rbWeekly, rbMonthly, currentUser, supaSession]);

  // (balance sync eliminado — profiles.balance se actualiza via /api/balance/sync
  //  y /api/profile GET, nunca via /api/profile/update para evitar pisar el total correcto)

  // ─── Auth redirect handler (runs once on first load) ────────────────────────
  //
  // Strategy:
  //   • The URL hash is read at MODULE LEVEL (_IS_EMAIL_CONFIRM / _IS_RECOVERY)
  //     before React renders and before Supabase can call replaceState.
  //   • Here we react to those flags immediately — no dependency on the timing
  //     of onAuthStateChange events which may have already fired.
  //   • onAuthStateChange is still used for the auto-login step and for
  //     future token-refresh events, but the toast / modal are shown directly.
  useEffect(() => {
    // ── 1. Clean the URL right away so tokens never stay in history ──────────
    if (_INIT_HASH.includes("access_token")) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    // ── 2. ?pw_reset=1 — server-side /reset redirect after password change ──
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("pw_reset") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      setToast({ title: "✅ Contraseña actualizada", message: "Tu contraseña fue restablecida. ¡Ya podés iniciar sesión con la nueva!", type: "win" });
      toastTimerRef.current = setTimeout(() => setToastExiting(true), 12500);
      toastExitTimerRef.current = setTimeout(() => { setToast(null); setToastExiting(false); }, 13000);
      setAuthModal("login");
    }

    // ── 3. Email confirmation — show toast DIRECTLY from module-level flag ───
    //   _IS_EMAIL_CONFIRM is true only on the first load after clicking the
    //   email link. On refresh the hash is gone so it stays false forever.
    if (_IS_EMAIL_CONFIRM) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current);
      setToastExiting(false);
      setToast({ title: "✅ Email verificado", message: "Tu cuenta Manderbet está activa. ¡Ya podés jugar!", type: "confirm" });
      toastTimerRef.current    = setTimeout(() => setToastExiting(true), 4000);
      toastExitTimerRef.current = setTimeout(() => { setToast(null); setToastExiting(false); }, 4500);
    }

    // ── 4. Password recovery — open reset modal DIRECTLY ────────────────────
    if (_IS_RECOVERY) {
      setResetNewPass("");
      setResetConfirmPass("");
      setResetError("");
      setResetSuccess(false);
      setAuthModal("reset");
    }

    // ── 5. onAuthStateChange — handles session, auto-login & token refresh ───
    //   We still listen for SIGNED_IN / INITIAL_SESSION to auto-login the user
    //   after email confirmation, and for PASSWORD_RECOVERY as a belt-and-
    //   suspenders fallback for opening the reset modal.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setResetNewPass("");
        setResetConfirmPass("");
        setResetError("");
        setResetSuccess(false);
        setAuthModal("reset");

      } else if (
        (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        session && _IS_EMAIL_CONFIRM
      ) {
        // Auto-login the user who just confirmed their email.
        // The toast was already shown in step 3 above.
        const rawUser  = session.user;
        const username = (rawUser.user_metadata?.username as string | undefined) || rawUser.email || "";
        const authSess: AuthSession = {
          access_token:  session.access_token,
          refresh_token: session.refresh_token,
          expires_at:    (session.expires_at ?? 0) * 1000,
          user: {
            id:                 rawUser.id,
            email:              rawUser.email ?? "",
            user_metadata:      rawUser.user_metadata as { username?: string } | undefined,
            email_confirmed_at: rawUser.email_confirmed_at,
          },
        };
        supaSessionRef.current = authSess; // sincronizar ref ANTES de loadUser
        setSupaSession(authSess);

        if (!ls.get("user_" + username)) {
          ls.set("user_" + username, "__supabase__");
          ls.set("email_" + username, rawUser.email || "");
          if (!ls.getBalance(username)) ls.setBalance(username, 0);
        }
        // Fetch profile to sync mander_id and balance from Supabase
        (async () => {
          let dbCurrency2 = "";
          try {
            const profileRes = await fetch("/api/profile", { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              if (profileData?.profile?.mander_id) {
                localStorage.setItem("mander_id_" + username, profileData.profile.mander_id);
              }
              if (typeof profileData?.profile?.balance === "number") {
                ls.setBalance(username, profileData.profile.balance);
              }
              if (profileData?.profile?.email) setUserEmail(profileData.profile.email);
              if (profileData?.profile?.status) setAccountStatus(profileData.profile.status);
              setProfileDetails(prev => ({ ...prev, ...(profileData?.details || {}), created_at: profileData?.profile?.created_at || prev.created_at }));
              if (profileData?.details?.currency) dbCurrency2 = profileData.details.currency;
              // Restaurar wager_req restante desde el servidor (nuevo modelo: saldo pendiente)
              const serverTotalDep2  = profileData?.stats?.total_deposit ?? 0;
              const serverWagered2   = profileData?.stats?.wagered_total ?? 0;
              const serverRemaining2 = Math.max(0, serverTotalDep2 - serverWagered2);
              const migrated2 = !!localStorage.getItem("wager_req_v2_" + username);
              if (!migrated2) {
                ls.setWagerReq(username, serverRemaining2);
                ls.setWagerReqInitial(username, serverTotalDep2);
                localStorage.setItem("wager_req_v2_" + username, "1");
              } else if (serverRemaining2 > ls.getWagerReq(username)) {
                ls.setWagerReq(username, serverRemaining2);
                ls.setWagerReqInitial(username, Math.max(serverTotalDep2, ls.getWagerReqInitial(username)));
              }
            }
          } catch {}
          ls.set("currentUser", username);
          setCurrentUser(username);
          setAuthModal("");
          loadUser(username);
          // Aplicar moneda de la DB después de loadUser para que tenga prioridad sobre localStorage
          if (dbCurrency2) { currencyFromDbRef.current = true; setDisplayCurrency(dbCurrency2); }
        })();
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevRateRef = useRef<number>(1);
  const liveRatesRef = useRef<Record<string,number>>(FALLBACK_RATES);
  liveRatesRef.current = liveRates;

  useEffect(() => {
    if (isFirstCurrRender.current) { isFirstCurrRender.current = false; prevRateRef.current = liveRatesRef.current[displayCurrency] || 1; return; }
    const oldRate = prevRateRef.current;
    const newRate = liveRatesRef.current[displayCurrency] || 1;
    const ratio = newRate / oldRate;
    if (ratio !== 1 && isFinite(ratio) && oldRate > 0) {
      setDiceBet(v => { const n = parseFloat(v) || 0; return n > 0 ? (Math.round(n * ratio * 100) / 100).toFixed(2) : v; });
      setPlinkoBet(v => { const n = parseFloat(v) || 0; return n > 0 ? (Math.round(n * ratio * 100) / 100).toFixed(2) : v; });
      setKenoBet(v => { const n = parseFloat(v) || 0; return n > 0 ? (Math.round(n * ratio * 100) / 100).toFixed(2) : v; });
    }
    prevRateRef.current = newRate;
    setCurrencyFade(0);
    const t = setTimeout(() => setCurrencyFade(1), 180);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCurrency]);

  const fetchRates = useCallback(() => {
    setRatesLoading(true);
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(r=>r.json())
      .then(d=>{
        if (d?.rates) {
          const r = d.rates as Record<string,number>;
          setLiveRates(prev => ({ ...prev, ...r, USD: 1 }));
          if (r.EUR) exchangeRates.EUR = r.EUR;
          if (r.ARS) exchangeRates.ARS = r.ARS;
          setRatesUpdatedAt(new Date());
        }
      })
      .catch(()=>{})
      .finally(()=>setRatesLoading(false));
  }, []);

  useEffect(() => {
    fetchRates();
    const id = setInterval(fetchRates, 60000);
    return () => clearInterval(id);
  }, [fetchRates]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".balance-drop-wrap")) setBalanceDropOpen(false);
      if (!t.closest(".profile-drop-wrap")) setProfileDropOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    if (!balanceDropOpen) {
      setFiatCurrPickerOpen(false);
      setFiatCurrSearch("");
    }
  }, [balanceDropOpen]);

  useEffect(() => {
    const id = setInterval(() => setBannerSlide(s => (s + 1) % 3), 12000);
    return () => clearInterval(id);
  }, []);

  // Tick every second so rakeback/bonus countdown displays refresh in real time
  useEffect(() => {
    const id = setInterval(() => setRbTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Persist liveWins across reloads ──────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem("mander_live_wins", JSON.stringify(liveWins)); } catch {}
  }, [liveWins]);

  // ── Auto fake-wins feed (all originals, respeta horario Argentina) ──────────
  useEffect(() => {
    const next = () => {
      const mult = getArgActivityMult();
      const base = 4000 + Math.random() * 6000;
      const delay = base * mult;
      return setTimeout(() => {
        setLiveWins(prev => [makeFakeWin(), ...prev].slice(0, 20));
        timerRef.current = next();
      }, delay);
    };
    const timerRef = { current: next() };
    return () => clearTimeout(timerRef.current);
  }, []);

  // Bug 4: Stop auto dice when currency changes to avoid stale rate
  useEffect(() => {
    if (autoRunRef.current) {
      loopIdRef.current++;       // invalidate any pending loop callbacks
      autoRunRef.current = false;
      setDiceAutoRunning(false);
    }
  }, [displayCurrency]);

  // ── Animated balance counter ──────────────────────────────────────────────
  useEffect(() => {
    const target = balance;
    const start = displayedBalRef.current;
    const diff = Math.abs(target - start);
    if (diff < 0.001) return;

    // Game wins/losses are instant; only deposits animate
    if (balanceInstantRef.current) {
      balanceInstantRef.current = false;
      if (balanceAnimRef.current) cancelAnimationFrame(balanceAnimRef.current);
      displayedBalRef.current = target;
      setDisplayedBalance(target);
      return;
    }

    // Deposit animation: 1.4s ease-out
    const duration = 1400;
    const startTime = performance.now();
    if (balanceAnimRef.current) cancelAnimationFrame(balanceAnimRef.current);
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = start + (target - start) * eased;
      displayedBalRef.current = cur;
      setDisplayedBalance(cur);
      if (t < 1) balanceAnimRef.current = requestAnimationFrame(animate);
    };
    balanceAnimRef.current = requestAnimationFrame(animate);
    return () => { if (balanceAnimRef.current) cancelAnimationFrame(balanceAnimRef.current); };
  }, [balance]);

  // ── Click-outside: close floating panels ─────────────────────────────────
  useEffect(() => {
    if (!notifPanelOpen && !rewardsDropOpen && !profileDropOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (notifPanelOpen && notifPanelRef.current && !notifPanelRef.current.contains(t)) setNotifPanelOpen(false);
      if (rewardsDropOpen && rewardsDropRef.current && !rewardsDropRef.current.contains(t)) setRewardsDropOpen(false);
      if (profileDropOpen && profileDropRef.current && !profileDropRef.current.contains(t)) setProfileDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifPanelOpen, rewardsDropOpen, profileDropOpen]);

  // ── Auto-generate deposit address on every coin/network change ──
  useEffect(() => {
    if (cashierTab !== "deposit" || !currentUser) return;
    generateDeposit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashierTab, currentUser?.id, depositCoin, depositNetwork]);

  // ── Fake wins simulation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    let stopped = false;
    let tid: ReturnType<typeof setTimeout>;
    let lastUser = "";

    function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

    const ALL_GAMES = [
      "Dice","Dice","Dice","Plinko","Plinko","Plinko",
      "Keno","Keno","Blackjack","Blackjack",
      "Mines","Mines","Hilo","Hilo",
      "Roulette","Roulette","Baccarat","Baccarat",
    ];

    function pushFake(user: string, profit: number, gameOverride?: string) {
      const bet = Math.max(0.10, +(profit / (1.2 + Math.random() * 3.5)).toFixed(2));
      const game = gameOverride ?? ALL_GAMES[Math.floor(Math.random() * ALL_GAMES.length)];
      setLiveWins(prev => [{
        user, game, betUsd: bet, win:true, profitUsd: profit,
        createdAt: new Date().toISOString(),
      }, ...prev].slice(0, 20));
    }

    function schedule() {
      if (stopped) return;
      const mult = getArgActivityMult();
      const roll0 = Math.random();
      // Bursts 5–10s · normal 15–32s · slow 35–55s · very slow 60–90s — todo × mult horario
      const base = roll0 < 0.15
        ? 5000  + Math.random() * 5000
        : roll0 < 0.50
        ? 15000 + Math.random() * 17000
        : roll0 < 0.80
        ? 35000 + Math.random() * 20000
        : 60000 + Math.random() * 30000;
      const delay = base * mult;
      tid = setTimeout(() => {
        if (stopped) return;
        const roll = Math.random();

        if (roll < 0.14 && lastUser) {
          // Same player scores again (hot streak)
          pushFake(lastUser, rand(FAKE_PROFITS));

        } else if (roll < 0.26 && lastUser) {
          // Same player wins twice more in quick succession
          const game = ALL_GAMES[Math.floor(Math.random() * ALL_GAMES.length)];
          pushFake(lastUser, rand(FAKE_PROFITS), game);
          setTimeout(() => { if (!stopped) pushFake(lastUser, rand(FAKE_PROFITS), game); }, 500 + Math.random() * 700);

        } else if (roll < 0.40) {
          // Two different players back-to-back
          const u1 = rand(FAKE_USERS);
          const u2 = rand(FAKE_USERS.filter(u => u !== u1));
          pushFake(u1, rand(FAKE_PROFITS));
          setTimeout(() => { if (!stopped) { pushFake(u2, rand(FAKE_PROFITS)); lastUser = u2; } }, 600 + Math.random() * 900);
          lastUser = u1;

        } else if (roll < 0.52) {
          // Three different players in rapid burst
          const u1 = rand(FAKE_USERS);
          const pool2 = FAKE_USERS.filter(u => u !== u1);
          const u2 = rand(pool2);
          const u3 = rand(pool2.filter(u => u !== u2));
          pushFake(u1, rand(FAKE_PROFITS));
          setTimeout(() => { if (!stopped) pushFake(u2, rand(FAKE_PROFITS)); }, 600  + Math.random() * 600);
          setTimeout(() => { if (!stopped) { pushFake(u3, rand(FAKE_PROFITS)); lastUser = u3; } }, 1300 + Math.random() * 800);
          lastUser = u1;

        } else if (roll < 0.62) {
          // Same player wins 2–3 times on the same game (luck run)
          const u = rand(FAKE_USERS);
          const game = ALL_GAMES[Math.floor(Math.random() * ALL_GAMES.length)];
          const count = Math.random() < 0.45 ? 3 : 2;
          pushFake(u, rand(FAKE_PROFITS), game);
          setTimeout(() => { if (!stopped) pushFake(u, rand(FAKE_PROFITS), game); }, 550 + Math.random() * 500);
          if (count === 3) setTimeout(() => { if (!stopped) pushFake(u, rand(FAKE_PROFITS), game); }, 1150 + Math.random() * 700);
          lastUser = u;

        } else if (roll < 0.74) {
          // Big win (higher profit bracket)
          const bigProfits = FAKE_PROFITS.filter(p => p >= 5);
          const u = rand(FAKE_USERS);
          pushFake(u, rand(bigProfits));
          lastUser = u;

        } else {
          // Single ordinary win
          const u = rand(FAKE_USERS);
          pushFake(u, rand(FAKE_PROFITS));
          lastUser = u;
        }
        schedule();
      }, delay);
    }

    tid = setTimeout(schedule, 2500 + Math.random() * 3500);
    return () => { stopped = true; clearTimeout(tid); };
  }, [currentUser]);

  async function doLogin() {
    setLoginError("");
    if (!loginUser.trim() || !loginPass.trim()) return setLoginError(t("errFillAll"));
    // Determine if user is logging in with email or username
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginUser.trim());
    let emailToUse = loginUser.trim();
    if (!isEmail) {
      // Look up email from localStorage (backward-compat for existing users)
      const storedEmail = ls.get("email_" + loginUser.trim());
      if (storedEmail) {
        emailToUse = storedEmail;
      } else {
        // Try local auth fallback for demo / pre-Supabase users
        const saved = ls.get("user_" + loginUser.trim());
        if (!saved) {
          const _reserved = new Set([...FAKE_USERS, ..._INIT_USERS_POOL].map(u => u.toLowerCase()));
          if (_reserved.has(loginUser.trim().toLowerCase())) return setLoginError(t("errPass"));
          return setLoginError(t("errUser"));
        }
        if (saved !== loginPass) return setLoginError(t("errPass"));
        // Limpiar cualquier sesión Supabase de otro usuario que pueda estar en localStorage
        // para que fetchRemoteBalance no cargue el balance de la cuenta equivocada.
        clearSession();
        setSupaSession(null);
        supaSessionRef.current = null;
        supabase.auth.signOut().catch(() => {});
        const uLocal = loginUser.trim();
        ls.set("currentUser", uLocal);
        setCurrentUser(uLocal);
        setAuthModal("");
        loadUser(uLocal);
        // Pedir game-token en background para que el sync de balance funcione
        // sin necesitar Supabase Auth (sirve para cualquier usuario del casino)
        fetch("/api/auth/local-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: uLocal }),
        }).then(r => r.ok ? r.json() : null).then(data => {
          if (data?.token) localStorage.setItem(`mander_game_token_${uLocal}`, data.token);
        }).catch(() => {});
        return;
      }
    }
    setAuthLoading(true);
    const result = await authLogin(emailToUse, loginPass);
    setAuthLoading(false);
    if (result.error) {
      if (result.error === "EMAIL_NOT_CONFIRMED") {
        return setLoginError("Debés verificar tu correo electrónico antes de iniciar sesión. Revisá tu bandeja de entrada (o spam) y hacé clic en el enlace de confirmación.");
      }
      return setLoginError(result.error);
    }
    const session = result.session!;
    const username = session.user.user_metadata?.username || loginUser.trim();
    supaSessionRef.current = session; // sincronizar ref ANTES de loadUser
    setSupaSession(session);
    // Ensure local profile exists
    if (!ls.get("user_" + username)) {
      ls.set("user_" + username, "__supabase__");
      ls.set("email_" + username, session.user.email || "");
      if (!ls.getBalance(username)) ls.setBalance(username, 0);
    }
    // Sincronizar mander_id Y balance de Supabase ANTES de mostrar el perfil
    let dbCurrency3 = "";
    try {
      const profileRes = await fetch("/api/profile", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        if (profileData?.profile?.mander_id) {
          localStorage.setItem("mander_id_" + username, profileData.profile.mander_id);
        }
        if (typeof profileData?.profile?.balance === "number") {
          ls.setBalance(username, profileData.profile.balance);
        }
        if (profileData?.profile?.email) setUserEmail(profileData.profile.email);
        if (profileData?.profile?.status) setAccountStatus(profileData.profile.status);
        setProfileDetails(prev => ({ ...prev, ...(profileData?.details || {}), created_at: profileData?.profile?.created_at || prev.created_at }));
        if (profileData?.details?.currency) dbCurrency3 = profileData.details.currency;
        // Restaurar wager_req restante desde el servidor (nuevo modelo: saldo pendiente)
        const serverTotalDep3  = profileData?.stats?.total_deposit ?? 0;
        const serverWagered3   = profileData?.stats?.wagered_total ?? 0;
        const serverRemaining3 = Math.max(0, serverTotalDep3 - serverWagered3);
        const migrated3 = !!localStorage.getItem("wager_req_v2_" + username);
        if (!migrated3) {
          ls.setWagerReq(username, serverRemaining3);
          ls.setWagerReqInitial(username, serverTotalDep3);
          localStorage.setItem("wager_req_v2_" + username, "1");
        } else if (serverRemaining3 > ls.getWagerReq(username)) {
          ls.setWagerReq(username, serverRemaining3);
          ls.setWagerReqInitial(username, Math.max(serverTotalDep3, ls.getWagerReqInitial(username)));
        }
      }
    } catch {}
    profileLoadedRef.current = true; // perfil ya cargado, evitar doble fetch
    ls.set("currentUser", username);
    setCurrentUser(username);
    setAuthModal("");
    loadUser(username);
    // Aplicar moneda de la DB después de loadUser para que tenga prioridad sobre localStorage
    if (dbCurrency3) { currencyFromDbRef.current = true; setDisplayCurrency(dbCurrency3); }
  }

  async function doRegister() {
    setRegError("");
    setRegSuccess(false);
    if (!regUser.trim() || !regEmail.trim() || !regPass) return setRegError(t("errFillAll"));
    if (regUser.trim().length < 3) return setRegError("El nombre de usuario debe tener al menos 3 caracteres.");
    if (regUser.trim().length > 20) return setRegError("El nombre de usuario no puede superar los 20 caracteres.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) return setRegError("Ingresa un correo válido.");
    if (!regTerms) return setRegError("Debes aceptar los Términos y Condiciones.");
    {
      const _reserved = new Set([...FAKE_USERS, ..._INIT_USERS_POOL].map(u => u.toLowerCase()));
      if (_reserved.has(regUser.trim().toLowerCase())) return setRegError(t("errUserExists"));
    }
    if (ls.get("user_" + regUser)) return setRegError(t("errUserExists"));
    const errs = validatePassword(regPass);
    if (errs.length) return setRegError("Falta: " + errs.join(", "));
    setAuthLoading(true);
    const result = await authSignUp(regEmail.trim(), regPass, regUser.trim());
    setAuthLoading(false);
    if (result.error) return setRegError(result.error);
    // Store local profile immediately
    ls.set("user_" + regUser.trim(), "__supabase__");
    ls.set("email_" + regUser.trim(), regEmail.trim());
    ls.set("registered_at_" + regUser.trim(), new Date().toISOString());
    if (regReferral.trim()) ls.set("referral_" + regUser.trim(), regReferral.trim());
    ls.setBalance(regUser.trim(), 0);
    ls.saveBets(regUser.trim(), []);
    ls.saveTx(regUser.trim(), []);
    ls.set("display_currency_" + regUser.trim(), "USD");
    ls.saveDice(regUser.trim(), { profit:0,wagered:0,wins:0,losses:0,history:[],autoRemaining:0 });
    setRegSuccess(true);
    const registeredUser = regUser.trim();
    setTimeout(() => {
      setRegUser(""); setRegEmail(""); setRegPass(""); setRegReferral("");
      setRegTerms(false); setRegSuccess(false);
      setLoginUser(registeredUser); setLoginPass(""); setAuthModal("login");
    }, 1200);
  }

  async function doResetPassword() {
    setResetError("");
    if (!resetNewPass || !resetConfirmPass) return setResetError("Completá ambos campos.");
    if (resetNewPass !== resetConfirmPass) return setResetError("Las contraseñas no coinciden.");
    const errs = validatePassword(resetNewPass);
    if (errs.length > 0) return setResetError("La contraseña debe tener al menos: " + errs.join(", ") + ".");
    setAuthLoading(true);

    // ── Garantizar que la sesión esté activa antes de updateUser ─────────────
    // detectSessionInUrl procesa el hash de forma asíncrona; si el usuario
    // llega al modal antes de que termine, updateUser falla con
    // "Auth session missing".  Forzamos setSession() con los tokens del hash.
    if (_IS_RECOVERY) {
      const at = _HASH_PARAMS.get("access_token");
      const rt = _HASH_PARAMS.get("refresh_token");
      if (at && rt) {
        await supabase.auth.setSession({ access_token: at, refresh_token: rt });
      }
    }

    const { error } = await supabase.auth.updateUser({ password: resetNewPass });
    setAuthLoading(false);
    if (error) {
      const msg = error.message.toLowerCase().includes("same")
        ? "La nueva contraseña debe ser diferente a la actual."
        : error.message || "Token inválido o expirado. Pedí un nuevo enlace.";
      return setResetError(msg);
    }
    setResetSuccess(true);
    setTimeout(() => {
      setResetNewPass(""); setResetConfirmPass(""); setResetSuccess(false);
      setAuthModal("login");
    }, 2200);
  }

  function doLogout() {
    // Flush any pending balance sync before clearing the session — prevents losing game results
    // that were made within the 800ms debounce window before logout.
    if (balanceSyncTimerRef.current) {
      clearTimeout(balanceSyncTimerRef.current);
      balanceSyncTimerRef.current = null;
      if (hasRemoteBalanceLoadedRef.current) {
        // Save post-bet coin balances to localStorage so the next login shows the correct value
        // instead of the stale pre-bet cache (coinBalancesRef is always synchronously updated on each bet).
        ls.saveCoinBalances(currentUser, { ...coinBalancesRef.current });
        const coin = depositCoinRef.current;
        const native = coinBalancesRef.current[coin] ?? 0;
        const totalUsd = Object.entries(coinBalancesRef.current)
          .reduce((sum, [c, n]) => sum + (n as number) * getPriceUsd(c), 0);
        const token = supaSession?.access_token || localStorage.getItem(`mander_game_token_${currentUser}`);
        if (token) {
          fetch("/api/balance/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ currency: coin, balance: native, totalUsd }),
          }).catch(() => {});
        }
      }
    }
    // Always persist the latest coin balances to localStorage on logout,
    // even when no timer was pending — guarantees the next login cache is never stale.
    if (hasRemoteBalanceLoadedRef.current && Object.keys(coinBalancesRef.current).length > 0) {
      ls.saveCoinBalances(currentUser, { ...coinBalancesRef.current });
    }
    hasRemoteBalanceLoadedRef.current = false;
    const token = supaSession?.access_token;
    if (token) authLogout(token);
    profileLoadedRef.current = false; // resetear para que el próximo login cargue el perfil
    setSupaSession(null);
    loopIdRef.current++;         // kill any pending auto-loop callbacks
    autoRunRef.current = false;
    manualBetRef.current = false;
    setDiceAutoRunning(false);
    setDiceRolling(false);
    plinkoLoopIdRef.current++;
    plinkoAutoRunRef.current = false;
    setPlinkoAutoRunning(false);
    setPendingPlinkoBalls([]);
    kenoLoopIdRef.current++;
    kenoAutoRunRef.current = false;
    setKenoAutoRunning(false);
    ls.rm("currentUser");
    setCurrentUser("");
    setBalanceState(0);
    setLoginUser(""); setLoginPass("");
    setSection("home");
    setHomeView("dashboard");
  }

  function doClaimInstant() {
    if (!canClaimInstant(currentUser)) return;
    const val = claimInstantRakeback(currentUser);
    if (val <= 0) return;
    const nb = ls.getBalance(currentUser) + val;
    setCoinBalanceUsd(nb);
    setRbInstant(0);
    saveRewardClaim(currentUser, val, "Rakeback Claim - Instant");
    addNotif("bonus", "⚡ Rakeback Instantáneo Reclamado", `+$${val.toFixed(2)} han sido añadidos a tu saldo.`);
  }

  function doClaimWeekly() {
    const val = claimPeriodicRakeback("weekly", currentUser);
    if (val <= 0) return;
    const nb = ls.getBalance(currentUser) + val;
    setCoinBalanceUsd(nb);
    setRbWeekly(0);
    saveRewardClaim(currentUser, val, "Rakeback Claim - Weekly");
    addNotif("bonus", "🎁 Bono Semanal Reclamado", `+$${val.toFixed(2)} han sido añadidos a tu saldo.`);
  }

  function doClaimMonthly() {
    const val = claimPeriodicRakeback("monthly", currentUser);
    if (val <= 0) return;
    const nb = ls.getBalance(currentUser) + val;
    setCoinBalanceUsd(nb);
    setRbMonthly(0);
    saveRewardClaim(currentUser, val, "Rakeback Claim - Monthly");
    addNotif("bonus", "🎁 Bono Mensual Reclamado", `+$${val.toFixed(2)} han sido añadidos a tu saldo.`);
  }

  function claimRankReward() {
    if (!rankPendingReward || !currentUser) return;
    const nb = ls.getBalance(currentUser) + rankPendingReward.amount;
    setCoinBalanceUsd(nb);
    saveRewardClaim(currentUser, rankPendingReward.amount, `Rank Reward - ${rankPendingReward.rankName}`);
    const toast = { amount: rankPendingReward.amount, rankName: rankPendingReward.rankName, gradient: rankPendingReward.gradient, color: rankPendingReward.color };
    // Pop claimed reward from the queue; show next if any
    const raw = localStorage.getItem("rank_pending_reward_" + currentUser);
    let queue: typeof rankPendingReward[] = [];
    if (raw) { try { const p = JSON.parse(raw); queue = Array.isArray(p) ? p : [p]; } catch {} }
    queue.shift();
    if (queue.length > 0) {
      localStorage.setItem("rank_pending_reward_" + currentUser, JSON.stringify(queue));
      setRankPendingReward(queue[0]);
    } else {
      localStorage.removeItem("rank_pending_reward_" + currentUser);
      setRankPendingReward(null);
    }
    setRankCreditToast(toast);
    setTimeout(() => setRankCreditToast(null), 5000);
  }

  function openSection(s: string) {
    settlePendingPlinkoBalls();
    stopAllAutos();
    setSection(s);
    setHomeView("dashboard");
    setProfileDropOpen(false);
    setBalanceDropOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function stopAllAutos() {
    // Always increment every loop-ID ref so any pending setTimeout callback sees
    // a stale ID and returns immediately — no extra round fires after navigation.
    loopIdRef.current++;
    autoRunRef.current = false;
    setDiceAutoRunning(false);

    plinkoLoopIdRef.current++;
    plinkoAutoRunRef.current = false;
    setPlinkoAutoRunning(false);

    kenoLoopIdRef.current++;
    kenoAutoRunRef.current = false;
    setKenoAutoRunning(false);
    setKenoIsDrawing(false);

    baccaratStopRef.current?.();
  }

  function showHomeView() {
    settlePendingPlinkoBalls();
    stopAllAutos();
    setSection("home"); setHomeView("dashboard"); setHomeCategory("Lobby");
  }
  function showDiceOnly() {
    settlePendingPlinkoBalls();
    stopAllAutos();
    setSection("home");
    setHomeView("dice");
    setDiceBubbleWin(null);
    setDiceBubbleVal("—");
    setDiceMarkerLeft(5);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function showPlinkoOnly() {
    settlePendingPlinkoBalls();
    stopAllAutos();
    setSection("home");
    setHomeView("plinko");
    setPendingPlinkoBalls([]);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function showSlotOnly()      { settlePendingPlinkoBalls(); stopAllAutos(); setSection("home"); setHomeView("dashboard"); window.scrollTo({ top: 0, behavior: "instant" }); }
  function showBlackjackOnly() { settlePendingPlinkoBalls(); stopAllAutos(); setSection("home"); setHomeView("blackjack"); window.scrollTo({ top: 0, behavior: "instant" }); }
  function showMinesOnly()     { settlePendingPlinkoBalls(); stopAllAutos(); setSection("home"); setHomeView("mines");     window.scrollTo({ top: 0, behavior: "instant" }); }
  function showKenoOnly() {
    settlePendingPlinkoBalls();
    stopAllAutos();
    setSection("home");
    setHomeView("keno");
    window.scrollTo({ top: 0, behavior: "instant" });
    // Keep kenoDrawnNums and kenoLastResult so the last bet is visible on re-entry
  }
  function showOriginalsView() {
    settlePendingPlinkoBalls();
    stopAllAutos();
    setSection("home");
    setHomeView("originals");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function showHiloOnly() { settlePendingPlinkoBalls(); stopAllAutos(); setSection("home"); setHomeView("hilo"); window.scrollTo({ top: 0, behavior: "instant" }); }
  function showRouletteOnly() { settlePendingPlinkoBalls(); stopAllAutos(); setSection("home"); setHomeView("roulette"); window.scrollTo({ top: 0, behavior: "instant" }); }
  function showBaccaratOnly() { settlePendingPlinkoBalls(); stopAllAutos(); setSection("home"); setHomeView("baccarat"); window.scrollTo({ top: 0, behavior: "instant" }); }

  // ── Per-coin balance helper ────────────────────────────────────────────────
  // Updates both the USD `balance` state and the native amount in `coinBalances`
  // for the currently selected coin.  All game win/loss handlers should use this.
  function setCoinBalanceUsd(newUsdBal: number) {
    const coin = depositCoinRef.current;
    const priceUsd = getPriceUsd(coin);
    // Calcular el nativo mediante DELTA para preservar los decimales exactos del servidor.
    // Si hacemos (newUsdBal / priceUsd) completo, el precio fluctuante borra decimales recibidos.
    // En cambio: solo convertimos el cambio (delta) a nativo y lo sumamos al nativo ya guardado.
    const prevUsdBal = ls.getBalance(currentUser);
    const deltaUsd = newUsdBal - prevUsdBal;
    const prevNative = coinBalancesRef.current[coin] ?? 0;
    const newNative = Math.max(0, prevNative + deltaUsd / priceUsd);
    balanceInstantRef.current = true;
    // Actualizar ref de forma síncrona antes del setState para que el nativeSnap sea exacto
    coinBalancesRef.current = { ...coinBalancesRef.current, [coin]: newNative };
    setCoinBalances(prev => ({ ...prev, [coin]: newNative }));

    // Calcular el total USD de TODAS las monedas (la activa con el nuevo valor)
    // Usamos coinBalancesRef.current para evitar closures stale
    const totalUsdSnap = Object.entries({ ...coinBalancesRef.current, [coin]: newNative })
      .reduce((sum, [c, native]) => sum + (native as number) * getPriceUsd(c), 0);

    // Mostrar solo la moneda activa en pantalla — el total va al backend (profiles.balance)
    setBalanceState(newUsdBal);
    ls.setBalance(currentUser, newUsdBal);

    // Sync to Supabase (debounced 800ms to avoid hammering on auto-bet)
    if (balanceSyncTimerRef.current) clearTimeout(balanceSyncTimerRef.current);
    const coinSnap = coin;
    const nativeSnap = newNative;
    const userSnap = currentUser;
    // IMPORTANTE: capturar el estado del guard AHORA, antes de que arranque el timer.
    // Si fetchRemoteBalance no había completado cuando se llamó setCoinBalanceUsd, el sync
    // debe omitirse aunque fetchRemoteBalance complete antes de que el timer dispare.
    // (Evita la race condition: timer creado en t=0, fetchRemoteBalance completa en t=500ms,
    //  timer dispara en t=800ms y borra el balance recién cargado.)
    const remoteLoadedAtCallTime = hasRemoteBalanceLoadedRef.current;
    balanceSyncTimerRef.current = setTimeout(async () => {
      // Omitir si el balance remoto no estaba cargado en el momento de la llamada
      if (!remoteLoadedAtCallTime) return;
      // Intentar con sesión Supabase fresca primero
      const sess = await getOrRefreshSession();
      if (sess && sess !== supaSessionRef.current) {
        supaSessionRef.current = sess;
        setSupaSession(sess);
      }
      // Usar game-token como fallback (funciona sin Supabase Auth)
      const token = sess?.access_token || localStorage.getItem(`mander_game_token_${userSnap}`);
      if (!token) return;
      // Actualizar cache local con el balance post-apuesta antes de enviar al servidor.
      // Esto evita que el cache quede stale (con el valor pre-apuesta) si fetchRemoteBalance
      // fue bloqueado por el guard de race condition mientras este timer estaba pendiente.
      ls.saveCoinBalances(userSnap, { ...coinBalancesRef.current });
      fetch("/api/balance/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currency: coinSnap, balance: nativeSnap, totalUsd: totalUsdSnap }),
      }).catch(() => {});
    }, 800);
  }

  function addBet(amount: number, winAmount: number, game: string = "Casino") {
    const b: Bet = { amount, winAmount, createdAt: new Date().toISOString() };
    const newBets = [...ls.getBets(currentUser), b].slice(-500);
    ls.saveBets(currentUser, newBets);
    setBets(newBets);
    const prevWagered = ls.getTotalWagered(currentUser);
    ls.addTotalWagered(currentUser, amount);
    ls.addTotalBetsCount(currentUser);
    // Reducir requisito de wagering pendiente con cada apuesta (nuevo modelo: balance restante)
    const pendingReq = ls.getWagerReq(currentUser);
    if (pendingReq > 0) ls.setWagerReq(currentUser, Math.max(0, +(pendingReq - amount).toFixed(4)));
    const newWagered = ls.getTotalWagered(currentUser);
    setVipWagered(newWagered);
    setTotalBetsCount(ls.getTotalBetsCount(currentUser));
    const newRankIdx = getRankIndex(newWagered);
    const rb = distributeRakeback(currentUser, amount, VIP_RANKS[newRankIdx].rakebackPct, getHouseEdge(game));
    setRbInstant(rb.instant); setRbWeekly(rb.weekly); setRbMonthly(rb.monthly);
    const prevRankIdx = getRankIndex(prevWagered);
    if (newRankIdx > prevRankIdx) {
      // Cargar cola existente (puede haber recompensas sin reclamar de rangos anteriores)
      const existingRaw = localStorage.getItem("rank_pending_reward_" + currentUser);
      let queue: { amount: number; rankName: string; gradient: string; color: string; image: string }[] = [];
      if (existingRaw) { try { const p = JSON.parse(existingRaw); queue = Array.isArray(p) ? p : [p]; } catch {} }
      const wasEmpty = queue.length === 0;
      // Generar un premio por CADA rango saltado (no solo el último)
      for (let ri = prevRankIdx + 1; ri <= newRankIdx; ri++) {
        const rank = VIP_RANKS[ri];
        // Power-curve: skews heavily toward the minimum reward.
        // ~65% of results land in the bottom third of the range; top values are rare.
        const t = Math.pow(Math.random(), 3);
        const reward = rank.rewardMin + t * (rank.rewardMax - rank.rewardMin);
        queue.push({ amount: parseFloat(reward.toFixed(2)), rankName: rank.name, gradient: rank.gradient, color: rank.color, image: rank.image });
      }
      localStorage.setItem("rank_pending_reward_" + currentUser, JSON.stringify(queue));
      // Solo actualizar el state si no había ninguna recompensa pendiente previa
      // (si ya había una en pantalla, se mostrará esa hasta que el usuario la reclame)
      if (wasEmpty) setRankPendingReward(queue[0]);
    }
    const lw: LiveWin = {
      user: privateMode ? "Anónimo" : currentUser,
      game,
      betUsd: amount,
      win: winAmount > 0,
      profitUsd: winAmount > 0 ? winAmount - amount : -amount,
      createdAt: new Date().toISOString(),
    };
    if (lw.win && lw.profitUsd >= 0.30) setLiveWins(prev => [lw, ...prev].slice(0, 20));
  }

  function addMinesBetRecord(amount: number, multiplier: number, win: boolean, payout: number) {
    const rec: GameBetRecord = { amount, multiplier, win, payout, createdAt: new Date().toISOString() };
    const newList = [rec, ...ls.getMinesBets(currentUser)].slice(0, 1000);
    ls.saveMinesBets(currentUser, newList);
    setMinesBetHistory(newList);
  }

  function addBJBetRecord(amount: number, multiplier: number, win: boolean, payout: number) {
    const rec: GameBetRecord = { amount, multiplier, win, payout, createdAt: new Date().toISOString() };
    const newList = [rec, ...ls.getBJBets(currentUser)].slice(0, 1000);
    ls.saveBJBets(currentUser, newList);
    setBjBetHistory(newList);
  }

  function addHiloBetRecord(amount: number, multiplier: number, win: boolean, payout: number) {
    const rec: GameBetRecord = { amount, multiplier, win, payout, createdAt: new Date().toISOString() };
    const newList = [rec, ...ls.getHiloBets(currentUser)].slice(0, 1000);
    ls.saveHiloBets(currentUser, newList);
    setHiloBetHistory(newList);
  }

  function addRouletteBetRecord(amount: number, multiplier: number, win: boolean, payout: number) {
    const rec: GameBetRecord = { amount, multiplier, win, payout, createdAt: new Date().toISOString() };
    const newList = [rec, ...ls.getRouletteBets(currentUser)].slice(0, 1000);
    ls.saveRouletteBets(currentUser, newList);
    setRouletteBetHistory(newList);
  }

  function addBaccaratBetRecord(amount: number, multiplier: number, win: boolean, payout: number) {
    const rec: GameBetRecord = { amount, multiplier, win, payout, createdAt: new Date().toISOString() };
    const bets: GameBetRecord[] = JSON.parse(localStorage.getItem("baccarat_bets_"+currentUser)||"[]");
    const newList = [rec, ...bets].slice(0, 1000);
    localStorage.setItem("baccarat_bets_"+currentUser, JSON.stringify(newList));
    setBaccaratBetHistory(newList);
  }

  // ── Dice logic ─────────────────────────────────────────────────────────
  function syncDiceFields(source: "multiplier"|"target"|"chance") {
    let t = parseFloat(diceTarget)||50.5;
    let c = parseFloat(diceChance)||49.5;
    let m = parseFloat(diceMultiplier)||2;
    const isOver = diceMode === "over";
    if (source==="target") { t=Math.min(98.99,Math.max(1,t)); c=isOver ? 100-t : t; m=99/c; }
    else if (source==="chance") { c=Math.min(98.99,Math.max(1,c)); t=isOver ? 100-c : c; m=99/c; }
    else { m=Math.max(1.01,m); c=Math.min(98.99,Math.max(1,99/m)); t=isOver ? 100-c : c; }
    setDiceTarget(t.toFixed(2));
    setDiceChance(c.toFixed(4));
    setDiceMultiplier(m.toFixed(4));
  }

  diceVolRef.current = diceVol;

  function playDiceWin() {
    if (diceVolRef.current === 0) return;
    try {
      const vol = diceVolRef.current / 100;
      const ctx = new AudioContext();
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.09);
        gain.gain.linearRampToValueAtTime(0.22 * vol, ctx.currentTime + i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.18);
        osc.start(ctx.currentTime + i * 0.09);
        osc.stop(ctx.currentTime + i * 0.09 + 0.18);
        if (i === notes.length - 1) osc.onended = () => ctx.close();
      });
    } catch {}
  }

  function playDiceLose() {
    if (diceVolRef.current === 0) return;
    try {
      const vol = diceVolRef.current / 100;
      const ctx = new AudioContext();
      const notes = [330, 277, 220];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.15 * vol, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.14);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.14);
        if (i === notes.length - 1) osc.onended = () => ctx.close();
      });
    } catch {}
  }

  function runDiceRoll(overrideBetDisplay?: number, overrideRate?: number): { success:boolean; win:boolean; profitUsd:number } {
    const rate = overrideRate ?? liveRates[displayCurrency] ?? 1;
    const betDisplay = overrideBetDisplay ?? (parseFloat(diceBet)||0);
    const bet = betDisplay / rate;
    const chance = Math.min(98.99, Math.max(1, parseFloat(diceChance)||49.5));
    const multiplier = Math.max(1.01, parseFloat(diceMultiplier)||2);
    const curBal = ls.getBalance(currentUser);
    if (curBal < bet - 0.0001 || bet < 0.0099) return { success:false, win:false, profitUsd:0 };

    const newBal = curBal - bet;
    const roll = parseFloat((Math.random()*100).toFixed(2));
    const target = diceMode === "over" ? 100 - chance : chance;
    const win = diceMode === "over" ? roll > target : roll < target;
    let payout = 0;

    const newStats = ls.getDice(currentUser);
    if (win) {
      payout = bet * multiplier;
      setCoinBalanceUsd(newBal + payout);
      newStats.wins += 1;
      newStats.profit += payout - bet;
      playDiceWin();
    } else {
      setCoinBalanceUsd(newBal);
      newStats.losses += 1;
      newStats.profit -= bet;
      playDiceLose();
    }
    newStats.wagered += bet;
    const betProfit = win ? payout - bet : -bet;
    newStats.history = [{ value: roll, win, profit: betProfit }, ...(newStats.history||[])].slice(0,500);
    ls.saveDice(currentUser, newStats);
    setDiceStats({ ...newStats });
    addBet(bet, win ? payout : 0, "Dice");
    // Save dice-specific bet record
    const record: DiceBetRecord = {
      amount: bet, multiplier: win ? multiplier : 0,
      rollValue: roll, win, payout: win ? payout : 0,
      createdAt: new Date().toISOString(),
    };
    const newDiceBets = [record, ...ls.getDiceBets(currentUser)].slice(0, 1000);
    ls.saveDiceBets(currentUser, newDiceBets);
    setDiceBetHistory(newDiceBets);
    const finalLeft = 5 + roll * 0.9;
    if (diceMarkerAnimRef.current) clearTimeout(diceMarkerAnimRef.current);
    setDiceBubbleWin(win);
    setDiceBubbleVal(roll.toFixed(2));
    setDiceMarkerTransition("left 0.42s ease-out");
    setDiceMarkerLeft(finalLeft);
    const profitUsd = win ? payout - bet : -bet;
    return { success:true, win, profitUsd };
  }

  async function placeDiceBet() {
    if (!currentUser) { setAuthModal("login"); return; }
    if (manualBetRef.current || diceRolling || diceAutoRunning) return;
    manualBetRef.current = true;
    setDiceRolling(true);
    await new Promise(r => setTimeout(r, 600));
    runDiceRoll();
    setDiceRolling(false);
    manualBetRef.current = false;
  }

  interface AutoDiceSettings {
    onWin: "reset"|"increase"; onWinPct: number;
    onLose: "reset"|"increase"; onLosePct: number;
    stopProfit: number|null; stopLoss: number|null;
    infinite?: boolean;
  }

  function startAutoDice(settings: AutoDiceSettings) {
    if (!currentUser) { setAuthModal("login"); return; }
    const count = settings.infinite ? 999999 : Math.max(0, parseInt(diceAutoCount)||0);
    if (count<=0 || autoRunRef.current) return;

    const rate = liveRates[displayCurrency] || 1;
    const baseBetDisplay = parseFloat(diceBet)||0;
    if (baseBetDisplay / rate < 0.0099) return;

    autoRunRef.current = true;
    const myId = ++loopIdRef.current;
    setDiceAutoRunning(true);

    let remaining = count;
    setDiceAutoRemaining(remaining);
    let currentBetDisplay = baseBetDisplay;
    let sessionProfitDisplay = 0;

    const stopAuto = (resetBet = true) => {
      autoRunRef.current = false;
      setDiceAutoRunning(false);
      if (resetBet) setDiceBet(baseBetDisplay.toFixed(2));
    };

    const loop = () => {
      if (loopIdRef.current !== myId) return; // stale loop — a newer one replaced us
      if (!autoRunRef.current || remaining<=0) { stopAuto(); return; }
      const currentBetUsd = currentBetDisplay / rate;
      if (currentBetUsd < 0.0099 || ls.getBalance(currentUser) < currentBetUsd - 0.0001) {
        stopAuto();
        return;
      }
      setDiceBet(currentBetDisplay.toFixed(2));
      const result = runDiceRoll(currentBetDisplay, rate);
      if (!result.success) { stopAuto(); return; }

      sessionProfitDisplay += result.profitUsd * rate;

      if (result.win) {
        if (settings.onWin==="increase" && settings.onWinPct>0) {
          currentBetDisplay = currentBetDisplay * (1 + settings.onWinPct/100);
        } else {
          currentBetDisplay = baseBetDisplay;
        }
      } else {
        if (settings.onLose==="increase" && settings.onLosePct>0) {
          currentBetDisplay = currentBetDisplay * (1 + settings.onLosePct/100);
        } else {
          currentBetDisplay = baseBetDisplay;
        }
      }

      const maxBetDisplay = Math.floor(ls.getBalance(currentUser) * rate * 100) / 100;
      const minBetDisplay = Math.ceil(0.01 * rate * 100) / 100;
      currentBetDisplay = Math.max(minBetDisplay, Math.min(maxBetDisplay, currentBetDisplay));

      if (settings.stopProfit!==null && sessionProfitDisplay>=settings.stopProfit) {
        stopAuto(); return;
      }
      if (settings.stopLoss!==null && sessionProfitDisplay<=-settings.stopLoss) {
        stopAuto(); return;
      }

      remaining--;
      setDiceAutoRemaining(remaining);
      setTimeout(loop, 600);
    };
    setTimeout(loop, 600);
  }

  function stopAutoDice() {
    loopIdRef.current++;   // invalidate any pending setTimeout callbacks immediately
    autoRunRef.current = false;
    setDiceAutoRunning(false);
  }

  // ── Plinko logic ────────────────────────────────────────────────────────
  const plinkoBetUsd = useMemo(() => {
    const rate = liveRates[displayCurrency] || 1;
    return (parseFloat(plinkoBet)||0) / rate;
  }, [plinkoBet, liveRates, displayCurrency]);

  function runPlinkoRoll(overrideBetDisplay?: number, overrideRate?: number): {
    success:boolean; win:boolean; profitUsd:number; path:("L"|"R")[]; slot:number; multiplier:number; betUsd:number;
  } {
    const rate = overrideRate ?? liveRates[displayCurrency] ?? 1;
    const betDisplay = overrideBetDisplay ?? (parseFloat(plinkoBet)||0);
    const bet = betDisplay / rate;
    const mults = PLINKO_MULTS[plinkoRisk][plinkoRows];
    const curBal = ls.getBalance(currentUser);
    if (curBal < bet - 0.0001 || bet < 0.0099) return { success:false, win:false, profitUsd:0, path:[], slot:0, multiplier:0, betUsd:0 };

    // Pure binomial: 50/50 L/R at each peg — fair, unbiased RNG
    const path: ("L"|"R")[] = Array.from({ length: plinkoRows }, () => Math.random() < 0.5 ? "L" : "R");
    const slot = path.filter(d => d === "R").length;
    const multiplier = mults[slot];
    const payout = bet * multiplier;
    const betProfit = payout - bet;
    const win = multiplier >= 1;

    // Deduct bet immediately (payout added when ball lands via settlePlinkoLanding)
    setCoinBalanceUsd(curBal - bet);

    return { success:true, win, profitUsd:betProfit, path, slot, multiplier, betUsd:bet };
  }

  // ── Plinko sound ──────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { plinkoVolRef.current = plinkoVol; }, [plinkoVol]);
  function _getPlinkoCtx() {
    if (!plinkoAudioCtxRef.current || plinkoAudioCtxRef.current.state === "closed")
      plinkoAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return plinkoAudioCtxRef.current;
  }
  // Rising-chime synth: same style for all outcomes, pitch-shifted by multiplier
  function playPlinkoSound(multiplier: number) {
    const vol = plinkoVolRef.current / 100;
    if (vol === 0) return;
    try {
      const ctx = _getPlinkoCtx();
      const t0 = ctx.currentTime;
      // Map multiplier → (freqStart, freqEnd, duration, layers)
      let freqStart: number, freqEnd: number, dur: number, layers: number, gain: number;
      if (multiplier >= 50) {
        freqStart = 700; freqEnd = 2200; dur = 0.42; layers = 4; gain = 0.28;
      } else if (multiplier >= 20) {
        freqStart = 620; freqEnd = 1800; dur = 0.36; layers = 3; gain = 0.26;
      } else if (multiplier >= 10) {
        freqStart = 560; freqEnd = 1500; dur = 0.30; layers = 2; gain = 0.24;
      } else if (multiplier >= 5) {
        freqStart = 500; freqEnd = 1100; dur = 0.24; layers = 2; gain = 0.22;
      } else if (multiplier >= 2) {
        freqStart = 420; freqEnd = 850; dur = 0.20; layers = 1; gain = 0.20;
      } else if (multiplier >= 1) {
        freqStart = 340; freqEnd = 620; dur = 0.16; layers = 1; gain = 0.17;
      } else {
        // Loss: same shape but sweeps *down* slightly, slightly muted
        freqStart = 420; freqEnd = 280; dur = 0.18; layers = 1; gain = 0.13;
      }
      for (let l = 0; l < layers; l++) {
        const offset = l * 0.06;
        const ratio = 1 + l * 0.015; // tiny detune per layer for richness
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freqStart * ratio, t0 + offset);
        osc.frequency.exponentialRampToValueAtTime(freqEnd * ratio, t0 + offset + dur * 0.55);
        g.gain.setValueAtTime(gain * vol, t0 + offset);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + offset + dur);
        osc.start(t0 + offset); osc.stop(t0 + offset + dur + 0.02);
      }
    } catch {}
  }
  // Soft click every time a ball drops
  function playPlinkoDrop() {
    const vol = plinkoVolRef.current / 100;
    if (vol === 0) return;
    try {
      const ctx = _getPlinkoCtx();
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(480, t0);
      osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.07);
      g.gain.setValueAtTime(0.10 * vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      osc.start(t0); osc.stop(t0 + 0.11);
    } catch {}
  }

  function settlePlinkoLanding(ball: PendingPlinkoball, actualSlot: number, actualMultiplier: number, silent = false) {
    const { betUsd } = ball;
    const multiplier = actualMultiplier;
    const slot = actualSlot;
    const payout = betUsd * multiplier;
    const betProfit = payout - betUsd;
    const win = multiplier >= 1;

    const curBal = ls.getBalance(currentUser);
    setCoinBalanceUsd(curBal + payout);

    const newStats = ls.getPlinko(currentUser);
    newStats.wagered += betUsd;
    newStats.profit += betProfit;
    if (win) newStats.wins += 1; else newStats.losses += 1;
    newStats.history = [{ multiplier, win, profit: betProfit }, ...(newStats.history||[])].slice(0, 500);
    ls.savePlinko(currentUser, newStats);
    setPlinkoStats({ ...newStats });

    if (!silent) playPlinkoSound(multiplier);
    addBet(betUsd, payout, "Plinko");

    const record: PlinkoBetRecord = {
      amount: betUsd, multiplier, win, payout, slot, createdAt: new Date().toISOString(),
    };
    const newBets = [record, ...ls.getPlinkoBets(currentUser)].slice(0, 1000);
    ls.savePlinkoBets(currentUser, newBets);
    setPlinkoBetHistory(newBets);
  }

  // Ref so onBallsConsumed always sees the latest pending balls (avoids stale closures)
  const pendingPlinkoBallsRef = useRef<PendingPlinkoball[]>([]);
  pendingPlinkoBallsRef.current = pendingPlinkoBalls;

  // Settle any in-flight Plinko balls with a natural delay (called when leaving the Plinko view).
  // Each ball waits for its estimated remaining fall time so the payout feels organic, not instant.
  function settlePendingPlinkoBalls() {
    const pending = pendingPlinkoBallsRef.current;
    if (pending.length === 0) return;
    const now = Date.now();
    pending.forEach(ball => {
      const totalMs  = plinkoBallFallMs(ball.rows);
      const elapsed  = now - ball.launchedAt;
      const remaining = Math.max(0, totalMs - elapsed);
      // silent=true: credit balance but don't play sound (user isn't on the Plinko page)
      setTimeout(() => settlePlinkoLanding(ball, ball.targetSlot, ball.multiplier, true), remaining);
    });
    setPendingPlinkoBalls([]);
  }

  function placePlinkoManual() {
    if (!currentUser) { setAuthModal("login"); return; }
    if (plinkoAutoRunning) return;
    const result = runPlinkoRoll();
    if (!result.success) return;
    const ball: PendingPlinkoball = {
      id: ++plinkoDropIdRef.current,
      targetSlot: result.slot,
      rows: plinkoRows,
      risk: plinkoRisk,
      multiplier: result.multiplier,
      betUsd: result.betUsd,
      launchedAt: Date.now(),
    };
    playPlinkoDrop();
    setPendingPlinkoBalls(prev => [...prev, ball]);
  }

  function onBallsConsumed(ids: number[], actualSlots: Record<number, number>) {
    // Always settle using the pre-computed binomial targetSlot (determined at roll time by pure 50/50 RNG).
    // Physical animation is visual only — using it for payout would allow physics drift to inflate
    // the probability of extreme slots (e.g. 1000x) far beyond the true binomial 1/65536.
    const landed = pendingPlinkoBallsRef.current.filter(b => ids.includes(b.id));
    landed.forEach(ball => {
      const mults = PLINKO_MULTS[ball.risk]?.[ball.rows] ?? [];
      // Use the RNG-determined targetSlot — exact binomial probability guaranteed
      const actualSlot = Math.max(0, Math.min(mults.length - 1, ball.targetSlot));
      const actualMultiplier = mults[actualSlot];
      // Only settle if the multiplier lookup is a valid positive number
      if (typeof actualMultiplier !== 'number' || !isFinite(actualMultiplier) || actualMultiplier < 0) {
        console.error('[Plinko] Invalid multiplier lookup — slot:', actualSlot, 'risk:', ball.risk, 'rows:', ball.rows);
        return;
      }
      settlePlinkoLanding(ball, actualSlot, actualMultiplier);
    });
    setPendingPlinkoBalls(prev => prev.filter(b => !ids.includes(b.id)));
  }

  interface AutoPlinkoSettings {
    onWin:"reset"|"increase"; onWinPct:number;
    onLose:"reset"|"increase"; onLosePct:number;
    stopProfit:number|null; stopLoss:number|null;
    infinite?:boolean;
  }

  function startAutoPlinko(settings: AutoPlinkoSettings) {
    if (!currentUser) { setAuthModal("login"); return; }
    const count = settings.infinite ? 999999 : Math.max(0, parseInt(plinkoAutoCount)||0);
    if (count <= 0 || plinkoAutoRunRef.current) return;

    const rate = liveRates[displayCurrency] || 1;
    const baseBetDisplay = parseFloat(plinkoBet)||0;
    if (baseBetDisplay / rate < 0.0099) return;

    plinkoAutoRunRef.current = true;
    const myId = ++plinkoLoopIdRef.current;
    setPlinkoAutoRunning(true);

    let remaining = count;
    setPlinkoAutoRemaining(remaining);
    let currentBetDisplay = baseBetDisplay;
    let sessionProfitDisplay = 0;

    const stopAuto = (resetBet = true) => {
      plinkoAutoRunRef.current = false;
      setPlinkoAutoRunning(false);
      if (resetBet) setPlinkoBet(baseBetDisplay.toFixed(2));
    };

    const loop = () => {
      if (plinkoLoopIdRef.current !== myId) return;
      if (!plinkoAutoRunRef.current || remaining <= 0) { stopAuto(); return; }
      const currentBetUsd = currentBetDisplay / rate;
      // Include payouts from in-flight balls so the loop doesn't stop prematurely
      const inFlightCredit = pendingPlinkoBallsRef.current.reduce(
        (s, b) => s + b.betUsd * b.multiplier, 0
      );
      const effectiveBal = ls.getBalance(currentUser) + inFlightCredit;
      if (currentBetUsd < 0.0099 || effectiveBal < currentBetUsd - 0.0001) { stopAuto(); return; }

      setPlinkoBet(currentBetDisplay.toFixed(2));
      const result = runPlinkoRoll(currentBetDisplay, rate);
      if (!result.success) { stopAuto(); return; }

      // Add ball to physics queue (payout settled when ball lands)
      const ball: PendingPlinkoball = {
        id: ++plinkoDropIdRef.current,
        targetSlot: result.slot,
        rows: plinkoRows,
        risk: plinkoRisk,
        multiplier: result.multiplier,
        betUsd: result.betUsd,
        launchedAt: Date.now(),
      };
      playPlinkoDrop();
      setPendingPlinkoBalls(prev => [...prev, ball]);

      sessionProfitDisplay += result.profitUsd * rate;

      if (result.win) {
        currentBetDisplay = settings.onWin === "increase" && settings.onWinPct > 0
          ? currentBetDisplay * (1 + settings.onWinPct / 100) : baseBetDisplay;
      } else {
        currentBetDisplay = settings.onLose === "increase" && settings.onLosePct > 0
          ? currentBetDisplay * (1 + settings.onLosePct / 100) : baseBetDisplay;
      }

      // Cap next bet by actual available balance (can't spend in-flight payouts)
      const realBal = ls.getBalance(currentUser);
      const maxBetDisplay = Math.floor(realBal * rate * 100) / 100;
      const minBetDisplay = Math.ceil(0.01 * rate * 100) / 100;
      currentBetDisplay = Math.max(minBetDisplay, Math.min(maxBetDisplay, currentBetDisplay));

      if (settings.stopProfit !== null && sessionProfitDisplay >= settings.stopProfit) { stopAuto(); return; }
      if (settings.stopLoss !== null && sessionProfitDisplay <= -settings.stopLoss) { stopAuto(); return; }

      remaining--;
      setPlinkoAutoRemaining(remaining);
      setTimeout(loop, 600);
    };
    setTimeout(loop, 600);
  }

  function stopAutoPlinko() {
    plinkoLoopIdRef.current++;
    plinkoAutoRunRef.current = false;
    setPlinkoAutoRunning(false);
  }

  // ── Cashier ──────────────────────────────────────────────────────────
  function openCashier(tab: "deposit"|"withdraw") {
    setCashierTab(tab);
    setCashierOpen(true);
    setDepositError(""); setWithdrawError("");
    setDepositView("select");
    setDepositAmount("");
    setWithdrawAmount(""); setWithdrawAddress("");
  }

  async function generateDeposit(autoMode = false) {
    // Capturar coin/network al inicio para evitar que cambios rápidos mezclen datos
    const coin = depositCoin;
    const network = depositNetwork;
    const genId = ++depositGenCounter.current; // contador de generación — descarta respuestas viejas

    setDepositError("");
    const lim = getNetLimit(coin, network);
    const minNative = minDepositNative(coin, network);
    const livePrice = getPriceUsd(coin);
    const maxNative = +(lim.maxDep / livePrice).toPrecision(6);
    let coinAmt: number;
    if (autoMode) {
      coinAmt = minNative;
    } else {
      coinAmt = parseFloat(depositAmount);
      if (!coinAmt||coinAmt<=0) return setDepositError("Ingresá un monto válido");
      if (coinAmt < minNative) return setDepositError(`Mínimo: ${minNative} ${coin} ($${lim.minDep} USD)`);
      if (coinAmt > maxNative) return setDepositError(`Máximo: ${maxNative} ${coin} ($${lim.maxDep} USD)`);
    }
    const usdAmt = +(coinAmt * livePrice).toFixed(2);
    const localId = `local_${Date.now()}`;
    const address = makeFakeAddress(coin, network);
    pendingDepositServerIdRef.current = null; // resetear ref al iniciar un nuevo depósito

    // Expirar depósitos pendientes anteriores para evitar acumulación en localStorage
    const prevTxList = ls.getTx(currentUser);
    const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 horas
    const now = Date.now();
    const cleanedTxList = prevTxList.map((t: Transaction) => {
      if (t.type === "deposit" && t.status === "pending") {
        const age = now - new Date(t.createdAt).getTime();
        if (age > PENDING_EXPIRY_MS) return { ...t, status: "expired" as const };
      }
      return t;
    });
    if (cleanedTxList.some((t: Transaction, i: number) => t.status !== prevTxList[i].status)) {
      ls.saveTx(currentUser, cleanedTxList);
      setTransactions([...cleanedTxList]);
    }
    if (pendingDeposit) setPendingDeposit(null);
    const pd: Transaction = {
      id: localId,
      type:"deposit", coin, network,
      coinAmount:coinAmt, usdAmount:usdAmt,
      address,
      status:"pending", createdAt:new Date().toISOString(),
      display_id: nextDisplayId("deposit"), // ID local temporal para UI inmediata
    };
    // Guardar inmediatamente en localStorage para UI instantánea
    const tx = ls.getTx(currentUser);
    tx.push(pd);
    ls.saveTx(currentUser, tx);
    setTransactions([...tx]);
    setPendingDeposit(pd);
    setDepositView("generated");

    // ── Sync a Supabase en segundo plano ──────────────────────────────────
    const sess = supaSessionRef.current;
    if (!sess?.access_token) { console.warn("[Deposit Supabase] sin sesión, solo local"); return; }

    // Guard: solo insertar en DB una vez por user+coin+network en esta sesión
    const dbKey = `${currentUser!.id}:${coin}:${network}`;
    if (autoGenKeySet.current.has(dbKey)) return;
    autoGenKeySet.current.add(dbKey);

    try {
      console.log("[Deposit Supabase] POST →", { type: "deposit", amount: usdAmt, currency: coin });
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.access_token}` },
        body: JSON.stringify({
          type: "deposit", amount: usdAmt, currency: coin,
          network, external_tx_id: address,
          notes: `coinAmount:${coinAmt}`,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error("[Deposit Supabase] POST falló", res.status, errBody);
        return;
      }
      const { transaction: serverTx } = await res.json();
      // Si el usuario cambió de red mientras esperaba el POST, descartar esta respuesta
      if (genId !== depositGenCounter.current) return;
      console.log("[Deposit Supabase] POST OK — id:", serverTx.id, "display_id:", serverTx.display_id);

      // Guardar UUID real en ref INMEDIATAMENTE (antes del next render)
      pendingDepositServerIdRef.current = serverTx.id;

      // Reemplazar id local + display_id en localStorage
      const allTx = ls.getTx(currentUser);
      const updated = allTx.map((t: Transaction) =>
        t.id === localId ? { ...t, id: serverTx.id, display_id: serverTx.display_id } : t
      );
      ls.saveTx(currentUser, updated);
      setTransactions([...updated]);
      setPendingDeposit(prev => prev ? { ...prev, id: serverTx.id, display_id: serverTx.display_id } : prev);

      // ── Race condition fix: si el usuario ya confirmó mientras esperaba el POST ──
      // Buscar la tx actual en localStorage — si ya está "completed", hacer PATCH ahora
      const freshTx = updated.find((t: Transaction) => t.id === serverTx.id);
      if (freshTx?.status === "completed") {
        console.log("[Deposit Supabase] TX ya confirmada localmente, PATCHeando ahora →", serverTx.id);
        const freshSess = supaSessionRef.current;
        if (freshSess?.access_token) {
          try {
            const patchRes = await fetch(`/api/transactions/${serverTx.id}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${freshSess.access_token}` },
              body: JSON.stringify({ status: "completed" }),
            });
            if (patchRes.ok) {
              const { transaction: upd } = await patchRes.json();
              console.log("[Deposit Supabase] PATCH diferido OK →", upd?.id, upd?.status);
              // NO llamar fetchRemoteBalance aquí: el balance ya fue actualizado optimistamente
              // en confirmDeposit y el balance/sync enviará el valor post-apuesta correcto.
              // Llamarlo causaría race condition si el usuario apostó mientras el POST estaba en vuelo.
            } else {
              const errBody = await patchRes.json().catch(() => ({}));
              console.error("[Deposit Supabase] PATCH diferido falló", patchRes.status, errBody);
            }
          } catch (e) { console.error("[Deposit Supabase] PATCH diferido error:", e); }
        }
      }
    } catch (e) { console.error("[Deposit Supabase] fetch error:", e); }
  }

  function addNotif(type: AppNotification["type"], title: string, message: string) {
    const n: AppNotification = { id: Date.now().toString(), type, title, message, createdAt: new Date().toISOString(), read: false };
    const updated = [n, ...ls.getNotifs(currentUser)].slice(0, 50);
    ls.saveNotifs(currentUser, updated);
    setNotifications(updated);
    // Clear any existing toast timers before showing new toast
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current);
    setToastExiting(false);
    setToast({ title, message, type });
    // After 12.5s begin slide-out, remove at 13s
    toastTimerRef.current = setTimeout(() => setToastExiting(true), 12500);
    toastExitTimerRef.current = setTimeout(() => { setToast(null); setToastExiting(false); }, 13000);
  }

  function dismissToast() {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current);
    setToastExiting(true);
    toastExitTimerRef.current = setTimeout(() => { setToast(null); setToastExiting(false); }, 450);
  }

  async function confirmDeposit() {
    if (!pendingDeposit) return;
    const usdAmt    = pendingDeposit.usdAmount;
    const address   = pendingDeposit.address!; // clave única e inmutable del depósito

    // Buscar el tx ACTUAL en localStorage por address (su id puede haber cambiado local→server)
    const allTxNow   = ls.getTx(currentUser);
    const currentTx  = allTxNow.find((t: Transaction) => t.address === address && t.type === "deposit");
    const currentTxId = currentTx?.id || pendingDeposit.id!;

    // UUID del servidor: del ref (si POST ya regresó) o del tx actual (si ya fue actualizado)
    const serverUuid =
      pendingDepositServerIdRef.current ||
      (currentTxId && !currentTxId.startsWith("local_") ? currentTxId : null);
    pendingDepositServerIdRef.current = null;

    setCashierOpen(false);
    setDepositView("select");
    setPendingDeposit(null);

    // Marcar como completed en localStorage usando el ID actual del tx
    const updated = ls.updateTxStatus(currentUser, currentTxId, "completed");

    // Actualizar UI inmediatamente (optimistic) — NO usar setCoinBalanceUsd porque eso
    // dispara un POST /api/balance/sync que choca con el updateBalance del PATCH
    // y causa doble-crédito. Solo actualizamos estado local; fetchRemoteBalance corrige desde el servidor.
    if (balanceSyncTimerRef.current) {
      clearTimeout(balanceSyncTimerRef.current);
      balanceSyncTimerRef.current = null;
    }
    const depositedCoin = pendingDeposit?.coin ?? depositCoinRef.current;
    // Usar coinAmount exacto del depósito (evita reconversión USD/precio que pierde decimales)
    const addedNative = pendingDeposit?.coinAmount ?? (usdAmt / getPriceUsd(depositedCoin));
    balanceInstantRef.current = true;
    setCoinBalances(prev => {
      const updated2 = { ...prev, [depositedCoin]: (prev[depositedCoin] ?? 0) + addedNative };
      coinBalancesRef.current = updated2;
      return updated2;
    });
    const prevBal = ls.getBalance(currentUser);
    const nbOptimistic = prevBal + (depositedCoin === depositCoinRef.current ? usdAmt : 0);
    if (depositedCoin === depositCoinRef.current) {
      setBalanceState(nbOptimistic);
      ls.setBalance(currentUser, nbOptimistic);
    }
    ls.addWagerReq(currentUser, usdAmt);
    setTransactions([...updated]);
    addNotif("deposit", "Depósito confirmado", `+${fmtMoney(usdAmt)} acreditados a tu cuenta`);

    // ── PATCH Supabase ────────────────────────────────────────────────────
    const sess = supaSessionRef.current;
    if (sess?.access_token && serverUuid) {
      console.log("[Deposit Supabase] PATCH status=completed →", serverUuid);
      try {
        const patchRes = await fetch(`/api/transactions/${serverUuid}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.access_token}` },
          body: JSON.stringify({ status: "completed" }),
        });
        if (patchRes.ok) {
          const { transaction: upd } = await patchRes.json();
          console.log("[Deposit Supabase] PATCH OK →", upd?.id, upd?.status);
          // Refrescar balance desde servidor (fuente de verdad post-PATCH)
          await fetchRemoteBalance(currentUser, { postDeposit: true });
        } else {
          const errBody = await patchRes.json().catch(() => ({}));
          console.error("[Deposit Supabase] PATCH falló", patchRes.status, errBody);
        }
      } catch (e) { console.error("[Deposit Supabase] PATCH error:", e); }
    } else {
      // POST aún en vuelo — generateDeposit lo va a manejar cuando regrese el POST
      console.warn("[Deposit Supabase] PATCH pendiente (POST aún en vuelo) — address:", address, "| sesión:", !!sess?.access_token);
    }
  }

  async function submitWithdraw() {
    setWithdrawError("");
    const amt = parseFloat(withdrawAmount);
    const wLim = getNetLimit(withdrawCoin, withdrawNetwork);
    const curBal = ls.getBalance(currentUser);
    if (!withdrawAddress.trim()) return setWithdrawError("Ingresá una wallet address");
    if (!amt||amt<=0) return setWithdrawError("Ingresá un monto válido");
    if (amt < wLim.minWith) return setWithdrawError(`Mínimo retiro: $${wLim.minWith} USD`);
    if (amt > wLim.maxWith) return setWithdrawError(`Máximo retiro: $${wLim.maxWith} USD`);
    if (amt > curBal) return setWithdrawError("Saldo insuficiente");
    const wagerReq = ls.getWagerReq(currentUser);
    if (wagerReq > 0.001) {
      setCashierOpen(false);
      // wager_req_initial = total de depósitos que generaron el requisito (para barra de progreso)
      const wagerReqInitial = Math.max(ls.getWagerReqInitial(currentUser), wagerReq);
      const wageredToward = Math.max(0, wagerReqInitial - wagerReq);
      setWagerAlert({ required: wagerReqInitial, wagered: wageredToward, remaining: +wagerReq.toFixed(4) });
      return;
    }
    const localId = `local_${Date.now()}`;
    const newTx: Transaction = {
      id: localId, type:"withdraw", coin:withdrawCoin, network:withdrawNetwork,
      usdAmount:amt, address:withdrawAddress, status:"pending",
      createdAt:new Date().toISOString(), display_id: nextDisplayId("withdraw"),
    };
    const tx = ls.getTx(currentUser);
    tx.push(newTx);
    ls.saveTx(currentUser, tx);
    const nb = curBal - amt;
    setCoinBalanceUsd(nb);
    setTransactions([...tx]);
    setCashierOpen(false);
    addNotif("withdraw", "Retiro solicitado", `${fmtMoney(amt)} está siendo procesado. Te notificaremos cuando sea enviado.`);

    // ── Sync a Supabase en segundo plano ──────────────────────────────────
    const sessW = supaSessionRef.current;
    if (sessW?.access_token) {
      try {
        console.log("[Withdraw Supabase] INSERT →", { type: "withdrawal", amount: amt, currency: withdrawCoin, network: withdrawNetwork });
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessW.access_token}` },
          body: JSON.stringify({
            type: "withdrawal", amount: amt, currency: withdrawCoin,
            network: withdrawNetwork, external_tx_id: withdrawAddress,
          }),
        });
        if (res.ok) {
          const { transaction: serverTx } = await res.json();
          const updated = ls.getTx(currentUser).map((t: Transaction) =>
            t.id === localId ? { ...t, id: serverTx.id, display_id: serverTx.display_id } : t
          );
          ls.saveTx(currentUser, updated);
          setTransactions([...updated]);
        } else {
          const errBody = await res.json().catch(() => ({}));
          console.error("[Withdraw Supabase]", res.status, errBody);
        }
      } catch (e) {
        console.error("[Withdraw Supabase] fetch error:", e);
      }
    } else {
      console.warn("[Withdraw Supabase] No hay sesión activa, retiro guardado solo localmente");
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  function filterByRange(items: Bet[]) {
    if (statsRange==="all") return items;
    const days = statsRange==="7d"?7:30;
    const cut = Date.now() - days*86400000;
    return items.filter(b => new Date(b.createdAt).getTime()>=cut);
  }

  const filtered = filterByRange(bets);
  const totalWagered = filtered.reduce((s,b)=>s+b.amount,0);
  const totalWins = filtered.reduce((s,b)=>s+b.winAmount,0);
  const winRate = filtered.length ? (filtered.filter(b=>b.winAmount>0).length/filtered.length)*100 : 0;

  const totalDeposits = transactions.filter(t=>t.type==="deposit").reduce((s,t)=>s+t.usdAmount,0);
  const lastDeposit = [...transactions].reverse().find(t=>t.type==="deposit");

  // ── Dice payout preview ───────────────────────────────────────────────
  const diceBetNum = Math.max(0, parseFloat(diceBet)||0);
  const diceMultNum = Math.max(1.01, parseFloat(diceMultiplier)||2);
  const dicePayoutPreview = diceBetNum * diceMultNum;
  const diceBetUsd = diceBetNum / (liveRates[displayCurrency]||1);

  // ── Balance chip display ──────────────────────────────────────────────
  const fmtARS = (v: number) => (v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mStyle: React.CSSProperties = { opacity: currencyFade, transition: "opacity 0.18s ease" };
  const selectedCurrDef = WALLET_CURRENCIES.find(c=>c.code===displayCurrency) || WALLET_CURRENCIES[0];
  const chipRate = liveRates[displayCurrency] || 1;
  const chipConverted = displayedBalance * chipRate;
  const chipFormatted = chipConverted >= 1000
    ? chipConverted.toLocaleString("es-AR", { maximumFractionDigits: 0 })
    : chipConverted.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gameInProgress = diceRolling || diceAutoRunning || plinkoAutoRunning || kenoAutoRunning || kenoIsDrawing || minesGameActive || hiloGameActive || bjGameActive || rouletteGameActive || baccaratGameActive;
  const chipCryptoAmt = coinBalances[depositCoin] ?? 0;
  const chipText = displayInFiat
    ? `${selectedCurrDef.symbol}${chipFormatted}`
    : chipCryptoAmt.toFixed(8);

  // ── Search filtered slots ─────────────────────────────────────────────
  const filteredSlots = fakeSlots.filter(s => {
    const matchCat = searchCategory==="All" || s.category===searchCategory;
    const matchQ = !searchQ || s.name.toLowerCase().includes(searchQ.toLowerCase()) || s.provider.toLowerCase().includes(searchQ.toLowerCase());
    return matchCat && matchQ;
  });

  // ─────────────────────────────────────────────────────────────────────
  // ─── APP ────────────────────────────────────────────────────────────
  return (
    <div style={{ margin:0,fontFamily:"Arial,sans-serif",background:"#0e1320",color:"#e6edf3",minHeight:"100vh" }}>
      {/* ── SIDEBAR ── */}
      <aside style={{
        width: sidebarCollapsed ? "62px" : "220px",
        position:"fixed", left:0, top:0, bottom:0,
        background:"#13192a",
        borderRight:"1px solid #1a2235",
        display:"flex", flexDirection:"column",
        zIndex:100, overflow:"hidden",
        transition:"width 0.22s cubic-bezier(.4,0,.2,1)",
      }}>
        {/* Top: hamburger + Casino/Sports toggle */}
        <div style={{ height:"70px", padding: sidebarCollapsed?"0":"0 12px", borderBottom:"1px solid #1a2235", flexShrink:0, display:"flex", alignItems:"center" }}>
          {/* Hamburger row */}
          <div style={{ display:"flex",alignItems:"center",gap:"8px",justifyContent: sidebarCollapsed?"center":"flex-start", width:"100%" }}>
            <button onClick={()=>setSidebarCollapsed(v=>!v)}
              style={{ width:"38px",height:"38px",borderRadius:"10px",background:"#1e2538",border:"none",color:"#c8d4e8",fontSize:"18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
              ☰
            </button>
            {!sidebarCollapsed && (
              <button onClick={showHomeView} style={{ flex:1,border:"none",background:"linear-gradient(180deg,#f4b12d,#de9409)",color:"white",fontWeight:600,borderRadius:"8px",height:"38px",cursor:"pointer",fontSize:"13px" }}>Casino</button>
            )}
          </div>
        </div>

        {/* Search — sits just below the header line */}
        {!sidebarCollapsed && (
          <div style={{ padding:"10px 12px", borderBottom:"1px solid #1a2235", flexShrink:0 }}>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",color:"#97a4b7",fontSize:"16px" }}>⌕</span>
              <input onClick={()=>setSearchOpen(true)} readOnly placeholder={t("search")}
                style={{ width:"100%",padding:"10px 12px 10px 36px",borderRadius:"10px",border:"1px solid #3a4258",background:"#262d3f",color:"#fff",cursor:"pointer",boxSizing:"border-box",fontSize:"13px" }} />
            </div>
          </div>
        )}
        {sidebarCollapsed && (
          <div style={{ display:"flex",justifyContent:"center",padding:"10px 0",borderBottom:"1px solid #1a2235",flexShrink:0 }}>
            <button onClick={()=>setSearchOpen(true)}
              style={{ width:"40px",height:"40px",borderRadius:"10px",background:"#1e2538",border:"none",color:"#c8d4e8",fontSize:"18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
              ⌕
            </button>
          </div>
        )}

        {/* Nav items */}
        <ul style={{ listStyle:"none",padding:"8px 0 8px",margin:0, flex:1, overflowY:"auto", overflowX:"hidden" }}>
          {[
            { icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, key:"home",      action:showHomeView },
            { icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/><path d="M7 9l-2-2M17 9l2-2"/></svg>, key:"originals", action:()=>{ if(!sidebarCollapsed) setOriginalsMenuOpen(v=>!v); else { setSearchOpen(true); setSearchCategory("Originals"); } } },
            { icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>, key:"rewards",   action:()=>openSection("tips-bonuses") },
            { icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, key:"referrals", action:()=>openSection("referrals") },
            { icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>, key:"fairness",  action:()=>{ window.scrollTo({top:0,behavior:"instant"}); setSection("fairness"); } },
            { icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>, key:"support",   action:()=>{ setChatOpen(true); if(currentUser) loadChatSessions(currentUser); } },
          ].map((item,i)=>{ const isNavActive = (item.key==="home"&&section==="home") || (item.key==="originals"&&originalsMenuOpen) || (item.key==="rewards"&&section==="tips-bonuses") || (item.key==="referrals"&&section==="referrals") || (item.key==="fairness"&&section==="fairness"); return (
            <li key={i} style={{ borderBottom:"1px solid #1a2235" }}>
              <div onClick={item.action} title={sidebarCollapsed ? t(item.key) : undefined}
                onMouseEnter={e=>{
                  if(!isNavActive){ e.currentTarget.style.background="#131d30"; e.currentTarget.style.borderLeftColor="#3a4a66"; e.currentTarget.style.color="#fff"; }
                }}
                onMouseLeave={e=>{
                  if(!isNavActive){ e.currentTarget.style.background="transparent"; e.currentTarget.style.borderLeftColor="transparent"; e.currentTarget.style.color="#9ca3af"; }
                }}
                style={{
                  display:"flex", alignItems:"center",
                  justifyContent: sidebarCollapsed ? "center" : "space-between",
                  padding: sidebarCollapsed ? "14px 0" : "12px 14px",
                  color: isNavActive ? "#ffffff" : "#9ca3af",
                  fontWeight:500, cursor:"pointer",
                  borderLeft: isNavActive ? "3px solid #f4a91f" : "3px solid transparent",
                  background: isNavActive ? "linear-gradient(90deg,#1a2238,#0f1320)" : "transparent",
                  transition:"background 0.2s ease, color 0.2s ease, border-left-color 0.2s ease",
                }}>
                <span style={{ display:"flex",alignItems:"center",gap:"10px",justifyContent: sidebarCollapsed?"center":"flex-start",minWidth: sidebarCollapsed?"100%":"auto" }}>
                  <span style={{ width:"22px",height:"22px",display:"flex",alignItems:"center",justifyContent:"center",fontSize: sidebarCollapsed?"22px":"17px",flexShrink:0,lineHeight:1 }}>{item.icon}</span>
                  {!sidebarCollapsed && <span style={{ fontSize:"14px", lineHeight:1.4, fontFamily:"'Inter',sans-serif", letterSpacing:"0.2px", fontWeight:500, whiteSpace:"nowrap" }}>{t(item.key)}</span>}
                </span>
                {!sidebarCollapsed && item.key==="originals" && (
                  <span
                    onMouseEnter={e=>{ e.currentTarget.style.background="#515a78"; e.currentTarget.style.transform="scale(1.15)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background="#3a425a"; e.currentTarget.style.transform="scale(1)"; }}
                    style={{ width:"22px",height:"22px",borderRadius:"6px",background:"#3a425a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",transition:"background .15s, transform .15s",cursor:"pointer" }}>
                    {originalsMenuOpen ? "▴" : "▾"}
                  </span>
                )}
              </div>
              {/* Originals submenu */}
              {item.key==="originals" && originalsMenuOpen && !sidebarCollapsed && (
                <ul className="casino-submenu" style={{ listStyle:"none",margin:0,padding:"4px 0 6px 0",background:"#0c1120",borderBottom:"1px solid #1a2235" }}>
                  {[
                    { icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1.4" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>, label:"Dados",     action:showDiceOnly,     view:"dice" },
                    { icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>, label:"Plinko",    action:showPlinkoOnly,   view:"plinko" },
                    { icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, label:"Keno",      action:showKenoOnly,     view:"keno" },
                    { icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z"/><path d="M4 8h16"/><path d="M9 4v4"/></svg>, label:"Blackjack", action:showBlackjackOnly,view:"blackjack" },
                    { icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="14" r="7"/><line x1="12" y1="7" x2="12" y2="4"/><line x1="9" y1="4" x2="15" y2="4"/><line x1="17.5" y1="8.5" x2="19.5" y2="6.5"/><circle cx="10" cy="13" r="1" fill="currentColor" stroke="none"/></svg>, label:"Mines",     action:showMinesOnly,    view:"mines" },
                    { icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 5 12 2 16 5"/><polyline points="8 19 12 22 16 19"/><path d="M4 9v6M20 9v6M4 12h4M16 12h4"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>, label:"Hilo",      action:showHiloOnly,     view:"hilo" },
                    { icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>, label:"Ruleta",    action:showRouletteOnly, view:"roulette" },
                    { icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="12" height="16" rx="2"/><rect x="11" y="2" width="12" height="16" rx="2"/></svg>, label:"Baccarat",  action:showBaccaratOnly, view:"baccarat" },
                  ].map((sub,si)=>{
                    const isActiveSub = homeView === sub.view;
                    return (
                    <li key={si} onClick={sub.action}
                      onMouseEnter={e=>{ if(!isActiveSub){ e.currentTarget.style.background="#131d30"; e.currentTarget.style.color="#c8d0dc"; } }}
                      onMouseLeave={e=>{ if(!isActiveSub){ e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#9ca3af"; } }}
                      style={{ display:"flex",alignItems:"center",gap:"10px",padding:"9px 14px 9px 28px",cursor:"pointer",
                        color: isActiveSub ? "#f4a91f" : "#9ca3af",
                        fontWeight: isActiveSub ? 600 : 500,
                        fontSize:"14px",
                        fontFamily:"'Inter',sans-serif",
                        letterSpacing:"0.2px",
                        background: isActiveSub ? "linear-gradient(90deg,rgba(244,169,31,0.12),transparent)" : "transparent",
                        borderLeft: isActiveSub ? "2px solid #f4a91f" : "2px solid transparent",
                        paddingLeft: isActiveSub ? "26px" : "28px",
                        transition:"background 0.2s ease, color 0.2s ease",
                        boxShadow: isActiveSub ? "inset 0 0 20px rgba(244,169,31,0.04)" : "none",
                      }}>
                      <span style={{ fontSize:"14px", width:"18px", flexShrink:0, textAlign:"center", display:"inline-flex", alignItems:"center", justifyContent:"center", filter: isActiveSub ? "drop-shadow(0 0 4px rgba(244,169,31,0.6))" : "none" }}>{sub.icon}</span>
                      <span>{sub.label}</span>
                      {isActiveSub && <span style={{ marginLeft:"auto", width:"6px", height:"6px", borderRadius:"50%", background:"#f4a91f", boxShadow:"0 0 6px rgba(244,169,31,0.8)", flexShrink:0 }}/>}
                    </li>
                  )})}
                </ul>
              )}
            </li>
          ); })}
        </ul>

        {/* ── Admin link — only visible when logged in ── */}
        {currentUser && (
          <div style={{ flexShrink:0, borderTop:"1px solid #1a2235" }}>
            <div
              onClick={()=>{ window.scrollTo({top:0,behavior:"instant"}); setSection("admin"); }}
              title={sidebarCollapsed ? "Admin" : undefined}
              onMouseEnter={e=>{ e.currentTarget.style.background="#131d30"; e.currentTarget.style.color="#fff"; }}
              onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#9ca3af"; }}
              style={{
                display:"flex", alignItems:"center", gap:"10px",
                justifyContent: sidebarCollapsed ? "center" : "flex-start",
                padding: sidebarCollapsed ? "14px 0" : "12px 16px",
                cursor:"pointer", color: section==="admin" ? "#f59e0b" : "#9ca3af",
                background: section==="admin" ? "#131d30" : "transparent",
                borderLeft: section==="admin" ? "3px solid #f59e0b" : "3px solid transparent",
                transition:"all .15s",
              }}
            >
              <span style={{ width:"22px", height:"22px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  <path d="M16 3.5c.7.5 1.2 1.4 1.2 2.5s-.5 2-1.2 2.5"/>
                </svg>
              </span>
              {!sidebarCollapsed && <span style={{ fontSize:"14px", fontWeight:500, whiteSpace:"nowrap" }}>Admin</span>}
            </div>
          </div>
        )}

        {/* ── Language selector — last flex child inside aside ── */}
        <div style={{ flexShrink:0, position:"relative", borderTop:"1px solid #1a2235" }}>
          {/* Language list popup — fixed so it's not clipped */}
          {langMenuOpen && (
            <div style={{ position:"fixed",bottom:"48px",left:0,width: sidebarCollapsed?"62px":"220px",background:"#161e30",border:"1px solid #2a3550",borderRadius:"10px",overflow:"hidden",zIndex:200,boxShadow:"0 -8px 24px rgba(0,0,0,.7)",transition:"width 0.22s cubic-bezier(.4,0,.2,1)" }}>
              {Object.keys(LANGS).filter(l=>l!==lang).map(l=>(
                <button key={l} onClick={()=>{ setLang(l); setLangMenuOpen(false); }}
                  style={{ width:"100%",display:"flex",alignItems:"center",gap:"12px",background:"transparent",border:"none",borderBottom:"1px solid #1e2840",padding:"11px 14px",cursor:"pointer",color:"#c8d4e8",fontWeight:600,fontSize:"13px",textAlign:"left",transition:"background .12s" }}
                  onMouseEnter={e=>(e.currentTarget.style.background="#1e2840")}
                  onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                  {flagImg(l, 20)}
                  {!sidebarCollapsed && <span>{LANG_NAMES[l]}</span>}
                </button>
              ))}
            </div>
          )}
          {/* Trigger */}
          <button onClick={()=>setLangMenuOpen(v=>!v)}
            style={{ width:"100%",display:"flex",alignItems:"center",gap:"10px",justifyContent: sidebarCollapsed?"center":"flex-start",background:"transparent",border:"none",padding: sidebarCollapsed?"12px 0":"12px 16px",cursor:"pointer",color:"#e0e8f4",transition:"background .15s" }}
            onMouseEnter={e=>(e.currentTarget.style.background="#1d2540")}
            onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
            {flagImg(lang, 20)}
            {!sidebarCollapsed && <>
              <span style={{ flex:1,textAlign:"left",fontSize:"13px",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden" }}>{LANG_NAMES[lang]}</span>
              <span style={{ fontSize:"10px",color:"#6a7a99",transform:langMenuOpen?"rotate(180deg)":"none",transition:"transform .2s",display:"inline-block" }}>▲</span>
            </>}
          </button>
        </div>

      </aside>

      {/* MAIN */}
      <main style={{ marginLeft: sidebarCollapsed?"62px":"220px", minHeight:"100vh", padding:"16px", transition:"margin-left 0.22s cubic-bezier(.4,0,.2,1)" }}>
        {/* NAVBAR */}
        <nav style={{ background:"rgba(16,23,37,.97)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",borderBottom:"1px solid #1d2536",height:"70px",margin:"-16px -16px 18px -16px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 16px rgba(0,0,0,.45)",flexShrink:0 }}>
          <div style={{ maxWidth:"1080px",margin:"0 auto",height:"100%",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"14px",flexWrap:"nowrap" }}>
          <div style={{ cursor:"pointer",display:"flex",alignItems:"center",marginLeft:"-38px" }} onClick={showHomeView}><img src="/mander-logo.png" alt="Mander" style={{ height:"90px",display:"block" }} /></div>
          <div style={{ flex:1 }}/>
          <div style={{ display:"flex",alignItems:"center",gap:"10px",position:"relative" }}>
            {currentUser ? (<>
            {/* Balance chip */}
            <div className="balance-drop-wrap" style={{ position:"relative" }}>
              <button onClick={()=>{ setBalanceDropOpen(!balanceDropOpen); setProfileDropOpen(false); }}
                style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px",background:"#0d1117",border:"1px solid #1e2a3a",borderRadius:"10px",padding:"0 16px 0 10px",minHeight:"44px",minWidth:"220px",fontWeight:500,color:"#fff",cursor:"pointer" }}>
                <span style={{ display:"flex",alignItems:"center",gap:"14px",...mStyle }}>
                  <img src={coinDisplayMap[depositCoin]?.icon ?? "/coins/usdt.svg"} width={26} height={26} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={depositCoin} />
                  {chipText}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {balanceDropOpen && (
                <div style={{ position:"absolute",top:"calc(100% + 8px)",left:0,width:"260px",background:"#161e2e",border:"1px solid #1e2a3e",borderRadius:"14px",zIndex:60,boxShadow:"0 20px 50px rgba(0,0,0,.6)" }}>
                  {/* Coin rows */}
                  <div style={{ maxHeight:"320px",overflowY:"auto",padding:"8px 0" }}>
                    {Object.entries(coinDisplayMap)
                      .filter(([k]) => k !== "ARS" && coinConfig[k])
                      .filter(([k]) => !hideZeroBalances || (coinBalances[k] ?? 0) > 0)
                      .map(([coin, def]) => {
                        const cryptoAmt = coinBalances[coin] ?? 0;
                        const usdVal = cryptoAmt * getPriceUsd(coin);
                        const fiatVal = usdVal * (liveRates[displayCurrency] ?? 1);
                        const isSelected = coin === depositCoin;
                        const coinLocked = gameInProgress;
                        return (
                          <div key={coin} onClick={()=>{ if(coinLocked) return; setDepositCoin(coin); }}
                            title={coinLocked?"No puedes cambiar moneda durante una apuesta activa":undefined}
                            style={{ display:"flex",alignItems:"center",gap:"12px",padding:"10px 16px",cursor:coinLocked?"not-allowed":"pointer",background:isSelected?"rgba(255,255,255,0.06)":"transparent",transition:"background .15s",opacity:coinLocked&&!isSelected?0.4:1 }}
                            onMouseEnter={e=>{ if(!isSelected&&!coinLocked)(e.currentTarget as HTMLDivElement).style.background="rgba(255,255,255,0.04)"; }}
                            onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.background=isSelected?"rgba(255,255,255,0.06)":"transparent"; }}>
                            <img src={def.icon ?? ""} width={32} height={32} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={coin} />
                            <div style={{ flex:1,minWidth:0 }}>
                              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                                <span style={{ color:"#e2eaf5",fontWeight:600,fontSize:"14px" }}>{coin}</span>
                                <span style={{ color:"#e2eaf5",fontWeight:700,fontSize:"14px" }}>
                                  {displayInFiat
                                    ? `${selectedCurrDef.symbol}${fiatVal >= 1000 ? fiatVal.toLocaleString("es-AR",{maximumFractionDigits:0}) : fiatVal.toFixed(2)}`
                                    : cryptoAmt.toFixed(8)}
                                </span>
                              </div>
                              <div style={{ display:"flex",justifyContent:"space-between",marginTop:"1px" }}>
                                <span style={{ color:"#5a6a82",fontSize:"12px" }}>{def.name}</span>
                                <span style={{ color:"#5a6a82",fontSize:"12px" }}>{cryptoAmt.toFixed(8)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {/* Divider */}
                  <div style={{ height:"1px",background:"#1e2a3e",margin:"0 12px" }} />
                  {/* Display in Fiat toggle */}
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px" }}>
                    <span style={{ color:"#c0cde0",fontSize:"13px",fontWeight:500 }}>Display in Fiat</span>
                    <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
                      {displayInFiat && (
                        <div style={{ position:"relative" }}>
                          <button onClick={e=>{ e.stopPropagation(); setFiatCurrPickerOpen(v=>!v); }}
                            style={{ background:"#1e2a3e",border:"1px solid #2e3d5a",borderRadius:"6px",padding:"2px 10px",color:"#8ab4f8",fontSize:"12px",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:"4px" }}>
                            {displayCurrency}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8ab4f8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                          {fiatCurrPickerOpen && (
                            <div style={{ position:"absolute",top:"calc(100% + 6px)",right:0,width:"210px",background:"#1a2336",border:"1px solid #1e2a3e",borderRadius:"10px",boxShadow:"0 8px 32px rgba(0,0,0,.6)",zIndex:200 }}>
                              {/* Search */}
                              <div style={{ padding:"8px 10px",borderBottom:"1px solid #1e2a3e" }}>
                                <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#111827",borderRadius:"7px",padding:"5px 10px",border:"1px solid #2a3550" }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5a6a82" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                  <input autoFocus value={fiatCurrSearch} onChange={e=>{ e.stopPropagation(); setFiatCurrSearch(e.target.value); }}
                                    onClick={e=>e.stopPropagation()}
                                    placeholder="Buscar moneda..."
                                    style={{ background:"transparent",border:"none",outline:"none",color:"#c0cde0",fontSize:"12px",width:"100%",fontFamily:"inherit" }} />
                                </div>
                              </div>
                              <div style={{ maxHeight:"200px",overflowY:"auto",padding:"4px 0" }}>
                              {WALLET_CURRENCIES.filter(c=>{ const q=fiatCurrSearch.toLowerCase(); return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q); }).map(c=>(
                                <div key={c.code} onClick={e=>{ e.stopPropagation(); setDisplayCurrency(c.code); setFiatCurrPickerOpen(false); setFiatCurrSearch(""); }}
                                  style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",cursor:"pointer",background:displayCurrency===c.code?"rgba(138,180,248,0.12)":"transparent",transition:"background .12s" }}
                                  onMouseEnter={e=>{ if(displayCurrency!==c.code)(e.currentTarget as HTMLDivElement).style.background="rgba(255,255,255,0.05)"; }}
                                  onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.background=displayCurrency===c.code?"rgba(138,180,248,0.12)":"transparent"; }}>
                                  <span style={{ color:"#c0cde0",fontSize:"13px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,marginRight:"8px" }}>{c.name}</span>
                                  <span style={{ color:displayCurrency===c.code?"#8ab4f8":"#5a6a82",fontSize:"12px",fontWeight:700,flexShrink:0 }}>{c.code}</span>
                                </div>
                              ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div onClick={()=>{ if(gameInProgress) return; setDisplayInFiat(v=>!v); setFiatCurrPickerOpen(false); }} title={gameInProgress?"No puedes cambiar esto durante una apuesta activa":undefined} style={{ width:"38px",height:"22px",borderRadius:"11px",background:gameInProgress?"#2a3550":displayInFiat?"#4ade80":"#2a3550",cursor:gameInProgress?"not-allowed":"pointer",position:"relative",transition:"background .2s",flexShrink:0,opacity:gameInProgress?0.45:1 }}>
                        <div style={{ position:"absolute",top:"3px",left:displayInFiat?"19px":"3px",width:"16px",height:"16px",borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.3)" }} />
                      </div>
                    </div>
                  </div>
                  {/* Hide 0 balances toggle */}
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px 12px" }}>
                    <span style={{ color:"#c0cde0",fontSize:"13px",fontWeight:500 }}>Hide 0 balances</span>
                    <div onClick={()=>setHideZeroBalances(v=>!v)} style={{ width:"38px",height:"22px",borderRadius:"11px",background:hideZeroBalances?"#4ade80":"#2a3550",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0 }}>
                      <div style={{ position:"absolute",top:"3px",left:hideZeroBalances?"19px":"3px",width:"16px",height:"16px",borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.3)" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button onClick={()=>openCashier("deposit")} style={{ minHeight:"44px",padding:"0 28px",borderRadius:"10px",fontWeight:700,fontSize:"14px",color:"#fff",background:"linear-gradient(180deg,#f6b531,#ea9807)",border:"none",cursor:"pointer",letterSpacing:"0.2px",transition:"filter .15s" }}
              onMouseEnter={e=>(e.currentTarget.style.filter="brightness(1.1)")}
              onMouseLeave={e=>(e.currentTarget.style.filter="none")}>{t("deposit")}</button>

            {/* Rewards button + dropdown */}
            {(() => {
              void rbTick; // re-evaluate every second for live countdown
              const rdCanI = canClaimInstant(currentUser);
              const rdCanW = canClaimPeriodic("weekly", currentUser);
              const rdCanM = canClaimPeriodic("monthly", currentUser);
              const rdITimer = timeUntilInstant(currentUser);
              const rdWTimer = timeUntilClaim("weekly", currentUser);
              const rdMTimer = timeUntilClaim("monthly", currentUser);
              const rdBadge = [rdCanI && rbInstant > 0, rdCanW && rbWeekly > 0, rdCanM && rbMonthly > 0].filter(Boolean).length;
              const rdRows: { key: string; label: string; amount: number; canClaim: boolean; timer: string; onClaim: ()=>void; accent: string; icon: React.ReactNode }[] = [
                { key:"instant", label:"Rakeback Instantáneo", amount:rbInstant, canClaim:rdCanI, timer:rdITimer, onClaim:doClaimInstant, accent:"#f4a91f",
                  icon:<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f4a91f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
                { key:"weekly",  label:"Bono Semanal",         amount:rbWeekly,  canClaim:rdCanW, timer:rdWTimer, onClaim:doClaimWeekly,  accent:"#6c8ae4",
                  icon:<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6c8ae4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
                { key:"monthly", label:"Bono Mensual",         amount:rbMonthly, canClaim:rdCanM, timer:rdMTimer, onClaim:doClaimMonthly, accent:"#9b6cda",
                  icon:<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#9b6cda" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
              ];
              return (
                <div ref={rewardsDropRef} style={{ position:"relative" }}>
                  <button
                    onClick={()=>{ setRewardsDropOpen(v=>!v); setNotifPanelOpen(false); setProfileDropOpen(false); setBalanceDropOpen(false); }}
                    className="hdr-icon-btn"
                    style={{ width:"40px",height:"40px",borderRadius:"10px",background:rewardsDropOpen?"#3d4a62":"#2f3648",border:"none",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",position:"relative",cursor:"pointer",transition:"background .15s, transform .12s" }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                    {rdBadge > 0 && (
                      <span style={{ position:"absolute",top:"-6px",right:"-4px",background:"#f4a91f",color:"#111",borderRadius:"999px",minWidth:"20px",height:"20px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:700,pointerEvents:"none" }}>{rdBadge}</span>
                    )}
                  </button>
                  {rewardsDropOpen && (
                      <div style={{ position:"absolute",top:"calc(100% + 10px)",right:0,zIndex:1200,width:"300px",background:"#131a28",border:"1px solid #1e2a3e",borderRadius:"16px",boxShadow:"0 8px 32px rgba(0,0,0,0.55)",overflow:"hidden" }}>
                        {/* Rows */}
                        <div style={{ padding:"8px" }}>
                          {rdRows.map(row => {
                            const avail = row.canClaim && row.amount > 0;
                            return (
                              <div key={row.key} style={{ display:"flex",alignItems:"center",gap:"10px",padding:"10px 8px",borderRadius:"10px",transition:"background .15s" }}>
                                {/* Icon */}
                                <div style={{ width:"36px",height:"36px",borderRadius:"10px",background:row.accent+"18",border:`1px solid ${row.accent}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                                  {row.icon}
                                </div>
                                {/* Label + amount */}
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:"13px",fontWeight:700,color:"#c8d8ec",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{row.label}</div>
                                  <div style={{ fontSize:"11px",color: avail ? "#00d95f" : "#4a5a70",marginTop:"1px",fontWeight:600 }}>
                                    {fmtMoney(row.amount)} {avail ? "Disponible" : row.amount > 0 ? "Pendiente" : "Sin saldo"}
                                  </div>
                                </div>
                                {/* Action */}
                                {avail ? (
                                  <button onClick={()=>{ row.onClaim(); setRewardsDropOpen(false); }}
                                    style={{ flexShrink:0,padding:"6px 12px",borderRadius:"8px",background:"linear-gradient(180deg,#f6b531,#ea9807)",border:"none",color:"#111",fontSize:"12px",fontWeight:800,cursor:"pointer",whiteSpace:"nowrap" }}>
                                    Reclamar
                                  </button>
                                ) : (
                                  <div style={{ flexShrink:0,padding:"5px 10px",borderRadius:"8px",background:"#0e1826",border:"1px solid #252f45",color:"#4a5a70",fontSize:"12px",fontWeight:700,whiteSpace:"nowrap" }}>
                                    {row.timer || "—"}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* Divider */}
                        <div style={{ height:"1px",background:"#1a2438",margin:"0 12px" }}/>
                        {/* Explorar Recompensas */}
                        <div style={{ padding:"10px" }}>
                          <button onClick={()=>{ setRewardsDropOpen(false); openSection("tips-bonuses"); }}
                            style={{ width:"100%",padding:"11px",borderRadius:"10px",background:"#1a2438",border:"1px solid #252f45",color:"#c8d8ec",fontSize:"13px",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",transition:"background .15s" }}
                            onMouseEnter={e=>(e.currentTarget.style.background="#20304a")}
                            onMouseLeave={e=>(e.currentTarget.style.background="#1a2438")}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                            Explorar Recompensas
                          </button>
                        </div>
                      </div>
                  )}
                </div>
              );
            })()}

            {/* Notifications bell */}
            <div ref={notifPanelRef} style={{ position:"relative" }}>
              <button onClick={()=>{ setNotifPanelOpen(v=>!v); setProfileDropOpen(false); setBalanceDropOpen(false); }}
                className="hdr-icon-btn"
                style={{ width:"40px",height:"40px",borderRadius:"10px",background: notifPanelOpen?"#3d4a62":"#2f3648",border:"none",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",cursor:"pointer",transition:"background .15s, transform .12s",position:"relative" }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {notifications.some(n=>!n.read) && (
                  <span style={{ position:"absolute",top:"-5px",right:"-4px",background:"#e63e3e",borderRadius:"999px",minWidth:"18px",height:"18px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:700,color:"#fff",pointerEvents:"none" }}>
                    {notifications.filter(n=>!n.read).length}
                  </span>
                )}
              </button>

              {/* Notifications panel */}
              {notifPanelOpen && (
                <div style={{ position:"absolute",top:"calc(100% + 8px)",right:0,width:"340px",background:"#1a2235",border:"1px solid #2a3650",borderRadius:"14px",overflow:"hidden",zIndex:200,boxShadow:"0 16px 48px rgba(0,0,0,.6)" }}>
                  {/* Header */}
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:"#131c2e",borderBottom:"1px solid #1e2e44" }}>
                    <span style={{ fontWeight:800,fontSize:"13px",letterSpacing:"1.5px",color:"#e8f0ff",textTransform:"uppercase" }}>Notificaciones</span>
                    <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
                      <button
                        onClick={()=>{ const upd = notifications.map(n=>({...n,read:true})); ls.saveNotifs(currentUser,upd); setNotifications(upd); }}
                        style={{ background:"#252f45",border:"1px solid #2e3e58",borderRadius:"8px",color:"#8a9bb8",padding:"5px 10px",fontSize:"11px",fontWeight:600,cursor:"pointer" }}>
                        Marcar todo como leído
                      </button>
                      <button onClick={()=>setNotifPanelOpen(false)}
                        style={{ background:"#252f45",border:"1px solid #2e3e58",borderRadius:"8px",color:"#8a9bb8",width:"28px",height:"28px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",cursor:"pointer",fontWeight:700 }}>
                        ✕
                      </button>
                    </div>
                  </div>
                  {/* List */}
                  <div style={{ maxHeight:"340px",overflowY:"auto" }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding:"32px 16px",textAlign:"center",color:"#4a5a78",fontSize:"13px" }}>Sin notificaciones aún</div>
                    ) : notifications.map(n => {
                      const icons: Record<string,string> = { deposit:"💰", withdraw:"📤", bonus:"🎁", info:"ℹ️" };
                      const colors: Record<string,string> = { deposit:"#22c55e", withdraw:"#f59e0b", bonus:"#f4a91f", info:"#60a5fa" };
                      return (
                        <div key={n.id}
                          onClick={()=>{ const upd = notifications.map(x=>x.id===n.id?{...x,read:true}:x); ls.saveNotifs(currentUser,upd); setNotifications(upd); }}
                          style={{ display:"flex",gap:"12px",padding:"13px 16px",borderBottom:"1px solid #1a2640",background: n.read?"transparent":"rgba(244,169,31,0.04)",cursor:"pointer",transition:"background .12s" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="#1e2a40")}
                          onMouseLeave={e=>(e.currentTarget.style.background=n.read?"transparent":"rgba(244,169,31,0.04)")}>
                          <div style={{ width:"36px",height:"36px",borderRadius:"10px",background:`${colors[n.type]}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",flexShrink:0 }}>
                            {icons[n.type]}
                          </div>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px" }}>
                              <span style={{ fontWeight:700,fontSize:"13px",color: n.read?"#7a8fb0":"#e0eaff" }}>{n.title}</span>
                              {!n.read && <span style={{ width:"7px",height:"7px",borderRadius:"50%",background:"#f4a91f",flexShrink:0 }}/>}
                            </div>
                            <p style={{ margin:"2px 0 0",fontSize:"12px",color:"#5a6e8a",lineHeight:"1.4" }}>{n.message}</p>
                            <p style={{ margin:"3px 0 0",fontSize:"10px",color:"#3a4e68" }}>{new Date(n.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div ref={profileDropRef} className="profile-drop-wrap" style={{ position:"relative" }}>
              <button onClick={()=>{ setProfileDropOpen(!profileDropOpen); setBalanceDropOpen(false); }}
                style={{ display:"flex",alignItems:"center",gap:"8px",background:"#2a3143",border:"1px solid #3c465d",color:"#dfe6f0",padding:"6px 14px 6px 8px",borderRadius:"10px",height:"40px",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:"13px" }}>
                <div style={{ width:"26px",height:"26px",borderRadius:"50%",overflow:"hidden",flexShrink:0,border:"1.5px solid #f4a91f" }}>
                  <img src={getVipInfo(vipWagered).rank.image} alt="rank" style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
                </div>
                {currentUser} ▾
              </button>
              {profileDropOpen && (
                <div style={{ position:"absolute",top:"calc(100% + 8px)",right:0,width:"220px",background:"#252b3b",border:"1px solid #3a4256",borderRadius:"12px",overflow:"hidden",zIndex:50,boxShadow:"0 16px 40px rgba(0,0,0,.35)" }}>
                  {([
                    [t("profile"),"profile",<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>],
                    [t("history"),"bet-history",<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>],
                    [t("transactions"),"transactions",<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>],
                    ["Recompensas","rewards-history",<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>],
                    [t("referrals"),"referrals-profile",<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>],
                  ] as [string,string,React.ReactNode][]).map(([l,s,icon])=>(
                    <button key={s} onClick={()=>openSection(s)}
                      style={{ width:"100%",textAlign:"left",background:"transparent",color:"#eef2f8",border:"none",borderBottom:"1px solid #2e3650",padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:"10px",fontSize:"14px",fontWeight:500,transition:"background .12s" }}
                      onMouseEnter={e=>e.currentTarget.style.background="#2e3650"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{ color:"#8a97b0",flexShrink:0 }}>{icon}</span>{l}
                    </button>
                  ))}
                  <button onClick={doLogout}
                    style={{ width:"100%",textAlign:"left",background:"transparent",color:"#ff5b5b",border:"none",padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:"10px",fontSize:"14px",fontWeight:500,transition:"background .12s" }}
                    onMouseEnter={e=>e.currentTarget.style.background="#2e1a1a"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
            </>) : (<>
              {/* Auth buttons */}
              <button
                onClick={()=>setAuthModal("login")}
                style={{ minHeight:"40px",padding:"0 20px",borderRadius:"10px",fontWeight:600,fontSize:"14px",color:"#c8d4e8",background:"#1e2538",border:"1px solid #3a4560",cursor:"pointer",transition:"background .15s, border-color .15s" }}
                onMouseEnter={e=>{ e.currentTarget.style.background="#263048"; e.currentTarget.style.borderColor="#5a6a88"; }}
                onMouseLeave={e=>{ e.currentTarget.style.background="#1e2538"; e.currentTarget.style.borderColor="#3a4560"; }}>
                Iniciar sesión
              </button>
              <button
                onClick={()=>setAuthModal("register")}
                style={{ minHeight:"40px",padding:"0 20px",borderRadius:"10px",fontWeight:700,fontSize:"14px",color:"#fff",background:"linear-gradient(180deg,#f6b531,#ea9807)",border:"none",cursor:"pointer",transition:"filter .15s" }}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                Registrarse
              </button>
            </>)}
          </div>
          </div>
        </nav>

        {/* HOME */}
        {section==="home" && (
          <section>
            {/* Dashboard */}
            {homeView==="dashboard" && (
              <><div style={{ maxWidth:"1080px", margin:"0 auto", width:"100%" }}>

                <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr",gap:"16px",marginBottom:"14px" }}>
                  {/* Hero — Banner Carousel */}
                  {(() => {
                    const slides = [
                      {
                        bg: "linear-gradient(105deg,#c47b00 0%,#f4a91f 45%,#ffe066 100%)",
                        textColor: "#1a0e00",
                        badgeColor: "rgba(0,0,0,.22)",
                        circle: "rgba(255,200,0,.18)",
                        text: {
                          es: { badge:"SIN ESPERAS. SOLO JUEGA.", title:"DEPÓSITOS Y RETIROS RÁPIDOS", desc:"Tu dinero se mueve más rápido que los carretes. Sin esperas, sin dudas – solo acción inmediata." },
                          en: { badge:"NO WAITING. JUST PLAY.", title:"INSTANT DEPOSITS & WITHDRAWALS", desc:"Your money moves faster than the reels. No waiting, no doubts – just immediate action." },
                          pt: { badge:"SEM ESPERA. SÓ JOGUE.", title:"DEPÓSITOS E SAQUES INSTANTÂNEOS", desc:"Seu dinheiro se move mais rápido que os rolos. Sem espera, sem dúvidas – só ação imediata." },
                          de: { badge:"KEINE WARTEZEIT. EINFACH SPIELEN.", title:"SOFORTIGE EIN- & AUSZAHLUNGEN", desc:"Ihr Geld bewegt sich schneller als die Rollen. Keine Wartezeiten, keine Zweifel – nur sofortige Aktion." },
                          fr: { badge:"SANS ATTENTE. JOUEZ SIMPLEMENT.", title:"DÉPÔTS & RETRAITS INSTANTANÉS", desc:"Votre argent se déplace plus vite que les rouleaux. Sans attente, sans doutes – juste de l'action immédiate." },
                        },
                      },
                      {
                        bg: "radial-gradient(circle at 10% 10%,rgba(157,56,255,.5),transparent 40%), linear-gradient(105deg,#3a0d80 0%,#1e0958 60%,#0e1320 100%)",
                        textColor: "#e8d4ff",
                        badgeColor: "rgba(255,255,255,.15)",
                        circle: "rgba(255,255,255,.10)",
                        text: {
                          es: { badge:"RECOMPENSAS DIARIAS", title:"TU LEALTAD TIENE PREMIO", desc:"Cada apuesta suma. Acumulá bonificaciones diarias y rakeback exclusivo cuanto más jugás." },
                          en: { badge:"DAILY REWARDS", title:"EARN WHILE YOU PLAY", desc:"Get rakeback on every bet plus exclusive daily bonuses for loyal players." },
                          pt: { badge:"RECOMPENSAS DIÁRIAS", title:"GANHE ENQUANTO JOGA", desc:"Obtenha rakeback em cada aposta mais bônus diários exclusivos para jogadores leais." },
                          de: { badge:"TÄGLICHE BELOHNUNGEN", title:"VERDIENE BEIM SPIELEN", desc:"Erhalte Rakeback bei jeder Wette plus exklusive tägliche Boni für treue Spieler." },
                          fr: { badge:"RÉCOMPENSES QUOTIDIENNES", title:"GAGNEZ EN JOUANT", desc:"Obtenez un rakeback sur chaque mise plus des bonus quotidiens exclusifs pour les joueurs fidèles." },
                        },
                      },
                      {
                        bg: "linear-gradient(105deg,#064e3b 0%,#065f46 50%,#0a7a5a 100%)",
                        textColor: "#d1fae5",
                        badgeColor: "rgba(255,255,255,.15)",
                        circle: "rgba(255,255,255,.08)",
                        text: {
                          es: { badge:"SIN KYC · 100% ANÓNIMO", title:"JUEGA SIN REVELAR TU IDENTIDAD", desc:"Sin formularios, sin documentos, sin esperas. Tu privacidad es lo primero — regístrate en segundos y empieza a jugar de inmediato." },
                          en: { badge:"NO KYC · 100% ANONYMOUS", title:"PLAY WITHOUT REVEALING YOUR IDENTITY", desc:"No forms, no documents, no waiting. Your privacy comes first — sign up in seconds and start playing right away." },
                          pt: { badge:"SEM KYC · 100% ANÔNIMO", title:"JOGUE SEM REVELAR SUA IDENTIDADE", desc:"Sem formulários, sem documentos, sem espera. Sua privacidade vem primeiro — cadastre-se em segundos e comece a jogar." },
                          de: { badge:"KEIN KYC · 100% ANONYM", title:"SPIELEN OHNE IDENTITÄTSNACHWEIS", desc:"Keine Formulare, keine Dokumente, keine Wartezeiten. Ihre Privatsphäre hat Priorität — in Sekunden registrieren und losspielen." },
                          fr: { badge:"SANS KYC · 100% ANONYME", title:"JOUEZ SANS RÉVÉLER VOTRE IDENTITÉ", desc:"Sans formulaires, sans documents, sans attente. Votre vie privée passe en premier — inscrivez-vous en quelques secondes et jouez." },
                        },
                      },
                    ];
                    const sl = slides[bannerSlide];
                    const tx = sl.text[lang as keyof typeof sl.text] ?? sl.text.en;
                    return (
                      <div onClick={bannerSlide===0 ? ()=>openCashier("deposit") : bannerSlide===1 ? ()=>openSection("tips-bonuses") : undefined} onMouseEnter={e=>{ if(bannerSlide===0||bannerSlide===1)(e.currentTarget as HTMLDivElement).style.filter="brightness(1.08)"; }} onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.filter=""; }} style={{ minHeight:"200px",display:"flex",alignItems:"center",background:sl.bg,overflow:"hidden",position:"relative",borderRadius:"14px",padding:"16px",border:"1px solid #20283a",transition:"background 0.7s ease, filter 0.2s ease",cursor:(bannerSlide===0||bannerSlide===1)?"pointer":"default" }}>
                        {/* Background images per slide */}
                        {bannerSlide===0 && (
                          <div style={{ position:"absolute",inset:0,backgroundImage:`url(${import.meta.env.BASE_URL}banner-slots.jpg)`,backgroundSize:"cover",backgroundPosition:"center",backgroundRepeat:"no-repeat",opacity:0.28,zIndex:0,pointerEvents:"none" }}/>
                        )}
                        <div style={{ position:"absolute",inset:0,backgroundImage:`url(${import.meta.env.BASE_URL}banner-loyalty.jpg)`,backgroundSize:"cover",backgroundPosition:"90% center",backgroundRepeat:"no-repeat",opacity:bannerSlide===1?0.28:0,zIndex:0,pointerEvents:"none",transition:"opacity 0.4s" }}/>
                        <div style={{ position:"absolute",inset:0,backgroundImage:`url(${import.meta.env.BASE_URL}banner-anon.jpg)`,backgroundSize:"cover",backgroundPosition:"center",backgroundRepeat:"no-repeat",opacity:bannerSlide===2?0.35:0,zIndex:0,pointerEvents:"none",transition:"opacity 0.4s" }}/>
                        {/* Sweep light */}
                        <div className="banner-sweep" style={{ position:"absolute",top:0,left:0,width:"60px",height:"100%",background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)",pointerEvents:"none",zIndex:3 }}/>
                        {/* Floating circle */}
                        <div className="banner-circle-float" style={{ position:"absolute",right:"30px",top:"10px",width:"200px",height:"200px",borderRadius:"50%",background:`radial-gradient(circle,${sl.circle},transparent 65%)` }}/>
                        {/* Text */}
                        <div key={bannerSlide} className="banner-text-in" style={{ maxWidth:"480px",position:"relative",zIndex:2 }}>
                          <span style={{ display:"inline-block",background:sl.badgeColor,color:sl.textColor,fontSize:"11px",fontWeight:500,letterSpacing:"0.06em",padding:"3px 10px",borderRadius:"20px",marginBottom:"10px" }}>{tx.badge}</span>
                          <h1 className="banner-title-glow" style={{ margin:"0 0 10px",fontSize:"28px",lineHeight:1.1,color:sl.textColor,fontWeight:900,whiteSpace:"nowrap" }}>{tx.title}</h1>
                          <p style={{ margin:0,fontSize:"13px",color:sl.textColor,opacity:0.85,lineHeight:1.5 }}>{tx.desc}</p>
                        </div>
                        {/* Dots */}
                        <div style={{ position:"absolute",bottom:"12px",left:"50%",transform:"translateX(-50%)",display:"flex",gap:"6px" }}>
                          {[0,1,2].map(i=>(
                            <button key={i} onClick={e=>{e.stopPropagation();setBannerSlide(i);}}
                              className={i===bannerSlide?"banner-dot-active":""}
                              style={{ width:i===bannerSlide?"22px":"8px",height:"8px",borderRadius:"999px",background:i===bannerSlide?"rgba(255,255,255,.95)":"rgba(255,255,255,.35)",border:"none",cursor:"pointer",padding:0,transition:"all .3s" }}/>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Profile summary / Welcome widget */}
                  <div style={{ background:"#161d2b",border:"1px solid #20283a",borderRadius:"14px",overflow:"hidden" }}>
                    {currentUser ? (<>
                      <div style={{ padding:"16px",display:"flex",alignItems:"center",gap:"12px",borderBottom:"1px solid #2a3348" }}>
                        <div style={{ width:"38px",height:"38px",border:"2px solid #f4a91f",borderRadius:"50%",overflow:"hidden",flexShrink:0 }}>
                          <img src={getVipInfo(vipWagered).rank.image} alt="rank" style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
                        </div>
                        <div style={{ fontWeight:600,fontSize:"18px" }}>{currentUser}</div>
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",gap:"10px",padding:"16px" }}>
                        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px" }}>
                        <button onClick={()=>openCashier("deposit")}
                          style={{ background:"#3a4256",color:"white",border:"none",borderRadius:"10px",padding:"10px 16px",fontWeight:500,cursor:"pointer",fontSize:"15px",transition:"transform .15s ease, background .15s ease, box-shadow .15s ease",display:"flex",alignItems:"center",justifyContent:"center" }}
                          onMouseEnter={e=>{ e.currentTarget.style.background="#4a5470"; e.currentTarget.style.transform="scale(1.04)"; e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.4)"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.background="#3a4256"; e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.boxShadow="none"; }}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:"6px",flexShrink:0}}><path d="M20 12V8H6a2 2 0 0 1 0-4h14v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>Add Funds
                        </button>
                        <button onClick={()=>openSection("transactions")}
                          style={{ background:"#3a4256",color:"white",border:"none",borderRadius:"10px",padding:"10px 16px",fontWeight:500,cursor:"pointer",fontSize:"15px",transition:"transform .15s ease, background .15s ease, box-shadow .15s ease",display:"flex",alignItems:"center",justifyContent:"center" }}
                          onMouseEnter={e=>{ e.currentTarget.style.background="#4a5470"; e.currentTarget.style.transform="scale(1.04)"; e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.4)"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.background="#3a4256"; e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.boxShadow="none"; }}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:"6px",flexShrink:0}}><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>Transactions
                        </button>
                        </div>
                        <button onClick={()=>openSection("rewards-history")}
                          style={{ width:"100%",background:"#3a4256",color:"white",border:"none",borderRadius:"10px",padding:"10px 16px",fontWeight:500,cursor:"pointer",fontSize:"15px",transition:"transform .15s ease, background .15s ease, box-shadow .15s ease",display:"flex",alignItems:"center",justifyContent:"center" }}
                          onMouseEnter={e=>{ e.currentTarget.style.background="#4a5470"; e.currentTarget.style.transform="scale(1.04)"; e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.4)"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.background="#3a4256"; e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.boxShadow="none"; }}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:"6px",flexShrink:0}}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>Recompensas
                        </button>
                      </div>
                    </>) : (
                      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 20px 26px",textAlign:"center",animation:"nlsfadeIn .35s ease" }}>
                        <p style={{ margin:"0 0 2px",fontSize:"11px",color:"#5a6a88",fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase" }}>¡Bienvenido a</p>
                        <h2 style={{ margin:"0 0 20px",fontSize:"26px",fontWeight:900,letterSpacing:"-0.5px",lineHeight:1 }}>
                          <span style={{ color:"#f6b531" }}>MANDER</span>
                          <span style={{ color:"#e2e8f0" }}>!</span>
                        </h2>
                        <button
                          onClick={()=>setAuthModal("register")}
                          onMouseEnter={e=>{ e.currentTarget.style.filter="brightness(1.12)"; e.currentTarget.style.transform="scale(1.03)"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.filter=""; e.currentTarget.style.transform=""; }}
                          style={{ width:"100%",padding:"14px 0",borderRadius:"10px",border:"none",background:"linear-gradient(180deg,#f6b531,#ea9807)",color:"#111",fontWeight:700,fontSize:"15px",cursor:"pointer",transition:"filter .15s,transform .15s",fontFamily:"inherit" }}>
                          Únete ahora
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Wins */}
                <div style={{ background:"#161d2b",border:"1px solid #20283a",borderRadius:"14px",padding:"10px 8px 6px",marginBottom:"14px" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:"10px",fontWeight:600,margin:"0 8px 8px" }}>
                    <span className="live-dot" style={{ width:"12px",height:"12px",borderRadius:"50%",background:"#57e35a",display:"inline-block",flexShrink:0 }}/>
                    Recent Wins
                  </div>
                  <div style={{ display:"flex",gap:"10px",overflow:"hidden",padding:"10px 4px 2px" }}>
                    {liveWins.length === 0 ? (
                      <div style={{ color:"#4a5568",fontSize:"13px",padding:"10px 4px",fontStyle:"italic" }}>
                        Aún no hay apuestas — ¡jugá una partida para verlas aquí!
                      </div>
                    ) : liveWins.map((w,i)=>{ const winKey = `${w.createdAt}${w.user}${w.profitUsd}_${i}`;
                      const gameInfo: Record<string,{bg:string;provider:string;img?:string;action:()=>void}> = {
                        "Dice":         { bg:"linear-gradient(160deg,#0a1e3a,#11325d)",   img:"/dice-card.jpg",       provider:"Mander Originals", action:showDiceOnly },
                        "Plinko":       { bg:"linear-gradient(160deg,#3a0008,#c02038)",   img:"/plinko-thumb.jpg",    provider:"Mander Originals", action:showPlinkoOnly },
                        "Keno":         { bg:"linear-gradient(160deg,#0a1a30,#0d3060)",   img:"/keno-thumb.jpg",      provider:"Mander Originals", action:showKenoOnly },
                        "Blackjack":    { bg:"linear-gradient(160deg,#001a1a,#003a3a)",   img:"/blackjack-thumb.jpg", provider:"Mander Originals", action:showBlackjackOnly },
                        "Mines":        { bg:"linear-gradient(160deg,#0a1e3a,#1a4d8a)",   img:"/mines-card.jpg",      provider:"Mander Originals", action:showMinesOnly },
                        "Hilo":         { bg:"linear-gradient(160deg,#002a14,#004a2a)",   img:"/hilo-card.jpg",       provider:"Mander Originals", action:showHiloOnly },
                        "Roulette":     { bg:"linear-gradient(160deg,#1a0a2e,#4a1a7a)",   img:"/roulette-card.jpg",   provider:"Mander Originals", action:showRouletteOnly },
                        "Baccarat":     { bg:"linear-gradient(160deg,#001830,#003060)",   img:"/baccarat-card.jpg",   provider:"Mander Originals", action:showBaccaratOnly },
                        "Sweet Bonanza":{ bg:"linear-gradient(160deg,#6a0066,#ff4cc3)",   provider:"Pragmatic Play",  action:()=>showSlotOnly() },
                      };
                      const info = gameInfo[w.game] ?? { bg:"linear-gradient(160deg,#1a2540,#2a3a5c)", provider:"Mander Casino", action:()=>showSlotOnly() };
                      return (
                        <div key={winKey} onClick={info.action} className={i===0?"win-slide-in":""} style={{ minWidth:"120px",flexShrink:0,borderRadius:"10px",overflow:"hidden",background:"#161d2b",border:"1px solid #20283a",cursor:"pointer",transition:"transform .15s,box-shadow .15s" }} onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.transform="translateY(-3px)";(e.currentTarget as HTMLDivElement).style.boxShadow="0 6px 20px rgba(0,0,0,0.4)";}} onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.transform="";(e.currentTarget as HTMLDivElement).style.boxShadow="";}}>
                          {/* Game image area */}
                          <div style={{ height:"90px",background:info.bg,position:"relative",overflow:"hidden" }}>
                            {info.img && <img src={info.img} alt={w.game} style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 53%" }}/>}
                          </div>
                          {/* User + amount */}
                          <div style={{ padding:"8px 10px" }}>
                            <div style={{ fontSize:"11px",color:"#c8d8ec",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{w.game}</div>
                            <div style={{ fontSize:"10px",color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:"2px" }}>{w.user === currentUser && privateMode ? "Anónimo" : w.user}</div>
                            <div style={{ fontWeight:700,fontSize:"13px",color:w.win?"#00d95f":"#ff5b5b" }}>
                              {w.win?"+":"-"}{fmtMoney(Math.abs(w.profitUsd))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Category tabs + search */}
                <div style={{ display:"grid",gridTemplateColumns:"1fr 320px",gap:"16px",marginBottom:"16px" }}>
                  <div style={{ display:"flex",gap:"6px",flexWrap:"wrap",background:"#161d2b",border:"1px solid #20283a",borderRadius:"12px",padding:"8px" }}>
                    <button onClick={()=>{ setHomeCategory("Originals"); showHomeView(); }}
                      style={{ display:"flex",alignItems:"center",gap:"8px",background:"linear-gradient(135deg,#1e2840,#263352)",color:"#f4a91f",border:"1px solid #f4a91f",padding:"9px 16px",borderRadius:"9px",fontWeight:600,cursor:"pointer",fontSize:"13px",letterSpacing:"0.4px",boxShadow:"0 0 10px rgba(244,169,31,.25), inset 0 0 8px rgba(244,169,31,.07)",transition:"all .15s ease" }}
                      onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                      onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/><path d="M7 9l-2-2M17 9l2-2"/></svg>
                      Originals
                    </button>
                  </div>
                  <div style={{ position:"relative" }}>
                    <span style={{ position:"absolute",left:"16px",top:"50%",transform:"translateY(-50%)",color:"#aab4c5",fontSize:"22px" }}>⌕</span>
                    <input onClick={()=>setSearchOpen(true)} readOnly placeholder="Search"
                      style={{ width:"100%",height:"100%",padding:"0 16px 0 46px",background:"#161d2b",border:"1px solid #20283a",borderRadius:"12px",color:"white",cursor:"pointer",boxSizing:"border-box" }} />
                  </div>
                </div>

                {/* Game row — filtered by homeCategory */}
                {(homeCategory==="Lobby" || homeCategory==="Originals") && (
                  <div style={{ marginBottom:"16px" }}>
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"14px" }}>
                      {[
                        { title:"Dice",      sub:"Originals", tag:"🎲 LIVE", bg:"linear-gradient(135deg,#0a1e3a,#11325d)", img:"/dice-card.jpg",  imgFit:"cover"    as const, action:showDiceOnly,      soon:false },
                        { title:"Plinko",    sub:"Originals", tag:"🎯 LIVE", bg:"linear-gradient(135deg,#7e262a,#ff596d)", img:"/plinko-thumb.jpg", imgFit:"cover" as const, action:showPlinkoOnly,    soon:false },
                        { title:"Keno",      sub:"Originals", tag:"🔢 LIVE", bg:"linear-gradient(135deg,#f4a91f,#c4780a)", img:"/keno-thumb.jpg", imgFit:"cover" as const, action:showKenoOnly,      soon:false },
                        { title:"Blackjack", sub:"Originals", tag:"🃏 LIVE", bg:"linear-gradient(135deg,#f3a428,#613210)", img:"/blackjack-thumb.jpg", imgFit:"cover" as const, action:showBlackjackOnly, soon:false },
                        { title:"Mines",     sub:"Originals", tag:"LIVE", bg:"linear-gradient(135deg,#0a1e3a,#1a4d8a)", img:"/mines-card.jpg", imgFit:"cover" as const, action:showMinesOnly, soon:false },
                        { title:"Hilo",      sub:"Originals", tag:"🃠 LIVE", bg:"linear-gradient(135deg,#004a2a,#00a85a)", img:"/hilo-card.jpg", imgFit:"cover" as const, action:showHiloOnly, soon:false },
                        { title:"Ruleta",    sub:"Originals", tag:"🎡 LIVE", bg:"linear-gradient(135deg,#1a0a2e,#4a1a7a)", img:"/roulette-card.jpg", imgFit:"cover" as const, action:showRouletteOnly, soon:false },
                        { title:"Baccarat",  sub:"Originals", tag:"🃠 LIVE", bg:"linear-gradient(135deg,#001224,#002a5c)", img:"/baccarat-card.jpg", imgFit:"cover" as const, action:showBaccaratOnly, soon:false },
                        { title:"Limbo", sub:"Originals", bg:"linear-gradient(135deg,#1a0a30,#2d0a50)", action:null, soon:true, soonIcon:(<svg viewBox="0 0 24 24" width="90" height="90" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C12 2 19 6 19 13a7 7 0 0 1-14 0C5 6 12 2 12 2z"/><circle cx="12" cy="12" r="2.5"/><path d="M5 15l-2.5 4 3.5-1"/><path d="M19 15l2.5 4-3.5-1"/><path d="M9 20.5c1 .8 3 .8 6 0"/></svg>) } as any,
                        { title:"Flip", sub:"Originals", bg:"linear-gradient(135deg,#0d0d1a,#1a1a30)", action:null, soon:true, soonIcon:(<svg viewBox="0 0 24 24" width="90" height="90" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4v16"/><path d="M8.5 7.5C10 6 14 6 15.5 7.5"/><path d="M8.5 16.5C10 18 14 18 15.5 16.5"/><path d="M4 12h3M17 12h3"/><path d="M3 8l2 1M19 8l-2 1M3 16l2-1M19 16l-2-1"/></svg>) } as any,
                        { title:"Crash", sub:"Originals", bg:"linear-gradient(135deg,#0d1117,#151d2a)", action:null, soon:true, soonIcon:(<svg viewBox="0 0 24 24" width="90" height="90" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,18 6,10 10,13 15,5 19,9"/><path d="M19 9l2-4-4 1"/><line x1="2" y1="21" x2="22" y2="21"/><line x1="2" y1="21" x2="2" y2="6"/><path d="M19 14l1 5-5-1"/><path d="M19 14 L22 22"/></svg>) } as any,
                        { title:"Rock Paper Scissors", sub:"Originals", bg:"linear-gradient(135deg,#0e120e,#161e16)", action:null, soon:true, soonIcon:(<svg viewBox="0 0 24 24" width="90" height="90" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12V7a2 2 0 0 1 4 0v3"/><path d="M10 8.5V6a2 2 0 0 1 4 0v4"/><path d="M14 9V7a2 2 0 0 1 4 0v5c0 3.3-2.7 6-6 6h-2a6 6 0 0 1-6-6v-1a1 1 0 0 1 1-1h1"/><line x1="4" y1="6" x2="8" y2="6"/><line x1="4" y1="9" x2="6" y2="9"/></svg>) } as any,
                        { title:"Poker", sub:"Originals", bg:"linear-gradient(135deg,#120d05,#1e1508)", action:null, soon:true, soonIcon:(<svg viewBox="0 0 24 24" width="90" height="90" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="10" height="14" rx="1.5"/><text x="4" y="12" fontSize="4" fill="#fff" stroke="none" fontWeight="bold">A</text><text x="4" y="16" fontSize="4" fill="#fff" stroke="none">♥</text><rect x="8" y="4" width="10" height="14" rx="1.5" transform="rotate(8 13 11)"/><rect x="12" y="3" width="10" height="14" rx="1.5" transform="rotate(18 17 10)"/></svg>) } as any,
                        { title:"Chicken", sub:"Originals", bg:"linear-gradient(135deg,#100e00,#1a1800)", action:null, soon:true, soonIcon:(<svg viewBox="0 0 24 24" width="90" height="90" fill="none" stroke="#fff" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="18" rx="5.5" ry="4"/><circle cx="13" cy="8" r="5.5"/><path d="M10 3.5 Q10.5 1.2 11.5 3.5 Q12 1.3 13 3.2 Q13.5 1.3 14.5 3.5"/><path d="M18 7 L22 8 L18 9.5"/><circle cx="15" cy="7" r="0.75" fill="#fff" stroke="none"/><path d="M18 9.8 Q19.2 12 17.5 13.5"/><path d="M6.5 17.5 Q3.5 15 4 12"/><path d="M6.5 20 Q2.5 17.5 3.2 14"/><line x1="10" y1="22" x2="10" y2="23.5"/><line x1="14" y1="22" x2="14" y2="23.5"/><path d="M8 23.5 L10 23 L12 23.5"/><path d="M12 23.5 L14 23 L16 23.5"/></svg>) } as any,
                        { title:"Darts", sub:"Originals", bg:"linear-gradient(135deg,#001010,#001a1a)", action:null, soon:true, soonIcon:(<svg viewBox="0 0 24 24" width="90" height="90" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="14" r="8"/><circle cx="10" cy="14" r="5.5"/><circle cx="10" cy="14" r="3"/><circle cx="10" cy="14" r="1" fill="#fff" stroke="none"/><line x1="10" y1="14" x2="21" y2="3" strokeWidth="1.6"/><path d="M21 3 L23 1 L22 4 L19 3 Z" fill="#fff" strokeWidth="0.8"/><path d="M17.5 6.5 L19 5 L20 7 L18.5 8 Z" strokeWidth="0.9"/></svg>) } as any,
                        { title:"Dragon Tower", sub:"Originals", bg:"linear-gradient(135deg,#150010,#20001a)", action:null, soon:true, soonIcon:(<svg viewBox="0 0 60 72" width="90" height="90" fill="none" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
  {/* === DRAGON HEAD (top) === */}
  {/* Left horn - sweeping back */}
  <path d="M26 14 C22 10 16 4 18 1 C20 3 22 8 24 12"/>
  {/* Right horn */}
  <path d="M34 14 C38 10 44 4 42 1 C40 3 38 8 36 12"/>
  {/* Left wing sweeping wide */}
  <path d="M22 20 C16 16 6 12 2 8 C6 10 10 14 12 18 C8 14 4 9 4 5 C8 9 14 16 18 22"/>
  {/* Left wing membrane */}
  <path d="M22 20 C14 14 8 8 4 5" strokeOpacity="0.4" strokeWidth="0.8"/>
  <path d="M22 20 C16 12 10 7 4 5" strokeOpacity="0.3" strokeWidth="0.8"/>
  {/* Right wing sweeping wide */}
  <path d="M38 20 C44 16 54 12 58 8 C54 10 50 14 48 18 C52 14 56 9 56 5 C52 9 46 16 42 22"/>
  {/* Right wing membrane */}
  <path d="M38 20 C46 14 52 8 56 5" strokeOpacity="0.4" strokeWidth="0.8"/>
  <path d="M38 20 C44 12 50 7 56 5" strokeOpacity="0.3" strokeWidth="0.8"/>
  {/* Dragon head shape - angular like screenshot */}
  <path d="M24 12 C22 14 21 16 22 18 C23 20 25 22 28 23 L32 23 C35 23 37 20 38 18 C39 16 38 14 36 12 Z"/>
  {/* Snout / jaw line */}
  <path d="M27 19 C29 21 31 21 33 19" strokeOpacity="0.9"/>
  {/* Nose slits */}
  <path d="M28 18 L29 19 M32 18 L31 19" strokeOpacity="0.7"/>
  {/* Glowing eyes */}
  <circle cx="27.5" cy="16" r="1.8" fill="rgba(255,255,255,0.95)" stroke="none"/>
  <circle cx="32.5" cy="16" r="1.8" fill="rgba(255,255,255,0.95)" stroke="none"/>
  <circle cx="27.5" cy="16" r="0.9" fill="#00d4ff" stroke="none"/>
  <circle cx="32.5" cy="16" r="0.9" fill="#00d4ff" stroke="none"/>
  {/* Eye glow rings */}
  <circle cx="27.5" cy="16" r="2.5" stroke="#00aaff" strokeWidth="0.5" strokeOpacity="0.5"/>
  <circle cx="32.5" cy="16" r="2.5" stroke="#00aaff" strokeWidth="0.5" strokeOpacity="0.5"/>
  {/* Crest / gem on forehead */}
  <path d="M30 12 L31.5 10 L33 12 L31.5 13 Z" strokeOpacity="0.8"/>
  {/* === TOWER (bottom) === */}
  {/* Tower top wall with battlements */}
  <path d="M12 28 L12 25 L17 25 L17 28 L22 28 L22 25 L27 25 L27 28 L33 28 L33 25 L38 25 L38 28 L43 28 L43 25 L48 25 L48 28"/>
  {/* Tower main frame */}
  <rect x="12" y="28" width="36" height="40" rx="0.5"/>
  {/* Vertical grid lines */}
  <line x1="24" y1="28" x2="24" y2="68"/>
  <line x1="36" y1="28" x2="36" y2="68"/>
  {/* Horizontal grid lines */}
  <line x1="12" y1="38" x2="48" y2="38"/>
  <line x1="12" y1="48" x2="48" y2="48"/>
  <line x1="12" y1="58" x2="48" y2="58"/>
  {/* Eggs in cells */}
  <ellipse cx="18" cy="33" rx="3.5" ry="4"/>
  <ellipse cx="30" cy="33" rx="3.5" ry="4"/>
  <ellipse cx="42" cy="43" rx="3.5" ry="4"/>
  <ellipse cx="18" cy="53" rx="3.5" ry="4"/>
  <ellipse cx="30" cy="63" rx="3.5" ry="4"/>
  {/* Egg spot details */}
  <circle cx="17" cy="32" r="1" strokeOpacity="0.5" strokeWidth="0.7"/>
  <circle cx="29" cy="32" r="1" strokeOpacity="0.5" strokeWidth="0.7"/>
  <circle cx="41" cy="42" r="1" strokeOpacity="0.5" strokeWidth="0.7"/>
</svg>) } as any,
                      ].map((g,i)=>(
                        <div key={i} style={{ display:"flex",flexDirection:"column",gap:"8px" }}>
                          <div style={{ position:"relative" }}>
                          <div onClick={g.soon ? undefined : (g.action ?? undefined)}
                            style={{ height:"270px",borderRadius:"14px",border:g.soon?"1px solid #2a2a3a":"1px solid #273149",cursor:g.soon?"default":"pointer",overflow:"hidden",position:"relative",background:g.bg,transition:"transform .2s ease,box-shadow .2s ease",opacity:g.soon?0.82:1,filter:g.soon?"grayscale(0.85) brightness(0.75)":undefined }}
                            onMouseEnter={e=>{ if(!g.soon){ e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 12px 40px rgba(0,0,0,0.5)"; }}}
                            onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
                            {(g as any).img && <img src={(g as any).img} alt={g.title} style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:(g as any).imgFit??"cover",objectPosition:"center center",padding:(g as any).imgPad??undefined,zIndex:0 }}/>}
                            {!(g as {img?:string}).img && <div style={{ position:"absolute",inset:0,opacity:.38,background:"radial-gradient(circle at 20% 30%,rgba(255,255,255,.35),transparent 25%), radial-gradient(circle at 80% 70%,rgba(255,255,255,.25),transparent 22%)",zIndex:1 }}/>}
                            {!(g as {img?:string}).img && g.soon && (g as any).soonIcon && (
                              <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2,flexDirection:"column" }}>
                                <div style={{ opacity:0.7,display:"flex",alignItems:"center",justifyContent:"center" }}>{(g as any).soonIcon}</div>
                              </div>
                            )}
                            {!(g as {img?:string}).img && g.title==="Baccarat" && (
                              <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2,gap:"10px",transform:"rotate(-8deg)" }}>
                                {[{r:"A",s:"♠",top:"#fff"},{r:"K",s:"♥",top:"#ff4a6a"}].map((c,ci)=>(
                                  <div key={ci} style={{ width:"70px",height:"100px",borderRadius:"9px",background:"rgba(255,255,255,0.96)",display:"flex",flexDirection:"column",padding:"5px 7px",justifyContent:"space-between",boxShadow:"0 8px 28px rgba(0,0,0,.55)",transform:`rotate(${ci===0?"-6deg":"8deg"}) translateY(${ci===0?"-4px":"6px"})` }}>
                                    <div style={{ fontSize:"16px",fontWeight:900,color:c.top,lineHeight:1 }}>{c.r}<span style={{fontSize:"12px"}}>{c.s}</span></div>
                                    <div style={{ fontSize:"28px",textAlign:"center",color:c.top,lineHeight:1 }}>{c.s}</div>
                                    <div style={{ fontSize:"16px",fontWeight:900,color:c.top,transform:"rotate(180deg)",lineHeight:1 }}>{c.r}<span style={{fontSize:"12px"}}>{c.s}</span></div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {!g.soon && <span style={{ position:"absolute",top:"10px",right:"10px",fontSize:"10px",fontWeight:500,background:"rgba(0,0,0,.55)",color:"#fff",padding:"3px 8px",borderRadius:"20px",zIndex:3 }}>{g.tag}</span>}
                            {g.soon && (
                              <div style={{ position:"absolute",bottom:"13px",left:"13px",right:"13px",zIndex:3 }}>
                                <div style={{ fontWeight:900,fontSize:"13px",letterSpacing:"1.8px",textTransform:"uppercase",color:"rgba(255,255,255,0.72)",textShadow:"0 2px 12px rgba(0,0,0,0.95)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{g.title}</div>
                                <div style={{ fontSize:"8px",color:"rgba(255,255,255,.38)",letterSpacing:"1.2px",textTransform:"uppercase",fontWeight:600,marginTop:"4px" }}>Mander Originals</div>
                              </div>
                            )}
                          </div>
                          {g.soon && <div style={{ position:"absolute",top:"10px",left:"10px",zIndex:10,background:"linear-gradient(90deg,#f6b531,#f4821f)",borderRadius:"7px",padding:"4px 12px",fontSize:"9px",fontWeight:900,color:"#0e1320",letterSpacing:"1.2px",textTransform:"uppercase",boxShadow:"0 2px 8px rgba(246,181,49,0.5)" }}>⏳ Próximamente</div>}
                          </div>
                          <div style={{ paddingLeft:"2px" }}>
                            <div style={{ fontSize:"14px",fontWeight:700,color:"#c8d8f0" }}>{g.title}</div>
                            <div style={{ fontSize:"12px",color:"#5a6e8a",marginTop:"2px" }}>{g.sub}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
              <CasinoFooter onHome={showHomeView} />
            </>)}

            {/* DICE GAME */}
            {homeView==="dice" && <><div style={{ maxWidth:"1080px", margin:"0 auto", width:"100%", borderRadius:"16px", overflow:"hidden", userSelect:"none", WebkitUserSelect:"none" } as React.CSSProperties}><DiceGame
              balance={balance} currentUser={currentUser}
              diceBet={diceBet} setDiceBet={setDiceBet}
              diceMultiplier={diceMultiplier} setDiceMultiplier={setDiceMultiplier}
              diceTarget={diceTarget} setDiceTarget={setDiceTarget}
              diceChance={diceChance} setDiceChance={setDiceChance}
              diceAutoCount={diceAutoCount} setDiceAutoCount={setDiceAutoCount} diceAutoRemaining={diceAutoRemaining}
              diceMarkerLeft={diceMarkerLeft} diceMarkerTransition={diceMarkerTransition} diceBubbleVal={diceBubbleVal}
              diceBubbleWin={diceBubbleWin}
              diceStats={diceStats}
              diceAutoRunning={diceAutoRunning}
              dicePayoutPreview={dicePayoutPreview}
              diceBetNum={diceBetNum}
              syncDiceFields={syncDiceFields}
              placeDiceBet={placeDiceBet}
              startAutoDice={startAutoDice}
              stopAutoDice={stopAutoDice}
              halveDiceBet={()=>{ setDiceBet(v=>Math.max(0.01,(parseFloat(v)||0)/2).toFixed(2)); }}
              doubleDiceBet={()=>{ const maxD=Math.floor(convertUsd(balance)*100)/100; setDiceBet(v=>Math.min(maxD,(parseFloat(v)||0)*2).toFixed(2)); }}
              fmtMoney={fmtMoney}
              onBack={showHomeView}
              diceBetHistory={diceBetHistory}
              diceRolling={diceRolling}
              displayCurrency={displayCurrency}
              diceBetUsd={diceBetUsd}
              currencyFade={currencyFade}
              lang={lang}
              diceVol={diceVol}
              setDiceVol={setDiceVol}
              convertUsd={convertUsd}
              diceMode={diceMode}
              setDiceMode={setDiceMode}
              onResetStats={()=>{ const z={ profit:0,wagered:0,wins:0,losses:0,history:[],autoRemaining:0 }; setDiceStats(z); ls.saveDice(currentUser, z); }}
              hideHistory={true}
            /></div>
            <GameInfoPanel game="dice" onFairness={() => { setSection("fairness"); setFairnessGame("Dice"); }}/>
            <MoreFromLockly currentGame="dice" onVerTodo={showOriginalsView} onGames={{ dice:showDiceOnly, plinko:showPlinkoOnly, keno:showKenoOnly, blackjack:showBlackjackOnly, mines:showMinesOnly, hilo:showHiloOnly, roulette:showRouletteOnly, baccarat:showBaccaratOnly }}/>
            <ApuestasSection records={diceBetHistory as ApuestaRecord[]} gameLabel="Dados" gameIcon={<img src="/dice-card.jpg" style={{width:"100%",height:"100%",objectFit:"cover"}} alt="dice"/>} fmtMoney={fmtMoney}/>
            <CasinoFooter onHome={showHomeView} />
            </>}

            {/* PLINKO GAME */}
            {homeView==="plinko" && <><div style={{ maxWidth:"1080px", margin:"0 auto", width:"100%", borderRadius:"16px", overflow:"hidden", border:"1px solid #153650", userSelect:"none", WebkitUserSelect:"none" } as React.CSSProperties}><PlinkoGame
              balance={balance}
              plinkoBet={plinkoBet} setPlinkoBet={setPlinkoBet}
              plinkoRows={plinkoRows} setPlinkoRows={setPlinkoRows}
              plinkoRisk={plinkoRisk} setPlinkoRisk={setPlinkoRisk}
              plinkoAutoCount={plinkoAutoCount} setPlinkoAutoCount={setPlinkoAutoCount} plinkoAutoRemaining={plinkoAutoRemaining}
              plinkoAutoRunning={plinkoAutoRunning}
              plinkoStats={plinkoStats}
              plinkoBetHistory={plinkoBetHistory}
              placePlinkoManual={placePlinkoManual}
              startAutoPlinko={startAutoPlinko}
              stopAutoPlinko={stopAutoPlinko}
              halvePlinkoBet={()=>setPlinkoBet(v=>Math.max(0.01,(parseFloat(v)||0)/2).toFixed(2))}
              doublePlinkoBet={()=>{ const maxD=Math.floor(convertUsd(balance)*100)/100; setPlinkoBet(v=>Math.min(maxD,(parseFloat(v)||0)*2).toFixed(2)); }}
              fmtMoney={fmtMoney}
              onBack={showHomeView}
              displayCurrency={displayCurrency}
              plinkoBetUsd={plinkoBetUsd}
              currencyFade={currencyFade}
              lang={lang}
              convertUsd={convertUsd}
              pendingBalls={pendingPlinkoBalls}
              onBallsConsumed={onBallsConsumed}
              onResetStats={()=>{ const z={ profit:0,wagered:0,wins:0,losses:0,history:[] }; setPlinkoStats(z); ls.savePlinko(currentUser, z); }}
              hideHistory={true}
              plinkoVol={plinkoVol} setPlinkoVol={setPlinkoVol}
              showPlinkoVol={showPlinkoVol} setShowPlinkoVol={setShowPlinkoVol}
              currentUser={currentUser||undefined}
            /></div>
            <GameInfoPanel game="plinko" onFairness={() => { setSection("fairness"); setFairnessGame("Plinko"); }}/>
            <MoreFromLockly currentGame="plinko" onVerTodo={showOriginalsView} onGames={{ dice:showDiceOnly, plinko:showPlinkoOnly, keno:showKenoOnly, blackjack:showBlackjackOnly, mines:showMinesOnly, hilo:showHiloOnly, roulette:showRouletteOnly, baccarat:showBaccaratOnly }}/>
            <ApuestasSection records={plinkoBetHistory as ApuestaRecord[]} gameLabel="Plinko" gameIcon={<img src="/plinko-thumb.jpg" style={{width:"100%",height:"100%",objectFit:"cover"}} alt="plinko"/>} fmtMoney={fmtMoney}/>
            <CasinoFooter onHome={showHomeView} />
            </>}

            {/* KENO GAME */}
            {homeView==="keno" && <><div style={{ maxWidth:"1080px", margin:"0 auto", width:"100%", borderRadius:"16px", overflow:"hidden", userSelect:"none", WebkitUserSelect:"none" } as React.CSSProperties}><KenoGame
              balance={balance}
              currentUser={currentUser||""}
              setAuthModal={setAuthModal}
              kenoBet={kenoBet} setKenoBet={setKenoBet}
              kenoPickedNums={kenoPickedNums} setKenoPickedNums={setKenoPickedNums}
              kenoDrawnNums={kenoDrawnNums}
              kenoIsDrawing={kenoIsDrawing}
              kenoAutoCount={kenoAutoCount} setKenoAutoCount={setKenoAutoCount}
              kenoAutoRemaining={kenoAutoRemaining} onSetAutoRemaining={setKenoAutoRemaining}
              kenoAutoRunning={kenoAutoRunning}
              kenoStats={kenoStats}
              kenoBetHistory={kenoBetHistory}
              kenoLastResult={kenoLastResult}
              fmtMoney={fmtMoney}
              displayCurrency={displayCurrency}
              convertUsd={convertUsd}
              currencyFade={currencyFade}
              onBack={showHomeView}
              onPlaceBet={(betDisplay: number) => {
                if (!currentUser) { setAuthModal("login"); return { success: false }; }
                // Determine outcome and deduct bet only — payout is credited by onSettleKenoBet
                const rate = liveRates[displayCurrency] || 1;
                const betUsd = betDisplay / rate;
                const curBal = ls.getBalance(currentUser);
                if (curBal < betUsd - 0.0001 || betUsd < 0.0099 || kenoPickedNums.length < 1) return { success: false };
                const picks = kenoPickedNums.length;
                const pool = Array.from({length:40},(_,i)=>i+1);
                const drawn: number[] = [];
                const poolCopy = [...pool];
                for (let i = 0; i < 10; i++) {
                  const idx = Math.floor(Math.random() * poolCopy.length);
                  drawn.push(poolCopy[idx]);
                  poolCopy.splice(idx, 1);
                }
                const hits = kenoPickedNums.filter(n => drawn.includes(n)).length;
                const riskTable = KENO_MULT[kenoRisk] || KENO_MULT.medium;
                const mults = riskTable[picks] || riskTable[1];
                const multiplier = hits < mults.length ? mults[hits] : 0;
                const payout = betUsd * multiplier;
                const win = multiplier > 0;
                // Only deduct the bet; payout is applied in onSettleKenoBet
                setCoinBalanceUsd(curBal - betUsd);
                return { success: true, drawn, hits, multiplier, payout, win, betUsd, picks, pickedNums: [...kenoPickedNums] };
              }}
              onSettleKenoBet={(result) => {
                // Credit payout and update stats when the draw animation finishes
                const curBal = ls.getBalance(currentUser);
                setCoinBalanceUsd(curBal + result.payout);
                const newStats = ls.getKeno(currentUser);
                newStats.wagered += result.betUsd;
                newStats.profit += result.payout - result.betUsd;
                if (result.win) newStats.wins += 1; else newStats.losses += 1;
                newStats.history = [{ picks: result.picks, hits: result.hits, multiplier: result.multiplier, win: result.win, profit: result.payout - result.betUsd }, ...newStats.history].slice(0, 500);
                ls.saveKeno(currentUser, newStats);
                setKenoStats({ ...newStats });
                const record: KenoBetRecord = {
                  amount: result.betUsd, picks: result.picks, hits: result.hits, multiplier: result.multiplier,
                  win: result.win, payout: result.payout, drawnNumbers: result.drawn,
                  pickedNumbers: result.pickedNums, createdAt: new Date().toISOString(),
                };
                const newKenoBets = [record, ...ls.getKenoBets(currentUser)].slice(0, 1000);
                ls.saveKenoBets(currentUser, newKenoBets);
                setKenoBetHistory(newKenoBets);
                addBet(result.betUsd, result.win ? result.payout : 0, "Keno");
              }}
              onSetDrawn={setKenoDrawnNums}
              onSetDrawing={setKenoIsDrawing}
              onSetLastResult={setKenoLastResult}
              onAutoRunRef={kenoAutoRunRef}
              onLoopIdRef={kenoLoopIdRef}
              onSetAutoRunning={setKenoAutoRunning}
              liveRates={liveRates}
              kenoRisk={kenoRisk} setKenoRisk={setKenoRisk}
              onResetStats={()=>{ const z={profit:0,wagered:0,wins:0,losses:0,history:[]}; setKenoStats(z); ls.saveKeno(currentUser,z); }}
              hideHistory={true}
              lang={lang}
            /></div>
            <GameInfoPanel game="keno" onFairness={() => { setSection("fairness"); setFairnessGame("Keno"); }}/>
            <MoreFromLockly currentGame="keno" onVerTodo={showOriginalsView} onGames={{ dice:showDiceOnly, plinko:showPlinkoOnly, keno:showKenoOnly, blackjack:showBlackjackOnly, mines:showMinesOnly, hilo:showHiloOnly, roulette:showRouletteOnly, baccarat:showBaccaratOnly }}/>
            <ApuestasSection records={kenoBetHistory as ApuestaRecord[]} gameLabel="Keno" gameIcon={<img src="/keno-thumb.jpg" style={{width:"100%",height:"100%",objectFit:"cover"}} alt="keno"/>} fmtMoney={fmtMoney}/>
            <CasinoFooter onHome={showHomeView} />
            </>}


            {/* BLACKJACK */}
            {homeView==="blackjack" && (
              <>
              <div style={{ maxWidth:"1080px", margin:"0 auto", height:"760px", width:"100%", borderRadius:"16px", overflow:"hidden", border:"1px solid #153650", display:"flex", flexDirection:"column" }}>
              <BlackjackGame
                balance={balance}
                fmtMoney={fmtMoney}
                convertUsd={convertUsd}
                displayCurrency={displayCurrency}
                currencyFade={currencyFade}
                onBack={showHomeView}
                onBalanceChange={setCoinBalanceUsd}
                addBet={addBet}
                onBetRecord={addBJBetRecord}
                liveRates={liveRates}
                lang={lang}
                bjStats={bjStats}
                setBjStats={setBjStats}
                currentUser={currentUser}
                onRequestLogin={() => setAuthModal("login")}
                onGameActive={setBjGameActive}
              />
              </div>
              <GameInfoPanel game="blackjack" onFairness={() => { setSection("fairness"); setFairnessGame("Blackjack"); }}/>
              <MoreFromLockly currentGame="blackjack" onVerTodo={showOriginalsView} onGames={{ dice:showDiceOnly, plinko:showPlinkoOnly, keno:showKenoOnly, blackjack:showBlackjackOnly, mines:showMinesOnly, hilo:showHiloOnly, roulette:showRouletteOnly, baccarat:showBaccaratOnly }}/>
              <ApuestasSection records={bjBetHistory as ApuestaRecord[]} gameLabel="Blackjack" gameIcon={<img src="/blackjack-thumb.jpg" style={{width:"100%",height:"100%",objectFit:"cover"}} alt="blackjack"/>} fmtMoney={fmtMoney}/>
              <CasinoFooter onHome={showHomeView} />
              </>
            )}

            {/* MINES */}
            {homeView==="mines" && (
              <>
              <div style={{ maxWidth:"1080px", margin:"0 auto", height:"760px", width:"100%", borderRadius:"16px", overflow:"hidden", border:"1px solid #153650", display:"flex", flexDirection:"column" }}>
                <MinesGame
                  balance={balance}
                  fmtMoney={fmtMoney}
                  convertUsd={convertUsd}
                  displayCurrency={displayCurrency}
                  currencyFade={currencyFade}
                  onBack={showHomeView}
                  onBalanceChange={setCoinBalanceUsd}
                  addBet={addBet}
                  onBetRecord={addMinesBetRecord}
                  liveRates={liveRates}
                  lang={lang}
                  minesStats={minesStats}
                  setMinesStats={(updater) => {
                    setMinesStats(prev => {
                      const next = typeof updater === "function" ? (updater as (p: MinesStats)=>MinesStats)(prev) : updater;
                      ls.saveMines(currentUser, next);
                      return next;
                    });
                  }}
                  currentUser={currentUser}
                  onResetStats={()=>{ const z=minesStatsDefault; setMinesStats(z); ls.saveMines(currentUser, z); }}
                  onRequestLogin={() => setAuthModal("login")}
                  onGameActive={setMinesGameActive}
                />
              </div>
              <GameInfoPanel game="mines" onFairness={() => { setSection("fairness"); setFairnessGame("Mines"); }}/>
              <MoreFromLockly currentGame="mines" onVerTodo={showOriginalsView} onGames={{ dice:showDiceOnly, plinko:showPlinkoOnly, keno:showKenoOnly, blackjack:showBlackjackOnly, mines:showMinesOnly, hilo:showHiloOnly, roulette:showRouletteOnly, baccarat:showBaccaratOnly }}/>
              <ApuestasSection records={minesBetHistory as ApuestaRecord[]} gameLabel="Mines" gameIcon={<img src="/mines-card.jpg" style={{width:"100%",height:"100%",objectFit:"cover"}} alt="mines"/>} fmtMoney={fmtMoney}/>
              <CasinoFooter onHome={showHomeView} />
              </>
            )}

            {/* HILO */}
            {homeView==="hilo" && (
              <>
              <HiloGame
                balance={balance}
                fmtMoney={fmtMoney}
                convertUsd={convertUsd}
                displayCurrency={displayCurrency}
                currencyFade={currencyFade}
                onBack={showHomeView}
                onBalanceChange={setCoinBalanceUsd}
                addBet={addBet}
                onBetRecord={addHiloBetRecord}
                liveRates={liveRates}
                lang={lang}
                hiloStats={hiloStats}
                setHiloStats={(updater) => {
                  setHiloStats(prev => {
                    const next = typeof updater === "function" ? (updater as (p: HiloStats)=>HiloStats)(prev) : updater;
                    ls.saveHilo(currentUser, next);
                    return next;
                  });
                }}
                currentUser={currentUser}
                onRequestLogin={() => setAuthModal("login")}
                onGameActive={setHiloGameActive}
              />
              <GameInfoPanel game="hilo" onFairness={() => { setSection("fairness"); setFairnessGame("Hilo"); }}/>
              <MoreFromLockly currentGame="hilo" onVerTodo={showOriginalsView} onGames={{ dice:showDiceOnly, plinko:showPlinkoOnly, keno:showKenoOnly, blackjack:showBlackjackOnly, mines:showMinesOnly, hilo:showHiloOnly, roulette:showRouletteOnly, baccarat:showBaccaratOnly }}/>
              <ApuestasSection records={hiloBetHistory as ApuestaRecord[]} gameLabel="Hilo" gameIcon={<img src="/hilo-card.jpg" style={{width:"100%",height:"100%",objectFit:"cover"}} alt="hilo"/>} fmtMoney={fmtMoney}/>
              <CasinoFooter onHome={showHomeView} />
              </>
            )}

            {/* ─── ROULETTE PAGE ─── */}
            {homeView==="roulette" && (
              <>
              <div style={{ maxWidth:"1080px", margin:"0 auto", width:"100%", borderRadius:"16px", overflow:"hidden", border:"1px solid #153650", display:"flex", flexDirection:"column" }}>
              {/* ── Roulette header bar ── */}
              <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 20px", background:"#0e1826", borderBottom:"1px solid #1a2438", flexShrink:0 }}>
                <button onClick={showHomeView}
                  style={{ background:"#131a28", border:"1px solid #252f45", color:"#8090b0", cursor:"pointer", fontSize:"18px", padding:"5px 12px", borderRadius:"8px", lineHeight:1 }}>
                  ←
                </button>
                <div style={{ fontWeight:500, fontSize:"15px", letterSpacing:"1.5px", color:"#fff", display:"flex", alignItems:"center", gap:"8px" }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>RULETA</div>
                <div style={{ marginLeft:"auto", fontSize:"12px", color:"#5a6a88", fontWeight:500 }}>Mander Originals</div>
              </div>
              <RouletteGame
                balance={balance}
                fmtMoney={fmtMoney}
                convertUsd={convertUsd}
                displayCurrency={displayCurrency}
                currencyFade={currencyFade}
                onBack={showHomeView}
                onBalanceChange={setCoinBalanceUsd}
                addBet={addBet}
                onBetRecord={addRouletteBetRecord}
                liveRates={liveRates}
                lang={lang}
                rouletteStats={rouletteStats}
                setRouletteStats={(updater) => {
                  setRouletteStats(prev => {
                    const next = typeof updater === "function" ? (updater as (p: RouletteStats)=>RouletteStats)(prev) : updater;
                    ls.saveRoulette(currentUser, next);
                    return next;
                  });
                }}
                currentUser={currentUser}
                onRequestLogin={() => setAuthModal("login")}
                onGameActive={setRouletteGameActive}
              />
              </div>
              <GameInfoPanel game="roulette" onFairness={() => { setSection("fairness"); setFairnessGame("Roulette"); }}/>
              <MoreFromLockly currentGame="roulette" onVerTodo={showOriginalsView} onGames={{ dice:showDiceOnly, plinko:showPlinkoOnly, keno:showKenoOnly, blackjack:showBlackjackOnly, mines:showMinesOnly, hilo:showHiloOnly, roulette:showRouletteOnly, baccarat:showBaccaratOnly }}/>
              <ApuestasSection records={rouletteBetHistory as ApuestaRecord[]} gameLabel="Ruleta" gameIcon={<img src="/roulette-card.jpg" style={{width:"100%",height:"100%",objectFit:"cover"}} alt="ruleta"/>} fmtMoney={fmtMoney}/>
              <CasinoFooter onHome={showHomeView} />
              </>
            )}

            {/* BACCARAT */}
            {homeView==="baccarat" && (
              <>
              <div style={{ maxWidth:"1080px", margin:"0 auto", height:"760px", width:"100%", borderRadius:"16px", overflow:"hidden", border:"1px solid #153650", display:"flex", flexDirection:"column" }}>
                <div style={{ padding:"10px 20px", background:"#0e1826", borderBottom:"1px solid #1a2438", display:"flex", alignItems:"center", gap:"10px" }}>
                  <button onClick={showHomeView} style={{ background:"#131a28", border:"1px solid #252f45", color:"#8090b0", cursor:"pointer", fontSize:"18px", padding:"5px 12px", borderRadius:"8px", lineHeight:1 }}>←</button>
                  <span style={{ fontWeight:500, fontSize:"15px", letterSpacing:"1.5px", color:"#fff", display:"flex", alignItems:"center", gap:"8px" }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="12" height="16" rx="2"/><rect x="11" y="2" width="12" height="16" rx="2"/></svg>BACCARAT</span>
                  <div style={{ marginLeft:"auto", fontSize:"12px", color:"#5a6a88", fontWeight:500 }}>Mander Originals</div>
                </div>
                <BaccaratGame
                  balance={balance}
                  fmtMoney={fmtMoney}
                  convertUsd={convertUsd}
                  displayCurrency={displayCurrency}
                  currencyFade={currencyFade}
                  onBack={showHomeView}
                  onBalanceChange={setCoinBalanceUsd}
                  addBet={addBet}
                  onBetRecord={addBaccaratBetRecord}
                  liveRates={liveRates}
                  lang={lang}
                  baccaratStats={baccaratStats}
                  setBaccaratStats={(updater) => {
                    setBaccaratStats(prev => {
                      const next = typeof updater === "function" ? (updater as (p: BaccaratStats) => BaccaratStats)(prev) : updater;
                      localStorage.setItem("baccarat_stats_"+currentUser, JSON.stringify(next));
                      return next;
                    });
                  }}
                  currentUser={currentUser}
                  onRequestLogin={() => setAuthModal("login")}
                  stopAutoRef={baccaratStopRef}
                  onGameActive={setBaccaratGameActive}
                />
              </div>
              <GameInfoPanel game="baccarat" onFairness={() => { setSection("fairness"); setFairnessGame("Baccarat"); }}/>
              <MoreFromLockly currentGame="baccarat" onVerTodo={showOriginalsView} onGames={{ dice:showDiceOnly, plinko:showPlinkoOnly, keno:showKenoOnly, blackjack:showBlackjackOnly, mines:showMinesOnly, hilo:showHiloOnly, roulette:showRouletteOnly, baccarat:showBaccaratOnly }}/>
              <ApuestasSection records={baccaratBetHistory as ApuestaRecord[]} gameLabel="Baccarat" gameIcon={<img src="/baccarat-card.jpg" style={{width:"100%",height:"100%",objectFit:"cover"}} alt="baccarat"/>} fmtMoney={fmtMoney}/>
              <CasinoFooter onHome={showHomeView} />
              </>
            )}

            {/* ─── ORIGINALS PAGE ─── */}
            {homeView==="originals" && (
              <><div style={{ maxWidth:"1080px", margin:"0 auto", width:"100%", paddingBottom:"40px" }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"28px" }}>
                  <span style={{ color:"#f4a91f", fontSize:"18px" }}>♠</span>
                  <span style={{ fontWeight:800, fontSize:"15px", letterSpacing:"2.5px", color:"#fff", textTransform:"uppercase" }}>Juegos Originales</span>
                </div>
                {/* Grid */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:"18px" }}>
                  {/* ── Active games ── */}
                  {([
                    { key:"dice",      label:"Dados",     bg:"linear-gradient(135deg,#0d2a7a,#1a5cd6)", icon:"🎲", accentBg:"#1a5cd6", action:showDiceOnly },
                    { key:"plinko",    label:"Plinko",    bg:"linear-gradient(135deg,#7a0a14,#e6293e)", icon:"🎯", accentBg:"#e6293e", action:showPlinkoOnly },
                    { key:"keno",      label:"Keno",      bg:"linear-gradient(135deg,#7a4200,#f4a91f)", icon:"🔮", accentBg:"#f4a91f", action:showKenoOnly },
                    { key:"blackjack", label:"Blackjack", bg:"linear-gradient(135deg,#5c2800,#d67a10)", icon:"🃏", accentBg:"#d67a10", action:showBlackjackOnly },
                    { key:"mines",     label:"Mines",     bg:"linear-gradient(135deg,#0a1e3a,#1a4d8a)", icon:"💎", accentBg:"#1a4d8a", action:showMinesOnly },
                    { key:"hilo",      label:"Hilo",      bg:"linear-gradient(135deg,#004a2a,#00a85a)", icon:"🃠", accentBg:"#00d47a", action:showHiloOnly },
                    { key:"roulette",  label:"Ruleta",    bg:"linear-gradient(135deg,#1a0a2e,#4a1a7a)", icon:"🎡", accentBg:"#9b59b6", action:showRouletteOnly },
                    { key:"baccarat",  label:"Baccarat",  bg:"linear-gradient(135deg,#001830,#003a7a)", icon:"🃠", accentBg:"#1a64e0", action:showBaccaratOnly },
                  ] as const).map(g => (
                    <div key={g.key} onClick={g.action} style={{ cursor:"pointer" }}
                      onMouseEnter={e=>{ const card = e.currentTarget.querySelector(".orig-card") as HTMLElement; if(card){ card.style.transform="translateY(-4px) scale(1.03)"; card.style.boxShadow="0 12px 32px rgba(0,0,0,.65)"; } }}
                      onMouseLeave={e=>{ const card = e.currentTarget.querySelector(".orig-card") as HTMLElement; if(card){ card.style.transform=""; card.style.boxShadow="0 4px 20px rgba(0,0,0,.5)"; } }}>
                      <div className="orig-card" style={{ borderRadius:"14px", background:g.bg, position:"relative", overflow:"hidden", aspectRatio:"1 / 0.88", boxShadow:"0 4px 20px rgba(0,0,0,.5)", transition:"transform .2s, box-shadow .2s" }}>
                        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 28% 18%,rgba(255,255,255,.28) 0%,transparent 58%)" }}/>
                        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,transparent 36%,rgba(0,0,0,.68))" }}/>
                        <div style={{ position:"absolute", top:"14px", right:"14px", fontSize:"52px", filter:"drop-shadow(0 2px 12px rgba(0,0,0,.75))", lineHeight:1 }}>{g.icon}</div>
                        <div style={{ position:"absolute", bottom:"13px", left:"13px" }}>
                          <div style={{ fontWeight:900, fontSize:"14px", letterSpacing:"2.5px", textTransform:"uppercase", color:"#fff", textShadow:"0 1px 8px rgba(0,0,0,.9)" }}>{g.label}</div>
                          <div style={{ display:"flex", alignItems:"center", gap:"5px", marginTop:"4px" }}>
                            <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:g.accentBg, boxShadow:`0 0 6px ${g.accentBg}` }}/>
                            <div style={{ fontSize:"8px", color:"rgba(255,255,255,.6)", letterSpacing:"1px", textTransform:"uppercase", fontWeight:600 }}>Mander Originals</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop:"10px", paddingLeft:"2px" }}>
                        <div style={{ fontSize:"13px", fontWeight:700, color:"#c8d8f0" }}>{g.label}</div>
                        <div style={{ fontSize:"11px", color:"#4a6a8a", marginTop:"2px" }}>Originales</div>
                      </div>
                    </div>
                  ))}

                </div>
              </div>
              <CasinoFooter onHome={showHomeView} /></>
            )}
          </section>
        )}

        {/* ── PROFILE SECTION NAV BAR ─────────────────────────────────────── */}
        {["profile","bet-history","transactions","rewards-history","referrals-profile"].includes(section) && (
          <div style={{ position:"sticky", top:0, zIndex:90, padding:"12px 0", margin:"0 -16px" }}>
            <div style={{ maxWidth:"1080px", margin:"0 auto", padding:"0 20px", overflowX:"auto", scrollbarWidth:"none" }}>
              <div style={{ display:"flex", gap:"6px", minWidth:"max-content" }}>
                {([
                  { key:"profile",       label:"Perfil",               icon:<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
                  { key:"bet-history",   label:"Historial de apuestas", icon:<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg> },
                  { key:"transactions",  label:"Transacciones",         icon:<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg> },
                  { key:"rewards-history", label:"Recompensas",           icon:<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg> },
                  { key:"referrals-profile", label:"Referidos",         icon:<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                ] as { key: string; label: string; icon: React.ReactNode }[]).map(tab => {
                  const active = section === tab.key;
                  return (
                    <button key={tab.key} onClick={() => { window.scrollTo({ top:0, behavior:"instant" }); openSection(tab.key); }}
                      style={{ display:"flex", alignItems:"center", gap:"7px", padding:"9px 18px", borderRadius:"7px",
                        border: active ? "1px solid transparent" : "1px solid #253045",
                        background: active ? "linear-gradient(160deg,#f6b531,#d4870a)" : "transparent",
                        color: active ? "#fff" : "#5a7090", fontWeight: active ? 700 : 500,
                        fontSize:"13px", cursor:"pointer", whiteSpace:"nowrap", fontFamily:"'Inter',sans-serif",
                        transition:"all .15s",
                        boxShadow: active ? "0 2px 12px rgba(244,169,31,.4)" : "none" }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor="#3a4f6a"; e.currentTarget.style.color="#8aa8cc"; }}}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor="#253045"; e.currentTarget.style.color="#5a7090"; }}}>
                      {tab.icon}
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* PROFILE */}
        {section==="profile" && (
          <section style={{ minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column" }}>
            <div style={{ minHeight:"calc(100vh - 70px)" }}>
            <ProfilePage
              currentUser={currentUser}
              balance={balance}
              fmtMoney={fmtMoney}
              totalWagered={vipWagered}
              totalWins={totalWins}
              winRate={winRate}
              totalBets={totalBetsCount || filtered.length}
              statsRange={statsRange}
              setStatsRange={setStatsRange}
              onLogout={doLogout}
              onOpenCashier={()=>openCashier("deposit")}
              displayCurrency={displayCurrency}
              onPrivateModeChange={setPrivateMode}
              vipWagered={vipWagered}
              userEmail={userEmail || supaSession?.user?.email || ls.get("email_" + currentUser) || ""}
              accountStatus={accountStatus}
              profileDetails={profileDetails}
              onForgotPassword={() => {
                const email = supaSession?.user?.email || ls.get("email_" + currentUser) || "";
                setForgotEmail(email);
                setForgotMsg("");
                setForgotError("");
                setAuthModal("forgot");
              }}
            />
            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
        )}

        {/* BET HISTORY */}
        {section==="bet-history" && (
          <section style={{ animation:"nlsfadeIn 0.25s ease", fontFamily:"'Inter', sans-serif", minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column" }}>
            <div style={{ maxWidth:"1080px", margin:"0 auto", padding:"0 20px", width:"100%", boxSizing:"border-box" as const, minHeight:"calc(100vh - 70px)" }}>
              {/* Title */}
              <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"16px" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f4a91f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                <span style={{ fontSize:"14px", fontWeight:800, letterSpacing:"1.4px", textTransform:"uppercase" as const, color:"#c8d8ec", fontFamily:"'Inter', sans-serif" }}>Historial de apuestas</span>
              </div>
              {!currentUser ? (
                <div style={{ background:"#161d2b", border:"1px solid #20283a", borderRadius:"14px", padding:"16px" }}>
                  <NotLoggedInState variant="transactions" onLogin={()=>setAuthModal("login")} onRegister={()=>setAuthModal("register")} />
                </div>
              ) : (()=>{
                // ── Normalize all per-game bet histories into one unified format ──
                type UBet = { game:string; label:string; color:string; amount:number; multiplier:number; payout:number; win:boolean; createdAt:string };
                const all: UBet[] = [
                  ...diceBetHistory.map(b=>({ game:"dice",      label:"Dados",      color:"#f97316", amount:b.amount, multiplier:b.multiplier, payout:b.payout, win:b.win, createdAt:b.createdAt })),
                  ...plinkoBetHistory.map(b=>({ game:"plinko",   label:"Plinko",     color:"#a855f7", amount:b.amount, multiplier:b.multiplier, payout:b.payout, win:b.win, createdAt:b.createdAt })),
                  ...kenoBetHistory.map(b=>({ game:"keno",       label:"Keno",       color:"#3b82f6", amount:b.amount, multiplier:b.multiplier, payout:b.payout, win:b.win, createdAt:b.createdAt })),
                  ...bjBetHistory.map(b=>({ game:"blackjack",    label:"Blackjack",  color:"#d67a10", amount:b.amount, multiplier:b.multiplier, payout:b.payout, win:b.win, createdAt:b.createdAt })),
                  ...minesBetHistory.map(b=>({ game:"mines",     label:"Mines",      color:"#ef4444", amount:b.amount, multiplier:b.multiplier, payout:b.payout, win:b.win, createdAt:b.createdAt })),
                  ...hiloBetHistory.map(b=>({ game:"hilo",       label:"Hilo",       color:"#00d47a", amount:b.amount, multiplier:b.multiplier, payout:b.payout, win:b.win, createdAt:b.createdAt })),
                  ...rouletteBetHistory.map(b=>({ game:"roulette", label:"Ruleta",   color:"#f4a91f", amount:b.amount, multiplier:b.multiplier, payout:b.payout, win:b.win, createdAt:b.createdAt })),
                  ...baccaratBetHistory.map(b=>({ game:"baccarat", label:"Baccarat", color:"#1a64e0", amount:b.amount, multiplier:b.multiplier, payout:b.payout, win:b.win, createdAt:b.createdAt })),
                ].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());

                const GAMES = [
                  { key:"all",        label:"Todos" },
                  { key:"dice",       label:"Dados" },
                  { key:"plinko",     label:"Plinko" },
                  { key:"keno",       label:"Keno" },
                  { key:"blackjack",  label:"Blackjack" },
                  { key:"mines",      label:"Mines" },
                  { key:"hilo",       label:"Hilo" },
                  { key:"roulette",   label:"Ruleta" },
                  { key:"baccarat",   label:"Baccarat" },
                ];

                const PAGE_SIZE = 30;
                const filtered = bhFilter==="all" ? all : all.filter(b=>b.game===bhFilter);
                const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
                const page = Math.min(bhPage, totalPages-1);
                const pageData = filtered.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE);
                const fmtDate = (s:string)=>{ const d=new Date(s); return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`; };

                return (
                  <div style={{ background:"#161d2b", border:"1px solid #20283a", borderRadius:"14px", overflow:"hidden" }}>
                    {/* Game filter tabs */}
                    <div style={{ display:"flex", gap:"6px", padding:"14px 16px 0", flexWrap:"wrap" as const }}>
                      {GAMES.map(g=>{
                        const active = bhFilter===g.key;
                        return (
                          <button key={g.key} onClick={()=>{ setBhFilter(g.key); setBhPage(0); }}
                            style={{ padding:"6px 14px", borderRadius:"7px", border:`1px solid ${active?"#f4a91f":"#253045"}`,
                              background: active ? "linear-gradient(160deg,#f6b531,#d4870a)" : "transparent",
                              color: active?"#fff":"#5a7090", fontWeight: active?700:500,
                              fontSize:"12px", cursor:"pointer", fontFamily:"'Inter',sans-serif", transition:"all .15s", whiteSpace:"nowrap" as const }}>
                            {g.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* Table — only shows actual bet rows */}
                    <div style={{ overflowX:"auto", marginTop:"10px" }}>
                      {pageData.length === 0 ? (
                        <div style={{ padding:"40px 16px", textAlign:"center" as const, color:"#3a4e68", fontSize:"13px", fontStyle:"italic" }}>
                          {filtered.length === 0 ? "Aún no hay apuestas registradas." : "No hay apuestas en esta página."}
                        </div>
                      ) : (
                      <table style={{ width:"100%", borderCollapse:"collapse" as const, minWidth:"600px" }}>
                        <thead>
                          <tr style={{ borderBottom:"1px solid #20283a" }}>
                            {["FECHA","JUEGO","APUESTA","MULTIPLICADOR","PAGO"].map(h=>(
                              <th key={h} style={{ padding:"11px 16px", textAlign:"left" as const, fontSize:"11px", fontWeight:700, color:"#4a5e7a", letterSpacing:"0.8px", whiteSpace:"nowrap" as const }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pageData.map((b,i)=>(
                            <tr key={i} style={{ borderBottom:"1px solid #1a2236" }}
                              onMouseEnter={e=>{ e.currentTarget.style.background="#1a2438"; }}
                              onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}>
                              <td style={{ padding:"12px 16px", fontSize:"13px", color:"#7a8faa", whiteSpace:"nowrap" as const }}>{fmtDate(b.createdAt)}</td>
                              <td style={{ padding:"12px 16px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:"7px" }}>
                                  <span style={{ width:"8px", height:"8px", borderRadius:"50%", background:b.color, display:"inline-block", flexShrink:0 }}/>
                                  <span style={{ fontSize:"13px", fontWeight:700, color:"#c8d8ec" }}>{b.label}</span>
                                </div>
                              </td>
                              <td style={{ padding:"12px 16px", fontSize:"13px", color:"#c8d8ec", fontWeight:600 }}>{`$${b.amount.toFixed(2)}`}</td>
                              <td style={{ padding:"12px 16px", fontSize:"13px", fontWeight:700, color: b.multiplier>1?"#22c55e":"#94a3b8" }}>
                                {`x${b.multiplier.toFixed(2)}`}
                              </td>
                              <td style={{ padding:"12px 16px", fontSize:"13px", fontWeight:700, color: b.win?"#22c55e":"#ff5b5b" }}>
                                {b.win ? `$${b.payout.toFixed(2)}` : "$0.00"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      )}
                    </div>
                    {totalPages>1 && (
                      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:"6px", padding:"14px 16px", borderTop:"1px solid #1a2236" }}>
                        <button onClick={()=>setBhPage(p=>Math.max(0,p-1))} disabled={page===0}
                          style={{ width:"32px", height:"32px", borderRadius:"7px", border:"1px solid #253045", background:"transparent", color:page===0?"#253045":"#8aa0c0", cursor:page===0?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>‹</button>
                        {Array.from({length:Math.min(5, totalPages)},(_,i)=>{
                          const start = Math.min(page, Math.max(0, totalPages-5));
                          const idx = start+i;
                          return (
                            <button key={idx} onClick={()=>setBhPage(idx)}
                              style={{ width:"32px", height:"32px", borderRadius:"7px", border:"none",
                                background: idx===page?"linear-gradient(160deg,#f6b531,#d4870a)":"#1a2436",
                                color: idx===page?"#fff":"#8aa0c0", fontWeight:idx===page?700:400,
                                fontSize:"13px", cursor:"pointer" }}>
                              {idx+1}
                            </button>
                          );
                        })}
                        <button onClick={()=>setBhPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                          style={{ width:"32px", height:"32px", borderRadius:"7px", border:"1px solid #253045", background:"transparent", color:page===totalPages-1?"#253045":"#8aa0c0", cursor:page===totalPages-1?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>›</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
        )}

        {/* TRANSACTIONS */}
        {section==="transactions" && (
          <section style={{ animation:"nlsfadeIn 0.25s ease", fontFamily:"'Inter', sans-serif", minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column" }}>
            <div style={{ maxWidth:"1080px", margin:"0 auto", padding:"0 20px", width:"100%", boxSizing:"border-box" as const, minHeight:"calc(100vh - 70px)" }}>
              {/* Title */}
              <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"16px" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f4a91f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
                <span style={{ fontSize:"14px", fontWeight:800, letterSpacing:"1.4px", textTransform:"uppercase" as const, color:"#c8d8ec", fontFamily:"'Inter', sans-serif" }}>Transacciones</span>
              </div>
              {/* Card */}
              <div style={{ background:"#161d2b", border:"1px solid #20283a", borderRadius:"14px", overflow:"hidden" }}>
                {/* Filter buttons */}
                <div style={{ display:"flex", gap:"8px", padding:"16px 16px 0" }}>
                  {([["deposit","Depositar"],["withdraw","Retirar"]] as [typeof txFilter, string][]).map(([val, label])=>{
                    const active = txFilter === val;
                    return (
                      <button key={val} onClick={()=>{ setTxFilter(val); setTxPage(0); }}
                        style={{ padding:"7px 18px", borderRadius:"7px", border:`1px solid ${active?"#f4a91f":"#253045"}`,
                          background: active ? "linear-gradient(160deg,#f6b531,#d4870a)" : "transparent",
                          color: active ? "#fff" : "#5a7090", fontWeight: active ? 700 : 500,
                          fontSize:"13px", cursor:"pointer", fontFamily:"'Inter',sans-serif", transition:"all .15s" }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                {/* Table / empty */}
                {!currentUser ? (
                  <div style={{ padding:"16px" }}>
                    <NotLoggedInState variant="transactions" onLogin={()=>setAuthModal("login")} onRegister={()=>setAuthModal("register")} />
                  </div>
                ) : (
                  (() => {
                    const PAGE_SIZE = 10;
                    const filtered = [...transactions].reverse().filter(tx => tx.type === txFilter);
                    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
                    const page = Math.min(txPage, totalPages - 1);
                    const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                    const fmtDate = (s: string) => {
                      const d = new Date(s);
                      return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
                    };
                    const statusColor = (s: string) => s==="completed"||s==="approved" ? "#22c55e" : s==="pending" ? "#f4a91f" : s==="expired" ? "#6b7280" : "#ff5b5b";
                    const statusLabel = (s: string) => s==="completed"||s==="approved" ? "Completado" : s==="pending" ? "Pendiente" : s==="expired" ? "Expirado" : "Rechazado";
                    return (
                      <>
                        {filtered.length === 0 ? (
                          <div style={{ padding:"40px 16px", textAlign:"center" as const, color:"#4a5e7a", fontSize:"13px" }}>
                            Aún no hay transacciones
                          </div>
                        ) : (
                          <>
                            <div style={{ overflowX:"auto", marginTop:"12px" }}>
                              <table style={{ width:"100%", borderCollapse:"collapse" as const, minWidth:"580px" }}>
                                <thead>
                                  <tr style={{ borderBottom:"1px solid #20283a" }}>
                                    {["#ID","FECHA","TIPO","CANTIDAD","MONEDA","RED","ESTADO"].map(h=>(
                                      <th key={h} style={{ padding:"12px 16px", textAlign:"left" as const, fontSize:"11px", fontWeight:700, color:"#4a5e7a", letterSpacing:"0.8px", whiteSpace:"nowrap" as const }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {pageData.map((tx,i)=>(
                                    <tr key={i} style={{ borderBottom:"1px solid #1a2236" }}
                                      onMouseEnter={e=>(e.currentTarget.style.background="#1a2438")}
                                      onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                                      <td style={{ padding:"13px 16px", whiteSpace:"nowrap" as const }}>
                                        {tx.display_id ? (
                                          <span style={{ fontFamily:"monospace", fontSize:"12px", fontWeight:700, color:"#5b8dee", background:"#1a2a4a", border:"1px solid #2a3a6a", borderRadius:"5px", padding:"3px 7px" }}>
                                            #{tx.display_id}
                                          </span>
                                        ) : (
                                          <span style={{ color:"#4a5e7a", fontSize:"12px" }}>—</span>
                                        )}
                                      </td>
                                      <td style={{ padding:"13px 16px", fontSize:"13px", color:"#7a8faa", whiteSpace:"nowrap" as const }}>{fmtDate(tx.createdAt)}</td>
                                      <td style={{ padding:"13px 16px" }}>
                                        <span style={{ color: tx.type==="deposit" ? "#22c55e" : "#f4a91f", fontWeight:600, fontSize:"13px" }}>
                                          {tx.type==="deposit" ? "Recibido" : "Enviado"}
                                        </span>
                                      </td>
                                      <td style={{ padding:"13px 16px" }}>
                                        <span style={{ color: tx.type==="deposit" ? "#22c55e" : "#f4a91f", fontWeight:700, fontSize:"13px" }}>
                                          {tx.type==="deposit" ? "+" : "-"}${tx.usdAmount.toFixed(2)}
                                        </span>
                                      </td>
                                      <td style={{ padding:"13px 16px", fontSize:"13px", color:"#c8d8ec", fontWeight:600 }}>{tx.coin}</td>
                                      <td style={{ padding:"13px 16px", fontSize:"13px", color:"#8a9ab8" }}>{tx.network}</td>
                                      <td style={{ padding:"13px 16px" }}>
                                        <span style={{ fontSize:"12px", fontWeight:600, color: statusColor(tx.status), background: statusColor(tx.status)+"18", border:`1px solid ${statusColor(tx.status)}40`, borderRadius:"6px", padding:"3px 8px", display:"inline-flex", alignItems:"center", gap:"4px" }}>
                                          {tx.status==="pending" && <span style={{ display:"inline-block", width:"7px", height:"7px", borderRadius:"50%", background:"#f4a91f", animation:"txPulse 1.2s ease-in-out infinite" }}/>}
                                          {statusLabel(tx.status)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {totalPages > 1 && (
                              <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:"6px", padding:"16px", borderTop:"1px solid #1a2236" }}>
                                <button onClick={()=>setTxPage(p=>Math.max(0,p-1))} disabled={page===0}
                                  style={{ width:"32px", height:"32px", borderRadius:"7px", border:"1px solid #253045", background:"transparent", color:page===0?"#253045":"#8aa0c0", cursor:page===0?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>‹</button>
                                {Array.from({length:totalPages},(_,i)=>(
                                  <button key={i} onClick={()=>setTxPage(i)}
                                    style={{ width:"32px", height:"32px", borderRadius:"7px", border:"none",
                                      background: i===page ? "linear-gradient(160deg,#f6b531,#d4870a)" : "#1a2436",
                                      color: i===page ? "#fff" : "#8aa0c0", fontWeight: i===page ? 700 : 400,
                                      fontSize:"13px", cursor:"pointer" }}>
                                    {i+1}
                                  </button>
                                ))}
                                <button onClick={()=>setTxPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                                  style={{ width:"32px", height:"32px", borderRadius:"7px", border:"1px solid #253045", background:"transparent", color:page===totalPages-1?"#253045":"#8aa0c0", cursor:page===totalPages-1?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>›</button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
        )}

        {/* REWARDS HISTORY */}
        {section==="rewards-history" && (
          <section style={{ animation:"nlsfadeIn 0.25s ease", fontFamily:"'Inter', sans-serif", minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column" }}>
            <div style={{ maxWidth:"1080px", margin:"0 auto", padding:"0 20px", width:"100%", boxSizing:"border-box" as const, minHeight:"calc(100vh - 70px)" }}>
              {/* Title */}
              <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"18px" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f4a91f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                <span style={{ fontSize:"14px", fontWeight:800, letterSpacing:"1.4px", textTransform:"uppercase" as const, color:"#c8d8ec", fontFamily:"'Inter', sans-serif" }}>Recompensas</span>
              </div>
              {/* Table card */}
              {!currentUser ? (
                <NotLoggedInState variant="transactions" onLogin={()=>setAuthModal("login")} onRegister={()=>setAuthModal("register")} />
              ) : (
                (() => {
                  const PAGE_SIZE = 10;
                  const history: RewardRecord[] = getRewardHistory(currentUser);
                  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
                  const page = Math.min(rwPage, totalPages - 1);
                  const pageData = history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                  const fmtDate = (ts: number) => {
                    const d = new Date(ts);
                    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
                  };
                  return (
                    <div style={{ background:"#161d2b", border:"1px solid #20283a", borderRadius:"14px", overflow:"hidden" }}>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse" as const, minWidth:"620px" }}>
                          <thead>
                            <tr style={{ borderBottom:"1px solid #20283a" }}>
                              {["FECHA","DIRECCIÓN","CANTIDAD","SALDO","PARA/DE","NOTA"].map(h=>(
                                <th key={h} style={{ padding:"14px 16px", textAlign:"left" as const, fontSize:"11px", fontWeight:700, color:"#4a5e7a", letterSpacing:"0.8px", whiteSpace:"nowrap" as const }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {history.length === 0 ? (
                              <tr>
                                <td colSpan={6} style={{ padding:"40px 16px", textAlign:"center" as const, color:"#4a5e7a", fontSize:"13px" }}>
                                  No hay recompensas reclamadas todavía.
                                </td>
                              </tr>
                            ) : pageData.map((rec: RewardRecord) => (
                              <tr key={rec.id} style={{ borderBottom:"1px solid #1a2236" }}
                                onMouseEnter={e=>(e.currentTarget.style.background="#1a2438")}
                                onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                                <td style={{ padding:"13px 16px", fontSize:"13px", color:"#7a8faa", whiteSpace:"nowrap" as const }}>{fmtDate(rec.date)}</td>
                                <td style={{ padding:"13px 16px" }}>
                                  <span style={{ color:"#22c55e", fontWeight:600, fontSize:"13px" }}>Recibido</span>
                                </td>
                                <td style={{ padding:"13px 16px" }}>
                                  <span style={{ color:"#22c55e", fontWeight:700, fontSize:"13px" }}>${rec.amount.toFixed(2)}</span>
                                </td>
                                <td style={{ padding:"13px 16px" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f4a91f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.5-.8-1.4-1.5-2.5-1.5-1.7 0-3 1.3-3 3s1.3 3 3 3c1.1 0 2-.7 2.5-1.5"/><path d="M9 12h6"/></svg>
                                    <span style={{ fontSize:"13px", color:"#c8d8ec", fontWeight:600 }}>USD</span>
                                  </div>
                                </td>
                                <td style={{ padding:"13px 16px", fontSize:"13px", color:"#c8d8ec" }}>Sistema</td>
                                <td style={{ padding:"13px 16px", fontSize:"13px", color:"#7a8faa" }}>{rec.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:"6px", padding:"16px", borderTop:"1px solid #1a2236" }}>
                          <button onClick={()=>setRwPage(p=>Math.max(0,p-1))} disabled={page===0}
                            style={{ width:"32px", height:"32px", borderRadius:"7px", border:"1px solid #253045", background:"transparent", color:page===0?"#253045":"#8aa0c0", cursor:page===0?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>
                            ‹
                          </button>
                          {Array.from({length:totalPages},(_,i)=>(
                            <button key={i} onClick={()=>setRwPage(i)}
                              style={{ width:"32px", height:"32px", borderRadius:"7px", border:"none",
                                background: i===page ? "linear-gradient(160deg,#f6b531,#d4870a)" : "#1a2436",
                                color: i===page ? "#fff" : "#8aa0c0", fontWeight: i===page ? 700 : 400,
                                fontSize:"13px", cursor:"pointer" }}>
                              {i+1}
                            </button>
                          ))}
                          <button onClick={()=>setRwPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                            style={{ width:"32px", height:"32px", borderRadius:"7px", border:"1px solid #253045", background:"transparent", color:page===totalPages-1?"#253045":"#8aa0c0", cursor:page===totalPages-1?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>
                            ›
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
        )}

        {section==="tips-bonuses" && (
          <section className="vip-section" style={{ minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column" }}>
            <div style={{ maxWidth:"1080px", margin:"0 auto", width:"100%", minHeight:"calc(100vh - 70px)" }}>
            {(() => {
              void rbTick; // re-evaluate every second for live countdown
              const { rank: vRank, pct: vPct, remaining: vRem, isMax: vMax, idx: vIdx } = getVipInfo(vipWagered);
              const fmtW = (v: number) => v >= 1000000 ? `$${(v/1000000).toFixed(2)}M` : v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v.toFixed(2)}`;
              const canI = canClaimInstant(currentUser);
              const canW = canClaimPeriodic("weekly", currentUser);
              const canM = canClaimPeriodic("monthly", currentUser);
              const iTimer = timeUntilInstant(currentUser);
              const wTimer = timeUntilClaim("weekly", currentUser);
              const mTimer = timeUntilClaim("monthly", currentUser);
              const bg = "#161d2b";
              const border = "#20283a";
              const tierEmoji = (tier: string) =>
                tier === "Bronze" ? "🥉" : tier === "Silver" ? "🥈" : tier === "Gold" ? "🥇" : tier === "Platinum" ? "💎" : "💚";
              return (
                <>
                  {/* ── Page Header ─────────────────────────────────────── */}
                  <div style={{ display:"flex", alignItems:"center", gap:"14px", marginBottom:"22px" }}>
                    <div style={{ width:"42px", height:"42px", borderRadius:"12px", background:"linear-gradient(135deg,#f4a91f,#c07800)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px #f4a91f44", flexShrink:0 }}>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize:"22px", fontWeight:800, color:"#e2e8f0", letterSpacing:"-0.3px" }}>VIP & Rakeback</div>
                      <div style={{ fontSize:"12px", color:"#7a8faa", marginTop:"2px" }}>Acumula rakeback en cada apuesta · Sube de rango · Desbloquea recompensas</div>
                    </div>
                  </div>

                  {/* ── VIP Rank Hero Card ───────────────────────────────── */}
                  <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:"16px", padding:"16px 20px", marginBottom:"14px", position:"relative", overflow:"hidden" }}>
                    {currentUser ? (
                      <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:"16px", alignItems:"center" }}>
                        {/* Badge */}
                        <div style={{ width:"52px", height:"52px", borderRadius:"14px", background:`${vRank.color}18`, border:`1px solid ${vRank.color}40`, flexShrink:0, boxShadow:`0 4px 18px ${vRank.color}44`, overflow:"hidden" }}>
                          <img src={vRank.image} alt={vRank.name} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                        </div>
                        {/* Rank name + progress */}
                        <div>
                          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"4px" }}>
                            <div style={{ fontSize:"10px", color:"#4a5568", letterSpacing:"1.6px", textTransform:"uppercase" as const, fontWeight:700 }}>Tu Rango Actual</div>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"8px" }}>
                            <div style={{ fontSize:"22px", fontWeight:900, background:vRank.gradient, WebkitBackgroundClip:"text" as const, WebkitTextFillColor:"transparent", lineHeight:1 }}>{vRank.name}</div>
                            <div style={{ background:`${vRank.color}20`, border:`1px solid ${vRank.color}50`, borderRadius:"20px", padding:"2px 10px", fontSize:"11px", fontWeight:800, color:vRank.color, flexShrink:0 }}>
                              {(vRank.rakebackPct * 100).toFixed(1)}% Rakeback
                            </div>
                          </div>
                          {/* Progress bar inline */}
                          {!vMax ? (
                            <div>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"5px" }}>
                                <span style={{ fontSize:"10px", color:"#4a5568", fontWeight:600 }}>{vRank.name}</span>
                                <span style={{ fontSize:"10px", fontWeight:800, color:"#94a3b8" }}>{Math.round(vPct)}%</span>
                                <span style={{ fontSize:"10px", color:"#4a5568", fontWeight:600 }}>{VIP_RANKS[vIdx+1]?.name}</span>
                              </div>
                              <div style={{ height:"7px", borderRadius:"999px", background:"#0e1826", overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${vPct}%`, background:vRank.gradient, borderRadius:"999px", transition:"width .5s ease", boxShadow: vPct > 0 ? `0 0 10px ${vRank.color}55` : "none" }} />
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize:"12px", color:"#4dd890", fontWeight:700 }}>✦ Rango Máximo</div>
                          )}
                        </div>
                        {/* Total apostado */}
                        <div style={{ textAlign:"right" as const, flexShrink:0 }}>
                          <div style={{ fontSize:"10px", color:"#4a5568", letterSpacing:"1.2px", textTransform:"uppercase" as const, marginBottom:"4px", fontWeight:700 }}>Total Apostado</div>
                          <div style={{ fontSize:"22px", fontWeight:900, color:"#e2e8f0" }}>{fmtW(vipWagered)}</div>
                          {!vMax && (
                            <div style={{ marginTop:"3px" }}>
                              <div style={{ fontSize:"11px", color:"#4a5568" }}>Sig: <span style={{ color:VIP_RANKS[vIdx+1]?.color || "#e2e8f0", fontWeight:700 }}>{VIP_RANKS[vIdx+1]?.name}</span></div>
                              <div style={{ fontSize:"11px", color:"#4a5568", marginTop:"1px" }}>Faltan <span style={{ color:"#94a3b8", fontWeight:700 }}>{fmtW(vRem)}</span></div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
                        <div style={{ width:"44px", height:"44px", borderRadius:"12px", background:`${vRank.color}18`, border:`1px solid ${vRank.color}30`, overflow:"hidden", flexShrink:0 }}>
                          <img src={vRank.image} alt={vRank.name} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                        </div>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f4a91f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <span style={{ fontSize:"13px", color:"#7a8faa" }}>Inicia sesión para ver tu rango VIP y reclamar rakeback.</span>
                      </div>
                    )}
                  </div>

                  {/* ── Rakeback Pools ───────────────────────────────────── */}
                  {currentUser && (
                    <>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"7px" }}>
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#f4a91f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                          <span style={{ fontSize:"11px", color:"#f4a91f", fontWeight:800, letterSpacing:"1.4px", textTransform:"uppercase" as const }}>Rakeback Pools</span>
                        </div>
                        <span style={{ fontSize:"11px", color:"#4a5568", fontStyle:"italic" as const }}>Sigue apostando para aumentar tus recompensas</span>
                      </div>
                      <div className="rb-pools-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px", marginBottom:"14px" }}>
                        {([
                          {
                            label:"Instantáneo", pct:"40%", freq:"Cada 1 hora",
                            amount:rbInstant, canClaim:canI, timer:iTimer, onClaim:doClaimInstant,
                            accent:"#f4a91f", accentDim:"#f4a91f18", locked:!canI,
                            tip:"El 40% de tu rakeback se genera con cada apuesta. El contador se reinicia cada hora.",
                            icon:(<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>),
                          },
                          {
                            label:"Semanal", pct:"35%", freq:"Lunes 17:00 UTC",
                            amount:rbWeekly, canClaim:canW, timer:wTimer, onClaim:doClaimWeekly,
                            accent:"#6c8ae4", accentDim:"#6c8ae418", locked:!canW,
                            tip:"El 35% se acumula durante la semana. Se habilita cada lunes a las 05:00 PM UTC.",
                            icon:(<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>),
                          },
                          {
                            label:"Mensual", pct:"25%", freq:"Día 1 de cada mes",
                            amount:rbMonthly, canClaim:canM, timer:mTimer, onClaim:doClaimMonthly,
                            accent:"#9b6cda", accentDim:"#9b6cda18", locked:!canM,
                            tip:"El 25% conforma tu fondo mensual. Se libera el día 1 de cada mes a las 12:00 AM UTC.",
                            icon:(<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>),
                          },
                        ] as { label:string; pct:string; freq:string; amount:number; canClaim:boolean; timer:string; onClaim:()=>void; accent:string; accentDim:string; locked:boolean; tip:string; icon:React.ReactNode }[]).map(c => {
                          const isAvail = c.canClaim && c.amount > 0;
                          return (
                          <div key={c.label} className="rb-card" style={{ background:bg, border:`1px solid ${isAvail ? c.accent+"70" : border}`, borderRadius:"16px", overflow:"visible", display:"flex", flexDirection:"column" as const, transition:"border-color .3s, box-shadow .3s", boxShadow: isAvail ? `0 0 22px ${c.accent}28` : "none", position:"relative" as const }}>
                            {/* Top stripe — animated pulse when available */}
                            <div className={isAvail ? "rb-stripe-pulse" : ""} style={{ height:"3px", borderRadius:"16px 16px 0 0", background: isAvail ? `linear-gradient(90deg,${c.accent},${c.accent}aa,${c.accent})` : `linear-gradient(90deg,${c.accent}44,${c.accent}22)` }} />
                            <div style={{ padding:"18px 18px 16px", opacity: c.locked && c.amount === 0 ? 0.85 : 1, display:"flex", flexDirection:"column" as const, flex:1 }}>

                              {/* ── Header ── */}
                              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"14px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                                  <div style={{ width:"36px", height:"36px", borderRadius:"10px", background: isAvail ? `${c.accent}25` : c.accentDim, border:`1px solid ${isAvail ? c.accent+"55" : c.accent+"22"}`, display:"flex", alignItems:"center", justifyContent:"center", color:c.accent, flexShrink:0, transition:"background .3s" }}>
                                    {c.icon}
                                  </div>
                                  <div>
                                    <div style={{ fontSize:"13px", fontWeight:800, color:"#c8d8ec" }}>{c.label}</div>
                                    <div style={{ fontSize:"10px", color:"#4a5568", marginTop:"2px" }}>{c.freq}</div>
                                  </div>
                                </div>
                                <div style={{ display:"flex", alignItems:"center", gap:"5px", paddingTop:"2px" }}>
                                  <div style={{ background:`${c.accent}20`, border:`1px solid ${c.accent}40`, borderRadius:"20px", padding:"2px 9px", fontSize:"11px", fontWeight:800, color:c.accent }}>{c.pct}</div>
                                  <span className="rb-tip" style={{ position:"relative" as const }}>
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#3a4a5c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor:"help" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                    <span className="rb-tip-box">{c.tip}</span>
                                  </span>
                                </div>
                              </div>

                              {/* ── Status badge ── */}
                              {isAvail ? (
                                <div style={{ display:"inline-flex", alignItems:"center", gap:"5px", background:"#00d95f18", border:"1px solid #00d95f40", borderRadius:"20px", padding:"3px 10px", marginBottom:"12px" }}>
                                  <div className="rb-dot-pulse" style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#00d95f", flexShrink:0 }} />
                                  <span style={{ fontSize:"10px", fontWeight:800, color:"#00d95f", letterSpacing:"0.5px" }}>DISPONIBLE AHORA</span>
                                </div>
                              ) : c.locked ? (
                                <div style={{ display:"inline-flex", alignItems:"center", gap:"5px", background:"#1a2035", border:"1px solid #2a3448", borderRadius:"20px", padding:"3px 10px", marginBottom:"12px" }}>
                                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#4a5a70" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                  <span style={{ fontSize:"10px", fontWeight:700, color:"#4a5a70", letterSpacing:"0.5px" }}>BLOQUEADO · ACUMULANDO</span>
                                </div>
                              ) : (
                                <div style={{ display:"inline-flex", alignItems:"center", gap:"5px", background:"#0e1826", border:"1px solid #20283a", borderRadius:"20px", padding:"3px 10px", marginBottom:"12px" }}>
                                  <span style={{ fontSize:"10px", fontWeight:700, color:"#4a5568" }}>SIN SALDO AÚN</span>
                                </div>
                              )}

                              {/* ── Amount ── */}
                              <div style={{ marginBottom:"14px", position:"relative" as const, flex:1 }}>
                                <div style={{ fontSize:"10px", color:"#4a5568", letterSpacing:"0.8px", textTransform:"uppercase" as const, fontWeight:700, marginBottom:"6px" }}>
                                  {c.locked ? "Acumulado (bloqueado)" : "Disponible"}
                                </div>
                                <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                                  <div style={{ fontSize:"30px", fontWeight:900, color: isAvail ? "#00d95f" : c.locked ? c.accent+"99" : "#263040", letterSpacing:"-0.5px", transition:"color .3s", userSelect:"none" as const }}>
                                    {(c.locked && c.label !== "Instantáneo") ? "$\u2022\u2022\u2022\u2022\u2022\u2022" : `$${c.amount.toFixed(4)}`}
                                  </div>
                                </div>
                                {c.locked && c.amount > 0 && (
                                  <div className="rb-grow-pulse" style={{ fontSize:"10px", color:c.accent, fontWeight:600, marginTop:"4px", display:"flex", alignItems:"center", gap:"4px" }}>
                                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                                    Creciendo con cada apuesta
                                  </div>
                                )}
                              </div>

                              {/* ── Divider ── */}
                              <div style={{ height:"1px", background:border, marginBottom:"13px" }} />

                              {/* ── Action area ── */}
                              {c.locked ? (
                                <div>
                                  <div style={{ background:"#0a1120", border:"1px solid #1a2538", borderRadius:"10px", padding:"10px 13px", marginBottom:"10px", display:"flex", alignItems:"center", gap:"9px" }}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, opacity:0.7 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <div>
                                      <div style={{ fontSize:"9px", color:"#4a5568", letterSpacing:"1px", textTransform:"uppercase" as const, fontWeight:700 }}>Desbloquea en</div>
                                      <div style={{ fontSize:"15px", fontWeight:900, color:"#94a3b8", marginTop:"1px", letterSpacing:"-0.3px" }}>{c.timer || "—"}</div>
                                    </div>
                                  </div>
                                  <button disabled style={{ width:"100%", height:"40px", background:"#0e1826", border:`1px solid ${border}`, borderRadius:"10px", fontSize:"12px", fontWeight:700, color:"#2a3a4c", cursor:"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:"7px" }}>
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    Bloqueado
                                  </button>
                                </div>
                              ) : isAvail ? (
                                <button onClick={c.onClaim} className="rb-claim-btn"
                                  style={{ width:"100%", height:"44px", background:`linear-gradient(135deg,${c.accent},${c.accent}cc)`, border:"none", borderRadius:"10px", fontSize:"14px", fontWeight:900, color: c.accent === "#f4a91f" ? "#0a0a0a" : "#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", boxShadow:`0 4px 18px ${c.accent}50`, transition:"opacity .15s, transform .1s" }}
                                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.opacity="0.88"; b.style.transform="translateY(-1px)"; }}
                                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.opacity="1"; b.style.transform="translateY(0)"; }}>
                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  Reclamar ahora
                                </button>
                              ) : (
                                <button disabled style={{ width:"100%", height:"40px", background:"#0e1826", border:`1px solid ${border}`, borderRadius:"10px", fontSize:"12px", fontWeight:700, color:"#2a3a4c", cursor:"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:"7px" }}>
                                  Sin saldo
                                </button>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* ── Level-Up Rewards ─────────────────────────────────── */}
                  <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:"18px", padding:"22px", marginBottom:"14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"18px" }}>
                      <div style={{ width:"32px", height:"32px", borderRadius:"9px", background:"#f4a91f20", border:"1px solid #f4a91f35", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#f4a91f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize:"14px", fontWeight:800, color:"#c8d8ec" }}>Recompensas al Subir de Rango</div>
                        <div style={{ fontSize:"11px", color:"#4a5568", marginTop:"2px" }}>Bono instantáneo al alcanzar cada nuevo tier</div>
                      </div>
                    </div>
                    <div className="rb-rewards-grid" style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"10px" }}>
                      {[
                        { tier:"Bronze",   gradient:"linear-gradient(135deg,#cd7f32,#8b4513)", image:"/ranks/bronze-iii.png",   range:"$3 – $10",   color:"#cd7f32" },
                        { tier:"Silver",   gradient:"linear-gradient(135deg,#c0c0c0,#808090)", image:"/ranks/silver-iii.png",   range:"$10 – $40",  color:"#c0c0c0" },
                        { tier:"Gold",     gradient:"linear-gradient(135deg,#f4a91f,#c07800)", image:"/ranks/gold-iii.png",     range:"$40 – $200", color:"#f4a91f" },
                        { tier:"Platinum", gradient:"linear-gradient(135deg,#b8c8e8,#7080a0)", image:"/ranks/platinum-iii.png", range:"$200 – $1K", color:"#b8c8e8" },
                        { tier:"Emerald",  gradient:"linear-gradient(135deg,#4dd890,#1a8850)", image:"/ranks/emerald-iii.png",  range:"$1K – $7K",  color:"#4dd890" },
                      ].map(t => (
                        <div key={t.tier} style={{ background:"#0e1826", border:`1px solid ${border}`, borderRadius:"14px", padding:"16px 10px", textAlign:"center" as const, position:"relative", overflow:"hidden" }}>
                          <div style={{ position:"absolute", inset:0, background:t.gradient, opacity:0.04, pointerEvents:"none" }} />
                          <div style={{ width:"52px", height:"52px", borderRadius:"14px", overflow:"hidden", margin:"0 auto 8px", border:`1px solid ${t.color}40` }}>
                            <img src={t.image} alt={t.tier} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                          </div>
                          <div style={{ fontSize:"11px", fontWeight:800, background:t.gradient, WebkitBackgroundClip:"text" as const, WebkitTextFillColor:"transparent", marginBottom:"7px", letterSpacing:"0.4px" }}>{t.tier}</div>
                          <div style={{ fontSize:"15px", fontWeight:900, color:"#00d95f" }}>{t.range}</div>
                          <div style={{ fontSize:"9px", color:"#4a5568", marginTop:"5px", letterSpacing:"0.6px", textTransform:"uppercase" as const }}>al subir</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── All Ranks Grid ────────────────────────────────────── */}
                  <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:"18px", padding:"22px" }}>
                    {/* Section header */}
                    <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"22px" }}>
                      <div style={{ width:"32px", height:"32px", borderRadius:"9px", background:"#f4a91f20", border:"1px solid #f4a91f35", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#f4a91f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 4.9L20 8l-4 3.9.9 5.5L12 15l-4.9 2.4L8 11.9 4 8l5.6-.1z"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize:"14px", fontWeight:800, color:"#c8d8ec" }}>Todos los Rangos</div>
                        <div style={{ fontSize:"11px", color:"#4a5568", marginTop:"2px" }}>15 niveles · Bronze → Emerald · rakeback creciente</div>
                      </div>
                    </div>

                    {/* Tier groups */}
                    {(["Bronze","Silver","Gold","Platinum","Emerald"] as const).map(tier => {
                      const tierRanks = VIP_RANKS.map((r,i)=>({...r,i})).filter(r=>r.tier===tier);
                      const first = tierRanks[0];
                      const currentIdx = currentUser ? getVipInfo(vipWagered).idx : -1;
                      const tierActive = tierRanks.some(r => r.i === currentIdx);
                      return (
                        <div key={tier} style={{ marginBottom:"20px" }}>
                          {/* Tier header bar */}
                          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"10px" }}>
                            <div style={{ height:"1px", width:"12px", background:first.color, opacity:0.5 }} />
                            <div style={{ display:"flex", alignItems:"center", gap:"7px" }}>
                              <div style={{ width:"22px", height:"22px", borderRadius:"6px", overflow:"hidden", border:`1px solid ${first.color}50` }}>
                                <img src={`/ranks/${tier.toLowerCase()}-iii.png`} alt={tier} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                              </div>
                              <span style={{ fontSize:"12px", fontWeight:900, color:first.color, letterSpacing:"1.5px", textTransform:"uppercase" as const }}>{tier}</span>
                              {tierActive && <span style={{ fontSize:"10px", fontWeight:700, color:first.color, background:`${first.color}18`, border:`1px solid ${first.color}40`, borderRadius:"20px", padding:"1px 8px" }}>Tu categoría</span>}
                            </div>
                            <div style={{ flex:1, height:"1px", background:`linear-gradient(90deg,${first.color}30,transparent)` }} />
                          </div>

                          {/* Rank cards grid */}
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"10px" }}>
                            {tierRanks.map(r => {
                              const isCurrent = r.i === currentIdx;
                              return (
                                <div key={r.name} className={isCurrent ? "rank-card-current" : ""} style={{
                                  background: isCurrent ? `${r.color}10` : "#0b1321",
                                  border: isCurrent ? `1.5px solid ${r.color}80` : `1px solid #1a2538`,
                                  borderRadius:"14px",
                                  padding:"14px 14px 13px",
                                  position:"relative" as const,
                                  overflow:"hidden",
                                  transition:"border-color .2s, box-shadow .2s",
                                  boxShadow: isCurrent ? `0 0 18px ${r.color}30` : "none",
                                }}>
                                  {/* Gradient bg wash */}
                                  <div style={{ position:"absolute", inset:0, background:r.gradient, opacity: isCurrent ? 0.06 : 0.03, pointerEvents:"none" }} />

                                  {/* Current badge */}
                                  {isCurrent && (
                                    <div style={{ position:"absolute", top:"9px", right:"9px", background:r.color, borderRadius:"6px", padding:"2px 7px", fontSize:"9px", fontWeight:900, color:"#0a0a0a", letterSpacing:"0.5px", textTransform:"uppercase" as const }}>
                                      Tú
                                    </div>
                                  )}

                                  {/* Badge image */}
                                  <div style={{ width:"48px", height:"48px", borderRadius:"12px", overflow:"hidden", border:`1px solid ${r.color}${isCurrent?"60":"30"}`, marginBottom:"10px" }}>
                                    <img src={r.image} alt={r.name} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                                  </div>

                                  {/* Rank name */}
                                  <div style={{ fontSize:"13px", fontWeight:900, color: isCurrent ? r.color : "#c8d8ec", marginBottom:"8px", letterSpacing:"0.2px" }}>{r.name}</div>

                                  {/* Stats */}
                                  <div style={{ display:"flex", flexDirection:"column" as const, gap:"4px" }}>
                                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                      <span style={{ fontSize:"10px", color:"#4a5568", fontWeight:600 }}>Wager mín.</span>
                                      <span style={{ fontSize:"11px", color:"#94a3b8", fontWeight:700 }}>{fmtW(r.minWager)}</span>
                                    </div>
                                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                      <span style={{ fontSize:"10px", color:"#4a5568", fontWeight:600 }}>Wager máx.</span>
                                      <span style={{ fontSize:"11px", color:"#94a3b8", fontWeight:700 }}>{r.i === VIP_RANKS.length-1 ? "∞" : fmtW(r.nextWager)}</span>
                                    </div>
                                    <div style={{ height:"1px", background:"#1a2538", margin:"3px 0" }} />
                                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                      <span style={{ fontSize:"10px", color:"#4a5568", fontWeight:600 }}>Rakeback</span>
                                      <span style={{ fontSize:"13px", fontWeight:900, color: r.color }}>{(r.rakebackPct*100).toFixed(1)}%</span>
                                    </div>
                                    {/* Pending rank reward claim — shown on whichever rank card matches the pending reward */}
                                    {rankPendingReward && rankPendingReward.rankName === r.name && (
                                      <>
                                        <div style={{ height:"1px", background:"#1a2538", margin:"6px 0 8px" }} />
                                        <div style={{ background:`${r.color}12`, border:`1px solid ${r.color}35`, borderRadius:"9px", padding:"8px 10px", marginBottom:"2px" }}>
                                          <div style={{ fontSize:"9px", fontWeight:800, color:r.color, letterSpacing:"1px", textTransform:"uppercase" as const, marginBottom:"4px" }}>🎁 Recompensa</div>
                                          <div style={{ fontSize:"16px", fontWeight:900, color:"#22c55e", marginBottom:"6px" }}>+${rankPendingReward.amount.toFixed(2)}</div>
                                          <button onClick={claimRankReward}
                                            style={{ width:"100%", background:r.gradient, border:"none", borderRadius:"7px", padding:"7px 0", fontSize:"12px", fontWeight:800, color:"#fff", cursor:"pointer", boxShadow:`0 3px 12px ${r.color}44`, fontFamily:"'Inter',sans-serif" }}>
                                            Reclamar
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
        )}
        {section==="referrals" && (
          <section style={{ minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column" }}>
            <div style={{ flex:1, minHeight:"calc(100vh - 70px)" }}>
              <AffiliateProgram username={currentUser} t={t} hideReferredTable onRegister={()=>setAuthModal("register")} />
            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
        )}
        {section==="referrals-profile" && (
          <section style={{ minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column", fontFamily:"'Inter',sans-serif" }}>
            <div style={{ minHeight:"calc(100vh - 70px)" }}>
              <div style={{ maxWidth:"1080px", margin:"0 auto", padding:"0 20px", boxSizing:"border-box" as const }}>
                <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"18px" }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f4a91f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <span style={{ fontSize:"14px", fontWeight:800, letterSpacing:"1.4px", textTransform:"uppercase" as const, color:"#c8d8ec" }}>Referidos</span>
                </div>
              </div>
              <AffiliateProgram username={currentUser} t={t} dashboardOnly hideReferredTable onRegister={()=>setAuthModal("register")} />
            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
        )}
        {section==="privacy" && (
          <section style={{ animation:"nlsfadeIn 0.25s ease", minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column" }}>
            <div style={{ maxWidth:"860px",margin:"0 auto", minHeight:"calc(100vh - 70px)" }}>
              <div style={{ marginBottom:"32px",paddingBottom:"20px",borderBottom:"1px solid #20283a" }}>
                <h1 style={{ margin:0,color:"#e2e8f0",fontSize:"22px",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase" }}>Política de Privacidad</h1>
              </div>

              {([
                { num:"1.0", title:"Introducción", body:[
                  "Tu privacidad es fundamental para nosotros. En Mander Casino nos comprometemos a salvaguardar tus datos personales y a actuar con total transparencia sobre la información que gestionamos. Te informaremos de manera clara sobre tus opciones y los derechos que tienes respecto a tus datos.",
                  "Esta Política de Privacidad explica de qué forma Mander Casino recopila, emplea y protege tu información cuando accedes a nuestra plataforma.",
                  "Si no estás de acuerdo con cualquier punto de esta política, te pedimos que te abstengas de utilizar nuestra plataforma. Al registrar una cuenta, confirmas que has leído y aceptas en su totalidad nuestros Términos y Condiciones y esta Política de Privacidad. Puedes dejar de usar la plataforma cuando quieras; no obstante, podríamos conservar ciertos datos si así lo requiere la normativa vigente.",
                  "Esta política puede ser actualizada periódicamente. Te recomendamos consultarla de forma regular."
                ]},
                { num:"2.0", title:"¿Quién gestiona tu información?", body:[
                  "En este documento, «Mander», «nosotros», «nuestra» y «nos» hacen referencia a Mander Casino. Gestionamos y procesamos tus datos en servidores situados en las jurisdicciones correspondientes. Si tienes dudas sobre nuestras prácticas de datos, puedes contactarnos a través de nuestros canales de soporte."
                ]},
                { num:"3.0", title:"Información que recopilamos sobre ti", subSections:[
                  { title:"Datos de identificación personal", body:[
                    "Recabamos determinada información que nos proporcionas durante el registro, el uso de la plataforma y la interacción con nuestros servicios. Esta información es necesaria para acceder a ciertas funciones. La recogemos cuando:",
                    ["Creas una cuenta en Mander Casino.", "Facilitas tus datos voluntariamente al utilizar la plataforma.", "Compartes información de forma pública dentro de nuestra comunidad.", "Te pones en contacto con nuestro equipo de soporte."],
                    "La información que podemos recopilar incluye:",
                    ["Nombre de usuario o alias.", "Dirección de correo electrónico.", "Historial de actividad y apuestas.", "Preferencias de configuración en la plataforma.", "Cualquier dato adicional que decidas compartir con nosotros.", "Información de métodos de pago, incluyendo tarjetas de crédito o débito."],
                    "Estos datos se usan de forma interna y no se ceden a terceros, salvo en los supuestos recogidos en esta política."
                  ]},
                  { title:"Datos no identificables y análisis de uso", body:[
                    "Con el fin de mejorar nuestra plataforma, recopilamos información sobre cómo interactúan los usuarios con Mander Casino sin identificarlos de manera personal. Esto puede incluir la dirección IP, horarios de conexión, secciones visitadas, idioma seleccionado, tipo de dispositivo o navegador, y registros de errores."
                  ]}
                ]},
                { num:"4.0", title:"Cómo y por qué usamos tu información personal", body:[
                  "Procesamos tus datos personales con los siguientes objetivos:",
                  ["Brindarte los servicios o funciones que hayas solicitado.", "Cumplir con las normativas legales y reglamentarias aplicables.", "Analizar y optimizar el rendimiento de nuestra plataforma.", "Enviarte comunicaciones promocionales, únicamente si has dado tu consentimiento."],
                  "Para cada uno de estos fines, puedes tener derechos específicos sobre tus datos, que describimos con más detalle a continuación."
                ]},
                { num:"5.0", title:"Tus derechos", subSections:[
                  { title:"Derecho de rectificación", body:["Si consideras que algún dato personal que conservamos sobre ti es erróneo o está desactualizado, puedes solicitarnos su corrección. Contacta con nuestro soporte para gestionar la actualización de tu información."] },
                  { title:"Derecho de acceso", body:["Para obtener una copia de los datos que tenemos registrados sobre ti, ponte en contacto con nuestro equipo de soporte. Es posible que te solicitemos verificación de identidad antes de procesar tu solicitud."] }
                ]},
                { num:"6.0", title:"Compartir tu información", body:[
                  "Podemos compartir tus datos con terceros en los siguientes casos:",
                  ["Para cumplir con obligaciones legales o regulatorias.", "Para hacer cumplir nuestras políticas y condiciones de uso.", "Para colaborar con proveedores externos de confianza que nos ayudan a ofrecer nuestros servicios.", "Si se detectan conductas fraudulentas o perjudiciales.", "Cuando hayas prestado tu consentimiento explícito."],
                  "Los datos podrían almacenarse o procesarse fuera de tu país de residencia, incluso en territorios con marcos normativos de protección de datos distintos. Adoptamos todas las medidas necesarias para garantizar que tu información sea tratada con seguridad, independientemente del lugar donde se procese."
                ]},
                { num:"7.0", title:"Seguridad", body:[
                  "La protección de tu información es una prioridad para nosotros. Tus datos se almacenan en entornos cifrados y protegidos con contraseña, resguardados detrás de sistemas de seguridad avanzados."
                ]},
                { num:"8.0", title:"Conservación de datos", body:[
                  "Mantenemos tus datos personales únicamente durante el tiempo imprescindible para satisfacer nuestras obligaciones legales o comerciales. Una vez que los datos dejan de ser necesarios, los eliminamos de manera segura o los anonimizamos."
                ]},
                { num:"9.0", title:"Sitios y servicios externos", body:[
                  "Nuestra plataforma puede incluir enlaces a sitios web de terceros. Estos sitios funcionan de manera autónoma respecto a Mander Casino, por lo que no somos responsables de su contenido ni de sus políticas de privacidad. La información que esos sitios recopilen se rige exclusivamente por sus propias normativas."
                ]},
                { num:"10.0", title:"Limitación de responsabilidad", body:[
                  "Mander Casino presta sus servicios «tal como están» y «según disponibilidad». Aunque hacemos todo lo posible por proteger tu información, no podemos garantizar un funcionamiento libre de errores en todo momento, ni asumimos responsabilidad por eventos que estén fuera de nuestro control."
                ]},
              ] as { num:string; title:string; body?:(string|string[])[]; subSections?:{title:string;body:(string|string[])[]}[] }[]).map(sec => (
                <div key={sec.num} style={{ marginBottom:"28px" }}>
                  <h2 style={{ color:"#e2e8f0",fontSize:"14px",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:"12px",marginTop:0 }}>
                    {sec.num} {sec.title}
                  </h2>
                  {sec.body && sec.body.map((item,i) =>
                    Array.isArray(item)
                      ? <ul key={i} style={{ margin:"8px 0 8px 0",padding:0,listStyle:"none" }}>{item.map((li,j)=><li key={j} style={{ color:"#94a3b8",fontSize:"14px",lineHeight:1.8,paddingLeft:"14px",position:"relative" }}><span style={{ position:"absolute",left:0,color:"#f6b531" }}>·</span>{li}</li>)}</ul>
                      : <p key={i} style={{ color:"#94a3b8",fontSize:"14px",lineHeight:1.8,margin:"0 0 10px" }}>{item}</p>
                  )}
                  {sec.subSections && sec.subSections.map(sub => (
                    <div key={sub.title} style={{ marginBottom:"16px" }}>
                      <h3 style={{ color:"#c8d8ec",fontSize:"12px",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:"8px",marginTop:"16px" }}>{sub.title}</h3>
                      {sub.body.map((item,i) =>
                        Array.isArray(item)
                          ? <ul key={i} style={{ margin:"8px 0 8px 0",padding:0,listStyle:"none" }}>{item.map((li,j)=><li key={j} style={{ color:"#94a3b8",fontSize:"14px",lineHeight:1.8,paddingLeft:"14px",position:"relative" }}><span style={{ position:"absolute",left:0,color:"#f6b531" }}>·</span>{li}</li>)}</ul>
                          : <p key={i} style={{ color:"#94a3b8",fontSize:"14px",lineHeight:1.8,margin:"0 0 10px" }}>{item}</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}

            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
        )}
        {section==="fairness" && (()=>{
          const fIcons:{[k:string]:(size:number,color?:string)=>React.ReactNode} = {
            Dice:   (s,c="currentColor")=><svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="8" cy="8" r="1.3" fill={c} stroke="none"/><circle cx="16" cy="8" r="1.3" fill={c} stroke="none"/><circle cx="12" cy="12" r="1.3" fill={c} stroke="none"/><circle cx="8" cy="16" r="1.3" fill={c} stroke="none"/><circle cx="16" cy="16" r="1.3" fill={c} stroke="none"/></svg>,
            Plinko: (s,c="currentColor")=><svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="4.5" r="2.5"/><line x1="12" y1="7" x2="12" y2="10"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="5" y1="15" x2="19" y2="15"/><line x1="3" y1="20" x2="21" y2="20"/><line x1="9" y1="10" x2="7" y2="15"/><line x1="15" y1="10" x2="17" y2="15"/></svg>,
            Keno:   (s,c="currentColor")=><svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
            Blackjack:(s,c="currentColor")=><svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="13" height="17" rx="2"/><rect x="9" y="2" width="13" height="17" rx="2"/></svg>,
            Mines:  (s,c="currentColor")=><svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="5"/><line x1="12" y1="8" x2="12" y2="5"/><line x1="7.5" y1="9.5" x2="5.5" y2="7.5"/><line x1="16.5" y1="9.5" x2="18.5" y2="7.5"/><line x1="7" y1="13" x2="4" y2="13"/><line x1="17" y1="13" x2="20" y2="13"/></svg>,
            Hilo:   (s,c="currentColor")=><svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="12" height="16" rx="2"/><polyline points="18 4 21 7 18 10"/><polyline points="18 14 21 17 18 20"/><line x1="21" y1="7" x2="21" y2="17"/></svg>,
            Roulette:(s,c="currentColor")=><svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/><line x1="2" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="22" y2="12"/></svg>,
            Baccarat:(s,c="currentColor")=><svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="12" height="16" rx="2"/><rect x="11" y="2" width="12" height="16" rx="2"/></svg>,
          };
          const fGames = [
            {
              key:"Dice", label:"Dice", color:"#4a9eff", soon:false,
              how:"Mander Dice es un juego de dados donde tú eliges un número objetivo y apuestas a que el resultado cae por encima o por debajo de ese número. El rango va del 0 al 100, y puedes ajustar tu probabilidad de ganar según tu estrategia.",
              sections:[
                { title:"Cómo se determina el resultado", body:"Cada tirada genera un número entre 0 y 100 de forma completamente aleatoria en el momento exacto en que confirmas tu apuesta. Ningún sistema interno ni externo puede predecir o influir en el resultado antes de que ocurra." },
                { title:"Sistema de aleatoriedad", body:"Utilizamos generadores de números aleatorios de alta entropía, independientes del casino. Esto significa que cada resultado es estadísticamente impredecible y no está relacionado con tiradas anteriores o futuras." },
                { title:"Sin ventaja oculta", body:"El house edge de Mander Dice es fijo, visible y no varía entre rondas. No existe ningún mecanismo que ajuste los resultados según tu historial de apuestas o tu balance actual." },
              ],
              tags:["Resultados 100% aleatorios","House edge fijo y visible","Sin memoria entre rondas"],
            },
            {
              key:"Plinko", label:"Plinko", color:"#f97316", soon:false,
              how:"En Mander Plinko, una pelota cae desde la parte superior de un tablero de clavijas y rebota aleatoriamente hasta aterrizar en una de las ranuras inferiores, cada una con un multiplicador distinto.",
              sections:[
                { title:"Cómo se determina la trayectoria", body:"La trayectoria de la pelota se calcula a partir de un proceso de decisión aleatorio en cada clavija. En cada punto de bifurcación, la pelota tiene una probabilidad igual de ir a la izquierda o a la derecha, lo que hace que el destino final sea imposible de predecir." },
                { title:"Física del juego", body:"El movimiento de la pelota simula física real con aleatoriedad pura en cada rebote. El casino no tiene control sobre en qué ranura aterrizará la pelota una vez que inicia su caída." },
                { title:"Transparencia de multiplicadores", body:"Los multiplicadores de cada ranura son fijos y visibles antes de realizar tu apuesta. El juego no ajusta los multiplicadores ni el comportamiento de la pelota en función de tu historial." },
              ],
              tags:["Trayectoria generada aleatoriamente","Multiplicadores fijos y visibles","Sin interferencia externa"],
            },
            {
              key:"Keno", label:"Keno", color:"#f4a91f", soon:false,
              how:"Mander Keno es un juego de lotería donde seleccionas entre 1 y 10 números del 1 al 40. Luego el sistema extrae una serie de números ganadores de forma aleatoria y recibes un premio según cuántos de tus números coinciden.",
              sections:[
                { title:"Cómo se extraen los números", body:"Los números ganadores se seleccionan mediante un generador de números aleatorios que garantiza que cada número del tablero tiene exactamente la misma probabilidad de ser elegido. El proceso de extracción es completamente independiente de los números que hayas seleccionado." },
                { title:"Imparcialidad garantizada", body:"El casino no tiene información sobre qué números elegiste en el momento de la extracción. Los resultados no pueden ser ajustados para favorecer o perjudicar a ningún jugador en particular." },
                { title:"Tabla de premios", body:"Los multiplicadores y premios para cada cantidad de aciertos son fijos y están disponibles antes de realizar tu apuesta. No existen cambios dinámicos en los premios según el balance de la sala." },
              ],
              tags:["Extracción completamente aleatoria","Probabilidades iguales para todos","Premios fijos y transparentes"],
            },
            {
              key:"Blackjack", label:"Blackjack", color:"#06b6d4", soon:false,
              how:"Mander Blackjack es el clásico juego de cartas donde el objetivo es llegar lo más cerca posible a 21 sin pasarse, superando al dealer. Puedes pedir carta, plantarte, doblar o dividir según tu mano.",
              sections:[
                { title:"Cómo se reparten las cartas", body:"Antes de cada ronda, la baraja completa se mezcla de forma aleatoria utilizando un algoritmo de barajado estándar. Cada carta repartida se extrae de esta baraja mezclada sin ningún tipo de pre-selección ni manipulación." },
                { title:"El dealer no tiene ventaja oculta", body:"Las reglas del dealer están fijas y son visibles: el dealer siempre pide carta con 16 o menos y se planta con 17 o más. Esta regla no cambia entre partidas ni se ajusta según el resultado de rondas anteriores." },
                { title:"Sin cartas marcadas", body:"No existe ningún mecanismo que permita al casino saber de antemano qué cartas tienen los jugadores. El proceso de reparto es ciego para todos los sistemas del casino hasta que las cartas se revelan." },
              ],
              tags:["Baraja mezclada aleatoriamente","Reglas del dealer fijas","Sin ventaja oculta"],
            },
            {
              key:"Mines", label:"Mines", color:"#22c55e", soon:false,
              how:"En Mander Mines, se ocultan un número de minas en una cuadrícula. Debes revelar casillas sin tocar ninguna mina para acumular ganancias. Cuanto más avances, mayor será tu multiplicador.",
              sections:[
                { title:"Cómo se colocan las minas", body:"Las posiciones de todas las minas se determinan de forma aleatoria en el instante en que confirmas tu apuesta, antes de que hagas tu primera selección. Una vez colocadas, sus posiciones no cambian durante la ronda." },
                { title:"El casino no conoce tu estrategia", body:"El sistema que coloca las minas opera de forma independiente a tu comportamiento de juego. Las posiciones de las minas no se ajustan en respuesta a las casillas que hayas elegido o tu historial de partidas." },
                { title:"Multiplicadores progresivos", body:"Los multiplicadores que obtienes al revelar cada casilla segura son fijos y calculados en base a las probabilidades reales del juego. No existen ajustes dinámicos que alteren tu potencial de ganancia durante una ronda activa." },
              ],
              tags:["Posiciones fijadas al inicio","Sin ajustes durante la ronda","Multiplicadores calculados con probabilidades reales"],
            },
            {
              key:"Hilo", label:"Hilo", color:"#a855f7", soon:false,
              how:"Mander Hilo es un juego de cartas donde se revela una carta y debes predecir si la siguiente será mayor o menor. Cada predicción correcta incrementa tu multiplicador.",
              sections:[
                { title:"Cómo se generan las cartas", body:"Cada carta revelada se extrae de forma aleatoria de una baraja estándar mezclada. El sistema no tiene información sobre qué carta saldrá a continuación al momento de mostrarte la carta actual." },
                { title:"Predicciones sin trampa", body:"Las probabilidades de que la siguiente carta sea mayor o menor son calculadas en base a las cartas que ya salieron. El casino no manipula la siguiente carta para invalidar tu predicción." },
                { title:"Riesgo ajustable", body:"Puedes elegir entre opciones de mayor o menor riesgo según tu estrategia. Los multiplicadores asociados reflejan con precisión las probabilidades reales de cada opción." },
              ],
              tags:["Cartas extraídas aleatoriamente","Probabilidades calculadas en tiempo real","Sin manipulación de resultados"],
            },
            {
              key:"Roulette", label:"Ruleta", color:"#f43f5e", soon:false,
              how:"Mander Ruleta ofrece la experiencia clásica del casino con una ruleta europea. Apuesta a un número, color, par/impar o grupo de números y observa dónde cae la bola.",
              sections:[
                { title:"Cómo se determina el número ganador", body:"Cada giro de la ruleta produce un número completamente aleatorio entre 0 y 36. El proceso es instantáneo y ocurre en el momento exacto del giro, sin pre-determinación ni ciclos predecibles." },
                { title:"Ruleta europea", body:"Mander Ruleta utiliza el formato europeo con un solo cero, lo que ofrece mejores probabilidades para el jugador en comparación con la versión americana. El house edge es fijo y transparente." },
                { title:"Cada giro es independiente", body:"El resultado de un giro no tiene ninguna relación estadística con los giros anteriores. No existen patrones, ciclos ni ajustes que hagan que ciertos números salgan con más o menos frecuencia a lo largo del tiempo." },
              ],
              tags:["Número aleatorio por giro","Ruleta europea (un solo cero)","Cada giro es independiente"],
            },
            {
              key:"Baccarat", label:"Baccarat", color:"#eab308", soon:false,
              how:"Mander Baccarat utiliza un mazo de 8 barajas estándar barajado de forma aleatoria antes de cada ronda. Las cartas se reparten siguiendo las reglas clásicas del Punto Banco: el jugador y el banquero reciben dos cartas cada uno, y se puede agregar una tercera carta según reglas fijas. Puedes apostar al Jugador, al Banquero (con 5% de comisión sobre las ganancias) o al Empate.",
              sections:[
                { title:"Aleatoriedad del mazo", body:"Cada ronda de Baccarat extrae cartas de un mazo de 8 barajas barajado con el mismo sistema de aleatoriedad auditado que usamos en todos nuestros juegos. Cuando quedan menos de 15 cartas, el mazo se rebaraja automáticamente para garantizar imparcialidad total en cada mano." },
                { title:"Reglas de la tercera carta", body:"Las reglas de la tercera carta son fijas y públicas: el Jugador pide carta si su total es 0–5; el Banquero pide carta según su total y la tercera carta del Jugador siguiendo el cuadro estándar del Punto Banco. No hay decisiones discrecionales del casino — el resultado sigue siempre las mismas reglas deterministas." },
                { title:"Comisión del Banquero", body:"La apuesta al Banquero paga con una comisión del 5% sobre las ganancias netas, lo cual refleja la ligera ventaja estadística que tiene el Banquero según las reglas del juego. El Empate paga 8x la apuesta. Todas las comisiones y pagos se calculan automáticamente y son visibles antes de apostar." },
              ],
              tags:["Mazo de 8 barajas auditado","Reglas Punto Banco estándar","Comisión 5% en Banquero"],
            },
          ] as {key:string;label:string;color:string;soon:boolean;how:string;sections:{title:string;body:string}[];tags:string[]}[];
          const activeGame = fGames.find(g=>g.key===fairnessGame) || fGames[0];
          return (
          <section style={{ animation:"nlsfadeIn 0.25s ease", minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column" }}>
            <div style={{ maxWidth:"1080px",margin:"0 auto",padding:"0 20px", minHeight:"calc(100vh - 70px)" }}>

              {/* Header */}
              <div style={{ marginBottom:"28px",paddingBottom:"20px",borderBottom:"1px solid #20283a" }}>
                <div style={{ display:"flex",alignItems:"center",gap:"12px",marginBottom:"10px" }}>
                  <div style={{ width:"38px",height:"38px",borderRadius:"10px",background:"linear-gradient(135deg,#f6b531,#e9970d)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                  </div>
                  <h1 style={{ margin:0,color:"#e2e8f0",fontSize:"22px",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase" }}>Juego Justo y Transparente</h1>
                </div>
                <p style={{ margin:0,color:"#94a3b8",fontSize:"14px",lineHeight:1.8,maxWidth:"700px" }}>
                  En Mander Casino, la confianza de nuestros jugadores es nuestra prioridad. Todos nuestros juegos originales están diseñados con sistemas independientes que garantizan resultados completamente aleatorios, sin interferencia externa ni manipulación de ningún tipo.
                </p>
              </div>

              {/* Game tabs */}
              <div style={{ display:"flex",flexWrap:"wrap" as const,gap:"8px",marginBottom:"24px" }}>
                {fGames.map(g=>(
                  <button key={g.key} onClick={()=>setFairnessGame(g.key)}
                    style={{ padding:"8px 16px",borderRadius:"8px",border: fairnessGame===g.key ? `1px solid ${g.color}` : "1px solid #20283a",background: fairnessGame===g.key ? `${g.color}18` : "#161d2b",color: fairnessGame===g.key ? g.color : "#94a3b8",fontWeight: fairnessGame===g.key ? 700 : 500,fontSize:"13px",cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",gap:"6px",opacity:g.soon?0.6:1 }}>
                    {fIcons[g.key]?.(16, fairnessGame===g.key ? g.color : "#94a3b8")}{g.label}{g.soon && <span style={{ fontSize:"10px",color:"#94a3b8" }}>·Pronto</span>}
                  </button>
                ))}
              </div>

              {/* Game detail panel */}
              <div key={activeGame.key} style={{ background:"#111827",border:`1px solid #1e2a3d`,borderRadius:"14px",overflow:"hidden",animation:"nlsfadeIn 0.2s ease" }}>
                {/* Panel header */}
                <div style={{ padding:"20px 24px",borderBottom:"1px solid #20283a",display:"flex",alignItems:"center",gap:"14px" }}>
                  <div style={{ width:"48px",height:"48px",borderRadius:"12px",background:`${activeGame.color}18`,border:`1px solid ${activeGame.color}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{fIcons[activeGame.key]?.(26, activeGame.color)}</div>
                  <div>
                    <div style={{ color:"#e2e8f0",fontWeight:700,fontSize:"16px",marginBottom:"2px" }}>Cómo funciona {activeGame.label}</div>
                    <div style={{ color:"#94a3b8",fontSize:"12px" }}>Mander Originals · {activeGame.soon ? "Próximamente" : "Disponible ahora"}</div>
                  </div>
                  {!activeGame.soon && <span style={{ marginLeft:"auto",background:`${activeGame.color}18`,color:activeGame.color,fontSize:"11px",fontWeight:600,padding:"4px 10px",borderRadius:"999px",border:`1px solid ${activeGame.color}30`,whiteSpace:"nowrap" as const }}>✓ Auditado</span>}
                </div>

                {/* Overview */}
                <div style={{ padding:"20px 24px",borderBottom:"1px solid #1e2a3d" }}>
                  <p style={{ color:"#c8d8ec",fontSize:"14px",lineHeight:1.8,margin:0 }}>{activeGame.how}</p>
                </div>

                {/* Sections */}
                <div style={{ padding:"20px 24px",display:"flex",flexDirection:"column" as const,gap:"20px" }}>
                  {activeGame.sections.map((s,i)=>(
                    <div key={i}>
                      <div style={{ color:"#e2e8f0",fontWeight:700,fontSize:"13px",letterSpacing:"0.5px",textTransform:"uppercase" as const,marginBottom:"8px" }}>{s.title}</div>
                      <p style={{ color:"#94a3b8",fontSize:"13px",lineHeight:1.8,margin:0 }}>{s.body}</p>
                    </div>
                  ))}
                </div>

                {/* Tags */}
                <div style={{ padding:"0 24px 20px",display:"flex",flexWrap:"wrap" as const,gap:"8px" }}>
                  {activeGame.tags.map((tag,ti)=>(
                    <span key={ti} style={{ background:"#161d2b",border:"1px solid #20283a",color:"#c8d8ec",fontSize:"11px",padding:"5px 12px",borderRadius:"999px" }}>✓ {tag}</span>
                  ))}
                </div>
              </div>

              {/* Bottom info */}
              <div style={{ marginTop:"24px",background:"#161d2b",border:"1px solid #20283a",borderRadius:"14px",padding:"20px 22px",display:"flex",gap:"16px",alignItems:"flex-start" }}>
                <div style={{ flexShrink:0,marginTop:"1px" }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f6b531" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div>
                  <div style={{ color:"#e2e8f0",fontWeight:700,fontSize:"13px",marginBottom:"6px" }}>¿Qué significa Juego Justo?</div>
                  <p style={{ color:"#94a3b8",fontSize:"13px",lineHeight:1.8,margin:0 }}>
                    Un juego justo garantiza que los resultados son completamente imparciales: ni el casino, ni ningún sistema interno, puede influir en el desenlace de una ronda. En Mander Casino, todos nuestros juegos originales se rigen por este principio. No importa quién esté jugando ni cuánto haya apostado — cada resultado es único, aleatorio e inalterable.
                  </p>
                </div>
              </div>

            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
          );
        })()}
        {section==="terms" && (
          <section style={{ animation:"nlsfadeIn 0.25s ease", minHeight:"calc(100vh - 70px)", display:"flex", flexDirection:"column" }}>
            <div style={{ maxWidth:"860px",margin:"0 auto", minHeight:"calc(100vh - 70px)" }}>
              <div style={{ marginBottom:"32px",paddingBottom:"20px",borderBottom:"1px solid #20283a" }}>
                <h1 style={{ margin:0,color:"#e2e8f0",fontSize:"22px",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase" }}>Términos de Servicio</h1>
                <p style={{ margin:"10px 0 0",color:"#94a3b8",fontSize:"13px" }}>Última actualización: Marzo 2025</p>
              </div>

              <p style={{ color:"#94a3b8",fontSize:"14px",lineHeight:1.8,margin:"0 0 28px" }}>
                Estos Términos de Servicio («Términos») definen las reglas y condiciones para el uso del sitio web de Mander Casino y sus servicios relacionados. Al acceder o usar la plataforma, aceptas cumplir con estos Términos.
              </p>

              {([
                { num:"1", title:"Elegibilidad", items:[
                  "Tienes al menos 18 años o cumples con la edad legal para jugar en tu jurisdicción.",
                  "No accedes a la plataforma desde un país restringido.",
                  "Eres responsable de asegurarte de que el uso de la plataforma sea legal en tu ubicación.",
                ] },
                { num:"2", title:"Datos de la empresa", body:"Manderbet.com es operado por Mander Group Ltd., número de registro 27481, con domicilio social en Kingstown, San Vicente y las Granadinas. Mander opera bajo la Licencia de Juegos de Curaçao N.º 365/JAZ. Para consultas, contáctanos en: support@manderbet.com" },
                { num:"3", title:"Cuentas de usuario", items:[
                  "Cada usuario solo puede crear una cuenta.",
                  "Toda la información proporcionada durante el registro debe ser precisa y mantenerse actualizada.",
                  "Está estrictamente prohibido el uso de herramientas automatizadas, bots o scripts.",
                  "Las cuentas no pueden compartirse, transferirse ni venderse.",
                ], extra:"Eres el único responsable de mantener la confidencialidad de tu cuenta y de cualquier actividad que ocurra en ella." },
                { num:"4", title:"Pagos", items:[
                  "Mander admite depósitos y retiros mediante criptomonedas seleccionadas.",
                  "Se debe cumplir un requisito de apuesta mínima de 1× el importe del depósito antes de procesar los retiros.",
                  "La plataforma se reserva el derecho de revisar, retrasar o rechazar transacciones si se detecta actividad irregular.",
                ], extra:"Los jugadores son responsables de los impuestos u obligaciones financieras en su jurisdicción." },
                { num:"5", title:"Programa de referidos", items:[
                  "Las comisiones se calculan como un porcentaje fijo de los Ingresos Netos de Juego (NGR) generados por los jugadores referidos.",
                  "Cualquier uso indebido del sistema de referidos, incluidas las auto-referencias o cuentas coordinadas, está prohibido.",
                  "Mander se reserva el derecho de modificar o cancelar las recompensas de afiliados en casos de abuso.",
                ] },
                { num:"6", title:"Conductas prohibidas", items:[
                  "Crear u operar múltiples cuentas.",
                  "Explotar bonos, promociones o mecánicas del sistema.",
                  "Usar automatización o herramientas de terceros para obtener ventaja.",
                  "Participar en actividades fraudulentas, colusorias o ilegales.",
                ], extra:"Las infracciones pueden resultar en el cierre de la cuenta y la pérdida de fondos." },
                { num:"7", title:"Acciones sobre la cuenta", body:"Mander se reserva el derecho de suspender o cerrar permanentemente cualquier cuenta a su discreción si se incumplen estos Términos o si se identifica un comportamiento sospechoso." },
                { num:"8", title:"Juego responsable", body:"Mander fomenta el juego responsable. Los usuarios deben tratar el juego como entretenimiento y evitar arriesgar más de lo que pueden permitirse perder." },
                { num:"9", title:"Descargo de responsabilidad", items:[
                  "Pérdidas financieras derivadas del juego.",
                  "Interrupciones o problemas técnicos fuera de nuestro control.",
                  "Servicios externos o contenido de terceros.",
                ], intro:"Mander Casino no se hace responsable de:", extra:"Todos los servicios se proporcionan «tal como están»." },
                { num:"10", title:"Modificaciones", body:"Mander puede actualizar estos Términos en cualquier momento. El uso continuado de la plataforma tras la publicación de cambios implica la aceptación de los Términos revisados." },
                { num:"11", title:"Marco legal", body:"Estos Términos se rigen por las regulaciones aplicables bajo la Licencia de Juegos de Curaçao." },
                { num:"12", title:"Soporte", body:"Si tienes preguntas sobre estos Términos, contáctanos en: support@manderbet.com" },
              ] as {num:string;title:string;body?:string;items?:string[];intro?:string;extra?:string}[]).map(sec => (
                <div key={sec.num} style={{ marginBottom:"28px" }}>
                  <h2 style={{ color:"#e2e8f0",fontSize:"14px",fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:"12px",marginTop:0 }}>
                    {sec.num}. {sec.title}
                  </h2>
                  {sec.intro && <p style={{ color:"#94a3b8",fontSize:"14px",lineHeight:1.8,margin:"0 0 8px" }}>{sec.intro}</p>}
                  {sec.body && <p style={{ color:"#94a3b8",fontSize:"14px",lineHeight:1.8,margin:"0 0 8px" }}>{sec.body}</p>}
                  {sec.items && (
                    <ul style={{ margin:"0 0 8px 0",padding:0,listStyle:"none" }}>
                      {sec.items.map((li,i) => (
                        <li key={i} style={{ color:"#94a3b8",fontSize:"14px",lineHeight:1.8,paddingLeft:"14px",position:"relative" }}>
                          <span style={{ position:"absolute",left:0,color:"#f6b531" }}>·</span>{li}
                        </li>
                      ))}
                    </ul>
                  )}
                  {sec.extra && <p style={{ color:"#94a3b8",fontSize:"14px",lineHeight:1.8,margin:"8px 0 0" }}>{sec.extra}</p>}
                </div>
              ))}
            </div>
            <CasinoFooter onHome={showHomeView} />
          </section>
        )}
        {section==="admin" && (
          <section style={{ animation:"nlsfadeIn 0.25s ease", minHeight:"calc(100vh - 70px)" }}>
            <AdminPanel />
          </section>
        )}
      </main>

      {/* RANK CREDIT TOAST — success notification after claiming */}
      {rankCreditToast && createPortal(
        <div style={{ position:"fixed", top:"16px", right:"16px", zIndex:1801, maxWidth:"320px", width:"calc(100% - 32px)", animation:"vip-reveal .35s cubic-bezier(.22,.68,0,1.2)" }}>
          <div style={{ background:"#0d1f14", border:`1px solid #22c55e55`, borderLeft:"3px solid #22c55e", borderRadius:"14px", padding:"14px 16px", boxShadow:"0 8px 32px rgba(0,0,0,.6), 0 0 24px #22c55e18", display:"flex", gap:"12px", alignItems:"center" }}>
            {/* Icon */}
            <div style={{ width:"40px", height:"40px", borderRadius:"10px", background:"#22c55e18", border:"1px solid #22c55e40", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            {/* Text */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:"12px", fontWeight:800, color:"#e2e8f0", marginBottom:"2px" }}>¡Recompensa acreditada!</div>
              <div style={{ fontSize:"11px", color:"#4a6a4a", lineHeight:1.4 }}>
                Se acreditaron <span style={{ color:"#22c55e", fontWeight:700 }}>${rankCreditToast.amount.toFixed(2)}</span> por subir a <span style={{ background:rankCreditToast.gradient, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", fontWeight:700 }}>{rankCreditToast.rankName}</span>
              </div>
            </div>
            {/* Dismiss */}
            <button onClick={()=>setRankCreditToast(null)}
              style={{ background:"transparent", border:"none", color:"#2a4a2a", cursor:"pointer", fontSize:"16px", flexShrink:0, padding:"2px 4px", lineHeight:1 }}>
              ×
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* RANK REWARD TOAST — top-right persistent notification */}
      {rankPendingReward && typeof rankPendingReward.amount === "number" && createPortal(
        <div style={{ position:"fixed", top:"16px", right:"16px", zIndex:1800, maxWidth:"320px", width:"calc(100% - 32px)", animation:"vip-reveal .4s ease" }}>
          <div style={{ background:"#161d2b", border:`1px solid ${rankPendingReward.color}55`, borderLeft:`3px solid ${rankPendingReward.color}`, borderRadius:"14px", padding:"14px 16px", boxShadow:`0 8px 32px rgba(0,0,0,.6), 0 0 24px ${rankPendingReward.color}22`, display:"flex", gap:"12px", alignItems:"center" }}>
            {/* Badge */}
            <div style={{ width:"44px", height:"44px", borderRadius:"10px", overflow:"hidden", flexShrink:0, border:`1px solid ${rankPendingReward.color}44`, boxShadow:`0 0 12px ${rankPendingReward.color}40` }}>
              <img src={rankPendingReward.image} alt={rankPendingReward.rankName} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            </div>
            {/* Text */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:"12px", fontWeight:800, color:"#e2e8f0", marginBottom:"2px" }}>🎉 ¡Subiste a {rankPendingReward.rankName}!</div>
              <div style={{ fontSize:"11px", color:"#5a6e8a", lineHeight:1.4 }}>Tenés <span style={{ color:rankPendingReward.color, fontWeight:700 }}>${rankPendingReward.amount.toFixed(2)}</span> de recompensa pendiente</div>
            </div>
            {/* CTA */}
            <button onClick={()=>openSection("tips-bonuses")}
              style={{ background:rankPendingReward.gradient, border:"none", borderRadius:"8px", padding:"7px 12px", fontSize:"11px", fontWeight:700, color:"#fff", cursor:"pointer", flexShrink:0, boxShadow:`0 2px 10px ${rankPendingReward.color}55`, whiteSpace:"nowrap" as const }}>
              Reclamar
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* CASHIER MODAL */}
      {cashierOpen && (
        <div onClick={e=>{ if(e.target===e.currentTarget) setCashierOpen(false); }}
          style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",zIndex:999 }}>
          <div style={{ width:"100%",maxWidth:"580px",background:"#16202e",border:"1px solid #2a3650",borderRadius:"16px",overflow:"hidden",boxShadow:"0 24px 60px rgba(0,0,0,.6)",fontFamily:"'Inter', sans-serif",minHeight:"600px",display:"flex",flexDirection:"column" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 20px 14px" }}>
              <h3 style={{ margin:0,color:"#f2f3f7",fontSize:"22px",fontWeight:700 }}>Wallet</h3>
              <button onClick={()=>setCashierOpen(false)} style={{ width:"32px",height:"32px",borderRadius:"50%",background:"#2a3550",border:"none",color:"#9ea8bc",fontSize:"20px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1 }}>×</button>
            </div>
            {currentUser && (
              <div style={{ display:"flex",borderBottom:"1px solid #2a3650",padding:"0 20px",gap:"24px" }}>
                {(["deposit","withdraw"] as const).map(tab=>(
                  <button key={tab} onClick={()=>setCashierTab(tab)} className="cashier-tab"
                    style={{ background:"transparent",border:"none",borderBottom:cashierTab===tab?"2px solid #f6b531":"2px solid transparent",color:cashierTab===tab?"#f6b531":"#7c8caa",fontWeight:600,fontSize:"14px",padding:"10px 0",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px",marginBottom:"-1px",transition:"color .15s" }}>
                    {tab==="deposit" ? "↓" : "↑"} {tab==="deposit" ? "Deposit" : "Withdraw"}
                  </button>
                ))}
              </div>
            )}

            {!currentUser && (
              <NotLoggedInState
                variant="deposit"
                onLogin={() => { setCashierOpen(false); setAuthModal("login"); }}
                onRegister={() => { setCashierOpen(false); setAuthModal("register"); }}
              />
            )}

            {/* Deposit */}
            {currentUser && cashierTab==="deposit" && (
              <div style={{ padding:"20px",display:"flex",flexDirection:"column",gap:"0px",flex:1 }}>
                {/* Section heading */}
                <div style={{ marginBottom:"20px" }}>
                  <span style={{ fontSize:"22px",fontWeight:700,color:"#fff" }}>Deposit</span>
                </div>
                {/* Currency + Network — 2-column grid */}
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"20px" }}>
                  {/* Currency */}
                  <div>
                    <label style={{ display:"block",marginBottom:"6px",color:"#7c8caa",fontSize:"11px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px" }}>Currency</label>
                    <div style={{ position:"relative" }}>
                      <div onClick={()=>{ setShowCoinDrop(p=>!p); setShowNetDrop(false); }} className="cashier-drop"
                        style={{ display:"flex",alignItems:"center",gap:"8px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #2a3650",background:"#1a2535",cursor:"pointer",userSelect:"none" as const,transition:"border-color .15s,background .15s" }}>
                        {coinDisplayMap[depositCoin]?.icon
                          ? <img src={coinDisplayMap[depositCoin].icon} width={22} height={22} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={depositCoin}/>
                          : <span style={{ fontSize:"16px",flexShrink:0 }}>{coinDisplayMap[depositCoin]?.badgeText}</span>}
                        <span style={{ flex:1,color:"#fff",fontWeight:600,fontSize:"14px" }}>{depositCoin}</span>
                        <span style={{ color:"#7c8caa",fontSize:"10px" }}>▼</span>
                      </div>
                      {showCoinDrop && (
                        <>
                          <div onClick={()=>setShowCoinDrop(false)} style={{ position:"fixed",inset:0,zIndex:98 }}/>
                          <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#131d2d",border:"1px solid #2a3650",borderRadius:"10px",zIndex:99,maxHeight:"240px",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,.7)" }}>
                            {Object.entries(coinDisplayMap).filter(([k])=>coinConfig[k]).map(([k,v])=>{
                              const selected = k===depositCoin;
                              const native = coinBalances[k] ?? 0;
                              const fiatVal = convertUsd(native * (coinConfig[k]?.priceUsd ?? 1));
                              const sym = getCurrencySymbol(displayCurrency);
                              const nativeStr = native === 0 ? "0" : parseFloat(native.toPrecision(8)).toString();
                              return (
                                <div key={k} onClick={()=>{ setDepositCoin(k); setDepositNetwork(coinConfig[k]?.networks[0]||"TRC20"); setShowCoinDrop(false); }}
                                  style={{ display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",cursor:"pointer",background:selected?"rgba(90,154,255,.12)":"transparent",borderBottom:"1px solid #1a2840" }}>
                                  {v.icon ? <img src={v.icon} width={24} height={24} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={k}/> : <span style={{ fontSize:"18px" }}>{v.badgeText}</span>}
                                  <span style={{ color:selected?"#5a9aff":"#fff",fontWeight:600,fontSize:"13px" }}>{k}</span>
                                  <div style={{ marginLeft:"auto",textAlign:"right" as const }}>
                                    <div style={{ color:"#fff",fontWeight:700,fontSize:"13px" }}>{sym}{fiatVal.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                                    <div style={{ color:"#7c8caa",fontSize:"11px" }}>{nativeStr}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Network */}
                  <div>
                    <label style={{ display:"block",marginBottom:"6px",color:"#7c8caa",fontSize:"11px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px" }}>Network</label>
                    <div style={{ position:"relative" }}>
                      <div onClick={()=>{ setShowNetDrop(p=>!p); setShowCoinDrop(false); }} className="cashier-drop"
                        style={{ display:"flex",alignItems:"center",gap:"8px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #2a3650",background:"#1a2535",cursor:"pointer",userSelect:"none" as const,transition:"border-color .15s,background .15s" }}>
                        <img src={networkIconMap[depositNetwork] ?? "/coins/eth.svg"} width={22} height={22} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={depositNetwork}/>
                        <span style={{ flex:1,color:"#fff",fontWeight:600,fontSize:"14px" }}>{depositNetwork}</span>
                        <span style={{ color:"#7c8caa",fontSize:"10px" }}>▼</span>
                      </div>
                      {showNetDrop && (
                        <>
                          <div onClick={()=>setShowNetDrop(false)} style={{ position:"fixed",inset:0,zIndex:98 }}/>
                          <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#131d2d",border:"1px solid #2a3650",borderRadius:"10px",zIndex:99,boxShadow:"0 8px 32px rgba(0,0,0,.7)" }}>
                            {(coinConfig[depositCoin]?.networks||[]).map(n=>(
                              <div key={n} onClick={()=>{ setDepositNetwork(n); setShowNetDrop(false); }} className="cashier-item"
                                style={{ padding:"10px 14px",cursor:"pointer",color:n===depositNetwork?"#5a9aff":"#d0dcea",fontWeight:n===depositNetwork?600:400,background:n===depositNetwork?"rgba(90,154,255,.12)":"transparent",borderBottom:"1px solid #1a2840",display:"flex",alignItems:"center",gap:"10px" }}>
                                <img src={networkIconMap[n] ?? "/coins/eth.svg"} width={20} height={20} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={n}/>
                                <span style={{ flex:1 }}>{n}</span>
                                {n===depositNetwork && <span style={{ fontSize:"12px",color:"#5a9aff" }}>✓</span>}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Address section header */}
                <div style={{ marginBottom:"6px",marginTop:"2px" }}>
                  <span style={{ color:"#9ea8bc",fontSize:"13px",fontWeight:600,letterSpacing:"0.3px" }}>Deposit address</span>
                </div>

                {/* Address card — loading or loaded */}
                {!pendingDeposit ? (
                  <div style={{ background:"#1e2a3a",borderRadius:"14px",padding:"32px 20px",marginBottom:"18px",display:"flex",alignItems:"center",justifyContent:"center",minHeight:"148px" }}>
                    <div style={{ textAlign:"center" as const }}>
                      <div style={{ width:34,height:34,border:"3px solid #2a3a52",borderTop:"3px solid #5a9aff",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px" }}/>
                      <span style={{ color:"#6a7a96",fontSize:"13px" }}>Generating address...</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:"#1e2a3a",borderRadius:"12px",padding:"12px 14px",marginBottom:"14px" }}>
                    {/* QR left | address+Copy stacked right */}
                    <div style={{ display:"flex",alignItems:"stretch",gap:"12px" }}>
                      <div style={{ flexShrink:0,background:"#fff",borderRadius:"7px",padding:"4px",display:"inline-flex" }}>
                        <img src={`https://chart.googleapis.com/chart?chs=320x320&cht=qr&chl=${encodeURIComponent(pendingDeposit.address!)}&choe=UTF-8`} width={148} height={148} style={{ display:"block" }} alt="QR"/>
                      </div>
                      <div style={{ flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-end",gap:"2px" }}>
                        <div style={{ fontSize:"11.5px",color:"#8a9ab8",lineHeight:1.4 }}>
                          <strong style={{ color:"#fff" }}>{pendingDeposit.network} only</strong>, do not use other networks
                        </div>
                        <div style={{ display:"flex",alignItems:"center",gap:"6px",fontSize:"12px",color:"#7c8caa",marginBottom:"4px" }}>
                          <span>Min. deposit:</span>
                          <span style={{ color:"#fff",fontWeight:600 }}>{minDepositNative(pendingDeposit.coin!, pendingDeposit.network!).toFixed(8)} {pendingDeposit.coin}</span>
                        </div>
                        <div onClick={()=>{ navigator.clipboard.writeText(pendingDeposit!.address!); setAddressCopied(true); setTimeout(()=>setAddressCopied(false),2000); }}
                          style={{ background:"#0d1622",border:`1px solid ${addressCopied?"#2a6a44":"#2e3f58"}`,borderRadius:"8px",padding:"8px 12px",color:"#d4e0f0",fontWeight:500,fontSize:"11px",wordBreak:"break-all" as const,lineHeight:1.6,display:"flex",alignItems:"center",gap:"10px",cursor:"pointer",transition:"border-color .2s" }}>
                          <span style={{ flex:1 }}>{pendingDeposit.address}</span>
                          <span style={{ flexShrink:0,color:addressCopied?"#4ade80":"#8a9ab8",transition:"color .2s" }}>
                            {addressCopied
                              ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              : <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="12" height="14" rx="2.5" ry="2.5"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" opacity=".5"/></svg>
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Security warning */}
                <div style={{ display:"flex",alignItems:"flex-start",gap:"10px",background:"rgba(255,180,0,.06)",borderRadius:"10px",padding:"12px 16px",fontSize:"13px",color:"#b89a5a",border:"1px solid rgba(255,180,0,.18)",marginTop:"14px" }}>
                  <span style={{ flexShrink:0,marginTop:"4px",display:"inline-flex" }}>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#f6c94e" opacity=".15" stroke="#f6c94e" strokeWidth="1.5" strokeLinejoin="round"/>
                      <line x1="12" y1="9" x2="12" y2="13" stroke="#f6c94e" strokeWidth="1.8" strokeLinecap="round"/>
                      <circle cx="12" cy="16.5" r="0.9" fill="#f6c94e"/>
                    </svg>
                  </span>
                  <span>
                    <strong style={{ color:"#f6c94e" }}>Security notice:</strong> Only send <strong style={{ color:"#fff" }}>{pendingDeposit?.coin ?? depositCoin}</strong> to this address via <strong style={{ color:"#fff" }}>{pendingDeposit?.network ?? depositNetwork}</strong>. Sending any other coin or using a different network will result in <strong style={{ color:"#ff7070" }}>permanent loss of funds</strong>.
                  </span>
                </div>
              </div>
            )}

            {currentUser && cashierTab==="withdraw" && (
              <div style={{ padding:"20px",flex:1 }}>
                {/* Section heading */}
                <div style={{ marginBottom:"20px" }}>
                  <span style={{ fontSize:"22px",fontWeight:700,color:"#fff" }}>Withdraw</span>
                </div>
                {/* Currency + Network — 2-column grid */}
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"20px" }}>
                  {/* Currency dropdown */}
                  <div>
                    <label style={{ display:"block",marginBottom:"6px",color:"#7c8caa",fontSize:"11px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px" }}>Currency</label>
                    <div style={{ position:"relative" }}>
                      <div onClick={()=>{ setShowCoinDrop(p=>!p); setShowWNetDrop(false); }} className="cashier-drop"
                        style={{ display:"flex",alignItems:"center",gap:"8px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #2a3650",background:"#1a2535",cursor:"pointer",userSelect:"none" as const,transition:"border-color .15s,background .15s" }}>
                        {coinDisplayMap[withdrawCoin]?.icon
                          ? <img src={coinDisplayMap[withdrawCoin].icon} width={22} height={22} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={withdrawCoin}/>
                          : <span style={{ fontSize:"16px",flexShrink:0 }}>{coinDisplayMap[withdrawCoin]?.badgeText}</span>}
                        <span style={{ flex:1,color:"#fff",fontWeight:600,fontSize:"14px" }}>{withdrawCoin}</span>
                        <span style={{ color:"#7c8caa",fontSize:"10px" }}>▼</span>
                      </div>
                      {showCoinDrop && (
                        <>
                          <div onClick={()=>setShowCoinDrop(false)} style={{ position:"fixed",inset:0,zIndex:98 }}/>
                          <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#131d2d",border:"1px solid #2a3650",borderRadius:"10px",zIndex:99,maxHeight:"240px",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,.7)" }}>
                            {Object.entries(coinDisplayMap).filter(([k])=>coinConfig[k]).map(([k,v])=>{
                              const selected = k===withdrawCoin;
                              const native = coinBalances[k] ?? 0;
                              const fiatVal = convertUsd(native * (coinConfig[k]?.priceUsd ?? 1));
                              const sym = getCurrencySymbol(displayCurrency);
                              const nativeStr = native === 0 ? "0" : parseFloat(native.toPrecision(8)).toString();
                              return (
                                <div key={k} onClick={()=>{ setDepositCoin(k); setDepositNetwork(coinConfig[k]?.networks[0]||"TRC20"); setWithdrawNetwork(coinConfig[k]?.networks[0]||"TRC20"); setShowCoinDrop(false); }}
                                  style={{ display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",cursor:"pointer",background:selected?"rgba(90,154,255,.12)":"transparent",borderBottom:"1px solid #1a2840" }}>
                                  {v.icon ? <img src={v.icon} width={24} height={24} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={k}/> : <span style={{ fontSize:"18px" }}>{v.badgeText}</span>}
                                  <span style={{ color:selected?"#5a9aff":"#fff",fontWeight:600,fontSize:"13px" }}>{k}</span>
                                  <div style={{ marginLeft:"auto",textAlign:"right" as const }}>
                                    <div style={{ color:"#fff",fontWeight:700,fontSize:"13px" }}>{sym}{fiatVal.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                                    <div style={{ color:"#7c8caa",fontSize:"11px" }}>{nativeStr}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Network dropdown */}
                  <div>
                    <label style={{ display:"block",marginBottom:"6px",color:"#7c8caa",fontSize:"11px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px" }}>Network</label>
                    <div style={{ position:"relative" }}>
                      <div onClick={()=>{ setShowWNetDrop(p=>!p); setShowCoinDrop(false); }} className="cashier-drop"
                        style={{ display:"flex",alignItems:"center",gap:"8px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #2a3650",background:"#1a2535",cursor:"pointer",userSelect:"none" as const,transition:"border-color .15s,background .15s" }}>
                        <img src={networkIconMap[withdrawNetwork] ?? "/coins/eth.svg"} width={22} height={22} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={withdrawNetwork}/>
                        <span style={{ flex:1,color:"#fff",fontWeight:600,fontSize:"14px" }}>{withdrawNetwork}</span>
                        <span style={{ color:"#7c8caa",fontSize:"10px" }}>▼</span>
                      </div>
                      {showWNetDrop && (
                        <>
                          <div onClick={()=>setShowWNetDrop(false)} style={{ position:"fixed",inset:0,zIndex:98 }}/>
                          <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#131d2d",border:"1px solid #2a3650",borderRadius:"10px",zIndex:99,boxShadow:"0 8px 32px rgba(0,0,0,.7)" }}>
                            {(coinConfig[withdrawCoin]?.networks||[]).map(n=>(
                              <div key={n} onClick={()=>{ setWithdrawNetwork(n); setShowWNetDrop(false); }} className="cashier-item"
                                style={{ padding:"10px 14px",cursor:"pointer",color:n===withdrawNetwork?"#5a9aff":"#d0dcea",fontWeight:n===withdrawNetwork?600:400,background:n===withdrawNetwork?"rgba(90,154,255,.12)":"transparent",borderBottom:"1px solid #1a2840",display:"flex",alignItems:"center",gap:"10px" }}>
                                <img src={networkIconMap[n] ?? "/coins/eth.svg"} width={20} height={20} style={{ borderRadius:"50%",objectFit:"contain",flexShrink:0 }} alt={n}/>
                                <span style={{ flex:1 }}>{n}</span>
                                {n===withdrawNetwork && <span style={{ fontSize:"12px",color:"#5a9aff" }}>✓</span>}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {/* Address */}
                <div style={{ marginBottom:"20px" }}>
                  <label style={{ display:"block",marginBottom:"6px",color:"#7c8caa",fontSize:"11px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px" }}>Address</label>
                  <input value={withdrawAddress} onChange={e=>setWithdrawAddress(e.target.value)}
                    placeholder="" className="cashier-input"
                    style={{ width:"100%",padding:"13px 16px",borderRadius:"8px",border:"1px solid #2a3650",background:"#1a2535",color:"#fff",fontSize:"14px",boxSizing:"border-box" as const,outline:"none",transition:"border-color .15s" }} />
                </div>
                {/* Amount */}
                <div style={{ marginBottom:"16px" }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px" }}>
                    <label style={{ color:"#7c8caa",fontSize:"11px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px" }}>Amount</label>
                    <span style={{ color:"#7c8caa",fontSize:"12px" }}>Balance: <strong style={{ color:"#fff" }}>{((coinBalances as Record<string,number>)[withdrawCoin]||0).toFixed(6)} {withdrawCoin}</strong></span>
                  </div>
                  <div style={{ position:"relative" }}>
                    {coinDisplayMap[withdrawCoin]?.icon
                      ? <img src={coinDisplayMap[withdrawCoin].icon} width={20} height={20} style={{ position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",borderRadius:"50%",objectFit:"contain",pointerEvents:"none" }} alt={withdrawCoin}/>
                      : <span style={{ position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",fontSize:"14px",pointerEvents:"none",color:"#7c8caa" }}>{coinDisplayMap[withdrawCoin]?.badgeText}</span>}
                    <input type="number" value={withdrawAmount} onChange={e=>setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      style={{ width:"100%",padding:"13px 60px 13px 40px",borderRadius:"8px",border:"1px solid #2a3650",background:"#1a2535",color:"#fff",fontSize:"15px",boxSizing:"border-box" as const,outline:"none" }}/>
                    <button onClick={()=>{ const bal=(coinBalances as Record<string,number>)[withdrawCoin]||0; const fee=getNetLimit(withdrawCoin,withdrawNetwork).wFee/getPriceUsd(withdrawCoin); setWithdrawAmount(String(Math.max(0,bal-fee).toFixed(8))); }} className="cashier-btn"
                      style={{ position:"absolute",right:"8px",top:"50%",transform:"translateY(-50%)",background:"#253548",border:"1px solid #3a4d65",borderRadius:"6px",color:"#fff",fontWeight:700,fontSize:"12px",padding:"5px 12px",cursor:"pointer" }}>Max</button>
                  </div>
                </div>
                {/* Min + Fee info */}
                <p style={{ color:"#7c8caa",fontSize:"12px",margin:"0 0 6px" }}>The min withdrawal amount is <strong style={{ color:"#c0cfe4" }}>{(getNetLimit(withdrawCoin,withdrawNetwork).minWith/getPriceUsd(withdrawCoin)).toFixed(8)} {withdrawCoin}</strong></p>
                <p style={{ color:"#7c8caa",fontSize:"12px",margin:"0 0 24px" }}>Transaction Fee: <strong style={{ color:"#fff" }}>{(getNetLimit(withdrawCoin,withdrawNetwork).wFee/getPriceUsd(withdrawCoin)).toFixed(8)} {withdrawCoin}</strong></p>
                {withdrawError && <p style={{ color:"#ff5b5b",fontSize:"13px",margin:"0 0 16px" }}>{withdrawError}</p>}
                <button onClick={submitWithdraw} className="cashier-btn" style={{ width:"100%",padding:"15px",borderRadius:"10px",background:"linear-gradient(180deg,#4caf50,#388e3c)",color:"#fff",fontWeight:700,fontSize:"15px",border:"none",cursor:"pointer",letterSpacing:"0.3px",marginTop:"4px" }}>Withdraw</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SEARCH MODAL */}
      {/* ── External Game Modal ── */}
      {extGameModal && (
        <div onClick={e=>{ if(e.target===e.currentTarget){ if(extFallbackTimer.current)clearTimeout(extFallbackTimer.current); setExtGameModal(null); } }}
          style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:2000,padding:"12px" }}>
          <div style={{ width:"min(900px,100%)",maxHeight:"92vh",background:"#0d1320",border:"1px solid #1e2a3e",borderRadius:"16px",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,0,0,.8)" }}>
            {/* Modal header */}
            <div style={{ display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",background:"#0a1018",borderBottom:"1px solid #1a2438",flexShrink:0 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600,fontSize:"14px",color:"#fff" }}>{extGameModal.name}</div>
                <div style={{ fontSize:"10px",color:"#64748b" }}>Pragmatic Play · Demo</div>
              </div>
              <a href={extGameModal.url} target="_blank" rel="noopener noreferrer"
                style={{ padding:"6px 14px",background:"linear-gradient(135deg,#1a9fff,#1060a0)",color:"#fff",borderRadius:"8px",fontWeight:500,fontSize:"12px",textDecoration:"none",flexShrink:0 }}>
                🔗 Abrir en pestaña
              </a>
              <button onClick={()=>{ if(extFallbackTimer.current)clearTimeout(extFallbackTimer.current); setExtGameModal(null); }}
                style={{ width:"32px",height:"32px",background:"#1a2438",color:"#94a3b8",border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"18px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>×</button>
            </div>
            {/* iframe */}
            <div style={{ flex:1,position:"relative",minHeight:"480px" }}>
              <iframe
                ref={extIframeRef}
                src={extGameModal.url}
                title={extGameModal.name}
                style={{ width:"100%",height:"100%",border:"none",minHeight:"480px" }}
                allow="fullscreen"
                onLoad={()=>{ if(extFallbackTimer.current)clearTimeout(extFallbackTimer.current); }}
                onError={()=>{ window.open(extGameModal.url,"_blank","noopener"); setExtGameModal(null); }}
              />
              {/* Fallback hint overlay (shown for 4s then fades) */}
              <div id="ext-hint" style={{ position:"absolute",bottom:"12px",left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,.75)",color:"#94a3b8",fontSize:"11px",padding:"5px 14px",borderRadius:"20px",pointerEvents:"none",whiteSpace:"nowrap" }}>
                Si el juego no carga, usá "Abrir en pestaña" ↑
              </div>
            </div>
          </div>
        </div>
      )}

      {searchOpen && (
        <div onClick={e=>{ if(e.target===e.currentTarget) setSearchOpen(false); }}
          style={{ position:"fixed",inset:0,background:"rgba(6,10,20,.78)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"14px",zIndex:1200 }}>
          <div style={{ width:"min(1380px,100%)",background:"#2f3444",border:"1px solid #41495d",borderRadius:"20px",padding:"18px",maxHeight:"92vh",overflowY:"auto" }}>
            <div style={{ display:"flex",gap:"12px",alignItems:"center",marginBottom:"14px" }}>
              <div style={{ flex:1,position:"relative" }}>
                <span style={{ position:"absolute",left:"18px",top:"50%",transform:"translateY(-50%)",fontSize:"24px",color:"#aab4c5" }}>⌕</span>
                <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
                  autoFocus placeholder="Search casino games"
                  style={{ width:"100%",background:"#2d3344",border:"2px solid #656d7e",borderRadius:"999px",padding:"16px 18px 16px 52px",color:"white",fontSize:"18px",fontWeight:500,boxSizing:"border-box" }} />
              </div>
              <button onClick={()=>setSearchOpen(false)} style={{ width:"52px",height:"52px",borderRadius:"10px",background:"#4a5164",color:"white",border:"none",fontSize:"26px",cursor:"pointer" }}>×</button>
            </div>
            <div style={{ display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"18px" }}>
              {searchCategories.map(cat=>{
                const isActive = searchCategory===cat;
                return (
                  <button key={cat} onClick={()=>setSearchCategory(cat)}
                    onMouseEnter={e=>{ if(!isActive){ e.currentTarget.style.background="#1e2840"; e.currentTarget.style.borderColor="#3a4a66"; e.currentTarget.style.color="#fff"; }}}
                    onMouseLeave={e=>{ if(!isActive){ e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="#252f45"; e.currentTarget.style.color="#dce3ee"; }}}
                    style={{
                      background: isActive ? "linear-gradient(135deg,#1e2840,#263352)" : "transparent",
                      color: isActive ? "#f4a91f" : "#dce3ee",
                      border: isActive ? "1px solid #f4a91f" : "1px solid #252f45",
                      padding:"9px 15px",
                      borderRadius:"9px",
                      fontWeight:500,
                      cursor:"pointer",
                      fontSize:"13px",
                      boxShadow: isActive ? "0 0 10px rgba(244,169,31,.2), inset 0 0 8px rgba(244,169,31,.06)" : "none",
                      transition:"all .15s ease",
                    }}>{cat}</button>
                );
              })}
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"16px" }}>
              {filteredSlots.map((s,i)=>{
                const thumbMap: Record<string,string> = {
                  dice:"/dice-card.jpg", plinko:"/plinko-thumb.jpg", keno:"/keno-thumb.jpg",
                  blackjack:"/blackjack-thumb.jpg", mines:"/mines-card.jpg", hilo:"/hilo-card.jpg",
                  roulette:"/roulette-card.jpg", baccarat:"/baccarat-card.jpg",
                };
                const thumb = thumbMap[s.type] || null;
                return (
                <div key={i} onClick={()=>{ setSearchOpen(false); if(s.type==="dice") showDiceOnly(); else if(s.type==="keno") showKenoOnly(); else if(s.type==="plinko") showPlinkoOnly(); else if(s.type==="blackjack") showBlackjackOnly(); else if(s.type==="mines") showMinesOnly(); else if(s.type==="hilo") showHiloOnly(); else if(s.type==="roulette") showRouletteOnly(); else if(s.type==="baccarat") showBaccaratOnly(); else showSlotOnly(); }}
                  style={{ background:"#394055",borderRadius:"12px",overflow:"hidden",cursor:"pointer" }}>
                  <div style={{ height:"192px",position:"relative",background:s.bg }}>
                    {thumb && <img src={thumb} alt={s.name} style={{ width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 75%",display:"block" }} />}
                    {!thumb && <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",fontWeight:600,color:"white" }}>{s.name}</div>}
                  </div>
                  <div style={{ padding:"10px 0 0" }}>
                    <div style={{ fontSize:"18px",fontWeight:600 }}>{s.name}</div>
                    <div style={{ color:"#c9d0dc",fontSize:"16px",fontWeight:500 }}>{s.provider}</div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Inline CSS for coin badges */}
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        .coin-badge {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border-radius: 50%;
          font-size: 12px; font-weight: 900; color: white; flex-shrink: 0;
        }
        .coin-usdt { background: #26a17b; }
        .coin-ars  { background: #4a95ff; }
        .coin-btc  { background: #f39a18; }
        .coin-eth  { background: #6575ff; }
        .coin-ltc  { background: #4c7ec9; }
        .coin-sol  { background: linear-gradient(135deg,#7a5cff,#5ff2bf); }
        .coin-usdc { background: #2f7fd9; }
        .coin-trx  { background: #ed0c0c; }
        .coin-bnb  { background: #d59a06; }
        .coin-pol  { background: #7e47e7; }
        select, input, button { font-family: inherit; font-size: inherit; outline: none; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0e1320; }
        ::-webkit-scrollbar-thumb { background: #2a3448; border-radius: 3px; }
      `}</style>

      {/* ═══ WALLET CONFIG MODAL ════════════════════════════════════════════ */}
      {walletConfigOpen && (
        <div onClick={()=>setWalletConfigOpen(false)}
          style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px" }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ width:"100%",maxWidth:"620px",height:"88vh",display:"flex",flexDirection:"column",background:"#111827",borderRadius:"16px",overflow:"hidden",boxShadow:"0 25px 80px rgba(0,0,0,.7)" }}>

            {/* Header */}
            <div style={{ padding:"20px 24px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #1f2a3c",flexShrink:0 }}>
              <span style={{ fontWeight:600,fontSize:"14px",letterSpacing:"1.5px",color:"#fff",textTransform:"uppercase" }}>Configuración de Billetera</span>
              <button onClick={()=>setWalletConfigOpen(false)}
                style={{ background:"transparent",border:"none",color:"#6b7280",fontSize:"20px",cursor:"pointer",lineHeight:1,padding:"2px 6px" }}>✕</button>
            </div>

            {/* Search */}
            <div style={{ padding:"14px 20px 0",flexShrink:0 }}>
              <div style={{ display:"flex",alignItems:"center",gap:"10px",background:"#1c2537",border:"1px solid #2a3650",borderRadius:"10px",padding:"10px 14px" }}>
                <span style={{ color:"#6b7280",fontSize:"16px" }}>🔍</span>
                <input value={walletSearch} onChange={e=>setWalletSearch(e.target.value)}
                  placeholder="Buscar monedas..."
                  style={{ flex:1,background:"transparent",border:"none",outline:"none",color:"#e5e7eb",fontSize:"14px",fontFamily:"inherit" }} />
                {walletSearch && (
                  <button onClick={()=>setWalletSearch("")} style={{ background:"transparent",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"14px" }}>✕</button>
                )}
              </div>
            </div>

            {/* Info banner */}
            <div style={{ margin:"12px 20px 4px",padding:"10px 14px",background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.3)",borderRadius:"8px",flexShrink:0 }}>
              <p style={{ margin:0,color:"#fbbf24",fontSize:"12px",lineHeight:1.5 }}>
                Los valores mostrados son aproximaciones basadas en los tipos de cambio actuales. Todas las transacciones se procesan en USD.
              </p>
            </div>

            {/* Status bar */}
            <div style={{ padding:"4px 20px 8px",display:"flex",alignItems:"center",gap:"6px",flexShrink:0 }}>
              {ratesLoading
                ? <span style={{ color:"#6b7280",fontSize:"11px" }}>⟳ Actualizando tasas...</span>
                : ratesUpdatedAt
                  ? <span style={{ color:"#4b5563",fontSize:"11px" }}>✓ Actualizado {ratesUpdatedAt.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</span>
                  : null
              }
            </div>

            {/* Currency list */}
            <div style={{ overflowY:"auto",flex:1 }}>
              {WALLET_CURRENCIES
                .filter(c => {
                  const q = walletSearch.toLowerCase();
                  return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                })
                .map(curr => {
                  const rate = liveRates[curr.code] || FALLBACK_RATES[curr.code] || 1;
                  const isSelected = displayCurrency === curr.code;
                  const rateStr = rate >= 1000
                    ? rate.toLocaleString("es-AR", { maximumFractionDigits: 0 })
                    : rate >= 1
                      ? rate.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                      : rate.toFixed(4);
                  return (
                    <button key={curr.code}
                      onClick={()=>{
                        setDisplayCurrency(curr.code);
                        ls.set("display_currency_"+currentUser, curr.code);
                        setWalletConfigOpen(false);
                      }}
                      style={{
                        width:"100%",display:"flex",alignItems:"center",gap:"16px",
                        padding:"16px 24px",background:isSelected?"rgba(255,255,255,.04)":"transparent",
                        border:"none",borderBottom:"1px solid #1a2235",
                        outline:isSelected?`1px solid ${curr.color}44`:"none",
                        cursor:"pointer",textAlign:"left",transition:"background .15s"
                      }}
                      onMouseEnter={e=>{ if(!isSelected) e.currentTarget.style.background="rgba(255,255,255,.03)"; }}
                      onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.background="transparent"; }}>
                      {/* Circle icon */}
                      <div style={{ width:"46px",height:"46px",borderRadius:"50%",background:curr.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:curr.symbol.length>2?"12px":"16px",fontWeight:600,color:"#fff",letterSpacing:"-0.5px" }}>
                        {curr.symbol.length > 3 ? curr.symbol.slice(0,3) : curr.symbol}
                      </div>
                      {/* Name */}
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
                          <span style={{ color:"#f3f4f6",fontWeight:500,fontSize:"16px" }}>{curr.code}</span>
                          {isSelected && (
                            <span style={{ width:"16px",height:"16px",borderRadius:"50%",background:curr.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",color:"#fff",fontWeight:600 }}>✓</span>
                          )}
                        </div>
                        <div style={{ color:"#6b7280",fontSize:"12px",marginTop:"1px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{curr.name}</div>
                      </div>
                      {/* Rate badge */}
                      <div style={{ flexShrink:0,background:"#1c2537",border:"1px solid #2a3650",borderRadius:"8px",padding:"5px 10px",color:"#d1d5db",fontSize:"13px",fontWeight:500,whiteSpace:"nowrap" }}>
                        $1 ≈ <span style={{ color:"#f3f4f6",fontWeight:600 }}>{rateStr}</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SUPPORT CHAT WIDGET ════════════════════════════════════════════ */}
      {/* Floating button */}
      <button
        onClick={() => {
          const opening = !chatOpen;
          setChatOpen(opening);
          if (opening && currentUser) loadChatSessions(currentUser);
          if (!opening) setChatScreen("lobby");
        }}
        style={{
          position:"fixed", bottom:"28px", right:"28px", zIndex:999,
          width:"60px", height:"60px", borderRadius:"50%",
          background:"linear-gradient(135deg,#1e2d45,#253550)",
          border:"2px solid #f4a91f",
          boxShadow:"0 4px 20px rgba(0,0,0,.6), 0 0 0 3px rgba(244,169,31,.12)",
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
          transition:"transform .2s, box-shadow .2s",
        }}
        onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(1.1)";}}
        onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(1)";}}
        title="Soporte en vivo"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#f4a91f" strokeWidth="1.5"/>
          <path d="M7.5 10.5C7.5 7.46 9.69 5 12 5s4.5 2.46 4.5 5.5" stroke="#f4a91f" strokeWidth="1.5" strokeLinecap="round"/>
          <rect x="5.5" y="10.5" width="3" height="5" rx="1.5" fill="#f4a91f"/>
          <rect x="15.5" y="10.5" width="3" height="5" rx="1.5" fill="#f4a91f"/>
          <path d="M18.5 15.5C18.5 17.5 15.5 19 12 19" stroke="#f4a91f" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="12" cy="19" r="1" fill="#f4a91f"/>
        </svg>
      </button>

      {/* Chat panel */}
      {chatOpen && (
        <div style={{
          position:"fixed", bottom:"100px", right:"20px", zIndex:998,
          width:"420px", height:"82vh", maxHeight:"740px", minHeight:"480px",
          background:"#0d1320", border:"1px solid #1a2640",
          borderRadius:"20px", boxShadow:"0 24px 80px rgba(0,0,0,.85)",
          display:"flex", flexDirection:"column", overflow:"hidden",
          animation:"chatSlideUp .28s cubic-bezier(.22,.61,.36,1)",
        }}>
          {/* Header */}
          <div style={{ background:"#111827", padding:"14px 16px", display:"flex", alignItems:"center", gap:"11px", borderBottom:"1px solid #1a2640", flexShrink:0 }}>
            {chatScreen === "chat" && (
              <button onClick={()=>goLobby()}
                style={{ background:"transparent", border:"none", color:"#8a9bb4", fontSize:"22px", cursor:"pointer", padding:"2px 6px", lineHeight:1, marginLeft:"-4px" }}>‹</button>
            )}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:"16px", color:"#fff", letterSpacing:".2px", textAlign: chatScreen==="lobby" ? "center" : "left" }}>
                {chatScreen==="lobby" ? "Mensajes" : "Mander Concierge"}
              </div>
              {chatScreen==="chat" && (
                <div style={{ fontSize:"11.5px", color:"#8a9bb4", marginTop:"1px" }}>El equipo también puede ayudar</div>
              )}
            </div>
            <button onClick={()=>{ setChatOpen(false); setChatScreen("lobby"); }}
              style={{ background:"transparent", border:"none", color:"#8a9bb4", fontSize:"18px", cursor:"pointer", padding:"2px 6px", lineHeight:1 }}>✕</button>
          </div>

          {/* LOBBY screen */}
          {chatScreen === "lobby" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", animation:"chatScreenIn .25s ease-out" }}>
              {chatSessions.length === 0 ? (
                /* Empty state */
                <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"14px", padding:"32px 24px" }}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#5a6e88" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="#1a2640"/>
                    <line x1="9" y1="10" x2="15" y2="10" stroke="#5a6e88" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="9" y1="13" x2="13" y2="13" stroke="#5a6e88" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <div style={{ fontWeight:500, fontSize:"17px", color:"#d9e5f5" }}>No hay mensajes</div>
                  <div style={{ fontSize:"13.5px", color:"#5a6e88", textAlign:"center", lineHeight:1.5 }}>Los mensajes del equipo se mostrarán aquí</div>
                </div>
              ) : (
                /* Sessions list */
                <div style={{ flex:1, overflowY:"auto" }}>
                  {chatSessions.map((s) => {
                    const d = new Date(s.date);
                    const now = Date.now();
                    const diffMin = Math.floor((now - d.getTime()) / 60000);
                    const timeLabel = diffMin < 2 ? "Ahora"
                      : diffMin < 60 ? `Hace ${diffMin} min`
                      : diffMin < 1440 ? d.toLocaleTimeString("es", { hour:"2-digit", minute:"2-digit" })
                      : d.toLocaleDateString("es", { day:"2-digit", month:"short" });
                    const ticketId = s.ticketId || s.id;
                    return (
                      <button key={s.id} onClick={() => {
                        setChatMessages(s.messages);
                        setChatVerified(true);
                        setChatAuthUser(currentUser || chatAuthUser);
                        setChatLastActivity(null);
                        setChatWarnShown(false);
                        goChat();
                      }}
                        style={{ width:"100%", background:"transparent", border:"none", borderBottom:"1px solid #181f2e", padding:"16px 18px", display:"flex", alignItems:"center", gap:"14px", cursor:"pointer", textAlign:"left", transition:"background .15s" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="#0f1928")}
                        onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                      >
                        <div style={{ width:"46px", height:"46px", borderRadius:"50%", background:"#1a2030", border:"1px solid #252f42", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <path d="M3 18v-6a9 9 0 0 1 18 0v6" stroke="#8a9bb4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" stroke="#8a9bb4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"4px" }}>
                            <span style={{ fontWeight:500, fontSize:"14px", color:"#e8f0fa" }}>Support Request</span>
                            <span style={{ fontSize:"11.5px", color:"#4a5e7a", flexShrink:0, marginLeft:"8px" }}>{timeLabel}</span>
                          </div>
                          <div style={{ fontSize:"12.5px", color:"#5a6e88" }}>
                            #{ticketId} &bull; Enviado
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* CTA button */}
              <div style={{ padding:"16px 20px", borderTop: chatSessions.length > 0 ? "1px solid #1a2640" : "none" }}>
                <button
                  onClick={() => {
                    setChatMessages([]);
                    setChatVerified(false);
                    setChatWarnShown(false);
                    if (currentUser) {
                      setChatAuthInput(currentUser);
                      setChatAuthUser(currentUser);
                      setChatVerified(true);
                      setChatLastActivity(Date.now());
                      setChatMessages([{ role:"assistant", content:`¡Hola ${currentUser}! Soy Mia, tu agente de soporte de Mander Casino 🎲. ¿En qué puedo ayudarte hoy?` }]);
                    }
                    goChat();
                  }}
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"center", gap:"10px",
                    padding:"14px 28px", borderRadius:"999px",
                    background:"#1a2640", border:"1px solid #2a3a54",
                    color:"#d9e5f5", fontWeight:500, fontSize:"15px",
                    cursor:"pointer", fontFamily:"inherit", width:"100%",
                    transition:"background .2s",
                  }}
                  onMouseEnter={e=>(e.currentTarget.style.background="#233050")}
                  onMouseLeave={e=>(e.currentTarget.style.background="#1a2640")}
                >
                  {chatSessions.length > 0 ? "Nueva conversación" : "Envíanos un mensaje"}
                  <span style={{ width:"28px", height:"28px", borderRadius:"50%", background:"#2a3a54", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" stroke="#d9e5f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* CHAT screen */}
          {chatScreen === "chat" && !chatVerified && (
            <div style={{ flex:1, padding:"32px 24px", display:"flex", flexDirection:"column", gap:"16px", justifyContent:"center", animation:"chatScreenIn .25s ease-out" }}>
              <div style={{ textAlign:"center", marginBottom:"8px" }}>
                <div style={{ width:"64px", height:"64px", borderRadius:"50%", background:"linear-gradient(135deg,#f4a91f,#c4780a)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"28px", margin:"0 auto 14px" }}>🎧</div>
                <div style={{ fontWeight:600, fontSize:"18px", color:"#fff", marginBottom:"6px" }}>Soporte en vivo</div>
                <p style={{ margin:0, fontSize:"14px", color:"#8a9bb4", lineHeight:1.6 }}>Ingresá tu nombre de usuario<br/>para iniciar el chat</p>
              </div>
              <input
                value={chatAuthInput}
                onChange={e=>setChatAuthInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter" && verifyChatUser()}
                placeholder="Nombre de usuario"
                style={{ padding:"14px 16px", borderRadius:"14px", border:"1px solid #2a3650", background:"#1c2537", color:"#fff", fontSize:"15px", fontFamily:"inherit", outline:"none" }}
                autoFocus
              />
              {chatAuthError && <div style={{ color:"#ff5a6a", fontSize:"13px", textAlign:"center" }}>{chatAuthError}</div>}
              <button
                onClick={verifyChatUser}
                style={{ padding:"14px", borderRadius:"14px", background:"linear-gradient(135deg,#f6b531,#ea9807)", border:"none", color:"#fff", fontWeight:500, fontSize:"15px", cursor:"pointer", fontFamily:"inherit" }}
              >Iniciar chat</button>
            </div>
          )}

          {chatScreen === "chat" && chatVerified && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", animation:"chatScreenIn .25s ease-out" }}>
              {/* Messages area */}
              <div style={{ flex:1, overflowY:"auto", padding:"20px 16px 12px", display:"flex", flexDirection:"column", gap:"14px" }}>
                {chatMessages.map((m, i) => {
                  if (m.system) return (
                    <div key={i} style={{ display:"flex", justifyContent:"center" }}>
                      <div style={{ background:"rgba(244,169,31,.12)", border:"1px solid rgba(244,169,31,.3)", borderRadius:"12px", padding:"10px 14px", fontSize:"12.5px", color:"#f4c96a", textAlign:"center", maxWidth:"90%", lineHeight:1.5 }}>
                        {m.content}
                      </div>
                    </div>
                  );
                  return (
                  <div key={i} style={{ display:"flex", flexDirection:"column", alignItems: m.role==="user" ? "flex-end" : "flex-start", gap:"4px" }}>
                    <div style={{ display:"flex", gap:"9px", alignItems:"flex-end", flexDirection: m.role==="user" ? "row-reverse" : "row" }}>
                      {m.role==="assistant" && (
                        <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:"linear-gradient(135deg,#f4a91f,#c4780a)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", flexShrink:0 }}>🎧</div>
                      )}
                      <div style={{
                        maxWidth:"78%", padding:"12px 16px",
                        borderRadius: m.role==="user" ? "20px 4px 20px 20px" : "4px 20px 20px 20px",
                        background: m.role==="user" ? "linear-gradient(135deg,#f4a91f,#d4870a)" : "#1a2d47",
                        color: m.role==="user" ? "#fff" : "#d9e5f5",
                        fontSize:"14px", lineHeight:1.55,
                        fontWeight: m.role==="user" ? 600 : 400,
                        boxShadow: m.role==="user" ? "0 2px 10px rgba(244,169,31,.25)" : "none",
                      }}>
                        {m.content || (m.role==="assistant" && chatLoading && i===chatMessages.length-1 ? (
                          <span style={{ display:"flex", gap:"5px", alignItems:"center", padding:"2px 0" }}>
                            <span style={{ width:"7px",height:"7px",borderRadius:"50%",background:"#f4a91f",display:"inline-block",animation:"chatDot 1s infinite .0s" }}></span>
                            <span style={{ width:"7px",height:"7px",borderRadius:"50%",background:"#f4a91f",display:"inline-block",animation:"chatDot 1s infinite .2s" }}></span>
                            <span style={{ width:"7px",height:"7px",borderRadius:"50%",background:"#f4a91f",display:"inline-block",animation:"chatDot 1s infinite .4s" }}></span>
                          </span>
                        ) : "")}
                      </div>
                    </div>
                    {m.role==="assistant" && i===0 && (
                      <div style={{ fontSize:"11px", color:"#4a5e7a", paddingLeft:"41px", marginTop:"-2px" }}>Mander Concierge · Ahora</div>
                    )}
                  </div>
                  );
                })}
                {chatLoading && chatMessages[chatMessages.length-1]?.role !== "assistant" && (
                  <div style={{ display:"flex", gap:"9px", alignItems:"flex-end" }}>
                    <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:"linear-gradient(135deg,#f4a91f,#c4780a)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", flexShrink:0 }}>🎧</div>
                    <div style={{ padding:"12px 16px", borderRadius:"4px 20px 20px 20px", background:"#1a2d47", display:"flex", gap:"5px", alignItems:"center" }}>
                      <span style={{ width:"7px",height:"7px",borderRadius:"50%",background:"#f4a91f",display:"inline-block",animation:"chatDot 1s infinite .0s" }}></span>
                      <span style={{ width:"7px",height:"7px",borderRadius:"50%",background:"#f4a91f",display:"inline-block",animation:"chatDot 1s infinite .2s" }}></span>
                      <span style={{ width:"7px",height:"7px",borderRadius:"50%",background:"#f4a91f",display:"inline-block",animation:"chatDot 1s infinite .4s" }}></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input area */}
              <div style={{ borderTop:"1px solid #1a2640", flexShrink:0, position:"relative" }}>

                {/* Emoji picker popup */}
                {chatEmojiOpen && (
                  <div style={{
                    position:"absolute", bottom:"100%", left:"12px", marginBottom:"8px",
                    background:"#111827", border:"1px solid #1e2d45", borderRadius:"16px",
                    padding:"12px", zIndex:10, boxShadow:"0 8px 32px rgba(0,0,0,.6)",
                    display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:"4px", width:"272px",
                    animation:"chatScreenIn .18s ease-out",
                  }}>
                    {CHAT_EMOJIS.map(em => (
                      <button key={em} onClick={() => { setChatInput(p => p + em); setChatEmojiOpen(false); }}
                        style={{ background:"transparent", border:"none", fontSize:"20px", cursor:"pointer", borderRadius:"8px", padding:"4px", lineHeight:1, transition:"background .12s" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="#1e2d45")}
                        onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                      >{em}</button>
                    ))}
                  </div>
                )}

                {/* Pending file chip */}
                {chatPendingFile && (
                  <div style={{ padding:"8px 14px 0", display:"flex", alignItems:"center", gap:"8px" }}>
                    <div style={{ background:"#1a2d47", border:"1px solid #2a3a54", borderRadius:"10px", padding:"6px 12px", display:"flex", alignItems:"center", gap:"8px", fontSize:"12.5px", color:"#a0b4cc" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="#f4a91f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span style={{ fontWeight:600, color:"#d9e5f5" }}>{chatPendingFile.name}</span>
                      <span style={{ color:"#5a6e88" }}>{chatPendingFile.size}</span>
                      <button onClick={()=>{ setChatPendingFile(null); sendFileMessage(); }} style={{ background:"#f4a91f", border:"none", borderRadius:"6px", color:"#000", fontSize:"11px", fontWeight:500, padding:"2px 8px", cursor:"pointer" }}>Adjuntar</button>
                      <button onClick={()=>setChatPendingFile(null)} style={{ background:"transparent", border:"none", color:"#5a6e88", fontSize:"15px", cursor:"pointer", lineHeight:1, padding:"0 2px" }}>✕</button>
                    </div>
                  </div>
                )}

                <div style={{ padding:"12px 14px 8px", display:"flex", gap:"10px", alignItems:"flex-end" }}>
                  <div style={{ flex:1, background:"#141e2e", border:"1px solid #2a3a54", borderRadius:"18px", padding:"10px 16px", display:"flex", alignItems:"center" }}>
                    <input
                      value={chatInput}
                      onChange={e=>setChatInput(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ sendChatMessage(); setChatEmojiOpen(false); } }}
                      placeholder="Escribe un mensaje..."
                      disabled={chatLoading}
                      style={{ flex:1, background:"transparent", border:"none", outline:"none", color:"#d9e5f5", fontSize:"14px", fontFamily:"inherit" }}
                    />
                  </div>
                  <button
                    onClick={sendChatMessage}
                    disabled={chatLoading || !chatInput.trim()}
                    style={{ width:"44px", height:"44px", borderRadius:"50%", background: chatInput.trim() ? "linear-gradient(135deg,#f6b531,#ea9807)" : "#1a2d47", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"background .2s, opacity .2s", opacity: chatLoading ? .5 : 1 }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
                  </button>
                </div>

                {/* Icon row */}
                <div style={{ padding:"0 14px 12px", display:"flex", gap:"4px", alignItems:"center" }}>
                  {/* Hidden file input */}
                  <input ref={chatFileRef} type="file" onChange={handleChatFile} style={{ display:"none" }} accept="image/*,.pdf,.doc,.docx,.txt,.zip" />
                  <button
                    onClick={()=>chatFileRef.current?.click()}
                    title="Adjuntar archivo"
                    style={{ background:"transparent", border:"none", borderRadius:"8px", padding:"6px 8px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"background .15s, opacity .15s", opacity:.65 }}
                    onMouseEnter={e=>{ e.currentTarget.style.background="#1a2640"; e.currentTarget.style.opacity="1"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.opacity=".65"; }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="#d9e5f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <button
                    onClick={()=>setChatEmojiOpen(o=>!o)}
                    title="Emojis"
                    style={{ background: chatEmojiOpen ? "#1a2640" : "transparent", border:"none", borderRadius:"8px", padding:"5px 8px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"background .15s, opacity .15s", opacity: chatEmojiOpen ? 1 : .65, fontSize:"19px", lineHeight:1 }}
                    onMouseEnter={e=>{ e.currentTarget.style.background="#1a2640"; e.currentTarget.style.opacity="1"; }}
                    onMouseLeave={e=>{ if(!chatEmojiOpen){ e.currentTarget.style.background="transparent"; e.currentTarget.style.opacity=".65"; } }}
                  >😊</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Wager Requirement Alert ── */}
      {wagerAlert && (
        <div style={{
          position:"fixed", inset:0, zIndex:5000,
          background:"rgba(0,0,0,.72)", display:"flex", alignItems:"center", justifyContent:"center",
        }} onClick={()=>setWagerAlert(null)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"#0f1828", border:"1px solid #f59e0b", borderRadius:"18px",
            padding:"28px 32px", maxWidth:"400px", width:"90%",
            boxShadow:"0 20px 60px rgba(0,0,0,.9)",
            animation:"notifSlideIn 0.3s cubic-bezier(0.22,1,0.36,1)",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"16px" }}>
              <div style={{ fontSize:"30px" }}>🔒</div>
              <div>
                <div style={{ fontWeight:800, fontSize:"16px", color:"#f59e0b" }}>Requisito de Wagering</div>
                <div style={{ fontSize:"12px", color:"#5a7090", marginTop:"2px" }}>1× del total depositado</div>
              </div>
            </div>
            <p style={{ fontSize:"13px", color:"#8090b0", lineHeight:1.6, margin:"0 0 20px" }}>
              Para poder retirar, debes apostar al menos <strong style={{ color:"#c8d8f0" }}>1× el total de tus depósitos</strong>. Completa el requisito de wagering y luego podrás solicitar tu retiro.
            </p>
            {/* Progress bar */}
            <div style={{ marginBottom:"20px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:"12px", color:"#5a7090", marginBottom:"6px" }}>
                <span>Progreso</span>
                <span style={{ color:"#c8d8f0", fontWeight:600 }}>{fmtMoney(wagerAlert.wagered)} / {fmtMoney(wagerAlert.required)}</span>
              </div>
              <div style={{ height:"8px", background:"#1a2438", borderRadius:"999px", overflow:"hidden" }}>
                <div style={{
                  height:"100%", borderRadius:"999px",
                  width:`${Math.min(100, (wagerAlert.wagered / wagerAlert.required) * 100).toFixed(1)}%`,
                  background:"linear-gradient(90deg,#f59e0b,#f6b531)",
                  transition:"width .3s",
                }}/>
              </div>
              <div style={{ fontSize:"12px", color:"#f59e0b", marginTop:"8px", textAlign:"center", fontWeight:600 }}>
                Te faltan {fmtMoney(wagerAlert.remaining)} por apostar
              </div>
            </div>
            <button onClick={()=>setWagerAlert(null)} style={{
              width:"100%", padding:"12px", borderRadius:"10px", border:"none",
              background:"linear-gradient(180deg,#f6b531,#ea9807)", color:"#fff",
              fontWeight:700, fontSize:"14px", cursor:"pointer",
            }}>Entendido, seguir jugando</button>
          </div>
        </div>
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div style={{
          position:"fixed", top:"80px", right:"16px", zIndex:3000,
          display:"flex", alignItems:"center", gap:"14px",
          background: toast.type === "confirm" ? "linear-gradient(135deg,#0d2318 0%,#0f2a1a 100%)" : "#1a2438",
          border:`1px solid ${
            toast.type==="confirm"  ? "rgba(34,197,94,0.6)"   :
            toast.type==="deposit"  ? "rgba(34,197,94,0.45)"  :
            toast.type==="withdraw" ? "rgba(245,158,11,0.45)" :
                                      "rgba(96,165,250,0.45)"
          }`,
          borderRadius:"14px", padding:"14px 18px", minWidth:"290px", maxWidth:"340px",
          boxShadow: toast.type === "confirm"
            ? "0 8px 32px rgba(0,0,0,.7), 0 0 24px rgba(34,197,94,0.12)"
            : "0 8px 32px rgba(0,0,0,.7)",
          animation: toastExiting
            ? "notifSlideOut 0.45s cubic-bezier(0.4,0,1,1) forwards"
            : "notifSlideIn 0.32s cubic-bezier(0.22,1,0.36,1)"
        }}>
          <div style={{
            width:"44px", height:"44px", borderRadius:"12px", flexShrink:0,
            background:
              toast.type==="confirm"  ? "rgba(34,197,94,0.18)"  :
              toast.type==="deposit"  ? "rgba(34,197,94,0.15)"  :
              toast.type==="withdraw" ? "rgba(245,158,11,0.15)" :
                                        "rgba(96,165,250,0.15)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:"24px"
          }}>
            {toast.type==="confirm" ? "✅" : toast.type==="deposit" ? "💰" : toast.type==="withdraw" ? "📤" : "🔔"}
          </div>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{
              fontWeight:700, fontSize:"14px", marginBottom:"3px",
              color: toast.type==="confirm" ? "#4ade80" : "#e8f4ff"
            }}>{toast.title}</div>
            <div style={{ fontSize:"12px", color:"#7a8fb0", lineHeight:1.4 }}>{toast.message}</div>
          </div>
          <button onClick={dismissToast}
            style={{ background:"none", border:"none", color:"#4a5e7a", fontSize:"16px", cursor:"pointer", padding:"4px", flexShrink:0, lineHeight:1 }}>✕</button>
        </div>
      )}

      {/* ── AUTH MODAL ── */}
      {authModal !== "" && createPortal(
        <div onClick={()=>setAuthModal("")}
          style={{ position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.40)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999999,padding:"12px" }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ position:"relative",display:"flex",width:"min(890px,96vw)",height:"min(760px,92vh)",borderRadius:"20px",overflow:"hidden",boxShadow:"0 32px 100px rgba(0,0,0,.85)" }}>
            <button onClick={()=>setAuthModal("")}
              style={{ position:"absolute",top:"10px",right:"10px",background:"rgba(0,0,0,.45)",border:"none",color:"#c0cfe8",fontSize:"12px",cursor:"pointer",zIndex:20,lineHeight:1,width:"22px",height:"22px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
            {/* LEFT PANEL */}
            <div style={{ flex:"0 0 460px",backgroundImage:"url('/auth-left-bg.jpg')",backgroundSize:"cover",backgroundPosition:"center",position:"relative",overflow:"hidden" }}>
              <p style={{ position:"absolute",bottom:"18px",left:"20px",right:"20px",textAlign:"center",fontSize:"11px",color:"rgba(255,255,255,0.55)",lineHeight:1.6,margin:0 }}>
                Al acceder al sitio, certifico que tengo al menos 18 años y he leído los{" "}
                <span onClick={()=>{setAuthModal("");setSection("terms");window.scrollTo({top:0,behavior:"instant"});}} style={{ color:"rgba(255,255,255,0.85)",textDecoration:"underline",cursor:"pointer" }}>Términos y Condiciones</span>.
              </p>
            </div>

            {/* RIGHT PANEL */}
            <div style={{ flex:1,background:"#111827",display:"flex",flexDirection:"column",padding:"0",overflowY:"auto" }}>
              {/* Tabs — hidden on forgot and reset screens */}
              {authModal !== "forgot" && authModal !== "reset" && (
                <div style={{ display:"flex",borderBottom:"1px solid #1e2a40",flexShrink:0,justifyContent:"center",paddingLeft:"32px",paddingRight:"32px" }}>
                  {(["register","login"] as const).map(tab=>{
                    const label = tab==="login" ? "Iniciar sesión" : "Registro";
                    const active = authModal===tab;
                    return (
                      <button key={tab} onClick={()=>{ setLoginError(""); setRegError(""); setAuthModal(tab); }}
                        style={{ padding:"14px 28px",background:"none",border:"none",borderBottom:`2px solid ${active?"#f4a91f":"transparent"}`,color:active?"#f4a91f":"#6a7a99",fontWeight:active?700:500,fontSize:"14px",cursor:"pointer",transition:"color .15s,border-color .15s",letterSpacing:"0.2px",whiteSpace:"nowrap" }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Form */}
              <div style={{ padding:"28px 32px 24px",flex:1,overflowY:"auto",display:"flex",flexDirection:"column" }}>
                {authModal === "reset" ? (<>
                  <div style={{ flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-start",paddingTop:"20px" }}>
                    {resetSuccess ? (
                      <div style={{ textAlign:"center",paddingTop:"30px" }}>
                        <div style={{ fontSize:"48px",marginBottom:"16px" }}>✅</div>
                        <h2 style={{ color:"#29c46d",fontWeight:900,fontSize:"20px",margin:"0 0 12px" }}>¡Contraseña actualizada!</h2>
                        <p style={{ color:"#8a9ab8",fontSize:"14px",lineHeight:1.6,margin:"0 0 6px" }}>Tu contraseña fue restablecida correctamente.</p>
                        <p style={{ color:"#6a7a99",fontSize:"13px" }}>Redirigiendo al inicio de sesión...</p>
                      </div>
                    ) : (<>
                      <h2 style={{ color:"#f4a91f",fontWeight:900,fontSize:"20px",letterSpacing:"1.5px",textTransform:"uppercase",textAlign:"center",margin:"0 0 8px" }}>Establecer nueva contraseña</h2>
                      <p style={{ color:"#6a7a99",fontSize:"13px",textAlign:"center",margin:"0 0 28px",lineHeight:1.5 }}>Ingresá tu nueva contraseña para recuperar el acceso a tu cuenta.</p>

                      <label style={{ display:"block",color:"#b8c8e0",fontSize:"13px",fontWeight:600,marginBottom:"6px" }}>Nueva contraseña <span style={{ color:"#f4a91f" }}>*</span></label>
                      <div style={{ position:"relative",marginBottom:"10px" }}>
                        <input value={resetNewPass} onChange={e=>setResetNewPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doResetPassword()}
                          type={showResetNew?"text":"password"} placeholder="Contraseña"
                          style={{ width:"100%",padding:"10px 48px 10px 18px",borderRadius:"10px",border:"1px solid #253048",background:"#192236",color:"#e6edf3",fontSize:"14px",outline:"none",boxSizing:"border-box" }}/>
                        <button onClick={()=>setShowResetNew(v=>!v)}
                          style={{ position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6a7a99",cursor:"pointer",fontSize:"18px",padding:0 }}>
                          {showResetNew ? "🙈" : "👁"}
                        </button>
                      </div>

                      {/* ── Password requirements — identical to registration form ── */}
                      {(()=>{
                        const has8     = resetNewPass.length >= 8;
                        const hasUpper = /[A-Z]/.test(resetNewPass);
                        const hasNum   = /[0-9]/.test(resetNewPass);
                        const hasSym   = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(resetNewPass);
                        const req = (ok: boolean, label: string) => (
                          <span key={label} style={{ display:"inline-flex",alignItems:"center",gap:"4px",fontSize:"12px",color: ok ? "#29c46d" : "#6a7a99",whiteSpace:"nowrap" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              {ok ? <polyline points="20 6 9 17 4 12"/> : <circle cx="12" cy="12" r="9"/>}
                            </svg>
                            {label}
                          </span>
                        );
                        return (
                          <div style={{ display:"flex",flexWrap:"wrap",gap:"6px 16px",marginBottom:"16px",padding:"10px 14px",borderRadius:"8px",background:"#111c2e",border:"1px solid #1e2a3d" }}>
                            {req(has8,     "8 caracteres")}
                            {req(hasUpper, "1 mayúscula")}
                            {req(hasNum,   "1 número")}
                            {req(hasSym,   "1 símbolo")}
                          </div>
                        );
                      })()}

                      <label style={{ display:"block",color:"#b8c8e0",fontSize:"13px",fontWeight:600,marginBottom:"6px" }}>Confirmar contraseña <span style={{ color:"#f4a91f" }}>*</span></label>
                      <div style={{ position:"relative",marginBottom:"20px" }}>
                        <input value={resetConfirmPass} onChange={e=>setResetConfirmPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doResetPassword()}
                          type={showResetConfirm?"text":"password"} placeholder="Confirmar contraseña"
                          style={{ width:"100%",padding:"10px 48px 10px 18px",borderRadius:"10px",border:`1px solid ${resetConfirmPass && resetConfirmPass!==resetNewPass?"#e53e3e":"#253048"}`,background:"#192236",color:"#e6edf3",fontSize:"14px",outline:"none",boxSizing:"border-box" }}/>
                        <button onClick={()=>setShowResetConfirm(v=>!v)}
                          style={{ position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6a7a99",cursor:"pointer",fontSize:"18px",padding:0 }}>
                          {showResetConfirm ? "🙈" : "👁"}
                        </button>
                      </div>

                      {resetError && <p style={{ color:"#ff5b5b",fontSize:"13px",margin:"0 0 14px",textAlign:"center",lineHeight:1.5 }}>{resetError}</p>}

                      <button onClick={doResetPassword} disabled={authLoading}
                        style={{ width:"100%",padding:"13px 0",borderRadius:"10px",background:"linear-gradient(180deg,#f6b531,#ea9807)",border:"none",color:"#0d1421",fontWeight:800,fontSize:"15px",cursor:authLoading?"not-allowed":"pointer",opacity:authLoading?0.7:1,transition:"filter .15s",letterSpacing:"0.3px" }}
                        onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"}
                        onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                        {authLoading ? "Guardando..." : "Establecer nueva contraseña"}
                      </button>
                    </>)}
                  </div>
                </>) : authModal === "forgot" ? (<>
                  <div style={{ flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-start",paddingTop:"30px" }}>
                    <h2 style={{ color:"#f4a91f",fontWeight:900,fontSize:"20px",letterSpacing:"1.5px",textTransform:"uppercase",textAlign:"center",margin:"0 0 28px" }}>Restablecer contraseña</h2>
                    <label style={{ display:"block",color:"#b8c8e0",fontSize:"13px",fontWeight:600,marginBottom:"6px" }}>Correo electrónico <span style={{ color:"#e53e3e" }}>*</span></label>
                    <input value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){if(!forgotEmail.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())){setForgotError("Ingresa un correo válido.");}else{setForgotError("");setForgotMsg("Si el correo está registrado, recibirás un enlace de recuperación.");}}}}
                      type="email" placeholder="Correo electrónico"
                      style={{ width:"100%",padding:"10px 18px",borderRadius:"10px",border:"1px solid #253048",background:"#192236",color:"#e6edf3",fontSize:"14px",outline:"none",boxSizing:"border-box",marginBottom:"16px" }}/>
                    {forgotError && <p style={{ color:"#ff5b5b",fontSize:"13px",margin:"-8px 0 14px",textAlign:"center" }}>{forgotError}</p>}
                    {forgotMsg && <p style={{ color:"#29c46d",fontSize:"13px",margin:"-8px 0 14px",textAlign:"center" }}>{forgotMsg}</p>}
                    <button onClick={async ()=>{
                      if (!forgotEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) { setForgotError("Ingresa un correo válido."); return; }
                      setForgotError(""); setForgotMsg("");
                      setAuthLoading(true);
                      const r = await authForgotPassword(forgotEmail.trim());
                      setAuthLoading(false);
                      if (r.error) setForgotError(r.error);
                      else setForgotMsg(r.message || "Si el correo está registrado, recibirás un enlace de recuperación.");
                    }}
                      disabled={authLoading}
                      style={{ width:"100%",padding:"11px 0",borderRadius:"10px",background:"linear-gradient(180deg,#f6b531,#ea9807)",border:"none",color:"#fff",fontWeight:700,fontSize:"15px",cursor:authLoading?"not-allowed":"pointer",opacity:authLoading?0.7:1,transition:"filter .15s",letterSpacing:"0.3px",marginBottom:"20px" }}
                      onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"}
                      onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                      {authLoading ? "Enviando..." : "Enviar correo de recuperación"}
                    </button>
                    <div style={{ textAlign:"center" }}>
                      <span onClick={()=>{ setForgotEmail(""); setForgotMsg(""); setForgotError(""); setAuthModal("login"); }}
                        style={{ color:"#e2e8f0",fontSize:"13px",cursor:"pointer",textDecoration:"underline",fontWeight:500 }}>
                        Volver al Inicio de Sesión
                      </span>
                    </div>
                  </div>
                </>) : authModal === "login" ? (<>
                  <label style={{ display:"block",color:"#b8c8e0",fontSize:"13px",fontWeight:600,marginBottom:"7px" }}>Usuario <span style={{ color:"#f4a91f" }}>*</span></label>
                  <input value={loginUser} onChange={e=>setLoginUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}
                    placeholder="Ingresa tu usuario"
                    style={{ width:"100%",padding:"10px 18px",borderRadius:"10px",border:"1px solid #253048",background:"#192236",color:"#e6edf3",fontSize:"14px",outline:"none",boxSizing:"border-box",marginBottom:"16px" }}/>
                  <label style={{ display:"block",color:"#b8c8e0",fontSize:"13px",fontWeight:600,marginBottom:"5px" }}>Contraseña <span style={{ color:"#f4a91f" }}>*</span></label>
                  <div style={{ position:"relative",marginBottom:"8px" }}>
                    <input value={loginPass} onChange={e=>setLoginPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}
                      type={showLoginPass?"text":"password"} placeholder="Contraseña"
                      style={{ width:"100%",padding:"10px 48px 10px 18px",borderRadius:"10px",border:"1px solid #253048",background:"#192236",color:"#e6edf3",fontSize:"14px",outline:"none",boxSizing:"border-box" }}/>
                    <button onClick={()=>setShowLoginPass(v=>!v)}
                      style={{ position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6a7a99",cursor:"pointer",fontSize:"18px",padding:0 }}>
                      {showLoginPass ? "🙈" : "👁"}
                    </button>
                  </div>
                  <div style={{ textAlign:"right",marginBottom:"28px" }}>
                    <span onClick={()=>{ setForgotEmail(""); setForgotMsg(""); setForgotError(""); setAuthModal("forgot"); }} style={{ color:"#f4a91f",fontSize:"12px",cursor:"pointer",fontWeight:500 }}>¿Olvidaste tu contraseña?</span>
                  </div>
                  {loginError && <p style={{ color:"#ff5b5b",fontSize:"13px",margin:"0 0 14px",textAlign:"center" }}>{loginError}</p>}
                  <button onClick={()=>doLogin()} disabled={authLoading}
                    style={{ width:"100%",padding:"11px 0",borderRadius:"10px",background:"linear-gradient(180deg,#f6b531,#ea9807)",border:"none",color:"#fff",fontWeight:700,fontSize:"16px",cursor:authLoading?"not-allowed":"pointer",opacity:authLoading?0.7:1,transition:"filter .15s",letterSpacing:"0.3px" }}
                    onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"}
                    onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                    {authLoading ? "Cargando..." : "Iniciar sesión"}
                  </button>
                </>) : (<>
                  <label style={{ display:"block",color:"#b8c8e0",fontSize:"13px",fontWeight:600,marginBottom:"7px" }}>Nombre para mostrar <span style={{ color:"#f4a91f" }}>*</span></label>
                  <input value={regUser} onChange={e=>setRegUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doRegister()} maxLength={20}
                    placeholder="3 a 20 caracteres"
                    style={{ width:"100%",padding:"10px 18px",borderRadius:"10px",border:"1px solid #253048",background:"#192236",color:"#e6edf3",fontSize:"14px",outline:"none",boxSizing:"border-box",marginBottom:"12px" }}/>
                  <label style={{ display:"block",color:"#b8c8e0",fontSize:"13px",fontWeight:600,marginBottom:"5px" }}>Correo electrónico <span style={{ color:"#f4a91f" }}>*</span></label>
                  {(() => {
                    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim());
                    const emailInvalid = regEmail.length > 0 && !emailValid;
                    return (<>
                      <input value={regEmail} onChange={e=>setRegEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doRegister()}
                        onFocus={()=>setRegEmailFocused(true)} onBlur={()=>setRegEmailFocused(false)}
                        type="email" placeholder="Correo electrónico"
                        style={{ width:"100%",padding:"10px 18px",borderRadius:"10px",border:`1px solid ${emailInvalid?"#ff5b5b":"#253048"}`,background:"#192236",color:"#e6edf3",fontSize:"14px",outline:"none",boxSizing:"border-box",marginBottom:(regEmailFocused||regEmail)?"6px":"12px" }}/>
                      {(regEmailFocused || regEmail.length > 0) && (
                        <p style={{ fontSize:"12px",margin:"0 0 14px",color: emailInvalid ? "#ff5b5b" : "#6a7a99",animation:"pwdReqIn 0.2s ease",transformOrigin:"top center" }}>
                          {emailInvalid
                            ? "Formato incorrecto. Ejemplo: nombre@dominio.com"
                            : emailValid
                              ? "✓ Correo válido"
                              : "Formato: nombre@dominio.com"}
                        </p>
                      )}
                    </>);
                  })()}
                  <label style={{ display:"block",color:"#b8c8e0",fontSize:"13px",fontWeight:600,marginBottom:"7px" }}>Contraseña <span style={{ color:"#f4a91f" }}>*</span></label>
                  <div style={{ position:"relative",marginBottom:(regPassFocused||regPass)?"10px":"16px" }}>
                    <input value={regPass} onChange={e=>setRegPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doRegister()}
                      onFocus={()=>setRegPassFocused(true)} onBlur={()=>setRegPassFocused(false)}
                      type={showRegPass?"text":"password"} placeholder="Contraseña"
                      style={{ width:"100%",padding:"10px 48px 10px 18px",borderRadius:"10px",border:"1px solid #253048",background:"#192236",color:"#e6edf3",fontSize:"14px",outline:"none",boxSizing:"border-box" }}/>
                    <button onClick={()=>setShowRegPass(v=>!v)}
                      style={{ position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6a7a99",cursor:"pointer",fontSize:"18px",padding:0 }}>
                      {showRegPass ? "🙈" : "👁"}
                    </button>
                  </div>
                  {(regPassFocused || regPass.length > 0) && (() => {
                    const has8 = regPass.length >= 8;
                    const hasUpper = /[A-Z]/.test(regPass);
                    const hasNum = /[0-9]/.test(regPass);
                    const hasSym = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(regPass);
                    const req = (ok: boolean, label: string) => (
                      <span key={label} style={{ display:"inline-flex",alignItems:"center",gap:"4px",fontSize:"12px",color: ok ? "#29c46d" : "#6a7a99",whiteSpace:"nowrap" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {ok ? <polyline points="20 6 9 17 4 12"/> : <circle cx="12" cy="12" r="9"/>}
                        </svg>
                        {label}
                      </span>
                    );
                    return (
                      <div style={{ display:"flex",flexWrap:"wrap",gap:"6px 16px",marginBottom:"16px",padding:"10px 14px",borderRadius:"8px",background:"#111c2e",border:"1px solid #1e2a3d",animation:"pwdReqIn 0.22s ease",transformOrigin:"top center" }}>
                        {req(has8, "8 caracteres")}
                        {req(hasUpper, "1 mayúscula")}
                        {req(hasNum, "1 número")}
                        {req(hasSym, "1 símbolo")}
                      </div>
                    );
                  })()}
                  <label style={{ display:"block",color:"#b8c8e0",fontSize:"13px",fontWeight:600,marginBottom:"7px" }}>Código de referido o bono <span style={{ color:"#6a7a99",fontWeight:400 }}>(opcional)</span></label>
                  <input value={regReferral} onChange={e=>setRegReferral(e.target.value)}
                    placeholder="Ingresa tu código"
                    style={{ width:"100%",padding:"10px 18px",borderRadius:"10px",border:"1px solid #253048",background:"#192236",color:"#e6edf3",fontSize:"14px",outline:"none",boxSizing:"border-box",marginBottom:"14px" }}/>
                  <label style={{ display:"flex",alignItems:"flex-start",gap:"10px",cursor:"pointer",marginBottom:"20px",userSelect:"none" }}>
                    <input type="checkbox" checked={regTerms} onChange={e=>setRegTerms(e.target.checked)}
                      style={{ marginTop:"2px",accentColor:"#f6b531",width:"16px",height:"16px",flexShrink:0,cursor:"pointer" }}/>
                    <span style={{ fontSize:"13px",color:"#8a9ab8",lineHeight:1.55 }}>
                      Acepto los{" "}
                      <span style={{ color:"#8a9ab8",cursor:"pointer" }} onClick={e=>{e.preventDefault();setAuthModal("");setSection("terms");window.scrollTo({top:0,behavior:"instant"});}}>Términos y Condiciones</span>
                      {" "}y la{" "}
                      <span style={{ color:"#f4a91f",cursor:"pointer" }} onClick={e=>{e.preventDefault();setAuthModal("");setSection("privacy");window.scrollTo({top:0,behavior:"instant"});}}>Política de Privacidad</span>
                    </span>
                  </label>
                  {regError && <p style={{ color:"#ff5b5b",fontSize:"13px",margin:"0 0 14px",textAlign:"center" }}>{regError}</p>}
                  {regSuccess && <p style={{ color:"#29c46d",fontSize:"13px",margin:"0 0 14px",textAlign:"center" }}>¡Cuenta creada! Revisá tu correo para confirmar y luego iniciá sesión.</p>}
                  <button onClick={()=>doRegister()} disabled={authLoading}
                    style={{ width:"100%",padding:"11px 0",borderRadius:"10px",background:"linear-gradient(180deg,#f6b531,#ea9807)",border:"none",color:"#fff",fontWeight:700,fontSize:"16px",cursor:authLoading?"not-allowed":"pointer",opacity:authLoading?0.7:1,transition:"filter .15s",letterSpacing:"0.3px" }}
                    onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"}
                    onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                    {authLoading ? "Creando cuenta..." : "Crear cuenta"}
                  </button>
                </>)}
              </div>
            </div>
          </div>
        </div>
      , document.body)}


    </div>
  );
}

// ─── Shared button styles ──────────────────────────────────────────────────
const primaryBtnStyle: React.CSSProperties = {
  width:"100%",padding:"12px 14px",marginTop:"10px",
  background:"linear-gradient(180deg,#f6b531,#ea9807)",color:"#fff",
  borderRadius:"10px",fontWeight:500,border:"none",cursor:"pointer",fontSize:"16px",
};
const secondaryBtnStyle: React.CSSProperties = {
  width:"100%",padding:"12px 14px",marginTop:"10px",
  background:"#2a3448",color:"#d9e0ea",borderRadius:"10px",
  fontWeight:500,border:"none",cursor:"pointer",fontSize:"16px",
};
const inputStyle: React.CSSProperties = {
  width:"100%",padding:"12px 14px",margin:"8px 0",
  background:"#1b2435",border:"1px solid #263149",borderRadius:"10px",
  color:"#fff",display:"block",boxSizing:"border-box",
};

// ─── Dice Game Component ──────────────────────────────────────────────────
interface DiceGameProps {
  balance: number; currentUser: string;
  diceBet: string; setDiceBet: (v:string)=>void;
  diceMultiplier: string; setDiceMultiplier: (v:string)=>void;
  diceTarget: string; setDiceTarget: (v:string)=>void;
  diceChance: string; setDiceChance: (v:string)=>void;
  diceAutoCount: string; setDiceAutoCount: (v:string)=>void;
  diceAutoRemaining: number;
  diceMarkerLeft: number; diceMarkerTransition: string; diceBubbleVal: string; diceBubbleWin: boolean|null;
  diceStats: DiceStats;
  diceAutoRunning: boolean;
  dicePayoutPreview: number;
  diceBetNum: number;
  syncDiceFields: (s:"multiplier"|"target"|"chance")=>void;
  placeDiceBet: ()=>void;
  startAutoDice: (s:{onWin:"reset"|"increase";onWinPct:number;onLose:"reset"|"increase";onLosePct:number;stopProfit:number|null;stopLoss:number|null;infinite?:boolean})=>void;
  stopAutoDice: ()=>void;
  halveDiceBet: ()=>void;
  doubleDiceBet: ()=>void;
  fmtMoney: (v:number)=>string;
  onBack: ()=>void;
  diceBetHistory: DiceBetRecord[];
  diceRolling: boolean;
  displayCurrency: string;
  diceBetUsd: number;
  currencyFade: number;
  diceMode: "over"|"under"; setDiceMode: (m:"over"|"under")=>void;
  lang: string;
  diceVol: number; setDiceVol: (v:number)=>void;
  convertUsd: (v:number)=>number;
  onResetStats: ()=>void;
  hideHistory?: boolean;
}

// ─── Shared APUESTAS table used by every game ────────────────────────────────
interface ApuestaRecord { amount:number; multiplier:number; win:boolean; payout:number; createdAt:string; }
function ApuestasSection({ records, gameLabel, gameIcon, fmtMoney: fmt }:
  { records:ApuestaRecord[]; gameLabel:string; gameIcon:React.ReactNode; fmtMoney:(v:number)=>string }) {
  return (
    <div style={{ maxWidth:"1080px", margin:"20px auto 28px", width:"100%", background:"#0d1a26", borderRadius:"14px", border:"1px solid #1a3347", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"14px 20px", borderBottom:"1px solid #1a3347", display:"flex", alignItems:"center", gap:"10px" }}>
        <span style={{ fontSize:"18px" }}>🏆</span>
        <span style={{ fontWeight:700, fontSize:"13px", color:"#f4a91f", letterSpacing:"1.5px", textTransform:"uppercase" }}>Apuestas</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:"4px" }}>
          {(["Todas las Apuestas","Grandes Ganancias","Apuestas Afortunadas"] as const).map((tab,i)=>(
            <div key={i} style={{ padding:"6px 14px", borderRadius:"999px", fontSize:"12px", cursor:"pointer", fontWeight:i===0?600:400, ...(i===0 ? { background:"#1a3347", border:"1px solid #2a4d68", color:"#e0eaf5" } : { color:"#4a6a88" }) }}>{tab}</div>
          ))}
        </div>
      </div>
      {/* Column headers */}
      <div style={{ display:"grid", gridTemplateColumns:"140px 1fr 1fr 1fr 1fr", padding:"10px 20px", borderBottom:"1px solid #152535", color:"#4a7090", fontSize:"12px", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px" }}>
        <span>Juego</span>
        <span style={{ textAlign:"center" }}>Hora</span>
        <span style={{ textAlign:"center" }}>Apuesta</span>
        <span style={{ textAlign:"center" }}>Multiplicador</span>
        <span style={{ textAlign:"right" }}>Pago</span>
      </div>
      {/* Rows */}
      {records.length === 0 ? (
        <div style={{ padding:"32px", textAlign:"center", color:"#4a6a80", fontSize:"14px" }}>Sin historial todavía</div>
      ) : records.slice(0,15).map((b,i)=>{
        const hora = new Date(b.createdAt).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});
        const paySign = b.win ? "+" : "-";
        const payAmt  = b.win ? (b.payout - b.amount).toFixed(2) : b.amount.toFixed(2);
        return (
          <div key={i} style={{ display:"grid", gridTemplateColumns:"140px 1fr 1fr 1fr 1fr", padding:"12px 20px", borderBottom:"1px solid #0f1e2c", alignItems:"center", background:i%2===0?"transparent":"rgba(255,255,255,.015)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <div style={{ width:"40px", height:"28px", borderRadius:"5px", overflow:"hidden", flexShrink:0, border:"1px solid rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center" }}>{gameIcon}</div>
              <span style={{ fontWeight:500, color:"#d0e2f0", fontSize:"13px" }}>{gameLabel}</span>
            </div>
            <div style={{ textAlign:"center", color:"#7a99b0", fontSize:"13px" }}>{hora}</div>
            <div style={{ textAlign:"center" }}>
              <span style={{ fontWeight:500, color:"#d0e2f0", fontSize:"13px" }}>{fmt(b.amount)}</span>
              <span style={{ marginLeft:"5px", background:"#0f8a6c", borderRadius:"999px", padding:"2px 6px", fontSize:"11px", color:"white", fontWeight:500 }}>₮</span>
            </div>
            <div style={{ textAlign:"center", color:"#d0e2f0", fontWeight:500, fontSize:"13px" }}>{b.multiplier.toFixed(2)}×</div>
            <div style={{ textAlign:"right", fontWeight:500, fontSize:"13px", color:b.win?"#21d97a":"#ff5a6a" }}>
              {paySign}{fmt(parseFloat(payAmt))}
              <span style={{ marginLeft:"5px", background:"#0f8a6c", borderRadius:"999px", padding:"2px 6px", fontSize:"11px", color:"white", fontWeight:500 }}>₮</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Game info panel shown at the top of every Original ──────────────────────
const GAME_META: Record<string, { title:string; bg:string; icon:string; img?:string; desc:string; sub?:string }> = {
  dice:      { title:"Mander Dados",     bg:"linear-gradient(135deg,#0f2a6e,#1a5cd6)", icon:"🎲", img:"/dice-card.jpg",       desc:"Lanza los dados y apuesta si el resultado cae por encima o por debajo de tu número objetivo. Tú controlas la probabilidad de ganar y el pago — cuanto mayor el riesgo, mayor la recompensa." },
  plinko:    { title:"Mander Plinko",    bg:"linear-gradient(135deg,#6e0a14,#d6293e)", icon:"🎯", img:"/plinko-thumb.jpg",    desc:"Suelta una bola desde la cima de una pirámide de clavos y observa cómo rebota hasta caer en un slot multiplicador. Elige tu nivel de riesgo y el número de filas para controlar la distribución del pago — desde ganancias pequeñas y frecuentes hasta hits de alto multiplicador." },
  keno:      { title:"Mander Keno",      bg:"linear-gradient(135deg,#7a4200,#f4a91f)", icon:"🔮", img:"/keno-thumb.jpg",      desc:"Elige hasta 10 números de un tablero de 40 casillas y observa cuántos coinciden con los 10 resultados sorteados. Selecciona tu nivel de riesgo para controlar la tabla de pagos — más riesgo significa multiplicadores más altos al acertar más números." },
  blackjack: { title:"Mander Blackjack", bg:"linear-gradient(135deg,#5c2800,#d67a10)", icon:"🃏", img:"/blackjack-thumb.jpg", desc:"Juega al Blackjack clásico con un zapato de 6 barajas verificado criptográficamente. Cada mano se reparte con tecnología provably fair, para que puedas verificar de forma independiente que la baraja fue mezclada sin manipulación. Pide, plántate, dobla o divide hasta llegar a 21." },
  mines:     { title:"Mander Mines",     bg:"linear-gradient(135deg,#0a1e3a,#1a4d8a)", icon:"💎", img:"/mines-card.jpg",      desc:"Navega por un campo minado descubriendo gemas y multiplicando tu apuesta. Elige el tamaño de la cuadrícula y la cantidad de minas, luego revela casillas una a una. Cobra cuando quieras — pero si golpeas una mina, lo pierdes todo." },
  slot:      { title:"Candy Burst",      bg:"linear-gradient(135deg,#5a0a7a,#c020d0)", icon:"🍬", sub:"Slots",               desc:"Gira los carretes y combina símbolos de dulces para ganar premios. Bonificaciones especiales, multiplicadores y giros gratis te esperan en cada tirada. ¡La suerte está de tu lado!" },
  hilo:      { title:"Mander Hilo",      bg:"linear-gradient(135deg,#004a2a,#00a85a)", icon:"🃠", img:"/hilo-card.jpg",       desc:"Predice si la siguiente carta será mayor o menor que la carta actual. Encadena aciertos consecutivos para multiplicar tu apuesta o retira tus ganancias en cualquier momento. Los multiplicadores se calculan dinámicamente según la probabilidad de cada carta." },
  roulette:  { title:"Mander Ruleta",    bg:"linear-gradient(135deg,#1a0a2e,#4a1a7a)", icon:"🎡", img:"/roulette-card.jpg",   desc:"Ruleta Europea con 37 números (0-36). Coloca fichas en números individuales, columnas, docenas o apuestas de dinero par como rojo/negro, par/impar y bajo/alto. Haz girar la rueda y descubre dónde cae la bola." },
  baccarat:  { title:"Mander Baccarat",  bg:"linear-gradient(135deg,#001830,#003a7a)", icon:"🃠", img:"/baccarat-card.jpg",   desc:"El clásico juego de cartas donde apostás al Jugador, la Banca o un Empate. Las cartas se reparten con totales módulo 10 y se aplican las reglas de tercera carta reales. Jugador paga 1:1, Banca paga 0.95:1 y Empate paga 8:1." },
};

type GameInfoSection = { heading: string; body?: string; bullets?: { label: string; text: string }[] };
const GAME_INFO: Record<string, GameInfoSection[]> = {
  dice: [
    { heading:"CÓMO JUGAR", body:"Establece tu monto de apuesta y elige un número objetivo con el slider. Luego selecciona Roll Over o Roll Under. Se genera un número aleatorio provably fair. Si el resultado cae en tu lado elegido del objetivo, ganas." },
    { heading:"PROBABILIDAD DE GANAR Y PAGOS", body:"Tu probabilidad de ganar está determinada por tu objetivo. Por ejemplo, tirar por encima de 50 te da un ~49.99% de probabilidad de ganar con un pago de aproximadamente 2x. Tirar por encima de 95 te da un ~4.99% de probabilidad con aproximadamente 19.8x. El multiplicador se ajusta automáticamente al mover el slider — siempre ves tus probabilidades exactas antes de apostar." },
    { heading:"VERIFICACIÓN PROVABLY FAIR", body:"Cada tirada se determina combinando la semilla del servidor, tu semilla de cliente y un nonce. Después de cada apuesta, puedes verificar que el resultado no fue manipulado usando las semillas de tu historial de juego. Puedes rotar tu semilla de cliente en cualquier momento entre tiradas." },
  ],
  plinko: [
    { heading:"CÓMO JUGAR", body:"Establece tu monto de apuesta, elige un nivel de riesgo (Bajo, Medio o Alto) y selecciona el número de filas (8 a 16). Presiona Apostar para soltar una bola desde la cima de la pirámide. La bola rebota en los clavos aleatoriamente y aterriza en uno de los slots multiplicadores del fondo. Tu pago es tu apuesta multiplicada por el valor del slot." },
    { heading:"NIVELES DE RIESGO", bullets:[
      { label:"Riesgo Bajo", text:"Los multiplicadores están distribuidos de forma más uniforme. La mayoría de las caídas devuelven cerca de tu apuesta con multiplicadores extremos más pequeños." },
      { label:"Riesgo Medio", text:"Una distribución equilibrada con multiplicadores altos moderados (hasta 110x en 16 filas) y pérdidas pequeñas más frecuentes." },
      { label:"Riesgo Alto", text:"Multiplicadores extremos en los bordes (hasta 1,000x en 16 filas) pero la mayoría de las caídas devuelven 0x. Alta varianza, alta recompensa." },
    ]},
    { heading:"VERIFICACIÓN PROVABLY FAIR", body:"Cada caída de bola se determina combinando la semilla del servidor, tu semilla de cliente y un nonce. El hash resultante determina la dirección en cada clavija, haciendo que cada rebote sea independientemente verificable. Puedes rotar tu semilla de cliente en cualquier momento entre caídas." },
  ],
  keno: [
    { heading:"CÓMO JUGAR", body:"Establece tu monto de apuesta y selecciona entre 1 y 10 números del tablero. Elige un nivel de riesgo (Clásico, Bajo, Medio o Alto), luego presiona Apostar. El juego sortea 10 números aleatorios. Tu pago depende de cuántos de tus picks coincidan con los números sorteados." },
    { heading:"NIVELES DE RIESGO Y PAGOS", bullets:[
      { label:"Clásico", text:"Pagos equilibrados en todos los conteos de aciertos." },
      { label:"Bajo", text:"Ganancias pequeñas frecuentes, pagos máximos moderados (hasta 1,000x)." },
      { label:"Medio", text:"Menos ganancias pero multiplicadores más altos en más coincidencias (hasta 1,000x)." },
      { label:"Alto", text:"La mayoría de las combinaciones pagan 0x, pero acertar todos los números paga hasta 1,000x." },
    ]},
    { heading:"VERIFICACIÓN PROVABLY FAIR", body:"Los 10 números sorteados se determinan combinando la semilla del servidor, tu semilla de cliente y un nonce. Cada sorteo es independientemente verificable — puedes comprobar las semillas de tu historial de juego después de cada ronda. Puedes rotar tu semilla de cliente en cualquier momento." },
  ],
  blackjack: [
    { heading:"CÓMO JUGAR", body:"Establece tu monto de apuesta y presiona Repartir para recibir dos cartas boca arriba. El crupier también recibe dos cartas, una boca arriba y una boca abajo. Tu objetivo es acercarte lo más posible a 21 sin pasarte. Las figuras (Rey, Reina, Jack) cuentan como 10, los Ases cuentan como 1 u 11, y todas las demás cartas cuentan a su valor nominal." },
    { heading:"TUS OPCIONES", bullets:[
      { label:"Pedir", text:"Saca otra carta del zapato." },
      { label:"Plantarse", text:"Conserva tu mano actual y deja jugar al crupier." },
      { label:"Doblar", text:"Dobla tu apuesta, saca exactamente una carta más, luego te plantas." },
      { label:"Dividir", text:"Si tus primeras dos cartas tienen el mismo valor, divídelas en dos manos separadas, cada una con su propia apuesta." },
      { label:"Seguro", text:"Cuando el crupier muestra un As, puedes hacer una apuesta lateral (la mitad de tu apuesta original) que paga 2:1 si el crupier tiene Blackjack." },
    ]},
    { heading:"PAGOS", body:"Una victoria estándar paga 1:1. Un Blackjack natural (un As más una carta de valor 10 en el reparto inicial) paga 3:2. Si empatas con el crupier, es un empate y se devuelve tu apuesta. El crupier debe pedir con 16 y plantarse con 17." },
    { heading:"VERIFICACIÓN PROVABLY FAIR", body:"Antes de cada mano, la semilla del servidor, tu semilla de cliente y un nonce se combinan para mezclar de forma determinista un zapato de 312 cartas (6 barajas estándar). Una vez completa la mano, puedes verificar la mezcla usando las semillas de tu historial de juego. También puedes rotar tu semilla de cliente en cualquier momento entre manos." },
  ],
  mines: [
    { heading:"CÓMO JUGAR", body:'Establece tu monto de apuesta y elige un tamaño de cuadrícula (5×5, 6×6, 7×7 u 8×8). Selecciona el número de minas usando un preset o ingresa un conteo personalizado. Presiona "Iniciar Juego" para comenzar, luego haz clic en las casillas para revelarlas. Cada casilla segura muestra una gema y aumenta tu multiplicador. Presiona "Cobrar" en cualquier momento para recoger tus ganancias.' },
    { heading:"MULTIPLICADOR Y RIESGO", bullets:[
      { label:"Menos minas", text:"= incrementos de multiplicador más pequeños por revelación, pero menor riesgo." },
      { label:"Más minas", text:"= saltos de multiplicador más grandes, pero mayor probabilidad de golpear una mina." },
      { label:"Cuadrículas más grandes", text:"dan más casillas para explorar con mayor profundidad estratégica." },
    ]},
    { heading:"VERIFICACIÓN PROVABLY FAIR", body:"Las posiciones de las minas se determinan antes de que comience el juego usando la semilla del servidor, tu semilla de cliente y un nonce. Cada juego es independientemente verificable." },
  ],
  slot: [
    { heading:"CÓMO JUGAR", body:"Establece tu monto de apuesta y presiona Girar. Los carretes se detienen aleatoriamente en una combinación de símbolos. Las combinaciones ganadoras siguen las líneas de pago definidas. Cuanto mayor tu apuesta, mayor el pago potencial." },
    { heading:"CARACTERÍSTICAS ESPECIALES", bullets:[
      { label:"Wild", text:"Sustituye cualquier símbolo normal para completar combinaciones ganadoras." },
      { label:"Scatter", text:"Activa giros gratis sin importar su posición en los carretes." },
      { label:"Giros Gratis", text:"Rondas adicionales sin costo donde todos los premios se multiplican." },
    ]},
    { heading:"PAGOS", body:"Cada símbolo tiene un valor de pago diferente. Consulta la tabla de pagos dentro del juego para ver los multiplicadores exactos. Las combinaciones de mayor valor resultan en los pagos más altos." },
  ],
  hilo: [
    { heading:"CÓMO JUGAR", body:"Establece tu apuesta y pulsa 'Nuevo Juego' para recibir tu primera carta. Luego elige MAYOR si crees que la siguiente carta tendrá un valor más alto (o igual), o MENOR si crees que será más baja (o igual). Encadena aciertos para multiplicar tus ganancias y retira cuando quieras." },
    { heading:"MULTIPLICADORES DINÁMICOS", body:"Los multiplicadores se calculan en tiempo real según la probabilidad de cada carta. Para una carta baja como el 2, MAYOR tiene un multiplicador bajo (~1.07x) porque es probable ganar, mientras que MENOR tiene un multiplicador alto (~6.44x) porque es difícil. El juego usa un RTP del 99%." },
    { heading:"RETIRAR O CONTINUAR", body:"Después de cada acierto puedes presionar 'Retirar' para cobrar tus ganancias acumuladas, o seguir apostando para multiplicar aún más. Si fallas en cualquier momento, pierdes tu apuesta inicial. La clave está en saber cuándo retirarse." },
    { heading:"VERIFICACIÓN PROVABLY FAIR", body:"Cada carta revelada se extrae de una baraja mezclada usando la semilla del servidor, tu semilla de cliente y un nonce. El orden completo de la baraja queda determinado antes de que comience la mano, y puede verificarse de forma independiente una vez finalizado el juego. Puedes rotar tu semilla de cliente en cualquier momento entre juegos." },
  ],
  roulette: [
    { heading:"CÓMO JUGAR", body:"Selecciona el valor de tu ficha y haz clic en los números, columnas, docenas o apuestas externas para colocar tus fichas. Puedes colocar varias fichas en diferentes posiciones antes de girar. Pulsa 'Apostar' para lanzar la rueda. La bola cae aleatoriamente en uno de los 37 números (0-36)." },
    { heading:"TIPOS DE APUESTA Y PAGOS", bullets:[
      { label:"Número exacto (Pleno)", text:"Apuesta a un número específico. Paga 35:1 (retorno total 36x tu apuesta)." },
      { label:"Columna (2:1)", text:"Cada fila del tablero (12 números). Paga 2:1 (retorno total 3x)." },
      { label:"Docena (2:1)", text:"1-12, 13-24 o 25-36. Paga 2:1 (retorno total 3x)." },
      { label:"Dinero par (1:1)", text:"Rojo/Negro, Par/Impar, Bajo (1-18)/Alto (19-36). Paga 1:1 (retorno total 2x). El 0 pierde todas las apuestas externas." },
    ]},
    { heading:"MODO AUTOMÁTICO", body:"Activa el modo Automático para lanzar la rueda repetidamente usando la misma distribución de fichas. Establece un número fijo de giros o usa ∞ para juego continuo. Pulsa 'Detener Auto' en cualquier momento para parar." },
    { heading:"VERIFICACIÓN PROVABLY FAIR", body:"Cada giro de la ruleta genera un número entre 0 y 36 combinando la semilla del servidor, tu semilla de cliente y un nonce de forma criptográficamente segura. El resultado es verificable de forma independiente: ninguna parte puede conocer o manipular el número ganador antes de que se lance la rueda." },
  ],
  baccarat: [
    { heading:"CÓMO JUGAR", body:"Selecciona el valor de tu ficha y haz clic en la zona de apuesta: Jugador, Banca o Empate. Podés apostar en varias zonas simultáneamente. Presioná 'Repartir' para iniciar la ronda. Se reparten dos cartas a cada lado, los totales se calculan módulo 10, y se aplican las reglas de tercera carta de Baccarat estándar para determinar si algún lado recibe carta adicional." },
    { heading:"TIPOS DE APUESTA Y PAGOS", bullets:[
      { label:"Jugador (1:1)", text:"Si la mano del Jugador tiene mayor valor que la de la Banca, ganás el doble de tu apuesta." },
      { label:"Banca (0.95:1)", text:"Si la mano de la Banca tiene mayor valor, ganás con una comisión del 5%. El retorno efectivo es 1.95x tu apuesta." },
      { label:"Empate (8:1)", text:"Si ambas manos terminan con el mismo valor, ganás 8x tu apuesta. Alta varianza y bajo RTP — se recomienda solo como apuesta secundaria." },
    ]},
    { heading:"VALORES DE CARTA", body:"Los Ases valen 1. Las figuras (J, Q, K) y los 10 valen 0. Todas las demás cartas valen su número. El total de cada mano es la suma de sus cartas módulo 10 — por ejemplo, 7+6=13 → 3." },
    { heading:"REGLAS DE TERCERA CARTA", body:"El Jugador recibe una tercera carta si su total es 0-5. La Banca sigue sus propias reglas de tercera carta que dependen de su total y la tercera carta del Jugador (reglas estándar de Baccarat). Ambos se plantan con 8 o 9 (natural)." },
    { heading:"MODO AUTOMÁTICO", body:"Activá el modo Auto para jugar rondas consecutivas automáticamente. Podés configurar la cantidad de rondas o usar ∞ para juego continuo. La apuesta se mantiene entre rondas. Presioná 'Detener Auto' en cualquier momento." },
    { heading:"VERIFICACIÓN PROVABLY FAIR", body:"El mazo de 8 barajas se mezcla usando la semilla del servidor, tu semilla de cliente y un nonce antes de cada zapato. El orden completo del mazo queda determinado criptográficamente antes del primer reparto. Cuando el zapato se agota (menos de 15 cartas), se genera un nuevo mazo verificable con un nuevo nonce." },
  ],
};

function gipIcon(heading: string) {
  if (heading.includes("JUGAR"))       return "📖";
  if (heading.includes("PROBABILIDAD") || heading.includes("PAGOS")) return "💰";
  if (heading.includes("NIVELES") || heading.includes("RIESGO") || heading.includes("MULTIPLICADOR")) return "📊";
  if (heading.includes("OPCIONES"))    return "🎮";
  if (heading.includes("VERIFICACIÓN") || heading.includes("PROVABLY")) return "🔒";
  if (heading.includes("ESPECIALES") || heading.includes("CARACTERÍSTICAS")) return "⭐";
  return "ℹ️";
}

function GameInfoPanel({ game, onFairness }: { game: keyof typeof GAME_META; onFairness?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const m = GAME_META[game];
  const sections = GAME_INFO[game] ?? [];
  return (
    <div className="gip-panel" style={{ maxWidth:"1080px", margin:"28px auto 18px", width:"100%", background:"#090e18", borderRadius:"14px", border:"1px solid #1a3347", overflow:"hidden" }}>

      {/* ── Top accent line ── */}
      <div style={{ height:"2px", background:`linear-gradient(90deg, ${m.bg.includes("135deg") ? m.bg.replace("linear-gradient(135deg,","").split(",")[0].trim() : "#f4a91f"} 0%, transparent 60%)`, opacity:0.7 }}/>

      <div style={{ padding:"24px 32px" }}>
        {/* ── Header row (static, not clickable) ── */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:"36px" }}>
          {/* Thumbnail */}
          <div style={{ flexShrink:0, width:"128px", height:"108px", borderRadius:"11px", background:m.bg, position:"relative", overflow:"hidden", boxShadow:"0 6px 22px rgba(0,0,0,.6)" }}>
            {(m as any).img
              ? <img src={(m as any).img} alt={game} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition:"center 80%" }}/>
              : <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 28% 20%, rgba(255,255,255,.28) 0%, transparent 58%)" }}/>
            }
            {!(m as any).img && <div style={{ position:"absolute", top:"8px", right:"10px", fontSize:"36px", filter:"drop-shadow(0 2px 10px rgba(0,0,0,.75))" }}>{m.icon}</div>}
          </div>

          {/* Title + badges + desc */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:"8px", marginBottom:"8px" }}>
              <span style={{ fontWeight:800, fontSize:"17px", color:"#e8f2ff", letterSpacing:"0.3px" }}>{m.title.toUpperCase()}</span>
              {!m.sub && (
                <span style={{ background:"rgba(244,169,31,.12)", border:"1px solid rgba(244,169,31,.35)", borderRadius:"999px", padding:"2px 10px", fontSize:"11px", color:"#f4a91f", fontWeight:600, letterSpacing:"0.5px", display:"inline-flex", alignItems:"center", gap:"4px" }}>
                  🔒 Provably Fair
                </span>
              )}
            </div>
            <p style={{ margin:0, fontSize:"13px", color:"#7a8fb0", lineHeight:"1.65", maxWidth:"680px" }}>{m.desc}</p>
          </div>
        </div>

        {/* ── Expandable detail sections ── */}
        {expanded && (
          <div style={{ marginTop:"4px" }}>
            {sections.map((sec, i) => (
              <div key={i} style={{ borderTop:"1px solid #1a2a3e", marginTop:"20px", paddingTop:"18px" }}>
                <div className="gip-section-heading">
                  <span>{gipIcon(sec.heading)}</span>
                  {sec.heading}
                </div>
                {sec.body && (
                  <p style={{ margin:0, fontSize:"13px", color:"#7a8fb0", lineHeight:"1.7" }}>
                    {sec.body}
                    {(sec.heading.includes("VERIFICACIÓN") || sec.heading.includes("PROVABLY")) && (
                      <> <span
                        className="gip-pf-link"
                        style={{ cursor: onFairness ? "pointer" : "default" }}
                        onClick={() => { if (onFairness) { window.scrollTo({ top:0, behavior:"instant" }); onFairness(); } }}
                      >Aprende más sobre verificación de equidad →</span></>
                    )}
                  </p>
                )}
                {sec.bullets && (
                  <div style={{ display:"flex", flexDirection:"column", gap:"2px", paddingLeft:"2px" }}>
                    {sec.bullets.map((b, j) => (
                      <div key={j} className="gip-bullet">
                        <span><strong style={{ color:"#c4d4ec", fontWeight:600 }}>{b.label}</strong>{" "}<span style={{ color:"#5a6e8a" }}>—</span>{" "}{b.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Toggle button ── */}
        <button className="gip-toggle-btn" onClick={() => setExpanded(e => !e)}>
          {expanded ? "Mostrar menos" : "Cómo jugar y más"}
          <span className={`gip-arrow${expanded ? " open" : ""}`}>▾</span>
        </button>
      </div>
    </div>
  );
}

// ─── Global Footer ────────────────────────────────────────────────────────────
function CasinoFooter({ onHome }: { onHome?: () => void }) {
  return (
    <footer style={{ background:"#060c14", margin:"60px -16px -16px", width:"calc(100% + 32px)", padding:"40px 24px 0", fontFamily:"'Inter',sans-serif" }}>
      <div style={{ maxWidth:"1080px", margin:"0 auto" }}>

        {/* Top grid: logo | links | community */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 180px 160px", gap:"48px", alignItems:"start", marginBottom:"32px" }}>

          {/* Logo + description */}
          <div>
            <div style={{ position:"relative", height:"76px", marginBottom:"14px", overflow:"visible" }}>
              <img src="/mander-logo.png" alt="Mander" onClick={() => { onHome?.(); window.scrollTo({ top: 0, behavior: "instant" }); }} style={{ height:"140px", position:"absolute", bottom:-36, left:-55, cursor:"pointer" }} />
            </div>
            <p style={{ fontSize:"12px", color:"#3e5270", lineHeight:"1.7", margin:"0 0 10px" }}>
              Manderbet.com es propiedad de y está operado por Mander Group Ltd., número de registro: 27481, con dirección registrada en Kingstown, San Vicente y las Granadinas.
            </p>
            <p style={{ fontSize:"12px", color:"#3e5270", lineHeight:"1.7", margin:"0 0 10px" }}>
              Manderbet.com está licenciado y regulado por la Autoridad de Juego de Curaçao y opera bajo la Licencia Nº 365/JAZ. Mander cumple con todos los requisitos regulatorios aplicables y está autorizado para ofrecer servicios de juegos de azar y apuestas en línea.
            </p>
            <p style={{ fontSize:"12px", color:"#3e5270", lineHeight:"1.7", margin:"0" }}>
              Para consultas, contáctenos en: <span style={{ color:"#5a85a8" }}>support@manderbet.com</span>
            </p>
          </div>

          {/* Enlaces útiles */}
          <div>
            <div style={{ fontSize:"13px", fontWeight:700, color:"#c8d8f0", letterSpacing:"0.4px", marginBottom:"16px" }}>
              Enlaces útiles
            </div>
            {[
              { label:"Referidos",              nav:"referrals" },
              { label:"Justicia",               nav:"fairness" },
              { label:"Soporte",                nav:"support" },
              { label:"Términos de servicio",   nav:"terms" },
              { label:"Política de privacidad", nav:"privacy" },
              { label:"Política AML",     nav:"privacy" },
            ].map(({ label, nav }) => (
              <div key={label} style={{ marginBottom:"9px" }}>
                <span style={{ fontSize:"13px", color:"#4a6280", cursor:"pointer", transition:"color .15s" }}
                  onMouseEnter={e=>(e.currentTarget.style.color="#c8d8f0")}
                  onMouseLeave={e=>(e.currentTarget.style.color="#4a6280")}
                  onClick={()=>window.dispatchEvent(new CustomEvent("casino-nav",{detail:nav}))}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Comunidad + selectors */}
          <div>
            <div style={{ fontSize:"13px", fontWeight:700, color:"#c8d8f0", letterSpacing:"0.4px", marginBottom:"16px" }}>
              Comunidad
            </div>
            <div style={{ display:"flex", gap:"10px", marginBottom:"20px" }}>
              {/* Telegram */}
              <button title="Telegram"
                style={{ background:"#0e1826", border:"1px solid #1e2e44", borderRadius:"10px", width:"44px", height:"44px", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"background .15s, border .15s" }}
                onMouseEnter={e=>{ e.currentTarget.style.background="#0d2d4a"; e.currentTarget.style.border="1px solid #2294d6"; }}
                onMouseLeave={e=>{ e.currentTarget.style.background="#0e1826"; e.currentTarget.style.border="1px solid #1e2e44"; }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.93 6.728-1.703 8.027c-.128.576-.464.717-.94.446l-2.6-1.915-1.254 1.206c-.14.14-.257.257-.526.257l.187-2.653 4.836-4.369c.21-.187-.046-.29-.324-.103L8.39 14.41l-2.55-.796c-.554-.173-.565-.554.116-.82l9.963-3.839c.46-.168.863.103.712.773z" fill="#2294d6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div style={{ fontSize:"12px", color:"#253345", paddingBottom:"20px", borderTop:"1px solid #0d1624", paddingTop:"18px" }}>
          Derechos de autor © 2026 Manderbet.com. Todos los derechos reservados.
        </div>

        {/* Badges */}
        <div style={{ paddingBottom:"28px", display:"flex", gap:"10px", flexWrap:"wrap" }}>
          {[
            { icon:"18+",  color:"#e53e3e", label:"Juego Responsable" },
            { icon:"✔",   color:"#2f9f5a", label:"Comprobablemente Justo" },
            { icon:"🛡",   color:"#e07b20", label:"Licenciado" },
          ].map(b=>(
            <div key={b.label} style={{ display:"flex", alignItems:"center", gap:"8px", background:"#0b1120", border:"1px solid #141f30", borderRadius:"999px", padding:"7px 16px" }}>
              <span style={{ fontSize:"13px", fontWeight:800, color:b.color }}>{b.icon}</span>
              <span style={{ fontSize:"12px", fontWeight:600, color:"#607090" }}>{b.label}</span>
            </div>
          ))}
        </div>

      </div>
    </footer>
  );
}

// ─── More From Mander section shown at the bottom of every Original ───────────
interface MoreFromLocklyProps {
  currentGame: "dice"|"plinko"|"keno"|"blackjack"|"mines"|"slot"|"hilo"|"roulette"|"baccarat";
  onGames: { dice:()=>void; plinko:()=>void; keno:()=>void; blackjack:()=>void; mines:()=>void; slot?:()=>void; hilo?:()=>void; roulette?:()=>void; baccarat?:()=>void };
  onVerTodo?: () => void;
}
function MoreFromLockly({ currentGame, onGames, onVerTodo }: MoreFromLocklyProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const ALL = [
    { key:"dice"      as const, label:"Dados",     sub:"Mander Originals", bg:"linear-gradient(135deg,#0f2a6e,#1a5cd6)", img:"/dice-card.jpg",       accentBg:"#1a5cd6" },
    { key:"plinko"    as const, label:"Plinko",    sub:"Mander Originals", bg:"linear-gradient(135deg,#6e0a14,#d6293e)", img:"/plinko-thumb.jpg",    accentBg:"#d6293e" },
    { key:"keno"      as const, label:"Keno",      sub:"Mander Originals", bg:"linear-gradient(135deg,#7a4200,#f4a91f)", img:"/keno-thumb.jpg",      accentBg:"#f4a91f" },
    { key:"blackjack" as const, label:"Blackjack", sub:"Mander Originals", bg:"linear-gradient(135deg,#5c2800,#d67a10)", img:"/blackjack-thumb.jpg", accentBg:"#d67a10" },
    { key:"mines"     as const, label:"Mines",     sub:"Mander Originals", bg:"linear-gradient(135deg,#0a1e3a,#1a4d8a)", img:"/mines-card.jpg",      accentBg:"#1a4d8a" },
    { key:"hilo"      as const, label:"Hilo",      sub:"Mander Originals", bg:"linear-gradient(135deg,#004a2a,#00a85a)", img:"/hilo-card.jpg",       accentBg:"#00d47a" },
    { key:"roulette"  as const, label:"Ruleta",    sub:"Mander Originals", bg:"linear-gradient(135deg,#1a0a2e,#4a1a7a)", img:"/roulette-card.jpg",   accentBg:"#9b59b6" },
    { key:"baccarat"  as const, label:"Baccarat",  sub:"Mander Originals", bg:"linear-gradient(135deg,#001830,#003a7a)", img:"/baccarat-card.jpg",   accentBg:"#1a64e0" },
  ];

  const scroll = (dir: "left"|"right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 360 : -360, behavior: "smooth" });
  };

  return (
    <div style={{ maxWidth:"1080px", margin:"40px auto 0", width:"100%", paddingBottom:"4px" }}>

      {/* ── Section header ── */}
      <div style={{ display:"flex", alignItems:"center", gap:"14px", marginBottom:"16px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <div style={{ width:"3px", height:"18px", borderRadius:"2px", background:"linear-gradient(to bottom,#f4a91f,rgba(244,169,31,0.3))", flexShrink:0 }}/>
          <span style={{ fontWeight:700, fontSize:"12px", color:"#c8d8f0", letterSpacing:"2px", textTransform:"uppercase" }}>Más de Mander</span>
        </div>
        <span style={{ background:"rgba(244,169,31,0.1)", border:"1px solid rgba(244,169,31,0.25)", borderRadius:"999px", padding:"2px 9px", fontSize:"10px", color:"rgba(244,169,31,0.8)", fontWeight:600, letterSpacing:"0.6px" }}>
          Originales
        </span>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:"8px" }}>
          <button
            onClick={() => onVerTodo?.()}
            style={{ background:"none", border:"none", cursor:"pointer", color:"#6a8fb0", fontSize:"12px", fontWeight:600, letterSpacing:"0.3px", padding:"4px 0", transition:"color .15s" }}
            onMouseEnter={e=>(e.currentTarget.style.color="#f4a91f")}
            onMouseLeave={e=>(e.currentTarget.style.color="#6a8fb0")}>
            Ver todo
          </button>
          <div style={{ width:"1px", height:"14px", background:"#1e2e44" }}/>
          {(["left","right"] as const).map(dir=>(
            <button key={dir} onClick={() => scroll(dir)} className="lockly-nav-btn"
              style={{ background:"#0f1824", border:"1px solid #1e2e44", borderRadius:"8px", color:"#5a7090", padding:"5px 13px", fontSize:"15px", lineHeight:1, fontWeight:700, cursor:"pointer", transition:"all .15s" }}
              onMouseEnter={e=>{ e.currentTarget.style.background="#1a2a40"; e.currentTarget.style.color="#f4a91f"; }}
              onMouseLeave={e=>{ e.currentTarget.style.background="#0f1824"; e.currentTarget.style.color="#5a7090"; }}>
              {dir === "left" ? "‹" : "›"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cards row ── */}
      <div ref={scrollRef} style={{ display:"flex", gap:"14px", overflowX:"auto", overflowY:"visible", paddingBottom:"14px", paddingTop:"10px", paddingLeft:"4px", paddingRight:"4px", marginTop:"-10px", marginLeft:"-4px", marginRight:"-4px", scrollbarWidth:"none" }}>
        {ALL.map(g => {
          const isCurrent = g.key === currentGame;
          return (
            <div
              key={g.key}
              onClick={isCurrent ? undefined : onGames[g.key]}
              className={isCurrent ? undefined : "lockly-game-card"}
              style={{ cursor: isCurrent ? "default" : "pointer", flexShrink:0, userSelect:"none", opacity: isCurrent ? 0.6 : 1, width:"162px" }}
            >
              <div
                className={isCurrent ? undefined : "lockly-thumb"}
                style={{ width:"162px", height:"148px", borderRadius:"13px", background:g.bg, position:"relative", overflow:"hidden",
                  boxShadow: isCurrent ? `0 0 0 2.5px #f4a91f, 0 6px 20px rgba(0,0,0,.5)` : `0 4px 18px rgba(0,0,0,.5)` }}
              >
                <img src={g.img} alt={g.label} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition:"center 70%", zIndex:0 }} />
                {isCurrent && (
                  <div style={{ position:"absolute", top:"10px", left:"10px", zIndex:3, background:"rgba(244,169,31,0.9)", borderRadius:"6px", padding:"2px 8px", fontSize:"9px", fontWeight:700, color:"#0e1320", letterSpacing:"0.8px", textTransform:"uppercase" }}>
                    Jugando
                  </div>
                )}
              </div>
              <div style={{ marginTop:"9px", paddingLeft:"2px" }}>
                <div className="lockly-card-label-name" style={{ fontSize:"13px", fontWeight:700, color: isCurrent ? "#f4a91f" : "#c8d8f0", letterSpacing:"0.2px" }}>{g.label}</div>
                <div style={{ display:"flex", alignItems:"center", gap:"5px", marginTop:"3px" }}>
                  <span style={{ fontSize:"10px", color:"#3a5070", fontWeight:500 }}>Mander Originals</span>
                  <span style={{ fontSize:"9px", color:"rgba(244,169,31,0.5)", fontWeight:600 }}>· PF</span>
                </div>
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}

function DiceGame({ balance, currentUser, diceBet, setDiceBet, diceMultiplier, setDiceMultiplier,
  diceTarget, setDiceTarget, diceChance, setDiceChance, diceAutoCount, setDiceAutoCount, diceAutoRemaining,
  diceMarkerLeft, diceMarkerTransition, diceBubbleVal, diceBubbleWin, diceStats, diceAutoRunning, dicePayoutPreview,
  diceBetNum, syncDiceFields, placeDiceBet, startAutoDice, stopAutoDice,
  halveDiceBet, doubleDiceBet, fmtMoney, onBack, diceBetHistory, diceRolling, displayCurrency, diceBetUsd, currencyFade, lang,
  diceVol, setDiceVol, convertUsd, diceMode, setDiceMode, onResetStats, hideHistory = false
}: DiceGameProps) {
  const t = (key: string) => tl(lang, key);
  const [diceTab, setDiceTab] = useState<"manual"|"auto">("manual");
  const [autoInfinite, setAutoInfinite] = useState(false);
  const [autoOnWin, setAutoOnWin] = useState<"reset"|"increase">("reset");
  const [autoOnWinPct, setAutoOnWinPct] = useState("0");
  const [autoOnLose, setAutoOnLose] = useState<"reset"|"increase">("reset");
  const [autoOnLosePct, setAutoOnLosePct] = useState("0");
  const [autoStopProfit, setAutoStopProfit] = useState("");
  const [autoStopLoss, setAutoStopLoss] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsPos, setStatsPos] = useState({ x: 270, y: 180 });
  const [chartHover, setChartHover] = useState<number|null>(null);
  const [showVol, setShowVol] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isDraggingStats = useRef(false);
  const statsDragOffset = useRef({ x: 0, y: 0 });

  function handleStatsDragStart(e: React.MouseEvent) {
    e.preventDefault();
    isDraggingStats.current = true;
    statsDragOffset.current = { x: e.clientX - statsPos.x, y: e.clientY - statsPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingStats.current) return;
      setStatsPos({ x: ev.clientX - statsDragOffset.current.x, y: ev.clientY - statsDragOffset.current.y });
    };
    const onUp = () => {
      isDraggingStats.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const targetNum = parseFloat(diceTarget)||50.5;
  const splitPct = targetNum;
  const lastTickPos = useRef(-1);
  const currFlag = CURRENCY_FLAGS[displayCurrency] ?? "🌐";
  const currLabel = displayCurrency;
  const dMStyle: React.CSSProperties = { opacity: currencyFade, transition: "opacity 0.18s ease" };

  function playSliderTick(pct: number) {
    if (diceVol === 0) return;
    try {
      const vol = diceVol / 100;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(400 + pct * 6, ctx.currentTime);
      gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.06);
      osc.onended = () => ctx.close();
    } catch {}
  }

  function handleDragStart(e: React.MouseEvent | React.TouchEvent) {
    if (diceAutoRunning) return;
    e.preventDefault();
    isDragging.current = true;

    function applyPos(clientX: number) {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const trackStart = rect.left + rect.width * 0.05;
      const trackWidth = rect.width * 0.90;
      const rawPct = ((clientX - trackStart) / trackWidth) * 100;
      const t = Math.min(98.99, Math.max(1, rawPct));
      const c = 100 - t;
      const m = 99 / c;
      setDiceTarget(t.toFixed(2));
      setDiceChance(c.toFixed(4));
      setDiceMultiplier(m.toFixed(4));
      if (Math.abs(t - lastTickPos.current) >= 3) {
        lastTickPos.current = t;
        playSliderTick(t);
      }
    }

    const grabStyle = document.createElement("style");
    grabStyle.id = "__dice-grab";
    grabStyle.textContent = "* { cursor: grabbing !important; }";
    document.head.appendChild(grabStyle);

    const onMove = (e: MouseEvent) => { if (isDragging.current) applyPos(e.clientX); };
    const onTouch = (e: TouchEvent) => { if (isDragging.current) applyPos(e.touches[0].clientX); };
    const onUp = () => {
      isDragging.current = false;
      document.getElementById("__dice-grab")?.remove();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouch, { passive: false });
    window.addEventListener("touchend", onUp);
  }

  return (
    <div className="dice-root" style={{ maxWidth:"1080px", margin:"0 auto", position:"relative" }}>
      <div style={{ display:"grid",gridTemplateColumns:"300px 1fr",gridTemplateRows:"auto 1fr",gap:"0",height:"714px",background:"#0e1320",borderRadius:"16px",overflow:"hidden",border:"1px solid #153650" }}>

        {/* ── Bordered header bar ── */}
        <div style={{ gridColumn:"1/-1", display:"flex", alignItems:"center", gap:"10px", padding:"10px 20px", background:"#0e1826", borderBottom:"1px solid #1a2438", flexShrink:0 }}>
          <button onClick={onBack} style={{ background:"#131a28", border:"1px solid #252f45", color:"#8090b0", cursor:"pointer", fontSize:"18px", padding:"5px 12px", borderRadius:"8px", lineHeight:1 }}>←</button>
          <div style={{ fontWeight:500, fontSize:"15px", letterSpacing:"1.5px", color:"#fff", display:"flex", alignItems:"center", gap:"8px" }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1.4" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>DICE</div>
          <div style={{ marginLeft:"auto", fontSize:"12px", color:"#5a6a88", fontWeight:500 }}>Mander Originals</div>
        </div>
        {/* ── Left panel ── */}
        <div style={{ background:"#131a28",padding:"16px",display:"flex",flexDirection:"column",gap:"0",overflowY:"auto",minHeight:0 }}>
          {/* Mode tabs */}
          <div style={{ display:"flex",alignItems:"center",background:"#0e1826",borderRadius:"14px",padding:"5px",gap:"4px",marginBottom:"16px" }}>
            <button onClick={()=>{ if(!diceAutoRunning) setDiceTab("manual"); }} disabled={diceAutoRunning}
              style={{ flex:1,background:diceTab==="manual"?"#1e2c44":"transparent",color:diceTab==="manual"?"#eef3f8":"#5a6a88",border:diceTab==="manual"?"1px solid #3a4a60":"1px solid transparent",borderRadius:"10px",padding:"10px",fontWeight:500,cursor:diceAutoRunning?"not-allowed":"pointer",fontSize:"14px",opacity:diceAutoRunning&&diceTab!=="manual"?0.45:1,transition:"opacity .2s" }}>
              {t("manual")}
            </button>
            <button onClick={()=>{ if(!diceAutoRunning) setDiceTab("auto"); }} disabled={diceAutoRunning}
              style={{ flex:1,background:diceTab==="auto"?"#1e2c44":"transparent",color:diceTab==="auto"?"#eef3f8":"#5a6a88",border:diceTab==="auto"?"1px solid #3a4a60":"1px solid transparent",borderRadius:"10px",padding:"10px",fontWeight:500,cursor:diceAutoRunning?"not-allowed":"pointer",fontSize:"14px",opacity:diceAutoRunning&&diceTab!=="auto"?0.45:1,transition:"opacity .2s" }}>
              {t("automatic")}
            </button>
          </div>

          {/* ── MANUAL TAB ── */}
          {diceTab==="manual" && <>
            <div style={{ color:"#5a6a88",fontWeight:500,marginBottom:"6px",fontSize:"13px",paddingLeft:"4px" }}>{t("betAmount")}</div>

            {/* Input row */}
            <div style={{ display:"flex",alignItems:"center",gap:"8px",background:"#0e1826",border:`1px solid ${diceBetUsd < 0.0099 ? "#c0392b" : "#252f45"}`,borderRadius:"10px",padding:"8px 14px",marginBottom:"8px" }}>
              <span style={{ fontSize:"16px",color:"#5a6a88",fontWeight:500,whiteSpace:"nowrap",...dMStyle }}>{currLabel}</span>
              <input
                value={(()=>{
                  if(!diceBet) return "";
                  const [int,dec] = diceBet.split(".");
                  const fmtInt = (parseInt(int||"0")||0).toLocaleString("en-US");
                  return dec !== undefined ? `${fmtInt}.${dec}` : fmtInt;
                })()}
                onChange={e=>{
                  const raw = e.target.value.replace(/,/g,"");
                  if(/^\d*\.?\d*$/.test(raw)) setDiceBet(raw);
                }}
                type="text" inputMode="decimal" placeholder="0.00"
                style={{ flex:1,background:"transparent",border:"none",color:"white",fontSize:"22px",fontWeight:600,padding:"0",minWidth:0,...dMStyle }} />
              <button onClick={()=>setDiceBet("0.00")}
                style={{ background:"#0e1826",border:"1px solid #252f45",borderRadius:"6px",color:"#6db3f2",fontSize:"11px",fontWeight:500,padding:"4px 8px",cursor:"pointer",letterSpacing:"0.04em",whiteSpace:"nowrap",textTransform:"uppercase" }}>
                {t("clear")}
              </button>
            </div>

            {/* Quick-action buttons */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",marginBottom:"8px" }}>
              {[
                { label:"Min", action:()=>setDiceBet((Math.ceil(convertUsd(0.01)*100)/100).toFixed(2)) },
                { label:"½",   action:halveDiceBet },
                { label:"2×",  action:doubleDiceBet },
                { label:"Max", action:()=>setDiceBet((Math.floor(convertUsd(balance)*100)/100).toFixed(2)) },
              ].map(b=>(
                <button key={b.label} onClick={b.action}
                  style={{ background:"#1a2438",color:"#d0dcea",border:"1px solid #252f45",borderRadius:"8px",padding:"8px 0",fontWeight:500,fontSize:"13px",cursor:"pointer" }}>
                  {b.label}
                </button>
              ))}
            </div>

            {diceBetUsd < 0.0099 && (
              <div style={{ fontSize:"11.5px", color:"#e74c3c", fontWeight:600, marginBottom:"8px", paddingLeft:"2px" }}>
                {t("minBet")} {fmtMoney(0.01)}
              </div>
            )}
            {diceBetUsd >= 0.0099 && <div style={{ marginBottom:"6px" }} />}

            <button onClick={placeDiceBet} disabled={diceRolling||diceBetUsd<0.0099||(!!currentUser&&balance<diceBetUsd-0.0001)}
              style={{ width:"100%",marginBottom:"14px",border:"none",borderRadius:"10px",padding:"14px",fontWeight:500,fontSize:"15px",transition:"all .2s",opacity:diceRolling?.7:1,
                background:((currentUser&&balance<diceBetUsd-0.0001)||diceBetUsd<0.0099||diceRolling)?"#1a2438":"linear-gradient(180deg,#1a9fff,#0d6fd4)",
                color:((currentUser&&balance<diceBetUsd-0.0001)||diceBetUsd<0.0099||diceRolling)?"#3a4a60":"#fff",
                boxShadow:((currentUser&&balance<diceBetUsd-0.0001)||diceBetUsd<0.0099||diceRolling)?"none":"0 4px 22px rgba(26,159,255,.35)",
                cursor:(diceRolling||diceBetUsd<0.0099||(!!currentUser&&balance<diceBetUsd-0.0001))?"not-allowed":"pointer" }}>
              {diceRolling ? t("rolling") : (currentUser&&balance<diceBetUsd-0.0001) ? t("insufficientBalance") : "▶ " + t("bet")}
            </button>

            <div style={{ color:"#5a6a88",fontWeight:500,marginBottom:"6px",fontSize:"13px",paddingLeft:"4px" }}>{t("toWin")}</div>
            <div style={{ display:"flex",alignItems:"center",gap:"8px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"10px",padding:"8px 14px",marginBottom:"14px" }}>
              <span style={{ fontSize:"16px",color:"#5a6a88",fontWeight:500,whiteSpace:"nowrap",...dMStyle }}>{currLabel}</span>
              <input readOnly
                value={diceBetNum > 0 ? (diceBetNum * Math.max(1.01, parseFloat(diceMultiplier)||2)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}
                style={{ flex:1,background:"transparent",border:"none",color:diceBetNum>0?"#00d95f":"#4a6070",fontSize:"22px",fontWeight:600,padding:"0",minWidth:0,...dMStyle }} />
            </div>
          </>}

          {/* ── AUTO TAB ── */}
          {diceTab==="auto" && <>
            <div style={{ color:"#5a6a88",fontWeight:500,marginBottom:"6px",fontSize:"13px",paddingLeft:"4px" }}>{t("betAmount")}</div>

            {/* Input row */}
            <div style={{ display:"flex",alignItems:"center",gap:"8px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"10px",padding:"8px 14px",marginBottom:"8px" }}>
              <span style={{ fontSize:"16px",color:"#5a6a88",fontWeight:500,whiteSpace:"nowrap",...dMStyle }}>{currLabel}</span>
              <input
                value={(()=>{
                  if(!diceBet) return "";
                  const [int,dec] = diceBet.split(".");
                  const fmtInt = (parseInt(int||"0")||0).toLocaleString("en-US");
                  return dec !== undefined ? `${fmtInt}.${dec}` : fmtInt;
                })()}
                onChange={e=>{
                  const raw = e.target.value.replace(/,/g,"");
                  if(/^\d*\.?\d*$/.test(raw)) setDiceBet(raw);
                }}
                type="text" inputMode="decimal" placeholder="0.00"
                style={{ flex:1,background:"transparent",border:"none",color:"white",fontSize:"22px",fontWeight:600,padding:"0",minWidth:0,...dMStyle }} />
              <button onClick={()=>setDiceBet("0.00")}
                style={{ background:"#0e1826",border:"1px solid #252f45",borderRadius:"6px",color:"#6db3f2",fontSize:"11px",fontWeight:500,padding:"4px 8px",cursor:"pointer",letterSpacing:"0.04em",whiteSpace:"nowrap",textTransform:"uppercase" }}>
                {t("clear")}
              </button>
            </div>

            {/* Quick-action buttons */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",marginBottom:"14px" }}>
              {[
                { label:"Min", action:()=>setDiceBet((Math.ceil(convertUsd(0.01)*100)/100).toFixed(2)) },
                { label:"½",   action:halveDiceBet },
                { label:"2×",  action:doubleDiceBet },
                { label:"Max", action:()=>setDiceBet((Math.floor(convertUsd(balance)*100)/100).toFixed(2)) },
              ].map(b=>(
                <button key={b.label} onClick={b.action}
                  style={{ background:"#1a2438",color:"#d0dcea",border:"1px solid #252f45",borderRadius:"8px",padding:"8px 0",fontWeight:500,fontSize:"13px",cursor:"pointer" }}>
                  {b.label}
                </button>
              ))}
            </div>

            <div style={{ color:"#5a6a88",fontWeight:500,marginBottom:"6px",fontSize:"13px" }}>{t("numberOfBets")}</div>
            {(()=>{
              const countInvalid = !autoInfinite && (diceAutoCount==="" || (parseInt(diceAutoCount)||0) <= 0);
              return (
                <div>
                  <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:`1px solid ${countInvalid?"#c0392b":"#252f45"}`,borderRadius:"10px",padding:"6px 10px",marginBottom: countInvalid ? "4px" : "14px" }}>
                    <input
                      value={diceAutoRunning ? String(diceAutoRemaining) : (autoInfinite?"∞":diceAutoCount)}
                      onChange={e=>{ setAutoInfinite(false); setDiceAutoCount(e.target.value); }}
                      onBlur={()=>{ if(!autoInfinite && (diceAutoCount===""|| (parseInt(diceAutoCount)||0)<=0)) setDiceAutoCount("1"); }}
                      type={autoInfinite?"text":"number"} min="1" readOnly={autoInfinite || diceAutoRunning}
                      style={{ flex:1,background:"transparent",border:"none",color:"white",fontSize:"20px",padding:"4px",minWidth:0 }} />
                    <button onClick={()=>setAutoInfinite(v=>!v)}
                      style={{ padding:"4px 10px",borderRadius:"6px",background:autoInfinite?"#1f6fd0":"#2a4155",color:"#d0dcea",border:"none",fontWeight:500,cursor:"pointer",fontSize:"16px" }}>∞</button>
                  </div>
                  {countInvalid && (
                    <div style={{ fontSize:"11.5px",color:"#e74c3c",fontWeight:600,marginBottom:"10px",paddingLeft:"2px" }}>
                      {t("minBetsCount")}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Advanced toggle ── */}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",padding:"8px 12px",background:"#152334",borderRadius:"10px",border:"1px solid #1e3548" }}>
              <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"13px" }}>Avanzado</span>
              <div onClick={()=>setShowAdvanced(v=>!v)}
                style={{ width:"42px",height:"24px",borderRadius:"12px",background:showAdvanced?"#1f6fd0":"#2a3f54",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0 }}>
                <div style={{ position:"absolute",top:"3px",left:showAdvanced?"21px":"3px",width:"18px",height:"18px",borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px #0005" }}/>
              </div>
            </div>

            {showAdvanced && <div>
            {/* ── On Win ── */}
            <div style={{ marginBottom:"12px" }}>
              <div style={{ color:"#5a6a88",fontWeight:500,fontSize:"12px",marginBottom:"5px" }}>Al ganar</div>
              <div style={{ display:"flex",gap:"6px",marginBottom:"6px" }}>
                {(["reset","increase"] as const).map(mode=>(
                  <button key={mode} onClick={()=>setAutoOnWin(mode)}
                    style={{ flex:1,padding:"7px 0",borderRadius:"8px",fontSize:"12px",fontWeight:500,cursor:"pointer",border:"none",
                      background:autoOnWin===mode?"#1f6fd0":"#1a2438",color:autoOnWin===mode?"#fff":"#7a9db8",transition:"background .15s" }}>
                    {mode==="reset"?"Reiniciar":"Aumentar"}
                  </button>
                ))}
              </div>
              {autoOnWin==="increase" && (
                <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"8px",padding:"6px 10px" }}>
                  <input value={autoOnWinPct} onChange={e=>setAutoOnWinPct(e.target.value.replace(/[^\d.]/g,""))}
                    type="text" inputMode="decimal" placeholder="0"
                    style={{ flex:1,background:"transparent",border:"none",color:"#fff",fontSize:"16px",fontWeight:500,minWidth:0 }}/>
                  <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"14px" }}>%</span>
                </div>
              )}
            </div>

            {/* ── On Lose ── */}
            <div style={{ marginBottom:"12px" }}>
              <div style={{ color:"#5a6a88",fontWeight:500,fontSize:"12px",marginBottom:"5px" }}>Al perder</div>
              <div style={{ display:"flex",gap:"6px",marginBottom:"6px" }}>
                {(["reset","increase"] as const).map(mode=>(
                  <button key={mode} onClick={()=>setAutoOnLose(mode)}
                    style={{ flex:1,padding:"7px 0",borderRadius:"8px",fontSize:"12px",fontWeight:500,cursor:"pointer",border:"none",
                      background:autoOnLose===mode?"#1f6fd0":"#1a2438",color:autoOnLose===mode?"#fff":"#7a9db8",transition:"background .15s" }}>
                    {mode==="reset"?"Reiniciar":"Aumentar"}
                  </button>
                ))}
              </div>
              {autoOnLose==="increase" && (
                <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"8px",padding:"6px 10px" }}>
                  <input value={autoOnLosePct} onChange={e=>setAutoOnLosePct(e.target.value.replace(/[^\d.]/g,""))}
                    type="text" inputMode="decimal" placeholder="0"
                    style={{ flex:1,background:"transparent",border:"none",color:"#fff",fontSize:"16px",fontWeight:500,minWidth:0 }}/>
                  <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"14px" }}>%</span>
                </div>
              )}
            </div>

            {/* ── Stop on Profit ── */}
            <div style={{ marginBottom:"12px" }}>
              <div style={{ color:"#5a6a88",fontWeight:500,fontSize:"12px",marginBottom:"5px" }}>Parar al ganar</div>
              <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"8px",padding:"6px 10px" }}>
                <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"13px",whiteSpace:"nowrap" }}>{displayCurrency}</span>
                <input value={autoStopProfit} onChange={e=>setAutoStopProfit(e.target.value.replace(/[^\d.]/g,""))}
                  type="text" inputMode="decimal" placeholder="0 = desactivado"
                  style={{ flex:1,background:"transparent",border:"none",color:"#fff",fontSize:"15px",fontWeight:500,minWidth:0 }}/>
              </div>
            </div>

            {/* ── Stop on Loss ── */}
            <div style={{ marginBottom:"12px" }}>
              <div style={{ color:"#5a6a88",fontWeight:500,fontSize:"12px",marginBottom:"5px" }}>Parar al perder</div>
              <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"8px",padding:"6px 10px" }}>
                <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"13px",whiteSpace:"nowrap" }}>{displayCurrency}</span>
                <input value={autoStopLoss} onChange={e=>setAutoStopLoss(e.target.value.replace(/[^\d.]/g,""))}
                  type="text" inputMode="decimal" placeholder="0 = desactivado"
                  style={{ flex:1,background:"transparent",border:"none",color:"#fff",fontSize:"15px",fontWeight:500,minWidth:0 }}/>
              </div>
            </div>
            </div>}

            {diceBetUsd < 0.0099 && (
              <div style={{ fontSize:"11.5px",color:"#e74c3c",fontWeight:600,marginBottom:"8px",paddingLeft:"2px" }}>
                {t("minBet")} {fmtMoney(0.01)}
              </div>
            )}

            {diceAutoRunning ? (
              <button onClick={stopAutoDice}
                style={{ width:"100%",padding:"14px",background:"#c0392b",color:"#fff",border:"none",borderRadius:"10px",fontWeight:500,fontSize:"16px",cursor:"pointer" }}>
                ⏹ {t("stopAuto")}
              </button>
            ) : (
              <button
                onClick={()=>{
                  startAutoDice({
                    onWin: autoOnWin,
                    onWinPct: parseFloat(autoOnWinPct)||0,
                    onLose: autoOnLose,
                    onLosePct: parseFloat(autoOnLosePct)||0,
                    stopProfit: autoStopProfit ? parseFloat(autoStopProfit)||null : null,
                    stopLoss: autoStopLoss ? parseFloat(autoStopLoss)||null : null,
                    infinite: autoInfinite,
                  });
                }}
                disabled={diceBetUsd < 0.0099 || balance < diceBetUsd - 0.0001 || (!autoInfinite && (diceAutoCount==="" || (parseInt(diceAutoCount)||0) <= 0))}
                style={{ width:"100%",padding:"14px",border:"none",borderRadius:"10px",fontWeight:500,fontSize:"15px",transition:"all .2s",
                  background:(diceBetUsd<0.0099||balance<diceBetUsd-0.0001||(!autoInfinite&&(diceAutoCount===""||((parseInt(diceAutoCount)||0)<=0))))?"#1a2438":"linear-gradient(180deg,#1a9fff,#0d6fd4)",
                  color:(diceBetUsd<0.0099||balance<diceBetUsd-0.0001||(!autoInfinite&&(diceAutoCount===""||((parseInt(diceAutoCount)||0)<=0))))?"#3a4a60":"#fff",
                  boxShadow:(diceBetUsd<0.0099||balance<diceBetUsd-0.0001||(!autoInfinite&&(diceAutoCount===""||((parseInt(diceAutoCount)||0)<=0))))?"none":"0 4px 22px rgba(26,159,255,.35)",
                  cursor:(diceBetUsd<0.0099||balance<diceBetUsd-0.0001||(!autoInfinite&&(diceAutoCount===""||((parseInt(diceAutoCount)||0)<=0))))?"not-allowed":"pointer" }}>
                {"▶ "+(balance < diceBetUsd - 0.0001 ? t("insufficientBalance") : t("startAuto"))}
              </button>
            )}
          </>}

          {/* Icon buttons row — bottom of left panel */}
          <div style={{ marginTop:"auto",paddingTop:"18px",display:"flex",gap:"8px",position:"relative" }}>
            <button
              onClick={()=>setShowStats(v=>!v)}
              title="Estadísticas"
              style={{ width:"38px",height:"38px",borderRadius:"8px",background:showStats?"#1f6fd0":"#0e1826",border:showStats?"1px solid #3a8aff":"1px solid #203a50",color:showStats?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",transition:"background .2s,border .2s,color .2s" }}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
            </button>

            {/* Volume button + popup */}
            <div style={{ position:"relative" }}>
              {showVol && (
                <div onClick={()=>setShowVol(false)}
                  style={{ position:"fixed",inset:0,zIndex:98 }}/>
              )}
              <button
                onClick={()=>setShowVol(v=>!v)}
                title="Volumen"
                style={{ position:"relative",zIndex:100,width:"38px",height:"38px",borderRadius:"8px",background:showVol?"#1f6fd0":"#0e1826",border:showVol?"1px solid #3a8aff":"1px solid #203a50",color:showVol?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",transition:"background .2s,border .2s,color .2s" }}>
                {diceVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : diceVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
              </button>

              {showVol && (
                <div style={{ position:"absolute",bottom:"48px",left:"0",background:"#0f1e2e",border:"1px solid #252f45",borderRadius:"12px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"12px",minWidth:"220px",boxShadow:"0 4px 20px rgba(0,0,0,.5)",zIndex:100 }}>
                  <span style={{ fontSize:"18px",flexShrink:0,color:"#5a6a88" }}>{diceVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : diceVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}</span>
                  <input
                    type="range" min="0" max="100" step="1"
                    value={diceVol}
                    onChange={e=>setDiceVol(Number(e.target.value))}
                    style={{ flex:1,accentColor:"#f4a91f",cursor:"pointer",height:"4px" }}
                  />
                  <span style={{ color:"#d0dcea",fontWeight:500,fontSize:"13px",minWidth:"24px",textAlign:"right" }}>{diceVol}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Center panel ── */}
        <div style={{ background:"#09141f",padding:"18px",display:"flex",flexDirection:"column" }}>

          {/* History pills */}
          <div style={{ display:"flex",gap:"6px",flexWrap:"nowrap",minHeight:"38px",overflow:"hidden",marginBottom:"6px" }}>
            {diceStats.history.slice(0,10).map((h,i)=>(
              <div key={`${h.win}_${h.value}_${i}`} style={{ flex:"1 1 0",minWidth:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"7px 4px",borderRadius:"999px",fontWeight:800,fontFamily:"'Inter',sans-serif",background:h.win?"#1eff00":"#495c6b",fontSize:"11.7px",color:h.win?"#06280a":"white",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
                {h.value.toFixed(2)}
              </div>
            ))}
          </div>

          {/* Big result number — flex:1 centers it in remaining space */}
          <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",minHeight:"44px" }}>
            {diceBubbleWin !== null && (
              <div style={{
                position:"absolute",width:"55%",height:"65%",
                background: diceBubbleWin
                  ? "radial-gradient(ellipse at center,rgba(0,255,80,0.15) 0%,transparent 70%)"
                  : "radial-gradient(ellipse at center,rgba(255,45,60,0.15) 0%,transparent 70%)",
                filter:"blur(12px)",
                pointerEvents:"none",
              }}/>
            )}
            <span style={{
              fontSize:"68px",fontWeight:900,letterSpacing:"-2px",lineHeight:1,
              position:"relative",
              color: diceBubbleWin === null ? "#1a2436"
                   : diceBubbleWin       ? "#00ff50" : "#ff3344",
              textShadow: diceBubbleWin === null ? "none"
                        : diceBubbleWin
                          ? "0 0 14px rgba(0,255,80,.55)"
                          : "0 0 14px rgba(255,50,60,.55)",
              transition:"color .25s,text-shadow .25s",userSelect:"none",
            }}>
              {diceBubbleWin === null ? "—" : diceBubbleVal}
            </span>
          </div>

          {/* Bottom section: slider + controls */}
          <div style={{ display:"flex",flexDirection:"column",gap:"12px" }}>

            {/* Slider — diamond ABOVE frame, ticks BELOW frame */}
            <div style={{ position:"relative",paddingTop:"50px" }}>

              {/* Framed track box — no horizontal padding so % coords match diamond coords */}
              <div style={{ background:"#090f1c",border:"1px solid #252f45",borderRadius:"12px",padding:"10px 0" }}>
                <div ref={trackRef} style={{ position:"relative",height:"24px" }}>

                  {/* Diamond marker — lives INSIDE trackRef so % aligns with track */}
                  {diceBubbleWin !== null && (
                    <div style={{ position:"absolute",bottom:"100%",marginBottom:"6px",left:`${diceMarkerLeft}%`,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",transition:diceMarkerTransition,zIndex:3,pointerEvents:"none" }}>
                      <div style={{
                        width:"42px",height:"42px",
                        clipPath:"polygon(50% 0%,100% 50%,50% 100%,0% 50%)",
                        background: diceBubbleWin
                          ? "linear-gradient(135deg,#2eff7a,#16b830)"
                          : "linear-gradient(135deg,#ff5566,#c9202f)",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        transition:"background .3s",
                        filter: diceBubbleWin
                          ? "drop-shadow(0 0 10px rgba(22,184,48,.8))"
                          : "drop-shadow(0 0 10px rgba(201,32,47,.8))",
                        userSelect:"none",
                      }}>
                        <span style={{ fontSize:"11px",fontWeight:900,color:"#fff",letterSpacing:"-0.5px",lineHeight:1 }}>{diceBubbleVal}</span>
                      </div>
                      {/* Stem connects diamond bottom to the track frame */}
                      <div style={{ width:"2px",height:"14px",background: diceBubbleWin?"rgba(22,184,48,.5)":"rgba(201,32,47,.5)",transition:"background .3s" }}/>
                    </div>
                  )}

                  {/* Track outer pill */}
                  <div style={{ position:"absolute",left:"5%",right:"5%",top:"2px",height:"20px",borderRadius:"999px",background:"#08111d",border:"2px solid #1a2638" }}/>

                  {/* Colored gradient bar */}
                  <div style={{ position:"absolute",left:"5%",right:"5%",top:"2px",height:"20px",borderRadius:"999px",overflow:"hidden",pointerEvents:"none" }}>
                    <div style={{ width:"100%",height:"100%",background: diceMode==="over"
                      ? `linear-gradient(90deg,#c9202f 0%,#c9202f ${splitPct}%,#16b830 ${splitPct}%,#16b830 100%)`
                      : `linear-gradient(90deg,#16b830 0%,#16b830 ${splitPct}%,#c9202f ${splitPct}%,#c9202f 100%)` }}/>
                  </div>

                  {/* Draggable white pill handle */}
                  <div
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                    style={{
                      position:"absolute",top:"-8px",
                      left:`${5 + targetNum*0.9}%`,
                      transform:"translateX(-50%)",
                      width:"22px",height:"36px",
                      background: diceAutoRunning ? "#3a4a5c" : "linear-gradient(180deg,#e8edf5,#c8d4e0)",
                      borderRadius:"999px",border:`2px solid ${diceAutoRunning ? "#4a5a6c" : "#f0f4fc"}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      zIndex:5,cursor:diceAutoRunning?"not-allowed":"grab",userSelect:"none",touchAction:"none",
                      boxShadow:"0 2px 8px rgba(0,0,0,.55)",
                      opacity: diceAutoRunning ? 0.5 : 1,
                      transition:"background .2s,border-color .2s,opacity .2s",
                    }}>
                    <div style={{ display:"flex",flexDirection:"column",gap:"3px" }}>
                      {[0,1,2].map(i=><div key={i} style={{ width:"10px",height:"2px",background:"rgba(80,100,130,0.7)",borderRadius:"1px" }}/>)}
                    </div>
                  </div>

                </div>
              </div>

              {/* Tick numbers — BELOW the frame */}
              <div style={{ position:"relative",height:"18px",marginTop:"4px" }}>
                {[0,25,50,75,100].map(v=>{
                  const leftPct = 5 + v * 0.9;
                  return (
                    <div key={v} style={{ position:"absolute",left:`${leftPct}%`,top:"0",transform:"translateX(-50%)",userSelect:"none" }}>
                      <span style={{ color:"#4a5a70",fontWeight:500,fontSize:"11px" }}>{v}</span>
                    </div>
                  );
                })}
              </div>

            </div>

          {/* Controls — pinned to bottom */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",background:"#131a28",borderRadius:"12px",padding:"16px" }}>

            {/* Multiplier */}
            <div>
              <label style={{ display:"block",color:"#5a6a88",fontWeight:500,marginBottom:"8px",fontSize:"13px" }}>{t("multiplierLabel")}</label>
              <input value={diceMultiplier} onChange={e=>setDiceMultiplier(e.target.value)} onBlur={()=>syncDiceFields("multiplier")} type="number"
                disabled={diceAutoRunning}
                style={{ background:"#0e1826",border:"1px solid #252f45",borderRadius:"10px",color:diceAutoRunning?"#4a6070":"white",padding:"10px 12px",width:"100%",boxSizing:"border-box",cursor:diceAutoRunning?"not-allowed":"text",opacity:diceAutoRunning?0.55:1 }} />
            </div>

            {/* Roll Over/Under — flip icon inside input */}
            <div>
              <label style={{ display:"block",color:"#5a6a88",fontWeight:500,marginBottom:"8px",fontSize:"13px" }}>
                {diceMode==="over" ? t("rollOver") : t("rollUnder")}
              </label>
              <div style={{ position:"relative" }}>
                <input value={diceTarget} onChange={e=>setDiceTarget(e.target.value)} onBlur={()=>syncDiceFields("target")} type="number"
                  disabled={diceAutoRunning}
                  style={{ background:"#0e1826",border:"1px solid #252f45",borderRadius:"10px",color:diceAutoRunning?"#4a6070":"white",padding:"10px 38px 10px 12px",width:"100%",boxSizing:"border-box",cursor:diceAutoRunning?"not-allowed":"text",opacity:diceAutoRunning?0.55:1 }} />
                <button
                  disabled={diceAutoRunning}
                  onClick={()=>{
                    if (diceAutoRunning) return;
                    const newMode = diceMode==="over" ? "under" : "over";
                    setDiceMode(newMode);
                    const cur = parseFloat(diceTarget)||50.5;
                    setDiceTarget(Math.min(98.99,Math.max(1,100-cur)).toFixed(2));
                  }}
                  title="Invertir dirección"
                  style={{ position:"absolute",right:"8px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:diceAutoRunning?"#252f45":"#6db3f2",cursor:diceAutoRunning?"not-allowed":"pointer",fontSize:"17px",lineHeight:1,padding:"2px",display:"flex",alignItems:"center",opacity:diceAutoRunning?0.35:1,transition:"opacity .2s,color .2s" }}>
                  ↺
                </button>
              </div>
            </div>

            {/* Chance */}
            <div>
              <label style={{ display:"block",color:"#5a6a88",fontWeight:500,marginBottom:"8px",fontSize:"13px" }}>{t("chance")+" %"}</label>
              <input value={diceChance} onChange={e=>setDiceChance(e.target.value)} onBlur={()=>syncDiceFields("chance")} type="number"
                disabled={diceAutoRunning}
                style={{ background:"#0e1826",border:"1px solid #252f45",borderRadius:"10px",color:diceAutoRunning?"#4a6070":"white",padding:"10px 12px",width:"100%",boxSizing:"border-box",cursor:diceAutoRunning?"not-allowed":"text",opacity:diceAutoRunning?0.55:1 }} />
            </div>

          </div>
          </div>{/* end bottom section */}
        </div>{/* end center panel */}

      </div>

      {/* ── Floating draggable stats panel ── */}
      {showStats && (
        <div style={{
          position:"fixed",
          left: statsPos.x,
          top: statsPos.y,
          zIndex:9999,
          width:"280px",
          background:"#0f1f2e",
          border:"1px solid #1e3a52",
          borderRadius:"14px",
          boxShadow:"0 8px 32px rgba(0,0,0,.7)",
          overflow:"hidden",
          userSelect:"none",
        }}>
          {/* Drag handle header */}
          <div
            onMouseDown={handleStatsDragStart}
            style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:"#112232",borderBottom:"1px solid #1e3a52",cursor:"grab" }}>
            <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
              <span style={{ display:"flex",alignItems:"center",color:"#7a9db8" }}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></span>
              <strong style={{ fontSize:"14px",color:"#d8e8f5" }}>{t("liveStats")}</strong>
            </div>
            <button onClick={()=>setShowStats(false)} style={{ background:"none",border:"none",color:"#7a9db8",fontSize:"18px",cursor:"pointer",lineHeight:1,padding:"0 2px" }}>×</button>
          </div>

          <div style={{ padding:"12px" }}>
            {/* Stats grid */}
            <div style={{ background:"#0d1a28",borderRadius:"10px",padding:"12px",marginBottom:"8px",display:"flex",flexDirection:"column",gap:"8px" }}>
              {([
                { label: t("profitLabel"), value: fmtMoney(diceStats.profit), color: diceStats.profit>=0?"#16ff5c":"#ff5959", extra: dMStyle },
                { label: t("won"),        value: String(diceStats.wins),      color: "#16ff5c", extra: {} },
                { label: t("wagered"),    value: fmtMoney(diceStats.wagered), color: "#d8e8f5", extra: dMStyle },
                { label: t("lostLabel"),  value: String(diceStats.losses),    color: "#ff5959", extra: {} },
              ] as {label:string;value:string;color:string;extra:React.CSSProperties}[]).map(s=>(
                <div key={s.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ color:"#7a9db8",fontSize:"11.5px" }}>{s.label}</span>
                  <span style={{ color:s.color,fontWeight:500,fontSize:"13px",...s.extra }}>{s.value}</span>
                </div>
              ))}
            </div>
            {/* Reset button */}
            <button
              onClick={onResetStats}
              style={{ width:"100%",marginBottom:"8px",background:"transparent",border:"1px solid #1e3a52",borderRadius:"8px",color:"#7a9db8",fontSize:"12px",cursor:"pointer",padding:"6px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",transition:"color .15s,border-color .15s,background .15s" }}
              onMouseEnter={e=>{const b=e.currentTarget as HTMLButtonElement;b.style.color="#fff";b.style.borderColor="#3a8aff";b.style.background="#0d1f30";}}
              onMouseLeave={e=>{const b=e.currentTarget as HTMLButtonElement;b.style.color="#7a9db8";b.style.borderColor="#1e3a52";b.style.background="transparent";}}
            ><span style={{ fontSize:"14px" }}>↺</span> Reiniciar estadísticas</button>

            {/* Mini chart — cumulative profit */}
            {(()=>{
              const raw = diceStats.history.length>0 ? diceStats.history.slice().reverse() : null;
              const W=320, H=210, PAD_X=12, PAD_Y=20;
              const chartW = W-PAD_X*2, chartH = H-PAD_Y*2;

              // build cumulative profit series (starts at 0)
              interface ChartPt { cum:number; win:boolean; profit:number }
              let series: ChartPt[] = [];
              if(raw){
                let running = 0;
                series = raw.map(p=>{ running += (p.profit??0); return { cum:running, win:p.win, profit:p.profit??0 }; });
              }

              // add origin point at start
              const allPts: ChartPt[] = raw ? [{ cum:0, win:false, profit:0 }, ...series] : [];
              const n = allPts.length;
              const cums = allPts.map(p=>p.cum);
              const minC = Math.min(0, ...cums);
              const maxC = Math.max(0, ...cums);
              const range = maxC - minC || 1;

              const toX = (i:number) => PAD_X + i * (chartW / Math.max(n-1,1));
              const toY = (v:number) => PAD_Y + chartH - ((v - minC) / range) * chartH;
              const zeroY = toY(0);

              const xs = allPts.map((_,i)=>toX(i));
              const ys = allPts.map(p=>toY(p.cum));

              // find max-profit point (last win) index among original series (skip origin)
              const maxIdx = series.length>0 ? series.reduce((best,p,i)=>p.cum>series[best].cum?i:best,0)+1 : -1;

              const hIdx = chartHover; // hover index in allPts
              const hpt = hIdx!==null && hIdx>0 && hIdx<allPts.length ? allPts[hIdx] : null;
              const hx = hIdx!==null ? xs[hIdx] : 0;

              // build line path — guard: need at least 2 points to draw
              const isProfit = diceStats.profit >= 0;
              if (n < 2) return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #1a3347" }}>
                  <span style={{ color:"#2a4a6a",fontSize:"12px" }}>Sin historial</span>
                </div>
              );

              const linePath = xs.map((x,i)=>`${i===0?"M":"L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");

              // fill: clip above zero = green, below zero = red
              const fillAbove = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const fillBelow = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;

              // tooltip pixel position (SVG coords map to % of container since no padding)
              const tipXpct = hIdx!==null && xs.length ? (xs[hIdx]/W)*100 : 0;
              const tipYpct = hIdx!==null && ys.length ? (ys[hIdx]/H)*100 : 0;
              // clamp so tooltip doesn't overflow edges
              const tipLeft = Math.min(Math.max(tipXpct, 12), 78);
              const tipTop  = Math.max(tipYpct - 14, 2); // shift above the dot

              return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",overflow:"visible",border:"1px solid #1a3347" }}>
                  {/* Tooltip — follows cursor position */}
                  {hpt && (
                    <div style={{
                      position:"absolute",
                      left:`${tipLeft}%`,
                      top:`${tipTop}%`,
                      transform:"translateX(-50%) translateY(-100%)",
                      background:"#1a2a3a",
                      border:`1.5px solid ${hpt.profit>=0?"#19ff35":"#ff3350"}`,
                      borderRadius:"8px",
                      padding:"4px 10px",
                      fontSize:"12px",
                      fontWeight:500,
                      color: hpt.profit>=0?"#19ff35":"#ff3350",
                      whiteSpace:"nowrap",
                      pointerEvents:"none",
                      zIndex:20,
                      boxShadow:`0 2px 12px ${hpt.profit>=0?"rgba(25,255,53,.3)":"rgba(255,51,80,.3)"}`,
                    }}>
                      {hpt.profit>=0?"+":""}{fmtMoney(hpt.profit)}
                      <span style={{ color:"#7a9db8",fontWeight:400,fontSize:"10px",marginLeft:"6px" }}>
                        acum: {hpt.cum>=0?"+":""}{fmtMoney(hpt.cum)}
                      </span>
                    </div>
                  )}
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:"100%",height:"100%",display:"block",cursor:"crosshair" }}
                    onMouseMove={e=>{
                      if(!xs.length) return;
                      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                      const svgX = ((e.clientX - rect.left) / rect.width) * W;
                      let closest = 0, minDist = Infinity;
                      xs.forEach((x,i)=>{ const d=Math.abs(x-svgX); if(d<minDist){ minDist=d; closest=i; } });
                      setChartHover(closest);
                    }}
                    onMouseLeave={()=>setChartHover(null)}
                  >
                    <defs>
                      <clipPath id="clipAbove"><rect x={PAD_X} y={PAD_Y} width={chartW} height={zeroY-PAD_Y}/></clipPath>
                      <clipPath id="clipBelow"><rect x={PAD_X} y={zeroY} width={chartW} height={chartH-(zeroY-PAD_Y)}/></clipPath>
                    </defs>
                    {n>1 ? <>
                      {/* fill below zero — red */}
                      <path d={fillBelow} fill="rgba(200,30,30,.35)" clipPath="url(#clipBelow)"/>
                      {/* fill above zero — green */}
                      <path d={fillAbove} fill="rgba(25,255,80,.18)" clipPath="url(#clipAbove)"/>
                      {/* zero line */}
                      <line x1={PAD_X} y1={zeroY} x2={W-PAD_X} y2={zeroY} stroke="#2a4055" strokeWidth="1.5"/>
                      {/* main line: green above zero, red below zero */}
                      <path d={linePath} fill="none" stroke="#19ff35" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#clipAbove)"/>
                      <path d={linePath} fill="none" stroke="#e03030" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#clipBelow)"/>
                      {/* transparent overlay to capture mouse across whole chart */}
                      <rect x={PAD_X} y={PAD_Y} width={chartW} height={chartH} fill="transparent"/>
                      {/* hover dot + vertical guide */}
                      {hIdx!==null && hIdx<allPts.length && (
                        <>
                          <line x1={xs[hIdx]} y1={PAD_Y} x2={xs[hIdx]} y2={H-PAD_Y} stroke="#3a5570" strokeWidth="1" strokeDasharray="4,3"/>
                          <circle cx={xs[hIdx]} cy={ys[hIdx]} r="5"
                            fill={allPts[hIdx].profit>=0?"#19ff35":"#ff3350"}
                            stroke="#0a1520" strokeWidth="2"
                            style={{ pointerEvents:"none" }}/>
                        </>
                      )}
                    </> : (
                      <line x1={PAD_X} y1={H/2} x2={W-PAD_X} y2={H/2} stroke="#2a4055" strokeWidth="1.5"/>
                    )}
                  </svg>
                </div>
              );
            })()}

          </div>
        </div>
      )}

      {!hideHistory && <div style={{ marginTop:"18px",background:"#0d1a26",borderRadius:"14px",border:"1px solid #1a3347",overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"14px 20px",borderBottom:"1px solid #1a3347",display:"flex",alignItems:"center",gap:"10px" }}>
          <span style={{ fontSize:"18px" }}>🎲</span>
          <span style={{ fontWeight:500,fontSize:"16px",color:"#e0eaf5" }}>Dice</span>
          <span style={{ color:"#6a8aa0",fontSize:"14px",marginLeft:"4px" }}>Mander Originals</span>
        </div>

        {/* Tab row */}
        <div style={{ padding:"10px 20px",borderBottom:"1px solid #152535",display:"flex",alignItems:"center",gap:"4px" }}>
          <div style={{ background:"#1a3347",border:"1px solid #2a4d68",borderRadius:"999px",padding:"7px 18px",fontWeight:500,fontSize:"13px",color:"#e0eaf5" }}>
            {t("myBets")}
          </div>
        </div>

        {/* Column headers */}
        <div style={{ display:"grid",gridTemplateColumns:"120px 1fr 1fr 1fr 1fr",padding:"10px 20px",borderBottom:"1px solid #152535",color:"#4a7090",fontSize:"13px",fontWeight:500 }}>
          <span>{t("game")}</span>
          <span style={{ textAlign:"center" }}>{t("time")}</span>
          <span style={{ textAlign:"center" }}>{t("betAmount")}</span>
          <span style={{ textAlign:"center" }}>{t("multiplierLabel")}</span>
          <span style={{ textAlign:"right" }}>{t("win")}</span>
        </div>

        {/* Rows */}
        {diceBetHistory.length === 0 ? (
          <div style={{ padding:"30px",textAlign:"center",color:"#4a6a80",fontSize:"14px" }}>
            {t("noHistory")}
          </div>
        ) : (
          diceBetHistory.slice(0, 10).map((b, i) => {
            const dt = new Date(b.createdAt);
            const hora = dt.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
            const paySign = b.win ? "+" : "-";
            const payAmt = b.win ? b.payout.toFixed(2) : b.amount.toFixed(2);
            return (
              <div key={i} style={{ display:"grid",gridTemplateColumns:"120px 1fr 1fr 1fr 1fr",padding:"12px 20px",borderBottom:"1px solid #0f1e2c",alignItems:"center",background:i%2===0?"transparent":"rgba(255,255,255,.015)" }}>
                {/* Game */}
                <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
                  <span style={{ fontSize:"18px" }}>🎲</span>
                  <span style={{ fontWeight:500,color:"#d0e2f0" }}>Dice</span>
                </div>
                {/* Hora */}
                <div style={{ textAlign:"center",color:"#7a99b0",fontSize:"13px" }}>{hora}</div>
                {/* Monto */}
                <div style={{ textAlign:"center" }}>
                  <span style={{ fontWeight:500,color:"#d0e2f0",fontSize:"13px" }}>${b.amount.toFixed(2)}</span>
                  <span style={{ marginLeft:"5px",background:"#0f8a6c",borderRadius:"999px",padding:"2px 6px",fontSize:"11px",color:"white",fontWeight:500 }}>₮</span>
                </div>
                {/* Multiplicador */}
                <div style={{ textAlign:"center",color:"#d0e2f0",fontWeight:500,fontSize:"13px" }}>
                  {b.multiplier.toFixed(2)}×
                </div>
                {/* Pago */}
                <div style={{ textAlign:"right",fontWeight:500,fontSize:"13px",color:b.win?"#21d97a":"#ff5a6a" }}>
                  {paySign}${payAmt}
                  <span style={{ marginLeft:"5px",background:"#0f8a6c",borderRadius:"999px",padding:"2px 6px",fontSize:"11px",color:"white",fontWeight:500 }}>₮</span>
                </div>
              </div>
            );
          })
        )}
      </div>}

    </div>
  );
}

// ─── PlinkoGame Component ───────────────────────────────────────────────────
interface PlinkoGameProps {
  balance: number;
  plinkoBet: string; setPlinkoBet: (v:string)=>void;
  plinkoRows: number; setPlinkoRows: (v:number)=>void;
  plinkoRisk: "low"|"medium"|"high"; setPlinkoRisk: (v:"low"|"medium"|"high")=>void;
  plinkoAutoCount: string; setPlinkoAutoCount: (v:string)=>void;
  plinkoAutoRemaining: number;
  plinkoAutoRunning: boolean;
  plinkoStats: PlinkoStats;
  plinkoBetHistory: PlinkoBetRecord[];
  placePlinkoManual: ()=>void;
  startAutoPlinko: (s:{onWin:"reset"|"increase";onWinPct:number;onLose:"reset"|"increase";onLosePct:number;stopProfit:number|null;stopLoss:number|null;infinite?:boolean})=>void;
  stopAutoPlinko: ()=>void;
  halvePlinkoBet: ()=>void;
  doublePlinkoBet: ()=>void;
  fmtMoney: (v:number)=>string;
  onBack: ()=>void;
  displayCurrency: string;
  plinkoBetUsd: number;
  currencyFade: number;
  lang: string;
  convertUsd: (v:number)=>number;
  pendingBalls: PendingPlinkoball[];
  onBallsConsumed: (ids: number[], actualSlots: Record<number, number>) => void;
  onResetStats: ()=>void;
  plinkoVol: number;
  setPlinkoVol: (v: number) => void;
  showPlinkoVol: boolean;
  setShowPlinkoVol: (v: boolean) => void;
  hideHistory?: boolean;
  currentUser?: string;
}
interface MatterBall { id: number; body: Matter.Body; targetSlot: number; settled: boolean; actualSlot?: number; }

function PlinkoGame({
  balance, plinkoBet, setPlinkoBet, plinkoRows, setPlinkoRows,
  plinkoRisk, setPlinkoRisk, plinkoAutoCount, setPlinkoAutoCount, plinkoAutoRemaining,
  plinkoAutoRunning, plinkoStats, plinkoBetHistory,
  placePlinkoManual, startAutoPlinko, stopAutoPlinko,
  halvePlinkoBet, doublePlinkoBet, fmtMoney, onBack,
  displayCurrency, plinkoBetUsd, currencyFade, lang, convertUsd,
  pendingBalls, onBallsConsumed, onResetStats,
  plinkoVol, setPlinkoVol, showPlinkoVol, setShowPlinkoVol, hideHistory = false,
  currentUser,
}: PlinkoGameProps) {
  const t = (key: string) => tl(lang, key);
  const [chartHoverP, setChartHoverP] = useState<number|null>(null);
  const [plinkoTab, setPlinkoTab] = useState<"manual"|"auto">("manual");
  const [autoInfinite, setAutoInfinite] = useState(false);
  const [autoOnWin, setAutoOnWin] = useState<"reset"|"increase">("reset");
  const [autoOnWinPct, setAutoOnWinPct] = useState("0");
  const [autoOnLose, setAutoOnLose] = useState<"reset"|"increase">("reset");
  const [autoOnLosePct, setAutoOnLosePct] = useState("0");
  const [autoStopProfit, setAutoStopProfit] = useState("");
  const [autoStopLoss, setAutoStopLoss] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsPos, setStatsPos] = useState({ x: 270, y: 180 });
  const isDraggingStats = useRef(false);
  const statsDragOffset = useRef({ x: 0, y: 0 });

  const dMStyle: React.CSSProperties = { opacity: currencyFade, transition: "opacity 0.18s ease" };
  const betInvalid = plinkoBetUsd < 0.0099;
  const betTooHigh = balance < plinkoBetUsd - 0.0001;
  const countInvalid = !autoInfinite && (plinkoAutoCount === "" || (parseInt(plinkoAutoCount)||0) <= 0);

  // ── Canvas & physics refs ─────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const pegsRef = useRef<Matter.Body[]>([]);
  const matterBallsRef = useRef<MatterBall[]>([]);
  const consumedIds = useRef<Set<number>>(new Set());
  const onConsumedRef = useRef(onBallsConsumed);
  onConsumedRef.current = onBallsConsumed;
  // Landing flash animations: { slot, startTime }
  const landingFlashesRef = useRef<{ slot: number; startTime: number }[]>([]);

  // ── Board geometry ────────────────────────────────────────────────────────
  const CW = 660, CH = 740;
  const N = plinkoRows;
  const BALL_R = N <= 10 ? 8 : N <= 12 ? 7 : N <= 14 ? 6.5 : 6;
  const PEG_R  = N <= 10 ? 5.5 : N <= 12 ? 5 : N <= 14 ? 4.5 : 4;
  const PAD_X = 22, PAD_Y = 60, SLOT_H = 38;
  const slotW_c = (CW - 2 * PAD_X) / (N + 1);
  const rowH_c  = (CH - PAD_Y - SLOT_H - 10) / N;
  const pegX_c  = (r: number, c: number) => PAD_X + (N / 2 + 0.5 + c - r / 2) * slotW_c;
  const pegY_c  = (r: number) => PAD_Y + (r + 1) * rowH_c;
  const binCX_c = (i: number) => PAD_X + (i + 0.5) * slotW_c;
  const binL_c  = (i: number) => PAD_X + i * slotW_c + 1;
  const binTop_c = CH - SLOT_H + 2;
  const binW_c  = slotW_c - 2;
  const binH_c  = SLOT_H - 4;

  // Geometry ref — avoids stale closures in effects
  const geoRef = useRef({ CW, CH, N, BALL_R, PEG_R, PAD_X, PAD_Y, SLOT_H, slotW_c, rowH_c, pegX_c, pegY_c, binCX_c, binL_c, binTop_c, binW_c, binH_c, plinkoRisk });
  geoRef.current = { CW, CH, N, BALL_R, PEG_R, PAD_X, PAD_Y, SLOT_H, slotW_c, rowH_c, pegX_c, pegY_c, binCX_c, binL_c, binTop_c, binW_c, binH_c, plinkoRisk };

  // ── Matter.js engine — recreated when row count changes ───────────────────
  useEffect(() => {
    const g = geoRef.current;
    if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
    if (engineRef.current) { Matter.World.clear(engineRef.current.world, false); Matter.Engine.clear(engineRef.current); }
    matterBallsRef.current = [];
    consumedIds.current = new Set();

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.0 } });
    engine.timing.timeScale = 0.45;   // slow-motion: same trajectory, ~2.2× slower in real time
    engineRef.current = engine;

    const pegs: Matter.Body[] = [];
    for (let r = 0; r < g.N; r++) {
      const gLX = g.PAD_X + (g.N / 2 + 0.5 - (r + 1) / 2) * g.slotW_c - g.slotW_c * 0.5;
      const gRX = g.PAD_X + (g.N / 2 + 0.5 + (r + 1) / 2) * g.slotW_c + g.slotW_c * 0.5;
      const py  = g.pegY_c(r);
      const pegOpts = { isStatic:true, restitution:0.45, friction:0.02, frictionAir:0, label:'peg', collisionFilter:{ category:0x0002, mask:0x0001 } };
      pegs.push(
        Matter.Bodies.circle(gLX, py, g.PEG_R, pegOpts),
        Matter.Bodies.circle(gRX, py, g.PEG_R, pegOpts),
      );
      for (let c = 0; c <= r; c++) {
        pegs.push(Matter.Bodies.circle(g.pegX_c(r, c), g.pegY_c(r), g.PEG_R, pegOpts));
      }
    }
    pegsRef.current = pegs;

    const wallOpts = { isStatic:true, restitution:0.2, friction:0.1, frictionAir:0, collisionFilter:{ category:0x0002, mask:0x0001 } };
    const wallL  = Matter.Bodies.rectangle(-5,       g.CH / 2, 10, g.CH, { ...wallOpts, label:'wall' });
    const wallR2 = Matter.Bodies.rectangle(g.CW + 5, g.CH / 2, 10, g.CH, { ...wallOpts, label:'wall' });
    const bottom = Matter.Bodies.rectangle(g.CW / 2, g.CH + 5, g.CW, 10, { isStatic:true, label:'bottom' });

    Matter.World.add(engine.world, [...pegs, wallL, wallR2, bottom]);

    Matter.Events.on(engine, 'beforeUpdate', () => {
      const g2 = geoRef.current;
      matterBallsRef.current.forEach(mb => {
        if (mb.settled) return;
        // RTP spring toward target — stronger in the lower half so ball reliably reaches targetSlot
        const tX = g2.binCX_c(mb.targetSlot);
        const dx = tX - mb.body.position.x;
        const springDelay = g2.PAD_Y + g2.rowH_c * 1.2;
        if (mb.body.position.y > springDelay) {
          // Scale force up as ball descends (bottom 40% of board = 2× stronger pull)
          const progress = Math.min(1, (mb.body.position.y - springDelay) / (g2.CH * 0.6));
          const springK = 0.000032 + progress * 0.000028; // 0.000032 → 0.000060
          Matter.Body.applyForce(mb.body, mb.body.position, { x: dx * springK * mb.body.mass, y: 0 });
        }
        // Hard velocity cap — no ball ever exceeds 3.2 px/step sideways
        const vx = mb.body.velocity.x;
        const vy = mb.body.velocity.y;
        if (Math.abs(vx) > 3.2) Matter.Body.setVelocity(mb.body, { x: Math.sign(vx) * 3.2, y: vy });
        // Slight general damping for smooth feel
        Matter.Body.setVelocity(mb.body, { x: mb.body.velocity.x * 0.999, y: mb.body.velocity.y });
        // Stuck-ball rescue: if speed drops very low while still above the bins, give a downward nudge
        const speed = Math.sqrt(mb.body.velocity.x ** 2 + mb.body.velocity.y ** 2);
        if (speed < 0.25 && mb.body.position.y < g2.CH - g2.SLOT_H - g2.BALL_R * 2) {
          Matter.Body.applyForce(mb.body, mb.body.position, {
            x: (Math.random() - 0.5) * 0.00008 * mb.body.mass,
            y: 0.0004 * mb.body.mass,
          });
        }
      });
    });

    Matter.Events.on(engine, 'collisionStart', event => {
      event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        let ball: Matter.Body | null = null;
        if (bodyA.label === 'ball' && bodyB.label === 'peg') ball = bodyA;
        if (bodyB.label === 'ball' && bodyA.label === 'peg') ball = bodyB;
        if (!ball) return;
        const mb = matterBallsRef.current.find(b => b.body === ball && !b.settled);
        if (!mb) return;
        const g2 = geoRef.current;
        const tX = g2.binCX_c(mb.targetSlot);
        const dx = tX - ball.position.x;
        // Directional nudge toward target at each peg bounce — stronger so visual tracks targetSlot
        const mag = Math.min(Math.abs(dx) * 0.000008 + 0.00022, 0.00065);
        Matter.Body.applyForce(ball, ball.position, { x: (dx >= 0 ? 1 : -1) * mag * ball.mass, y: 0 });
      });
    });

    const runner = Matter.Runner.create();
    runnerRef.current = runner;
    Matter.Runner.run(runner, engine);

    return () => {
      Matter.Events.off(engine, 'beforeUpdate');
      Matter.Events.off(engine, 'collisionStart');
      Matter.Runner.stop(runner);
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, [N]);

  // ── Drop new balls into physics world ─────────────────────────────────────
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const g = geoRef.current;
    pendingBalls.forEach(pb => {
      if (consumedIds.current.has(pb.id)) return;
      consumedIds.current.add(pb.id);
      const tX = g.binCX_c(pb.targetSlot);
      // Drop from center always — no sideways bias that could clip guard pegs
      const dropX = g.CW / 2 + (Math.random() - 0.5) * g.slotW_c * 0.2;
      const body = Matter.Bodies.circle(dropX, g.PAD_Y - g.BALL_R - 2, g.BALL_R, {
        restitution: 0.45, friction: 0.02, frictionAir: 0.001, density: 0.004, label: 'ball',
        collisionFilter: { category: 0x0001, mask: 0x0002 }, // only collide with pegs/walls, not other balls
      });
      Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 0.12, y: 0.5 });
      Matter.World.add(engine.world, body);
      matterBallsRef.current.push({ id: pb.id, body, targetSlot: pb.targetSlot, settled: false });
    });
  }, [pendingBalls]);

  // ── Canvas rendering loop (mount-only, reads state via refs) ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let rafId: number;

    function slotCol(m: number): string {
      if (m >= 500) return "#ff1493"; if (m >= 100) return "#d01070";
      if (m >= 30)  return "#b0175a"; if (m >= 10)  return "#7b1fa2";
      if (m >= 5)   return "#6a1b9a"; if (m >= 2)   return "#4527a0";
      if (m >= 1.5) return "#283593"; if (m >= 1)   return "#1a2a5e";
      if (m >= 0.5) return "#1e3a50"; return "#1e2a4a";
    }

    function rr(x:number,y:number,w:number,h:number,r:number) {
      ctx.beginPath();
      ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();
    }

    function frame() {
      const g = geoRef.current;
      const eng = engineRef.current;
      ctx.clearRect(0, 0, g.CW, g.CH);
      ctx.fillStyle = '#0e1320';
      ctx.fillRect(0, 0, g.CW, g.CH);

      const mults_c = PLINKO_MULTS[g.plinkoRisk]?.[g.N] || [];

      // Draw slots
      mults_c.forEach((m, i) => {
        rr(g.binL_c(i), g.binTop_c, g.binW_c, g.binH_c, 5);
        ctx.fillStyle = slotCol(m); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.8; ctx.stroke();
        const label = m >= 1000 ? Math.round(m/1000)+"K" : m >= 100 ? String(Math.round(m)) : m % 1 === 0 ? String(m) : m.toFixed(1);
        const fs = g.N <= 10 ? 15 : g.N <= 12 ? 13 : g.N <= 14 ? 12 : 11;
        ctx.fillStyle = '#fff'; ctx.font = `bold ${fs}px Inter,system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, g.binL_c(i) + g.binW_c / 2, g.binTop_c + g.binH_c / 2);
      });

      // ── Landing flash animations ──────────────────────────────────────────
      const now = performance.now();
      landingFlashesRef.current = landingFlashesRef.current.filter(f => now - f.startTime < 750);
      landingFlashesRef.current.forEach(f => {
        const t = Math.min(1, (now - f.startTime) / 750);
        const alpha = Math.pow(1 - t, 1.6);
        const cx = g.binL_c(f.slot) + g.binW_c / 2;
        const cy = g.binTop_c + g.binH_c / 2;
        // Bright radial glow filling the slot
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, g.binH_c * 0.9);
        grad.addColorStop(0,   `rgba(255,255,240,${alpha * 0.95})`);
        grad.addColorStop(0.35,`rgba(255,230,80,${alpha * 0.70})`);
        grad.addColorStop(0.7, `rgba(255,160,20,${alpha * 0.40})`);
        grad.addColorStop(1,   `rgba(255,120,0,0)`);
        rr(g.binL_c(f.slot), g.binTop_c, g.binW_c, g.binH_c, 5);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      // Detect settled balls and lit pegs
      const litPegs = new Set<Matter.Body>();
      const toSettle: number[] = [];

      matterBallsRef.current.forEach(mb => {
        if (mb.settled) return;
        const { x, y } = mb.body.position;
        if (y >= g.binTop_c - g.BALL_R * 0.5) {
          mb.settled = true;
          // Compute actual slot from physical X position
          mb.actualSlot = Math.max(0, Math.min(g.N, Math.floor((x - g.PAD_X) / g.slotW_c)));
          toSettle.push(mb.id);
          // Flash shows actual landing slot
          landingFlashesRef.current.push({ slot: mb.actualSlot, startTime: performance.now() });
          if (eng) { try { Matter.World.remove(eng.world, mb.body); } catch { /**/ } }
          return;
        }
        pegsRef.current.forEach(peg => {
          if (peg.label !== 'peg') return;
          const dpx = x - peg.position.x, dpy = y - peg.position.y;
          if (dpx*dpx + dpy*dpy < (g.PEG_R + g.BALL_R + 4) * (g.PEG_R + g.BALL_R + 4)) litPegs.add(peg);
        });
      });

      if (toSettle.length > 0) {
        const actualSlots: Record<number, number> = {};
        matterBallsRef.current.forEach(mb => { if (toSettle.includes(mb.id)) actualSlots[mb.id] = mb.actualSlot ?? mb.targetSlot; });
        onConsumedRef.current(toSettle, actualSlots);
        matterBallsRef.current = matterBallsRef.current.filter(mb => !toSettle.includes(mb.id));
      }

      // Draw pegs (all identical — inner and outer edge pegs share the same style)
      pegsRef.current.forEach(peg => {
        const lit = litPegs.has(peg);
        ctx.beginPath(); ctx.arc(peg.position.x, peg.position.y, lit ? g.PEG_R * 1.4 : g.PEG_R, 0, Math.PI*2);
        if (lit) { ctx.shadowColor = '#f4a91f'; ctx.shadowBlur = 14; ctx.fillStyle = '#ffffff'; }
        else { ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(200,220,255,0.88)'; }
        ctx.fill(); ctx.shadowBlur = 0;
      });

      // Draw balls
      matterBallsRef.current.forEach(mb => {
        if (mb.settled) return;
        const { x, y } = mb.body.position;
        const grad = ctx.createRadialGradient(x - g.BALL_R*0.3, y - g.BALL_R*0.3, 0, x, y, g.BALL_R);
        grad.addColorStop(0, '#fff8c0'); grad.addColorStop(0.55, '#f0d550'); grad.addColorStop(1, '#c8960c');
        ctx.beginPath(); ctx.arc(x, y, g.BALL_R, 0, Math.PI*2);
        ctx.fillStyle = grad; ctx.shadowColor = '#f4a91f'; ctx.shadowBlur = 18;
        ctx.fill(); ctx.shadowBlur = 0;
      });

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  function handleStatsDragStart(e: React.MouseEvent) {
    e.preventDefault();
    isDraggingStats.current = true;
    statsDragOffset.current = { x: e.clientX - statsPos.x, y: e.clientY - statsPos.y };
    const onMove = (ev: MouseEvent) => { if (isDraggingStats.current) setStatsPos({ x: ev.clientX - statsDragOffset.current.x, y: ev.clientY - statsDragOffset.current.y }); };
    const onUp   = () => { isDraggingStats.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="plinko-root" style={{ maxWidth:"1080px", margin:"0 auto", position:"relative" }}>
      <div style={{ display:"grid",gridTemplateColumns:"300px 1fr",gridTemplateRows:"auto 1fr",gap:"0",minHeight:"734px",background:"#0e1320",borderRadius:"16px",overflow:"hidden" }}>

        {/* ── Bordered header bar ── */}
        <div style={{ gridColumn:"1/-1", display:"flex", alignItems:"center", gap:"10px", padding:"10px 20px", background:"#0e1826", borderBottom:"1px solid #1a2438", flexShrink:0 }}>
          <button onClick={onBack} style={{ background:"#131a28", border:"1px solid #252f45", color:"#8090b0", cursor:"pointer", fontSize:"18px", padding:"5px 12px", borderRadius:"8px", lineHeight:1 }}>←</button>
          <div style={{ fontWeight:500, fontSize:"15px", letterSpacing:"1.5px", color:"#fff", display:"flex", alignItems:"center", gap:"8px" }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>PLINKO</div>
          <div style={{ marginLeft:"auto", fontSize:"12px", color:"#5a6a88", fontWeight:500 }}>Mander Originals</div>
        </div>

        {/* ── Left panel ── */}
        <div style={{ background:"#131a28",padding:"16px",display:"flex",flexDirection:"column",gap:"0" }}>
          {/* Mode tabs */}
          <div style={{ display:"flex",alignItems:"center",background:"#0e1826",borderRadius:"14px",padding:"5px",gap:"4px",marginBottom:"16px" }}>
            <button onClick={()=>{ if(!plinkoAutoRunning) setPlinkoTab("manual"); }} disabled={plinkoAutoRunning} style={{ flex:1,background:plinkoTab==="manual"?"#1e2c44":"transparent",color:plinkoTab==="manual"?"#eef3f8":"#5a6a88",border:plinkoTab==="manual"?"1px solid #3a4a60":"1px solid transparent",borderRadius:"10px",padding:"10px",fontWeight:500,cursor:plinkoAutoRunning?"not-allowed":"pointer",fontSize:"14px",opacity:plinkoAutoRunning&&plinkoTab!=="manual"?0.45:1,transition:"opacity .2s" }}>{t("manual")}</button>
            <button onClick={()=>{ if(!plinkoAutoRunning) setPlinkoTab("auto"); }} disabled={plinkoAutoRunning} style={{ flex:1,background:plinkoTab==="auto"?"#1e2c44":"transparent",color:plinkoTab==="auto"?"#eef3f8":"#5a6a88",border:plinkoTab==="auto"?"1px solid #3a4a60":"1px solid transparent",borderRadius:"10px",padding:"10px",fontWeight:500,cursor:plinkoAutoRunning?"not-allowed":"pointer",fontSize:"14px",opacity:plinkoAutoRunning&&plinkoTab!=="auto"?0.45:1,transition:"opacity .2s" }}>{t("automatic")}</button>
          </div>

          {/* Bet amount */}
          <div style={{ color:"#5a6a88",fontWeight:500,marginBottom:"6px",fontSize:"13px",paddingLeft:"4px" }}>{t("betAmount")}</div>
          <div style={{ display:"flex",alignItems:"center",gap:"8px",background:"#0e1826",border:`1px solid ${betInvalid?"#c0392b":"#252f45"}`,borderRadius:"10px",padding:"8px 14px",marginBottom:"8px" }}>
            <span style={{ fontSize:"16px",color:"#5a6a88",fontWeight:500,...dMStyle }}>{displayCurrency}</span>
            <input
              value={(()=>{ if(!plinkoBet) return ""; const [int,dec]=plinkoBet.split("."); const fmtInt=(parseInt(int||"0")||0).toLocaleString("en-US"); return dec!==undefined?`${fmtInt}.${dec}`:fmtInt; })()}
              onChange={e=>{ const raw=e.target.value.replace(/,/g,""); if(/^\d*\.?\d*$/.test(raw)) setPlinkoBet(raw); }}
              type="text" inputMode="decimal" placeholder="0.00"
              disabled={plinkoAutoRunning}
              style={{ flex:1,background:"transparent",border:"none",color:"white",fontSize:"22px",fontWeight:600,padding:"0",minWidth:0,...dMStyle }}/>
            <button onClick={()=>setPlinkoBet("0.00")} style={{ background:"#0e1826",border:"1px solid #252f45",borderRadius:"6px",color:"#6db3f2",fontSize:"11px",fontWeight:500,padding:"4px 8px",cursor:"pointer",textTransform:"uppercase" }}>{t("clear")}</button>
          </div>

          {/* Quick bet buttons */}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",marginBottom:"14px" }}>
            {[
              { label:"Min", action:()=>setPlinkoBet((Math.ceil(convertUsd(0.01)*100)/100).toFixed(2)) },
              { label:"½",   action:halvePlinkoBet },
              { label:"2×",  action:doublePlinkoBet },
              { label:"Max", action:()=>setPlinkoBet((Math.floor(convertUsd(balance)*100)/100).toFixed(2)) },
            ].map(b=>(
              <button key={b.label} onClick={b.action} disabled={plinkoAutoRunning}
                style={{ background:"#1a2438",color:"#d0dcea",border:"1px solid #252f45",borderRadius:"8px",padding:"8px 0",fontWeight:500,fontSize:"13px",cursor:"pointer",opacity:plinkoAutoRunning?0.55:1 }}>
                {b.label}
              </button>
            ))}
          </div>

          {betInvalid && <div style={{ fontSize:"11.5px",color:"#e74c3c",fontWeight:600,marginBottom:"8px",paddingLeft:"2px" }}>{t("minBet")} {fmtMoney(0.01)}</div>}
          {!betInvalid && <div style={{ marginBottom:"6px" }}/>}

          {/* Rows */}
          <div style={{ color:"#5a6a88",fontWeight:500,marginBottom:"6px",fontSize:"13px",paddingLeft:"4px" }}>Filas</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"4px",marginBottom:"14px" }}>
            {[8,10,12,14,16].map(r=>{
              const locked = plinkoAutoRunning || pendingBalls.length > 0;
              return (
                <button key={r} onClick={()=>{ if(!locked) setPlinkoRows(r); }}
                  title={pendingBalls.length>0?"Espera que caigan todas las pelotas":undefined}
                  style={{ background:plinkoRows===r?"#1f6fd0":"#1a2438",color:plinkoRows===r?"#fff":"#d0dcea",border:`1px solid ${plinkoRows===r?"#3a8aff":"#252f45"}`,borderRadius:"8px",padding:"8px 0",fontWeight:500,fontSize:"13px",cursor:locked?"not-allowed":"pointer",opacity:locked&&plinkoRows!==r?0.45:1,boxShadow:plinkoRows===r?"0 2px 14px #3a8aff66":"none",transition:"all .15s" }}>
                  {r}
                </button>
              );
            })}
          </div>
          {pendingBalls.length > 0 && !plinkoAutoRunning && (
            <div style={{ fontSize:"10px",color:"#5a7a9a",marginTop:"-10px",marginBottom:"8px",textAlign:"center" }}>
              🎱 {pendingBalls.length} pelota{pendingBalls.length!==1?"s":""} en juego — esperá que caigan
            </div>
          )}

          {/* Risk */}
          <div style={{ color:"#5a6a88",fontWeight:500,marginBottom:"6px",fontSize:"13px",paddingLeft:"4px" }}>Riesgo</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"4px",marginBottom:"16px" }}>
            {([["low","Bajo","#1f6fd0","#3a8aff"],["medium","Medio","#b07800","#f4a91f"],["high","Alto","#8b1a1a","#ff5a6a"]] as const).map(([r,label,bg,bd])=>{
              const locked = plinkoAutoRunning || pendingBalls.length > 0;
              return (
                <button key={r} onClick={()=>{ if(!locked) setPlinkoRisk(r); }}
                  title={pendingBalls.length>0?"Espera que caigan todas las pelotas":undefined}
                  style={{ background:plinkoRisk===r?bg:"#1a2438",color:"#fff",border:`1px solid ${plinkoRisk===r?bd:"#252f45"}`,borderRadius:"8px",padding:"8px 0",fontWeight:500,fontSize:"13px",cursor:locked?"not-allowed":"pointer",opacity:locked&&plinkoRisk!==r?0.45:1,boxShadow:plinkoRisk===r?`0 2px 14px ${bd}66`:"none",transition:"all .15s" }}>
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── MANUAL TAB ── */}
          {plinkoTab==="manual" && (
            <button onClick={placePlinkoManual} disabled={betInvalid||(!!currentUser&&betTooHigh)||plinkoAutoRunning}
              style={{ width:"100%",marginBottom:"8px",border:"none",borderRadius:"10px",padding:"14px",fontWeight:500,fontSize:"15px",transition:"all .2s",
                background:(betInvalid||(currentUser&&betTooHigh)||plinkoAutoRunning)?"#1a2438":"linear-gradient(180deg,#1a9fff,#0d6fd4)",
                color:(betInvalid||(currentUser&&betTooHigh)||plinkoAutoRunning)?"#3a4a60":"#fff",
                boxShadow:(betInvalid||(currentUser&&betTooHigh)||plinkoAutoRunning)?"none":"0 4px 22px rgba(26,159,255,.35)",
                cursor:(betInvalid||(!!currentUser&&betTooHigh)||plinkoAutoRunning)?"not-allowed":"pointer" }}>
              {(currentUser&&betTooHigh) ? t("insufficientBalance") : "▶ " + t("bet")}
            </button>
          )}

          {/* ── AUTO TAB ── */}
          {plinkoTab==="auto" && <>
            <div style={{ color:"#5a6a88",fontWeight:500,marginBottom:"6px",fontSize:"13px" }}>{t("numberOfBets")}</div>
            <div>
              <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:`1px solid ${countInvalid?"#c0392b":"#252f45"}`,borderRadius:"10px",padding:"6px 10px",marginBottom:countInvalid?"4px":"14px" }}>
                <input value={plinkoAutoRunning ? String(plinkoAutoRemaining) : (autoInfinite?"∞":plinkoAutoCount)} onChange={e=>{setAutoInfinite(false);setPlinkoAutoCount(e.target.value);}} onBlur={()=>{if(!autoInfinite&&(plinkoAutoCount===""||parseInt(plinkoAutoCount)<=0)) setPlinkoAutoCount("1");}} type={autoInfinite?"text":"number"} min="1" readOnly={autoInfinite || plinkoAutoRunning} style={{ flex:1,background:"transparent",border:"none",color:"white",fontSize:"20px",padding:"4px",minWidth:0 }}/>
                <button onClick={()=>setAutoInfinite(v=>!v)} style={{ padding:"4px 10px",borderRadius:"6px",background:autoInfinite?"#1f6fd0":"#2a4155",color:"#d0dcea",border:"none",fontWeight:500,cursor:"pointer",fontSize:"16px" }}>∞</button>
              </div>
              {countInvalid && <div style={{ fontSize:"11.5px",color:"#e74c3c",fontWeight:600,marginBottom:"10px",paddingLeft:"2px" }}>{t("minBetsCount")}</div>}
            </div>

            {betInvalid && <div style={{ fontSize:"11.5px",color:"#e74c3c",fontWeight:600,marginBottom:"8px",paddingLeft:"2px" }}>{t("minBet")} {fmtMoney(0.01)}</div>}
            {plinkoAutoRunning ? (
              <button onClick={stopAutoPlinko} style={{ width:"100%",padding:"14px",background:"#c0392b",color:"#fff",border:"none",borderRadius:"10px",fontWeight:500,fontSize:"16px",cursor:"pointer" }}>⏹ {t("stopAuto")}</button>
            ) : (
              <button
                onClick={()=>startAutoPlinko({ onWin:autoOnWin,onWinPct:parseFloat(autoOnWinPct)||0,onLose:autoOnLose,onLosePct:parseFloat(autoOnLosePct)||0,stopProfit:autoStopProfit?parseFloat(autoStopProfit)||null:null,stopLoss:autoStopLoss?parseFloat(autoStopLoss)||null:null,infinite:autoInfinite })}
                disabled={betInvalid||(!!currentUser&&betTooHigh)||countInvalid}
                style={{ width:"100%",padding:"14px",border:"none",borderRadius:"10px",fontWeight:500,fontSize:"15px",transition:"all .2s",
                  background:(betInvalid||(currentUser&&betTooHigh)||countInvalid)?"#1a2438":"linear-gradient(180deg,#1a9fff,#0d6fd4)",
                  color:(betInvalid||(currentUser&&betTooHigh)||countInvalid)?"#3a4a60":"#fff",
                  boxShadow:(betInvalid||(currentUser&&betTooHigh)||countInvalid)?"none":"0 4px 22px rgba(26,159,255,.35)",
                  cursor:(betInvalid||(!!currentUser&&betTooHigh)||countInvalid)?"not-allowed":"pointer" }}>
                {"▶ "+t("startAuto")}
              </button>
            )}
          </>}

          {/* Stats + Volume buttons */}
          <div style={{ marginTop:"auto",paddingTop:"18px",display:"flex",gap:"8px" }}>
            <button onClick={()=>setShowStats(v=>!v)} title="Estadísticas" style={{ width:"38px",height:"38px",borderRadius:"8px",background:showStats?"#1f6fd0":"#0e1826",border:showStats?"1px solid #3a8aff":"1px solid #203a50",color:showStats?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px" }}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></button>
            {/* Volume button + popup */}
            <div style={{ position:"relative" }}>
              {showPlinkoVol && (
                <div onClick={()=>setShowPlinkoVol(false)}
                  style={{ position:"fixed",inset:0,zIndex:98 }}/>
              )}
              <button
                onClick={()=>setShowPlinkoVol(v=>!v)}
                title="Volumen"
                style={{ position:"relative",zIndex:100,width:"38px",height:"38px",borderRadius:"8px",background:showPlinkoVol?"#1f6fd0":"#0e1826",border:showPlinkoVol?"1px solid #3a8aff":"1px solid #203a50",color:showPlinkoVol?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",transition:"background .2s,border .2s,color .2s" }}
              >{plinkoVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : plinkoVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}</button>
              {showPlinkoVol && (
                <div style={{ position:"absolute",bottom:"48px",left:"0",background:"#0f1e2e",border:"1px solid #252f45",borderRadius:"12px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"12px",minWidth:"220px",boxShadow:"0 4px 20px rgba(0,0,0,.5)",zIndex:100 }}>
                  <span style={{ fontSize:"18px",flexShrink:0,color:"#5a6a88" }}>{plinkoVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : plinkoVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}</span>
                  <input type="range" min="0" max="100" step="1" value={plinkoVol} onChange={e=>setPlinkoVol(Number(e.target.value))}
                    style={{ flex:1,accentColor:"#f4a91f",cursor:"pointer",height:"4px" }}/>
                  <span style={{ color:"#d0dcea",fontWeight:500,fontSize:"13px",minWidth:"24px",textAlign:"right" }}>{plinkoVol}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right panel — Matter.js canvas ── */}
        <div style={{ background:"#0e1320",padding:"14px 18px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
          <canvas ref={canvasRef} width={CW} height={CH} style={{ display:"block",maxWidth:"100%" }}/>
        </div>

      </div>

      {/* Floating stats panel */}
      {showStats && (
        <div style={{ position:"fixed",left:statsPos.x,top:statsPos.y,zIndex:9999,width:"280px",background:"#0f1f2e",border:"1px solid #1e3a52",borderRadius:"14px",boxShadow:"0 8px 32px rgba(0,0,0,.7)",overflow:"hidden",userSelect:"none" }}>
          <div onMouseDown={handleStatsDragStart} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:"#112232",borderBottom:"1px solid #1e3a52",cursor:"grab" }}>
            <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
              <span style={{ display:"flex",alignItems:"center",color:"#7a9db8" }}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></span>
              <strong style={{ fontSize:"14px",color:"#d8e8f5" }}>{t("liveStats")}</strong>
            </div>
            <button onClick={()=>setShowStats(false)} style={{ background:"none",border:"none",color:"#7a9db8",fontSize:"18px",cursor:"pointer",lineHeight:1,padding:"0 2px" }}>×</button>
          </div>
          <div style={{ padding:"12px" }}>
            <div style={{ background:"#0d1a28",borderRadius:"10px",padding:"12px",marginBottom:"8px",display:"flex",flexDirection:"column",gap:"8px" }}>
              {([
                { label:t("profitLabel"),value:fmtMoney(plinkoStats.profit),color:plinkoStats.profit>=0?"#16ff5c":"#ff5959",extra:dMStyle },
                { label:t("won"),        value:String(plinkoStats.wins),    color:"#16ff5c",extra:{} },
                { label:t("wagered"),    value:fmtMoney(plinkoStats.wagered),color:"#d8e8f5",extra:dMStyle },
                { label:t("lostLabel"), value:String(plinkoStats.losses),   color:"#ff5959",extra:{} },
              ] as {label:string;value:string;color:string;extra:React.CSSProperties}[]).map(s=>(
                <div key={s.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ color:"#7a9db8",fontSize:"11.5px" }}>{s.label}</span>
                  <span style={{ color:s.color,fontWeight:500,fontSize:"13px",...s.extra }}>{s.value}</span>
                </div>
              ))}
            </div>
            {/* Reset button */}
            <button
              onClick={onResetStats}
              style={{ width:"100%",marginBottom:"8px",background:"transparent",border:"1px solid #1e3a52",borderRadius:"8px",color:"#7a9db8",fontSize:"12px",cursor:"pointer",padding:"6px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",transition:"color .15s,border-color .15s,background .15s" }}
              onMouseEnter={e=>{const b=e.currentTarget as HTMLButtonElement;b.style.color="#fff";b.style.borderColor="#3a8aff";b.style.background="#0d1f30";}}
              onMouseLeave={e=>{const b=e.currentTarget as HTMLButtonElement;b.style.color="#7a9db8";b.style.borderColor="#1e3a52";b.style.background="transparent";}}
            ><span style={{ fontSize:"14px" }}>↺</span> Reiniciar estadísticas</button>

            {/* Mini chart — cumulative profit */}
            {(()=>{
              const raw = plinkoStats.history.length>0 ? plinkoStats.history.slice().reverse() : null;
              const W=320, H=210, PAD_X=12, PAD_Y=20;
              const chartW = W-PAD_X*2, chartH = H-PAD_Y*2;
              interface ChartPtP { cum:number; win:boolean; profit:number }
              let series: ChartPtP[] = [];
              if(raw){
                let running = 0;
                series = raw.map(p=>{ running += (p.profit??0); return { cum:running, win:p.win, profit:p.profit??0 }; });
              }
              const allPts: ChartPtP[] = raw ? [{ cum:0, win:false, profit:0 }, ...series] : [];
              const n = allPts.length;
              const cums = allPts.map(p=>p.cum);
              const minC = Math.min(0, ...cums);
              const maxC = Math.max(0, ...cums);
              const range = maxC - minC || 1;
              const toX = (i:number) => PAD_X + i * (chartW / Math.max(n-1,1));
              const toY = (v:number) => PAD_Y + chartH - ((v - minC) / range) * chartH;
              const zeroY = toY(0);
              const xs = allPts.map((_,i)=>toX(i));
              const ys = allPts.map(p=>toY(p.cum));
              const maxIdx = series.length>0 ? series.reduce((best,p,i)=>p.cum>series[best].cum?i:best,0)+1 : -1;
              const hIdx = chartHoverP;
              const hpt = hIdx!==null && hIdx>0 && hIdx<allPts.length ? allPts[hIdx] : null;
              const hx = hIdx!==null ? xs[hIdx] : 0;
              if (n < 2) return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #1a3347" }}>
                  <span style={{ color:"#2a4a6a",fontSize:"12px" }}>Sin historial</span>
                </div>
              );
              const linePath = xs.map((x,i)=>`${i===0?"M":"L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
              const fillAbove = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const fillBelow = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const tipXpct = hIdx!==null && xs.length ? (xs[hIdx]/W)*100 : 0;
              const tipYpct = hIdx!==null && ys.length ? (ys[hIdx]/H)*100 : 0;
              const tipLeft = Math.min(Math.max(tipXpct, 12), 78);
              const tipTop  = Math.max(tipYpct - 14, 2);
              return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",overflow:"visible",border:"1px solid #1a3347" }}>
                  {hpt && (
                    <div style={{
                      position:"absolute",
                      left:`${tipLeft}%`,
                      top:`${tipTop}%`,
                      transform:"translateX(-50%) translateY(-100%)",
                      background:"#1a2a3a",
                      border:`1.5px solid ${hpt.profit>=0?"#19ff35":"#ff3350"}`,
                      borderRadius:"8px",
                      padding:"4px 10px",
                      fontSize:"12px",
                      fontWeight:500,
                      color: hpt.profit>=0?"#19ff35":"#ff3350",
                      whiteSpace:"nowrap",
                      pointerEvents:"none",
                      zIndex:20,
                      boxShadow:`0 2px 12px ${hpt.profit>=0?"rgba(25,255,53,.3)":"rgba(255,51,80,.3)"}`,
                    }}>
                      {hpt.profit>=0?"+":""}{fmtMoney(hpt.profit)}
                      <span style={{ color:"#7a9db8",fontWeight:400,fontSize:"10px",marginLeft:"6px" }}>
                        acum: {hpt.cum>=0?"+":""}{fmtMoney(hpt.cum)}
                      </span>
                    </div>
                  )}
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:"100%",height:"100%",display:"block",cursor:"crosshair" }}
                    onMouseMove={e=>{
                      if(!xs.length) return;
                      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                      const svgX = ((e.clientX - rect.left) / rect.width) * W;
                      let closest = 0, minDist = Infinity;
                      xs.forEach((x,i)=>{ const d=Math.abs(x-svgX); if(d<minDist){ minDist=d; closest=i; } });
                      setChartHoverP(closest);
                    }}
                    onMouseLeave={()=>setChartHoverP(null)}
                  >
                    <defs>
                      <clipPath id="pClipAbove"><rect x={PAD_X} y={PAD_Y} width={chartW} height={zeroY-PAD_Y}/></clipPath>
                      <clipPath id="pClipBelow"><rect x={PAD_X} y={zeroY} width={chartW} height={chartH-(zeroY-PAD_Y)}/></clipPath>
                    </defs>
                    {n>1 ? <>
                      <path d={fillBelow} fill="rgba(200,30,30,.35)" clipPath="url(#pClipBelow)"/>
                      <path d={fillAbove} fill="rgba(25,255,80,.18)" clipPath="url(#pClipAbove)"/>
                      <line x1={PAD_X} y1={zeroY} x2={W-PAD_X} y2={zeroY} stroke="#2a4055" strokeWidth="1.5"/>
                      <path d={linePath} fill="none" stroke="#19ff35" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#pClipAbove)"/>
                      <path d={linePath} fill="none" stroke="#e03030" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#pClipBelow)"/>
                      <rect x={PAD_X} y={PAD_Y} width={chartW} height={chartH} fill="transparent"/>
                      {hIdx!==null && hIdx<allPts.length && (
                        <>
                          <line x1={xs[hIdx]} y1={PAD_Y} x2={xs[hIdx]} y2={H-PAD_Y} stroke="#3a5570" strokeWidth="1" strokeDasharray="4,3"/>
                          <circle cx={xs[hIdx]} cy={ys[hIdx]} r="5"
                            fill={allPts[hIdx].profit>=0?"#19ff35":"#ff3350"}
                            stroke="#0a1520" strokeWidth="2"
                            style={{ pointerEvents:"none" }}/>
                        </>
                      )}
                    </> : (
                      <line x1={PAD_X} y1={H/2} x2={W-PAD_X} y2={H/2} stroke="#2a4055" strokeWidth="1.5"/>
                    )}
                  </svg>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {!hideHistory && <div style={{ marginTop:"18px",background:"#0d1a26",borderRadius:"14px",border:"1px solid #1a3347",overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"14px 20px",borderBottom:"1px solid #1a3347",display:"flex",alignItems:"center",gap:"10px" }}>
          <span style={{ fontSize:"18px" }}>🎳</span>
          <span style={{ fontWeight:500,fontSize:"16px",color:"#e0eaf5" }}>Plinko</span>
          <span style={{ color:"#6a8aa0",fontSize:"14px",marginLeft:"4px" }}>Mander Originals</span>
        </div>
        {/* Tab row */}
        <div style={{ padding:"10px 20px",borderBottom:"1px solid #152535",display:"flex",alignItems:"center",gap:"4px" }}>
          <div style={{ background:"#1a3347",border:"1px solid #2a4d68",borderRadius:"999px",padding:"7px 18px",fontWeight:500,fontSize:"13px",color:"#e0eaf5" }}>
            {t("myBets")}
          </div>
        </div>
        {/* Column headers */}
        <div style={{ display:"grid",gridTemplateColumns:"120px 1fr 1fr 1fr 1fr",padding:"10px 20px",borderBottom:"1px solid #152535",color:"#4a7090",fontSize:"13px",fontWeight:500 }}>
          <span>{t("game")}</span>
          <span style={{ textAlign:"center" }}>{t("time")}</span>
          <span style={{ textAlign:"center" }}>{t("betAmount")}</span>
          <span style={{ textAlign:"center" }}>{t("multiplierLabel")}</span>
          <span style={{ textAlign:"right" }}>{t("win")}</span>
        </div>
        {/* Rows */}
        {plinkoBetHistory.length === 0 ? (
          <div style={{ padding:"30px",textAlign:"center",color:"#4a6a80",fontSize:"14px" }}>
            {t("noBetsYet")}
          </div>
        ) : (
          plinkoBetHistory.slice(0, 10).map((b, i) => {
            const dt = new Date(b.createdAt);
            const hora = dt.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
            const paySign = b.win ? "+" : "-";
            const payAmt = b.win ? b.payout.toFixed(2) : b.amount.toFixed(2);
            return (
              <div key={i} style={{ display:"grid",gridTemplateColumns:"120px 1fr 1fr 1fr 1fr",padding:"12px 20px",borderBottom:"1px solid #0f1e2c",alignItems:"center",background:i%2===0?"transparent":"rgba(255,255,255,.015)" }}>
                {/* Game */}
                <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
                  <span style={{ fontSize:"18px" }}>🎳</span>
                  <span style={{ fontWeight:500,color:"#d0e2f0" }}>Plinko</span>
                </div>
                {/* Hora */}
                <div style={{ textAlign:"center",color:"#7a99b0",fontSize:"13px" }}>{hora}</div>
                {/* Monto */}
                <div style={{ textAlign:"center" }}>
                  <span style={{ fontWeight:500,color:"#d0e2f0",fontSize:"13px" }}>${b.amount.toFixed(2)}</span>
                  <span style={{ marginLeft:"5px",background:"#0f8a6c",borderRadius:"999px",padding:"2px 6px",fontSize:"11px",color:"white",fontWeight:500 }}>₮</span>
                </div>
                {/* Multiplicador */}
                <div style={{ textAlign:"center",color:"#d0e2f0",fontWeight:500,fontSize:"13px" }}>
                  {b.multiplier.toFixed(2)}×
                </div>
                {/* Pago */}
                <div style={{ textAlign:"right",fontWeight:500,fontSize:"13px",color:b.win?"#21d97a":"#ff5a6a" }}>
                  {paySign}${payAmt}
                  <span style={{ marginLeft:"5px",background:"#0f8a6c",borderRadius:"999px",padding:"2px 6px",fontSize:"11px",color:"white",fontWeight:500 }}>₮</span>
                </div>
              </div>
            );
          })
        )}
      </div>}

    </div>
  );
}

// ─── Keno Gem ────────────────────────────────────────────────────────────────
function KenoGem({ number, animate }: { number: number; animate?: boolean }) {
  return (
    <div style={{
      position:"absolute",
      // Narrower container (8% horizontal inset) makes gem portrait rather than landscape
      inset:"1px",
      display:"flex", alignItems:"center", justifyContent:"center",
      animation: animate ? "kenoGemAppear 0.45s cubic-bezier(0.34,1.56,0.64,1) both" : undefined,
    }}>
      <img src="/keno-gem.png" alt="" style={{
        position:"absolute", inset:0,
        width:"100%", height:"100%",
        objectFit:"contain",
        pointerEvents:"none",
      }}/>
      <span style={{
        position:"relative", zIndex:2,
        fontWeight:600, fontSize:"18px",
        color:"#fff",
        textShadow:"0 1px 6px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.9)",
        lineHeight:1,
        marginTop:"6px",
      }}>{number}</span>
    </div>
  );
}

// ─── Keno Multiplier Table ─────────────────────────────────────────────────
// Analytically balanced at exactly 96.50% RTP each configuration.
// Hypergeometric: N=40 pool, K=10 drawn, player picks n. Σ P(m|n)×mult(m)=0.965
const KENO_MULT: Record<string, Record<number, number[]>> = {
  classic: {
    1:  [0, 3.96],
    2:  [0, 0, 7.50],
    3:  [0, 0.50, 1.80, 9.00],
    4:  [0, 0, 1.25, 4.25, 24.00],
    5:  [0, 0, 0.90, 2.50, 8.25, 33.00],
    6:  [0, 0, 0.55, 1.80, 5.00, 15.00, 60.00],
    7:  [0, 0, 0, 1.40, 3.50, 7.90, 25.00, 75.00],
    8:  [0, 0, 0, 1.10, 2.60, 6.40, 20.00, 50.00, 100.00],
    9:  [0, 0, 0, 0.60, 1.80, 4.30, 12.00, 28.00, 70.00, 100.00],
    10: [0, 0, 0, 1.40, 2.25, 4.50, 8.00, 17.00, 50.00, 80.00, 100.00],
  },
  low: {
    1:  [0, 3.86],
    2:  [0, 0, 16.73],
    3:  [0, 0, 5.21, 20.84],
    4:  [0, 0, 2.91, 7.29, 23.32],
    5:  [0, 0, 0, 8.57, 25.7, 102.8],
    6:  [0, 0, 0, 5.2, 10.41, 26.02, 104.06],
    7:  [0, 0, 0, 3.37, 6.07, 13.49, 37.08, 151.71],
    8:  [0, 0, 0, 0, 9.22, 16.59, 41.47, 110.59, 414.7],
    9:  [0, 0, 0, 0, 5.85, 9.95, 20.48, 46.81, 117.03, 468.1],
    10: [0, 0, 1.10, 1.20, 1.30, 1.80, 3.50, 13.00, 50.00, 250.00, 1000],
  },
  medium: {
    1:  [0, 3.86],
    2:  [0, 0, 16.73],
    3:  [0, 0, 3.74, 37.39],
    4:  [0, 0, 2.07, 10.35, 49.67],
    5:  [0, 0, 0, 7.7, 30.81, 154.05],
    6:  [0, 0, 0, 4.3, 13.44, 43, 268.75],
    7:  [0, 0, 0, 2.49, 8.31, 20.77, 62.32, 332.35],
    8:  [0, 0, 0, 0, 7.53, 22.6, 75.33, 226, 904],
    9:  [0, 0, 0, 0, 4.47, 13.97, 33.53, 89.41, 251.46, 1117.62],
    10: [0, 0, 0, 1.60, 2.00, 4.00, 7.00, 26.00, 100.00, 500.00, 1000],
  },
  high: {
    1:  [0, 3.86],
    2:  [0, 0, 16.73],
    3:  [0, 0, 0, 79.45],
    4:  [0, 0, 0, 5.44, 326.63],
    5:  [0, 0, 0, 0, 29.64, 1778.65],
    6:  [0, 0, 0, 0, 12.12, 242.45, 3636.76],
    7:  [0, 0, 0, 0, 0, 63.43, 1268.67, 25373.44],
    8:  [0, 0, 0, 0, 0, 0, 473.9, 7108.53, 118475.45],
    9:  [0, 0, 0, 0, 0, 0, 143.19, 2291.02, 14318.89, 286377.82],
    10: [0, 0, 0, 0, 3.50, 8.00, 13.00, 63.00, 500.00, 800.00, 1000],
  },
};

interface KenoGameProps {
  balance: number;
  currentUser: string;
  setAuthModal: (v: string) => void;
  kenoBet: string; setKenoBet: (v: string) => void;
  kenoPickedNums: number[]; setKenoPickedNums: (v: number[]) => void;
  kenoDrawnNums: number[];
  kenoIsDrawing: boolean;
  kenoAutoCount: string; setKenoAutoCount: (v: string) => void;
  kenoAutoRemaining: number;
  onSetAutoRemaining: (v: number) => void;
  kenoAutoRunning: boolean;
  kenoStats: KenoStats;
  kenoBetHistory: KenoBetRecord[];
  kenoLastResult: { hits: number; multiplier: number; payout: number; win: boolean } | null;
  fmtMoney: (v: number) => string;
  displayCurrency: string;
  convertUsd: (v: number) => number;
  currencyFade: number;
  onBack: () => void;
  onPlaceBet: (betDisplay: number) => { success: boolean; drawn?: number[]; hits?: number; multiplier?: number; payout?: number; win?: boolean; betUsd?: number; picks?: number; pickedNums?: number[] };
  onSettleKenoBet: (result: KenoSettleResult) => void;
  onSetDrawn: (v: number[]) => void;
  onSetDrawing: (v: boolean) => void;
  onSetLastResult: (v: { hits: number; multiplier: number; payout: number; win: boolean } | null) => void;
  onAutoRunRef: React.MutableRefObject<boolean>;
  onLoopIdRef: React.MutableRefObject<number>;
  onSetAutoRunning: (v: boolean) => void;
  liveRates: Record<string, number>;
  kenoRisk: "low"|"medium"|"high"|"classic";
  setKenoRisk: (v: "low"|"medium"|"high"|"classic") => void;
  onResetStats: () => void;
  lang: string;
  hideHistory?: boolean;
}

interface KenoSettleResult {
  drawn: number[]; hits: number; multiplier: number; payout: number; win: boolean;
  betUsd: number; picks: number; pickedNums: number[];
}

function KenoGame({
  balance, currentUser, setAuthModal, kenoBet, setKenoBet, kenoPickedNums, setKenoPickedNums,
  kenoDrawnNums, kenoIsDrawing, kenoAutoCount, setKenoAutoCount,
  kenoAutoRunning, kenoStats, kenoBetHistory, kenoLastResult,
  fmtMoney, displayCurrency, convertUsd, currencyFade,
  onBack, onPlaceBet, onSettleKenoBet, onSetDrawn, onSetDrawing, onSetLastResult,
  onAutoRunRef, onLoopIdRef, onSetAutoRunning, onSetAutoRemaining, liveRates,
  kenoAutoRemaining, kenoRisk, setKenoRisk, onResetStats, lang, hideHistory = false,
}: KenoGameProps) {
  const t = (key: string) => tl(lang, key);
  const [autoTab, setAutoTab] = useState<"manual"|"auto">("manual");
  const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set());
  const [justRevealedHits, setJustRevealedHits] = useState<Set<number>>(new Set());
  const [bigWin, setBigWin] = useState<{ multiplier: number; payout: number } | null>(null);
  const [winPopupNum, setWinPopupNum] = useState<number | null>(null);
  const [kenoInfinite, setKenoInfinite] = useState(false);
  const [isAutoPickRunning, setIsAutoPickRunning] = useState(false);
  const [kenoVol, setKenoVol] = useState(70);
  const kenoVolRef = useRef(70);
  kenoVolRef.current = kenoVol;
  const [showKenoStats, setShowKenoStats] = useState(false);
  const [showKenoVol, setShowKenoVol] = useState(false);
  const [kenoStatsPos, setKenoStatsPos] = useState({ x: 270, y: 180 });
  const [kenoChartHover, setKenoChartHover] = useState<number|null>(null);
  const kenoStatsDragOffset = useRef({ x: 0, y: 0 });
  const kenoStatsDragging = useRef(false);
  function handleKenoStatsDragStart(e: React.MouseEvent) {
    kenoStatsDragging.current = true;
    kenoStatsDragOffset.current = { x: e.clientX - kenoStatsPos.x, y: e.clientY - kenoStatsPos.y };
    function onMove(ev: MouseEvent) {
      if (!kenoStatsDragging.current) return;
      setKenoStatsPos({ x: ev.clientX - kenoStatsDragOffset.current.x, y: ev.clientY - kenoStatsDragOffset.current.y });
    }
    function onUp() { kenoStatsDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  const bigWinTimeoutRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const betDisplayRef = useRef(0);
  const picksRef = useRef<number[]>([]);
  // Tracks in-flight draw state for settlement when component unmounts mid-draw
  const kenoPendingResultRef = useRef<KenoSettleResult | null>(null);
  const kenoDrawProgressRef = useRef(0);   // how many numbers have been revealed so far
  const currentDrawDelayRef = useRef(200); // ms per number reveal
  // Stable refs so useEffect cleanup always calls the latest prop functions
  const onSettleKenoRef  = useRef(onSettleKenoBet);  onSettleKenoRef.current  = onSettleKenoBet;
  const onSetDrawnRef    = useRef(onSetDrawn);        onSetDrawnRef.current    = onSetDrawn;
  const onSetDrawingRef  = useRef(onSetDrawing);      onSetDrawingRef.current  = onSetDrawing;
  const onSetLastResRef  = useRef(onSetLastResult);   onSetLastResRef.current  = onSetLastResult;
  // Cancels the in-progress draw loop when component unmounts (user navigated away)
  const drawCancelRef = useRef(false);
  useEffect(() => {
    drawCancelRef.current = false;
    return () => {
      drawCancelRef.current = true;
      const pending = kenoPendingResultRef.current;
      if (pending) {
        // Reveal full board immediately so it's visible on re-entry
        onSetDrawnRef.current(pending.drawn);
        onSetDrawingRef.current(false);
        onSetLastResRef.current({ hits: pending.hits, multiplier: pending.multiplier, payout: pending.payout, win: pending.win });
        // Delay the payout by however long the remaining animation would have taken
        const remaining = Math.max(0, (pending.drawn.length - kenoDrawProgressRef.current) * currentDrawDelayRef.current);
        setTimeout(() => onSettleKenoRef.current(pending), remaining);
        kenoPendingResultRef.current = null;
      }
    };
  }, []);

  // Restore revealedSet from previous draw when re-entering Keno
  useEffect(() => {
    if (kenoDrawnNums.length > 0 && !kenoIsDrawing) {
      setRevealedSet(new Set(kenoDrawnNums));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playTick() {
    if (kenoVolRef.current === 0) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 1100;
      const vol = kenoVolRef.current / 100;
      gain.gain.setValueAtTime(0.07 * vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.055);
      osc.onended = () => ctx.close();
    } catch {}
  }
  function playDrawHit() {
    if (kenoVolRef.current === 0) return;
    try {
      const ctx = new AudioContext();
      const vol = kenoVolRef.current / 100;
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.06;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18 * vol, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.18);
        if (i === 1) osc.onended = () => ctx.close();
      });
    } catch {}
  }
  function playDrawMiss() {
    if (kenoVolRef.current === 0) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "triangle"; osc.frequency.value = 180;
      const vol = kenoVolRef.current / 100;
      gain.gain.setValueAtTime(0.12 * vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.09);
      osc.onended = () => ctx.close();
    } catch {}
  }

  const rate = liveRates[displayCurrency] || 1;
  const betDisplay = parseFloat(kenoBet) || 0;
  const betUsd = betDisplay / rate;
  const picks = kenoPickedNums.length;
  betDisplayRef.current = betDisplay;
  picksRef.current = kenoPickedNums;
  const riskTable = KENO_MULT[kenoRisk] || KENO_MULT.medium;
  const mults = riskTable[picks] || [];
  const payoutPreview = betUsd * (mults[picks] || 0);

  function toggleNum(n: number) {
    if (kenoIsDrawing || kenoAutoRunning) return;
    if (kenoDrawnNums.length > 0) {
      onSetDrawn([]);
      onSetLastResult(null);
      setRevealedSet(new Set());
      setWinPopupNum(null);
    }
    const next = kenoPickedNums.includes(n)
      ? kenoPickedNums.filter(x => x !== n)
      : kenoPickedNums.length >= 10 ? kenoPickedNums : [...kenoPickedNums, n];
    if (next !== kenoPickedNums) playTick();
    setKenoPickedNums(next);
  }

  function clearPicks() {
    if (kenoIsDrawing || kenoAutoRunning) return;
    setKenoPickedNums([]);
    onSetDrawn([]);
    onSetLastResult(null);
    setRevealedSet(new Set());
    setWinPopupNum(null);
  }

  function quickPick(count: number) {
    if (kenoIsDrawing || kenoAutoRunning) return;
    const nums = Array.from({ length: 40 }, (_, i) => i + 1);
    const picked: number[] = [];
    const pool = [...nums];
    for (let i = 0; i < Math.min(count, 40); i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }
    setKenoPickedNums(picked);
    onSetDrawn([]);
    onSetLastResult(null);
    setRevealedSet(new Set());
    setWinPopupNum(null);
  }

  async function autoQuickPick() {
    if (kenoIsDrawing || kenoAutoRunning || isAutoPickRunning) return;
    setIsAutoPickRunning(true);
    clearPicks();
    await new Promise(r => setTimeout(r, 50));
    const pool = Array.from({ length: 40 }, (_, i) => i + 1);
    const selected: number[] = [];
    for (let i = 0; i < 10; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const n = pool.splice(idx, 1)[0];
      selected.push(n);
      setKenoPickedNums([...selected]);
      playTick();
      // Delay grows slightly with each pick so the animation feels deliberate
      await new Promise(r => setTimeout(r, 80 + i * 8));
    }
    // Short pause so the user can see all picks before the Bet button appears
    await new Promise(r => setTimeout(r, 120));
    setIsAutoPickRunning(false);
  }

  async function runDraw(betDisplay: number): Promise<boolean> {
    drawCancelRef.current = false;
    const result = onPlaceBet(betDisplay);
    if (!result.success || !result.drawn) return false;

    // Store pending result and timing so cleanup can handle mid-draw navigation
    const delay = kenoAutoRunning ? 60 : 200;
    currentDrawDelayRef.current = delay;
    kenoDrawProgressRef.current = 0;
    kenoPendingResultRef.current = {
      drawn: result.drawn!, hits: result.hits!, multiplier: result.multiplier!,
      payout: result.payout!, win: result.win!, betUsd: result.betUsd!,
      picks: result.picks!, pickedNums: result.pickedNums!,
    };

    onSetDrawing(true);
    onSetDrawn([]);
    setRevealedSet(new Set());
    onSetLastResult(null);
    setWinPopupNum(null);

    const drawn = result.drawn!;
    const pickedSnapshot = [...kenoPickedNums];
    setJustRevealedHits(new Set());
    for (let i = 0; i < drawn.length; i++) {
      await new Promise(r => setTimeout(r, delay));
      if (drawCancelRef.current) return false; // navigated away — cleanup will settle
      kenoDrawProgressRef.current = i + 1;
      const num = drawn[i];
      onSetDrawn(drawn.slice(0, i + 1));
      setRevealedSet(new Set(drawn.slice(0, i + 1)));
      if (pickedSnapshot.includes(num)) {
        playDrawHit();
        // Mark as just-hit to trigger the animation; clear after animation completes
        setJustRevealedHits(prev => new Set([...prev, num]));
        setTimeout(() => setJustRevealedHits(prev => { const s = new Set(prev); s.delete(num); return s; }), 600);
      } else {
        playDrawMiss();
      }
    }
    if (drawCancelRef.current) return false;

    // Animation finished normally — settle payout now
    kenoPendingResultRef.current = null;
    onSettleKenoBet({
      drawn: result.drawn!, hits: result.hits!, multiplier: result.multiplier!,
      payout: result.payout!, win: result.win!, betUsd: result.betUsd!,
      picks: result.picks!, pickedNums: result.pickedNums!,
    });
    onSetDrawing(false);
    onSetLastResult({ hits: result.hits!, multiplier: result.multiplier!, payout: result.payout!, win: result.win! });

    if (result.multiplier! >= 10) {
      setBigWin({ multiplier: result.multiplier!, payout: result.payout! });
      if (bigWinTimeoutRef.current) clearTimeout(bigWinTimeoutRef.current);
      bigWinTimeoutRef.current = setTimeout(() => setBigWin(null), 3200);
    }

    if (kenoVolRef.current > 0) try {
      const vol = kenoVolRef.current / 100;
      const ctx = new AudioContext();
      if (result.win) {
        // Professional win — C major arpeggio with warmth and shimmer
        const isBig = result.multiplier! >= 10;
        const notes = isBig
          ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]
          : [523.25, 659.25, 783.99, 1046.5];
        const master = ctx.createGain();
        master.gain.value = 0.8 * vol;
        master.connect(ctx.destination);
        notes.forEach((freq, i) => {
          const t = ctx.currentTime + i * 0.1;
          const body = ctx.createOscillator();
          const bodyG = ctx.createGain();
          body.connect(bodyG); bodyG.connect(master);
          body.type = "sine"; body.frequency.value = freq;
          bodyG.gain.setValueAtTime(0, t);
          bodyG.gain.linearRampToValueAtTime(0.28, t + 0.025);
          bodyG.gain.setValueAtTime(0.28, t + 0.06);
          bodyG.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
          body.start(t); body.stop(t + 0.55);
          const bell = ctx.createOscillator();
          const bellG = ctx.createGain();
          bell.connect(bellG); bellG.connect(master);
          bell.type = "sine"; bell.frequency.value = freq * 2;
          bellG.gain.setValueAtTime(0, t);
          bellG.gain.linearRampToValueAtTime(0.08, t + 0.015);
          bellG.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          bell.start(t); bell.stop(t + 0.45);
          if (i === notes.length - 1) body.onended = () => ctx.close();
        });
      } else {
        // Professional loss — gentle descending frequency sweep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.4);
        filter.type = "lowpass"; filter.frequency.value = 800;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.18 * vol, ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45);
        osc.onended = () => ctx.close();
      }
    } catch {}
    return true;
  }

  async function placeBet() {
    if (!currentUser) { setAuthModal("login"); return; }
    if (kenoIsDrawing || kenoAutoRunning || picks < 1 || betUsd < 0.0099) return;
    await runDraw(betDisplay);
  }

  async function startAuto() {
    if (!currentUser) { setAuthModal("login"); return; }
    const count = kenoInfinite ? Infinity : Math.max(0, parseInt(kenoAutoCount) || 0);
    if ((!kenoInfinite && count <= 0) || onAutoRunRef.current || kenoIsDrawing || picks < 1) return;
    onAutoRunRef.current = true;
    onSetAutoRunning(true);
    const myId = ++onLoopIdRef.current;
    let remaining = count;
    onSetAutoRemaining(remaining);

    const loop = async () => {
      if (onLoopIdRef.current !== myId || !onAutoRunRef.current || remaining <= 0) {
        onAutoRunRef.current = false;
        onSetAutoRunning(false);
        return;
      }
      // Always read the latest bet from the ref so changes mid-auto-play are applied immediately
      const ok = await runDraw(betDisplayRef.current);
      if (!ok) {
        onAutoRunRef.current = false;
        onSetAutoRunning(false);
        return;
      }
      remaining--;
      onSetAutoRemaining(remaining);
      await new Promise(r => setTimeout(r, 400));
      loop();
    };
    loop();
  }

  function stopAuto() {
    onLoopIdRef.current++;
    onAutoRunRef.current = false;
    onSetAutoRunning(false);
  }

  function halveBet() { setKenoBet(Math.max(0.01, betDisplay / 2).toFixed(2)); }
  function doubleBet() {
    const maxD = Math.floor(convertUsd(balance) * 100) / 100;
    setKenoBet(Math.min(maxD, betDisplay * 2).toFixed(2));
  }

  const numState = (n: number): "picked" | "hit" | "miss" | "drawn" | "idle" => {
    const isPicked = kenoPickedNums.includes(n);
    const isDrawn = revealedSet.has(n);
    if (isPicked && isDrawn) return "hit";
    if (!isPicked && isDrawn) return "drawn";
    if (isPicked) return "picked";
    if (revealedSet.size > 0 && !isDrawn) return "miss";
    return "idle";
  };

  // ── cell state helpers ───────────────────────────────────────────────────
  const cellBg = (state: string) => {
    if (state === "hit") return "linear-gradient(145deg,#8b38ff,#6420d4)";
    if (state === "drawn") return "#0d1018";
    if (state === "picked") return "linear-gradient(145deg,#8b38ff,#6420d4)";
    if (state === "miss") return "#141b2a";
    return "#1c2436";
  };
  const cellBorder = (state: string) => {
    if (state === "hit") return "2px solid #22ee66";
    if (state === "drawn") return "1px solid #3a1010";
    if (state === "picked") return "1px solid #9940ff";
    if (state === "miss") return "1px solid #1a2030";
    return "1px solid #252f45";
  };
  const cellShadow = (state: string, isHit: boolean) => {
    if (isHit || state === "hit") return "0 0 22px rgba(34,238,102,.5)";
    if (state === "picked") return "0 0 12px rgba(139,56,255,.35)";
    return "none";
  };
  const cellScale = (state: string, isHit: boolean) => {
    if (isHit || state === "hit") return "scale(1.04)";
    if (state === "drawn") return "scale(0.87)";
    if (state === "picked") return "scale(1.03)";
    return "scale(1)";
  };
  const cellColor = (state: string) => {
    if (state === "hit" || state === "picked") return "#fff";
    if (state === "drawn") return "#ff4444";
    if (state === "miss") return "#2a3448";
    return "#8090b0";
  };

  const riskLabel: Record<string, string> = { classic: "Clásico", low: "Bajo", medium: "Medio", high: "Alto" };
  const disabled = kenoIsDrawing || kenoAutoRunning || isAutoPickRunning;

  return (
    <div className="keno-root" style={{ maxWidth:"1080px", margin:"0 auto", position:"relative" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:"0", background:"#0e1320", borderRadius:"14px", overflow:"hidden", border:"1px solid #153650" }}>

        {/* ── Bordered header bar ── */}
        <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 20px", background:"#0e1826", borderBottom:"1px solid #1a2438", flexShrink:0 }}>
          <button onClick={onBack} style={{ background:"#131a28", border:"1px solid #252f45", color:"#8090b0", cursor:"pointer", fontSize:"18px", padding:"5px 12px", borderRadius:"8px", lineHeight:1 }}>←</button>
          <div style={{ fontWeight:500, fontSize:"15px", letterSpacing:"1.5px", color:"#fff", display:"flex", alignItems:"center", gap:"8px" }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>KENO</div>
          <div style={{ marginLeft:"auto", fontSize:"12px", color:"#5a6a88", fontWeight:500 }}>Mander Originals</div>
        </div>
      {/* Two-column layout */}
      <div style={{ display:"grid", gridTemplateColumns:"265px 1fr", minHeight:"560px" }}>

        {/* ── Left control panel ─────────────────────────────────────────── */}
        <div style={{ background:"#131a28", borderRight:"1px solid #1e2840", padding:"16px", display:"flex", flexDirection:"column", gap:"12px" }}>

          {/* Manual / Auto tab */}
          <div style={{ display:"flex", alignItems:"center", background:"#0e1826", borderRadius:"14px", padding:"5px", gap:"4px", marginBottom:"0" }}>
            {(["manual","auto"] as const).map(tab => (
              <button key={tab} onClick={()=>{ if(!kenoAutoRunning) setAutoTab(tab); }}
                disabled={kenoAutoRunning}
                style={{ flex:1, padding:"10px", borderRadius:"10px", fontWeight:500, fontSize:"14px", border: autoTab===tab ? "1px solid #3a4a60" : "1px solid transparent",
                  background: autoTab===tab ? "#1e2c44" : "transparent",
                  color: autoTab===tab ? "#eef3f8" : "#5a6a88",
                  cursor: kenoAutoRunning ? "not-allowed" : "pointer",
                  opacity: kenoAutoRunning && autoTab!==tab ? 0.45 : 1,
                  transition:"opacity .2s" }}>
                {tab === "manual" ? t("manual") : t("automatic")}
              </button>
            ))}
          </div>

          {/* Bet amount */}
          <div>
            <div style={{ fontSize:"13px", color:"#5a6a88", fontWeight:500, marginBottom:"6px", paddingLeft:"4px" }}>{t("betAmount")}</div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", background:"#0e1826", border:`1px solid ${betUsd < 0.0099 && betDisplay > 0 ? "#c0392b" : "#252f45"}`, borderRadius:"10px", padding:"8px 14px", marginBottom:"6px" }}>
              <span style={{ fontSize:"16px", color:"#5a6a88", fontWeight:500, flexShrink:0, whiteSpace:"nowrap", opacity:currencyFade, transition:"opacity .18s" }}>{displayCurrency}</span>
              <input type="text" inputMode="decimal" value={kenoBet} placeholder="0.00"
                onChange={e=>{ const raw=e.target.value.replace(/,/g,""); if(/^\d*\.?\d*$/.test(raw)) setKenoBet(raw); }} disabled={disabled}
                style={{ flex:1, background:"transparent", border:"none", outline:"none", color:"#fff", fontSize:"22px", fontWeight:600, padding:"0", fontFamily:"inherit", minWidth:0, opacity:currencyFade, transition:"opacity .18s" }}
              />
              <button onClick={()=>setKenoBet("0.00")} disabled={disabled}
                style={{ background:"#0e1826", border:"1px solid #252f45", borderRadius:"6px", color:"#6db3f2", fontSize:"11px", fontWeight:500, padding:"4px 8px", cursor:disabled?"not-allowed":"pointer", letterSpacing:"0.04em", whiteSpace:"nowrap", textTransform:"uppercase" }}>
                {t("clear")}
              </button>
            </div>
            {betUsd < 0.0099 && betDisplay > 0 && (
              <div style={{ fontSize:"11px", color:"#e74c3c", fontWeight:600, marginBottom:"5px", paddingLeft:"2px" }}>
                {t("minBet")} {fmtMoney(0.01)}
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"6px" }}>
              {([
                ["Min", ()=>setKenoBet((Math.ceil(convertUsd(0.01)*100)/100).toFixed(2))],
                ["½",   halveBet],
                ["2×",  doubleBet],
                ["Max", ()=>setKenoBet((Math.floor(convertUsd(balance)*100)/100).toFixed(2))],
              ] as [string, () => void][]).map(([label, action]) => (
                <button key={label} onClick={action} disabled={disabled}
                  style={{ padding:"8px 0", borderRadius:"8px", fontWeight:500, fontSize:"13px", border:"1px solid #252f45", background:"#1a2438", color:disabled?"#3a4a60":"#d0dcea", cursor:disabled?"not-allowed":"pointer" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Riesgo — 4 in a row */}
          <div>
            <div style={{ fontSize:"13px", color:"#5a6a88", fontWeight:500, marginBottom:"6px", paddingLeft:"4px" }}>Riesgo</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"4px" }}>
              {([
                ["classic","Clásico","#4a1a8c","#9a5fff"],
                ["low",    "Bajo",   "#1f6fd0","#3a8aff"],
                ["medium", "Medio",  "#b07800","#f4a91f"],
                ["high",   "Alto",   "#8b1a1a","#ff5a6a"],
              ] as [string,string,string,string][]).map(([r,label,bg,bd])=>(
                <button key={r} onClick={()=>{ if(!disabled) setKenoRisk(r as "low"|"medium"|"high"|"classic"); }}
                  disabled={disabled}
                  style={{ padding:"8px 0", background:kenoRisk===r?bg:"#1a2438", border:`1px solid ${kenoRisk===r?bd:"#252f45"}`, borderRadius:"8px", color:"#fff", fontWeight:500, fontSize:"13px", cursor:disabled?"not-allowed":"pointer", transition:"all .15s", boxShadow:kenoRisk===r?`0 2px 14px ${bd}66`:"none" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto rounds */}
          {autoTab === "auto" && (
            <div>
              <div style={{ fontSize:"13px", color:"#5a6a88", fontWeight:500, marginBottom:"6px", paddingLeft:"4px" }}>Tiradas</div>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", background:"#0e1826", border:"1px solid #252f45", borderRadius:"10px", padding:"6px 10px" }}>
                <input
                  value={kenoAutoRunning ? String(kenoAutoRemaining) : (kenoInfinite ? "∞" : kenoAutoCount)}
                  onChange={e=>{ setKenoInfinite(false); setKenoAutoCount(e.target.value); }}
                  onBlur={()=>{ if(!kenoInfinite && (kenoAutoCount===""||parseInt(kenoAutoCount)<=0)) setKenoAutoCount("1"); }}
                  type={kenoInfinite ? "text" : "number"}
                  min="1" max="9999"
                  readOnly={kenoInfinite || kenoAutoRunning}
                  disabled={kenoAutoRunning}
                  style={{ flex:1, background:"transparent", border:"none", color:"white", fontSize:"20px", padding:"4px", minWidth:0, outline:"none", fontFamily:"inherit" }}
                />
                <button onClick={()=>setKenoInfinite(v=>!v)} disabled={kenoAutoRunning}
                  style={{ padding:"4px 10px", borderRadius:"6px", background:kenoInfinite?"#1f6fd0":"#2a4155", color:"#d0dcea", border:"none", fontWeight:500, cursor:kenoAutoRunning?"not-allowed":"pointer", fontSize:"16px", fontFamily:"inherit", transition:"all .15s" }}>
                  ∞
                </button>
              </div>
            </div>
          )}

          {/* Selección Automática + Limpiar Mesa */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px" }}>
            {([
              { label:<>{t("autoQuickPick").split("\n")[0]}<br/>{t("autoQuickPick").split("\n")[1]}</>, action:autoQuickPick },
              { label:t("clearBoard"), action:clearPicks },
            ] as { label:React.ReactNode; action:()=>void }[]).map((b,i)=>(
              <button key={i} onClick={b.action} disabled={disabled}
                style={{ padding:"10px 6px", background:"#1a2438", border:"1px solid #252f45", borderRadius:"8px", color:disabled?"#3a4a60":"#d0dcea", fontWeight:500, fontSize:"12px", cursor:disabled?"not-allowed":"pointer", lineHeight:1.4 }}>
                {b.label}
              </button>
            ))}
          </div>

          {/* Números seleccionados */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#0e1826", border:"1px solid #1a2438", borderRadius:"8px", padding:"11px 14px" }}>
            <span style={{ fontSize:"12px", color:"#5a7090", fontWeight:600 }}>{t("selectedNums")}:</span>
            <span style={{ fontSize:"14px", color:"#d0e2f5", fontWeight:500 }}>{picks} / 10</span>
          </div>

          {/* Bet / Stop button — right below the selected-numbers card */}
          {autoTab === "manual" ? (
            <button onClick={placeBet} disabled={disabled || picks < 1 || betUsd < 0.0099}
              style={{ width:"100%", padding:"14px 0", borderRadius:"10px", fontWeight:500, fontSize:"15px", border:"none", cursor:"pointer", transition:"all .2s",
                opacity: kenoIsDrawing ? .7 : 1,
                background: disabled || picks < 1 || betUsd < 0.0099 ? "#1a2438" : "linear-gradient(180deg,#1a9fff,#0d6fd4)",
                color: disabled || picks < 1 || betUsd < 0.0099 ? "#3a4a60" : "#fff",
                boxShadow: disabled || picks < 1 || betUsd < 0.0099 ? "none" : "0 4px 22px rgba(26,159,255,.35)" }}>
              {kenoIsDrawing ? t("drawing") : picks < 1 ? t("selectNumbers") : "▶ " + t("bet")}
            </button>
          ) : kenoAutoRunning ? (
            <button onClick={stopAuto}
              style={{ width:"100%", padding:"14px 0", borderRadius:"10px", fontWeight:500, fontSize:"15px", border:"none", cursor:"pointer", background:"linear-gradient(180deg,#ff5b5b,#c02020)", color:"#fff" }}>
              {t("stopAuto")}
            </button>
          ) : (
            <button onClick={startAuto} disabled={disabled || picks < 1 || betUsd < 0.0099 || (parseInt(kenoAutoCount)||0) <= 0}
              style={{ width:"100%", padding:"14px 0", borderRadius:"10px", fontWeight:500, fontSize:"15px", border:"none", transition:"all .2s",
                cursor: disabled || picks < 1 || betUsd < 0.0099 ? "not-allowed" : "pointer",
                background: disabled || picks < 1 || betUsd < 0.0099 ? "#1a2438" : "linear-gradient(180deg,#1a9fff,#0d6fd4)",
                color: disabled || picks < 1 || betUsd < 0.0099 ? "#3a4a60" : "#fff",
                boxShadow: disabled || picks < 1 || betUsd < 0.0099 ? "none" : "0 4px 22px rgba(26,159,255,.35)" }}>
              {"▶ "+t("startAuto")}
            </button>
          )}

          {/* Spacer */}
          <div style={{ flex:1 }}/>

          {/* Icon buttons row — bottom of left panel */}
          <div style={{ paddingTop:"14px", display:"flex", gap:"8px", position:"relative" }}>
            <button
              onClick={()=>setShowKenoStats(v=>!v)}
              title="Estadísticas"
              style={{ width:"38px",height:"38px",borderRadius:"8px",background:showKenoStats?"#1f6fd0":"#0e1826",border:showKenoStats?"1px solid #3a8aff":"1px solid #203a50",color:showKenoStats?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",transition:"background .2s,border .2s,color .2s" }}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
            </button>

            {/* Volume button + popup */}
            <div style={{ position:"relative" }}>
              {showKenoVol && (
                <div onClick={()=>setShowKenoVol(false)}
                  style={{ position:"fixed",inset:0,zIndex:98 }}/>
              )}
              <button
                onClick={()=>setShowKenoVol(v=>!v)}
                title="Volumen"
                style={{ position:"relative",zIndex:100,width:"38px",height:"38px",borderRadius:"8px",background:showKenoVol?"#1f6fd0":"#0e1826",border:showKenoVol?"1px solid #3a8aff":"1px solid #203a50",color:showKenoVol?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",transition:"background .2s,border .2s,color .2s" }}>
                {kenoVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : kenoVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
              </button>
              {showKenoVol && (
                <div style={{ position:"absolute",bottom:"48px",left:"0",background:"#0f1e2e",border:"1px solid #252f45",borderRadius:"12px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"12px",minWidth:"220px",boxShadow:"0 4px 20px rgba(0,0,0,.5)",zIndex:100 }}>
                  <span style={{ fontSize:"18px",flexShrink:0,color:"#5a6a88" }}>{kenoVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : kenoVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}</span>
                  <input type="range" min="0" max="100" step="1" value={kenoVol} onChange={e=>setKenoVol(Number(e.target.value))}
                    style={{ flex:1,accentColor:"#f4a91f",cursor:"pointer",height:"4px" }}/>
                  <span style={{ color:"#d0dcea",fontWeight:500,fontSize:"13px",minWidth:"24px",textAlign:"right" }}>{kenoVol}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: number grid ─────────────────────────────────────────── */}
        <div style={{ padding:"20px 20px 10px", display:"flex", flexDirection:"column", gap:"8px" }}>

          {/* Grid */}
          <div style={{ flex:1, position:"relative" }}>
          {/* Centered win overlay — Stake style */}
          {!kenoIsDrawing && kenoLastResult && kenoLastResult.win && (
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              transform:"translate(-50%,-50%)",
              zIndex:200, pointerEvents:"none",
            }}>
              <div style={{
                background:"rgba(10,16,26,0.97)", border:"2.5px solid #22ee66",
                borderRadius:"14px", padding:"20px 32px", textAlign:"center",
                boxShadow:"0 0 48px rgba(34,238,102,.45), 0 8px 32px rgba(0,0,0,.7)",
                animation:"kenoCenterPop .32s cubic-bezier(.34,1.56,.64,1) both",
                minWidth:"140px", whiteSpace:"nowrap",
              }}>
                <div style={{ fontSize:"30px", fontWeight:700, color:"#22ee66", lineHeight:1, letterSpacing:"-0.5px" }}>
                  {kenoLastResult.multiplier.toLocaleString("es-AR", { minimumFractionDigits:2, maximumFractionDigits:2 })}×
                </div>
                <div style={{ height:"1px", background:"#1e3a28", margin:"11px 0" }}/>
                <div style={{ fontSize:"15px", fontWeight:500, color:"#8aabb0", textAlign:"center" }}>
                  <span style={{ opacity:currencyFade, transition:"opacity .18s" }}>{fmtMoney(kenoLastResult.payout)}</span>
                </div>
              </div>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:"8px", alignContent:"start" }}>
            {Array.from({ length: 40 }, (_, i) => i + 1).map(n => {
              const state = numState(n);
              const isHit = state === "hit";
              return (
                <div key={n} onClick={()=>toggleNum(n)}
                  style={{
                    position:"relative",
                    background: cellBg(state),
                    border: cellBorder(state),
                    borderRadius:"14px",
                    paddingTop:"85%",
                    cursor: disabled ? "default" : "pointer",
                    transition: justRevealedHits.has(n) ? "background .12s, border-color .12s" : "background .12s, transform .12s, border-color .12s",
                    transform: justRevealedHits.has(n) ? undefined : cellScale(state, isHit),
                    boxShadow: cellShadow(state, isHit),
                    userSelect:"none",
                    animation: justRevealedHits.has(n) ? "kenoHitCell 0.5s cubic-bezier(0.34,1.56,0.64,1) both" : undefined,
                  }}
                  onMouseEnter={e=>{ if(!disabled && (state==="idle"||state==="picked")){ (e.currentTarget as HTMLDivElement).style.background=state==="picked"?"linear-gradient(145deg,#a050ff,#7030e0)":"#242e42"; }}}
                  onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.background=cellBg(state); }}
                >
                  <span style={{
                    position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
                    fontWeight:600, fontSize:"18px", color: cellColor(state),
                  }}>
                    {isHit ? <KenoGem number={n} animate={justRevealedHits.has(n)} /> : n}
                  </span>

                </div>
              );
            })}
          </div>
          </div>{/* end grid position:relative wrapper */}

          {/* ── Paytable / idle message ─────────────────────────────────── */}
          {/* Fixed-height paytable — never shifts position */}
          <div style={{ height:"66px", flexShrink:0 }}>
          {picks === 0 ? (
            <div style={{ height:"100%", background:"#0e1826", border:"1px solid #1a2438", borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px", color:"#5a7090", fontWeight:600 }}>
              Selecciona de 1 a 10 números para jugar
            </div>
          ) : (() => {
            const cols = picks + 1;
            const fs = picks >= 10 ? "10px" : picks >= 8 ? "11px" : picks >= 6 ? "12px" : "13px";
            const dotSz = picks >= 9 ? "6px" : "7px";
            return (
              <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols},1fr)`, gridTemplateRows:"1fr 1fr", gap:"2px", height:"100%" }}>
                {/* Row 1 — Multipliers */}
                {Array.from({length:cols},(_,m)=>{
                  const mult = mults[m] || 0;
                  const isWon = kenoLastResult && kenoLastResult.hits === m && kenoLastResult.win && mult > 0;
                  return (
                    <div key={`m${m}`} style={{
                      background: isWon ? "rgba(100,200,255,.18)" : "#1a2235",
                      borderRadius:"5px 5px 0 0",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:fs,
                      fontWeight:600,
                      color: isWon ? "#6ad4ff"
                        : mult>=1000  ? "#f4c040"
                        : mult>=100   ? "#00e676"
                        : mult>=10    ? "#1a9fff"
                        : mult>0      ? "#9ab0cc"
                        : "#2e3d52",
                      transition:"all .25s",
                      letterSpacing:"-0.3px",
                      whiteSpace:"nowrap",
                      overflow:"hidden",
                    }}>
                      {mult>0 ? `${mult.toFixed(2)}×` : "0.00×"}
                    </div>
                  );
                })}
                {/* Row 2 — Match counts + green dot */}
                {Array.from({length:cols},(_,m)=>{
                  const mult = mults[m] || 0;
                  const isWon = kenoLastResult && kenoLastResult.hits === m && kenoLastResult.win && mult > 0;
                  return (
                    <div key={`c${m}`} style={{
                      background:"#1a2235",
                      borderRadius:"0 0 5px 5px",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:"2px",
                      transition:"all .25s",
                    }}>
                      <span style={{ fontSize:fs, fontWeight:500, color: isWon ? "#22dd66" : "#384a60", whiteSpace:"nowrap" }}>{m}×</span>
                      <div style={{ width:dotSz, height:dotSz, borderRadius:"50%", background: isWon ? "#22dd66" : "#2a3d55", flexShrink:0 }}/>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          </div>

        </div>
      </div>

      {/* ── Floating draggable Keno stats panel ── */}
      {showKenoStats && (
        <div style={{ position:"fixed", left:kenoStatsPos.x, top:kenoStatsPos.y, zIndex:9998, width:"280px", background:"#0f1f2e", border:"1px solid #1e3a52", borderRadius:"14px", boxShadow:"0 8px 32px rgba(0,0,0,.7)", overflow:"hidden", userSelect:"none" }}>
          <div onMouseDown={handleKenoStatsDragStart} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:"#112232",borderBottom:"1px solid #1e3a52",cursor:"grab" }}>
            <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
              <span style={{ display:"flex",alignItems:"center",color:"#7a9db8" }}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></span>
              <strong style={{ fontSize:"14px",color:"#d8e8f5" }}>{t("liveStats")}</strong>
            </div>
            <button onClick={()=>setShowKenoStats(false)} style={{ background:"none",border:"none",color:"#7a9db8",fontSize:"18px",cursor:"pointer",lineHeight:1,padding:"0 2px" }}>×</button>
          </div>
          <div style={{ padding:"12px" }}>
            <div style={{ background:"#0d1a28",borderRadius:"10px",padding:"12px",marginBottom:"8px",display:"flex",flexDirection:"column",gap:"8px" }}>
              {([
                { label: t("profitLabel"), value: fmtMoney(kenoStats.profit), color: kenoStats.profit>=0?"#16ff5c":"#ff5959" },
                { label: t("won"),        value: String(kenoStats.wins),      color: "#16ff5c" },
                { label: t("wagered"),    value: fmtMoney(kenoStats.wagered), color: "#d8e8f5" },
                { label: t("lostLabel"),  value: String(kenoStats.losses),    color: "#ff5959" },
              ] as {label:string;value:string;color:string}[]).map(s=>(
                <div key={s.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ color:"#7a9db8",fontSize:"11.5px" }}>{s.label}</span>
                  <span style={{ color:s.color,fontWeight:500,fontSize:"13px" }}>{s.value}</span>
                </div>
              ))}
            </div>
            <button onClick={onResetStats}
              style={{ width:"100%",marginBottom:"8px",background:"transparent",border:"1px solid #1e3a52",borderRadius:"8px",color:"#7a9db8",fontSize:"12px",cursor:"pointer",padding:"6px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",transition:"color .15s,border-color .15s,background .15s" }}
              onMouseEnter={e=>{const b=e.currentTarget as HTMLButtonElement;b.style.color="#fff";b.style.borderColor="#3a8aff";b.style.background="#0d1f30";}}
              onMouseLeave={e=>{const b=e.currentTarget as HTMLButtonElement;b.style.color="#7a9db8";b.style.borderColor="#1e3a52";b.style.background="transparent";}}>
              <span style={{ fontSize:"14px" }}>↺</span> Reiniciar estadísticas
            </button>
            {/* Mini chart — cumulative profit */}
            {(()=>{
              const raw = kenoStats.history.length>0 ? kenoStats.history.slice().reverse() : null;
              const W=320, H=210, PAD_X=12, PAD_Y=20;
              const chartW = W-PAD_X*2, chartH = H-PAD_Y*2;
              interface KChartPt { cum:number; win:boolean; profit:number }
              let series: KChartPt[] = [];
              if(raw){
                let running = 0;
                series = raw.map(p=>{ running += (p.profit??0); return { cum:running, win:p.win, profit:p.profit??0 }; });
              }
              const allPts: KChartPt[] = raw ? [{ cum:0, win:false, profit:0 }, ...series] : [];
              const n = allPts.length;
              const cums = allPts.map(p=>p.cum);
              const minC = Math.min(0, ...cums);
              const maxC = Math.max(0, ...cums);
              const range = maxC - minC || 1;
              const toX = (i:number) => PAD_X + i * (chartW / Math.max(n-1,1));
              const toY = (v:number) => PAD_Y + chartH - ((v - minC) / range) * chartH;
              const zeroY = toY(0);
              const xs = allPts.map((_,i)=>toX(i));
              const ys = allPts.map(p=>toY(p.cum));
              const maxIdx = series.length>0 ? series.reduce((best,p,i)=>p.cum>series[best].cum?i:best,0)+1 : -1;
              const hIdx = kenoChartHover;
              const hpt = hIdx!==null && hIdx>0 && hIdx<allPts.length ? allPts[hIdx] : null;
              const hx = hIdx!==null ? xs[hIdx] : 0;
              if (n < 2) return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #1a3347" }}>
                  <span style={{ color:"#2a4a6a",fontSize:"12px" }}>Sin historial</span>
                </div>
              );
              const linePath = xs.map((x,i)=>`${i===0?"M":"L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
              const fillAbove = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const fillBelow = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const tipXpct = hIdx!==null && xs.length ? (xs[hIdx]/W)*100 : 0;
              const tipYpct = hIdx!==null && ys.length ? (ys[hIdx]/H)*100 : 0;
              const tipLeft = Math.min(Math.max(tipXpct, 12), 78);
              const tipTop  = Math.max(tipYpct - 14, 2);
              return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",overflow:"visible",border:"1px solid #1a3347" }}>
                  {hpt && (
                    <div style={{
                      position:"absolute",
                      left:`${tipLeft}%`,
                      top:`${tipTop}%`,
                      transform:"translateX(-50%) translateY(-100%)",
                      background:"#1a2a3a",
                      border:`1.5px solid ${hpt.profit>=0?"#19ff35":"#ff3350"}`,
                      borderRadius:"8px",
                      padding:"4px 10px",
                      fontSize:"12px",
                      fontWeight:500,
                      color: hpt.profit>=0?"#19ff35":"#ff3350",
                      whiteSpace:"nowrap",
                      pointerEvents:"none",
                      zIndex:20,
                      boxShadow:`0 2px 12px ${hpt.profit>=0?"rgba(25,255,53,.3)":"rgba(255,51,80,.3)"}`,
                    }}>
                      {hpt.profit>=0?"+":""}{fmtMoney(hpt.profit)}
                      <span style={{ color:"#7a9db8",fontWeight:400,fontSize:"10px",marginLeft:"6px" }}>
                        acum: {hpt.cum>=0?"+":""}{fmtMoney(hpt.cum)}
                      </span>
                    </div>
                  )}
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:"100%",height:"100%",display:"block",cursor:"crosshair" }}
                    onMouseMove={e=>{
                      if(!xs.length) return;
                      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                      const svgX = ((e.clientX - rect.left) / rect.width) * W;
                      let closest = 0, minDist = Infinity;
                      xs.forEach((x,i)=>{ const d=Math.abs(x-svgX); if(d<minDist){ minDist=d; closest=i; } });
                      setKenoChartHover(closest);
                    }}
                    onMouseLeave={()=>setKenoChartHover(null)}
                  >
                    <defs>
                      <clipPath id="kclipAbove"><rect x={PAD_X} y={PAD_Y} width={chartW} height={zeroY-PAD_Y}/></clipPath>
                      <clipPath id="kclipBelow"><rect x={PAD_X} y={zeroY} width={chartW} height={chartH-(zeroY-PAD_Y)}/></clipPath>
                    </defs>
                    {n>1 ? <>
                      <path d={fillBelow} fill="rgba(200,30,30,.35)" clipPath="url(#kclipBelow)"/>
                      <path d={fillAbove} fill="rgba(25,255,80,.18)" clipPath="url(#kclipAbove)"/>
                      <line x1={PAD_X} y1={zeroY} x2={W-PAD_X} y2={zeroY} stroke="#2a4055" strokeWidth="1.5"/>
                      <path d={linePath} fill="none" stroke="#19ff35" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#kclipAbove)"/>
                      <path d={linePath} fill="none" stroke="#e03030" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#kclipBelow)"/>
                      <rect x={PAD_X} y={PAD_Y} width={chartW} height={chartH} fill="transparent"/>
                      {hIdx!==null && hIdx<allPts.length && (
                        <>
                          <line x1={xs[hIdx]} y1={PAD_Y} x2={xs[hIdx]} y2={H-PAD_Y} stroke="#3a5570" strokeWidth="1" strokeDasharray="4,3"/>
                          <circle cx={xs[hIdx]} cy={ys[hIdx]} r="5"
                            fill={allPts[hIdx].profit>=0?"#19ff35":"#ff3350"}
                            stroke="#0a1520" strokeWidth="2"
                            style={{ pointerEvents:"none" }}/>
                        </>
                      )}
                    </> : (
                      <line x1={PAD_X} y1={H/2} x2={W-PAD_X} y2={H/2} stroke="#2a4055" strokeWidth="1.5"/>
                    )}
                  </svg>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Big Win Overlay */}
      {bigWin && (
        <div onClick={()=>setBigWin(null)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,.88)", display:"flex", alignItems:"center", justifyContent:"center",
          zIndex:9999, cursor:"pointer", animation:"fadeIn .25s ease-out",
        }}>
          <div style={{ textAlign:"center", animation:"scaleIn .35s cubic-bezier(.34,1.56,.64,1)" }}>
            <div style={{ fontSize:"72px", marginBottom:"8px" }}>🎉</div>
            <div style={{ fontSize:"60px", fontWeight:600, fontStyle:"italic", color:"#f4a91f", textShadow:"0 0 40px rgba(244,169,31,.6)" }}>
              {bigWin.multiplier >= 500 ? "MEGA WIN!" : bigWin.multiplier >= 100 ? "BIG WIN!" : "SUPER WIN!"}
            </div>
            <div style={{ fontSize:"34px", fontWeight:600, color:"#fff", marginTop:"16px", opacity:currencyFade }}>
              +{fmtMoney(bigWin.payout)}
            </div>
            <div style={{ color:"#f4a91f99", marginTop:"8px", fontSize:"15px" }}>{bigWin.multiplier}× · {riskLabel[kenoRisk]}</div>
            <div style={{ color:"#5a6e88", marginTop:"24px", fontSize:"13px" }}>Toca para continuar</div>
          </div>
        </div>
      )}
    </div>

    {!hideHistory && <div style={{ marginTop:"18px",background:"#0d1a26",borderRadius:"14px",border:"1px solid #1a3347",overflow:"hidden" }}>
      <div style={{ padding:"14px 20px",borderBottom:"1px solid #1a3347",display:"flex",alignItems:"center",gap:"10px" }}>
        <span style={{ fontSize:"18px" }}>🎱</span>
        <span style={{ fontWeight:500,fontSize:"16px",color:"#e0eaf5" }}>Keno</span>
        <span style={{ color:"#6a8aa0",fontSize:"14px",marginLeft:"4px" }}>Mander Originals</span>
      </div>
      <div style={{ padding:"10px 20px",borderBottom:"1px solid #152535",display:"flex",alignItems:"center",gap:"4px" }}>
        <div style={{ background:"#1a3347",border:"1px solid #2a4d68",borderRadius:"999px",padding:"7px 18px",fontWeight:500,fontSize:"13px",color:"#e0eaf5" }}>
          {t("myBets")}
        </div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"120px 1fr 1fr 1fr 1fr",padding:"10px 20px",borderBottom:"1px solid #152535",color:"#4a7090",fontSize:"13px",fontWeight:500 }}>
        <span>{t("game")}</span>
        <span style={{ textAlign:"center" }}>{t("time")}</span>
        <span style={{ textAlign:"center" }}>{t("betAmount")}</span>
        <span style={{ textAlign:"center" }}>{t("multiplierLabel")}</span>
        <span style={{ textAlign:"right" }}>{t("win")}</span>
      </div>
      {kenoBetHistory.length === 0 ? (
        <div style={{ padding:"30px",textAlign:"center",color:"#4a6a80",fontSize:"14px" }}>{t("noBetsYet")}</div>
      ) : (
        kenoBetHistory.slice(0, 10).map((b, i) => {
          const dt = new Date(b.createdAt);
          const hora = dt.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
          const paySign = b.win ? "+" : "-";
          const payAmt = b.win ? b.payout.toFixed(2) : b.amount.toFixed(2);
          return (
            <div key={i} style={{ display:"grid",gridTemplateColumns:"120px 1fr 1fr 1fr 1fr",padding:"12px 20px",borderBottom:"1px solid #0f1e2c",alignItems:"center",background:i%2===0?"transparent":"rgba(255,255,255,.015)" }}>
              <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
                <span style={{ fontSize:"18px" }}>🎱</span>
                <span style={{ fontWeight:500,color:"#d0e2f0" }}>Keno</span>
              </div>
              <div style={{ textAlign:"center",color:"#7a99b0",fontSize:"13px" }}>{hora}</div>
              <div style={{ textAlign:"center" }}>
                <span style={{ fontWeight:500,color:"#d0e2f0",fontSize:"13px" }}>${b.amount.toFixed(2)}</span>
                <span style={{ marginLeft:"5px",background:"#0f8a6c",borderRadius:"999px",padding:"2px 6px",fontSize:"11px",color:"white",fontWeight:500 }}>₮</span>
              </div>
              <div style={{ textAlign:"center",color:"#d0e2f0",fontWeight:500,fontSize:"13px" }}>
                {b.multiplier.toFixed(2)}×
              </div>
              <div style={{ textAlign:"right",fontWeight:500,fontSize:"13px",color:b.win?"#21d97a":"#ff5a6a" }}>
                {paySign}${payAmt}
                <span style={{ marginLeft:"5px",background:"#0f8a6c",borderRadius:"999px",padding:"2px 6px",fontSize:"11px",color:"white",fontWeight:500 }}>₮</span>
              </div>
            </div>
          );
        })
      )}
    </div>}
  </div>
  );
}
