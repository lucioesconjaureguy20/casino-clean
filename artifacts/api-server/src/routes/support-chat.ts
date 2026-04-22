import { Router, type IRouter } from "express";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";

const router: IRouter = Router();

// ── Supabase service-role helper ──────────────────────────────────────────────
function sbSvc(path: string, opts: RequestInit = {}) {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

// ── Language detection ────────────────────────────────────────────────────────
function detectLang(text: string): "es" | "pt" | "en" {
  const lower = text.toLowerCase();
  const esWords = [
    "hola", "gracias", "ayuda", "no puedo", "quiero", "tengo", "problema",
    "retiro", "depósito", "cuenta", "saldo", "juego", "dinero", "cómo", "como",
    "qué", "que", "por favor", "favor", "necesito", "podrias", "puedes", "enviar",
    "contacto", "un ", "una ", "estoy", "tengo", "mi ", "me ", "del ", "del",
    "casino", "consulta", "pregunta", "buenas", "buenos", "saludos",
  ];
  const ptWords = [
    "olá", "obrigado", "ajuda", "não posso", "quero", "tenho", "problema",
    "saque", "depósito", "conta", "saldo", "jogo", "dinheiro", "por favor",
    "preciso", "oi", "você", "voce", "estou", "meu", "minha", "pode",
    "pode me", "poderia", "gostaria", "tudo bem",
  ];
  const esScore = esWords.filter(w => lower.includes(w)).length;
  const ptScore = ptWords.filter(w => lower.includes(w)).length;
  if (ptScore > esScore) return "pt";
  if (esScore > 0) return "es";
  return "en";
}

// ── Topic detection ────────────────────────────────────────────────────────────
type Topic =
  | "deposit" | "withdrawal" | "balance" | "game" | "account" | "bonus"
  | "provably_fair" | "affiliate" | "password" | "human" | "greeting"
  | "thanks" | "partners" | "levels" | "limits" | "wager" | "security"
  | "responsible" | "crypto_info" | "games_list" | "unknown";

function detectTopic(text: string): Topic {
  const t = text.toLowerCase();
  // Partners first — "manager de partners" must not trigger "human"
  if (/partner|parceiro|partenaire|partner.?contact|contacto.?partner|manager.?partner|business.?partner|negocio|negócio|colabora|sponsor|patrocin|b2b/.test(t)) return "partners";
  if (/human|real.?person|real.?agent|hablar.?con.?alguien|persona.?real|agente.?humano|quiero.?hablar|falar.?com.?(pessoa|atendente)|parler.?à.?quelqu|mensch|gerente|supervisor|\bmanager\b/.test(t)) return "human";
  // Levels / ranks
  if (/level|nivel|rang|rank|vip|bronze|silver|gold|platinum|diamond|elite|xp|puntos|pontos|progress|progreso|progresso|loyalty|fidelidad|fidelidade/.test(t)) return "levels";
  // Deposit/withdrawal limits
  if (/m[íi]nimo|m[áa]ximo|limite|limit|minimo|maximo|m[íi]n |m[áa]x |minimum|maximum|how.?much.?can|cuánto.?puedo|quanto.?posso/.test(t)) return "limits";
  // Wagering requirements
  if (/wager|wagering|rollover|playthrough|requisito.?de.?apuesta|requisito.?de.?aposta|antes.?de.?retirar|antes.?de.?sacar|antes.?de.?sacar|para.?retirar/.test(t)) return "wager";
  // Security / 2FA / privacy
  if (/2fa|two.?factor|autenticación|autenticação|secure|seguro|segura|privacidad|privacidade|privacy|hack|hacked|comprometido|breached/.test(t)) return "security";
  // Responsible gambling
  if (/responsible|responsable|responsável|self.?exclu|autoexclu|problem.?gambl|adicción|adicao|límite.?de.?apuesta|cooling.?off|break/.test(t)) return "responsible";
  // Crypto info (which coins, networks, fees)
  if (/crypto|criptomoneda|criptomoeda|bitcoin|btc|ethereum|eth|usdt|tron|bep20|erc20|trc20|bnb|sol|solana|litecoin|ltc|fee|comisión.?red|gas|network/.test(t)) return "crypto_info";
  // Games list / what games are available
  if (/what.?games|qué.?juegos|quais.?jogos|juegos.?disponibles|jogos.?disponíveis|all.?games|todos.?los.?juegos|todos.?os.?jogos|lista.?de.?juegos|games.?available|how.?many.?games/.test(t)) return "games_list";
  // Standard topics
  if (/deposit|deposi|top.?up|fund|send.?crypto|added.?funds|recharge|recarga|envié|enviaste|txid|transaction.?hash|tx.?id|not.?credited|no.?acreditó|no.?llegó|no.?aparece|didn.?t.?arrive|pending.?deposit|deposito.?pendiente/.test(t)) return "deposit";
  if (/withdraw|retiro|retirar|saque|sacar|payout|cashout|cash.?out|withdrawal.?pending|retiro.?pendiente|not.?received|no.?recibí|no.?recibido|wallet/.test(t)) return "withdrawal";
  if (/balance|saldo|balance.?wrong|saldo.?incorrecto|missing.?funds|perdí.?dinero|faltam.?fundos|balance.?not|saldo.?no/.test(t)) return "balance";
  if (/dice|plinko|keno|roulette|ruleta|hilo|hi.?lo|blackjack|baccarat|mines|game|juego|jogo|crash|bug.?en|bug.?in|glitch|froze|se.?congeló|lost.?bet|perdí|error.?in.?game/.test(t)) return "game";
  if (/password|contraseña|senha|forgot|olvidé|esqueci|login|log.?in|sign.?in|can.?t.?log|no.?puedo.?entrar|account|cuenta|conta|blocked|bloqueado|suspended|suspendido|kyc|verify|verificar|verification|id.?document|documento|passport|pasaporte|identidad|identity/.test(t)) return "account";
  if (/bonus|bonificación|bônus|promo|promotion|promoción|free.?spin|cashback|reward|recompensa/.test(t)) return "bonus";
  if (/provably.?fair|fairness|justicia|random|seed|hash.?verification|verify.?game/.test(t)) return "provably_fair";
  if (/affiliate|afiliado|referral|referido|commission|comisión|link|invite/.test(t)) return "affiliate";
  if (/thank|gracias|obrigado|merci|danke|grazie|thanks|cheers/.test(t)) return "thanks";
  if (/hello|hi\b|hey|hola|oi\b|olá|salut|ciao|hallo|buenas|bom.?dia|good.?morning|good.?afternoon|sup\b/.test(t)) return "greeting";
  return "unknown";
}

// ── Smart rule-based bot responses ────────────────────────────────────────────
interface BotContext {
  isFirstMessage: boolean;
  botRepliesCount: number;
  ticketNum: string;
  lang: "en" | "es" | "pt";
  topic: Topic;
  history: Array<{ sender: string; message: string }>;
}

function generateBotReply(ctx: BotContext): { reply: string; escalate: boolean } {
  const { isFirstMessage, botRepliesCount, ticketNum, lang, topic, history } = ctx;

  // Auto-escalate after 4 bot replies with the same topic (unresolved).
  // Informational topics that always have a self-contained answer must never auto-escalate.
  const NEVER_ESCALATE: Topic[] = ["thanks", "greeting", "partners", "affiliate", "provably_fair", "bonus", "levels", "crypto_info", "games_list", "responsible", "limits", "wager", "security"];
  if (botRepliesCount >= 4 && !NEVER_ESCALATE.includes(topic)) {
    return {
      reply: lang === "es"
        ? `Entiendo que este problema persiste. Voy a conectarte con uno de nuestros agentes humanos de inmediato para que te ayuden personalmente. Por favor espera un momento. 🔴`
        : lang === "pt"
        ? `Entendo que esse problema persiste. Vou conectá-lo com um de nossos agentes humanos imediatamente para que possam ajudá-lo pessoalmente. Por favor aguarde um momento. 🔴`
        : `I understand this issue is persisting. Let me connect you with one of our human agents right away so they can assist you personally. Please hold on for a moment. 🔴`,
      escalate: true,
    };
  }

  // User wants human
  if (topic === "human") {
    return {
      reply: lang === "es"
        ? `Por supuesto, voy a conectarte con un agente humano ahora mismo. Por favor espera un momento. 🔴`
        : lang === "pt"
        ? `Claro, vou conectá-lo com um agente humano agora mesmo. Por favor aguarde um momento. 🔴`
        : `Of course, I'll connect you with a human agent right away. Please hold on for a moment. 🔴`,
      escalate: true,
    };
  }

  // Welcome message on first contact
  if (isFirstMessage) {
    const ticketLine = lang === "es"
      ? `🎫 Ticket #${ticketNum} — ¡Hola! Soy el asistente de soporte de Mander Casino. ¿En qué puedo ayudarte hoy?`
      : lang === "pt"
      ? `🎫 Ticket #${ticketNum} — Olá! Sou o assistente de suporte da Mander Casino. Como posso ajudá-lo hoje?`
      : `🎫 Ticket #${ticketNum} — Hello! I'm Mander Casino's support assistant. How can I help you today?`;

    if (topic === "greeting" || topic === "unknown") {
      return { reply: ticketLine, escalate: false };
    }
    // First message already has a topic — welcome + first relevant question
    return { reply: ticketLine + "\n\n" + getTopicResponse(topic, lang, 0, history), escalate: false };
  }

  // Thanks / closing message
  if (topic === "thanks") {
    return {
      reply: lang === "es"
        ? `¡Con mucho gusto! Si tienes alguna otra pregunta, no dudes en contactarnos. ¡Que tengas un gran día y buena suerte en los juegos! 🎰`
        : lang === "pt"
        ? `De nada! Se tiver mais alguma dúvida, não hesite em nos contatar. Tenha um ótimo dia e boa sorte nos jogos! 🎰`
        : `You're welcome! If you have any other questions, don't hesitate to reach out. Have a great day and good luck at the tables! 🎰`,
      escalate: false,
    };
  }

  // Greeting without first message (follow-up)
  if (topic === "greeting") {
    return {
      reply: lang === "es"
        ? `¡Hola de nuevo! ¿En qué más puedo ayudarte?`
        : lang === "pt"
        ? `Olá novamente! Em que mais posso ajudá-lo?`
        : `Hey there again! What else can I help you with?`,
      escalate: false,
    };
  }

  const response = getTopicResponse(topic, lang, botRepliesCount, history);
  return { reply: response, escalate: false };
}

function getTopicResponse(topic: Topic, lang: "en" | "es" | "pt", replyIndex: number, history: Array<{ sender: string; message: string }>): string {
  // Check if we already asked for info in a previous bot message
  const prevBotMessages = history.filter(m => m.sender === "bot" || m.sender === "system" || m.sender === "assistant").map(m => m.message.toLowerCase());
  const alreadyAskedTxid = prevBotMessages.some(m => m.includes("txid") || m.includes("transaction") || m.includes("transacción") || m.includes("transação"));
  const alreadyAskedWallet = prevBotMessages.some(m => m.includes("wallet") || m.includes("billetera") || m.includes("carteira") || m.includes("address") || m.includes("dirección") || m.includes("endereço"));
  const alreadyAskedGame = prevBotMessages.some(m => m.includes("which game") || m.includes("qué juego") || m.includes("qual jogo"));

  switch (topic) {
    case "deposit":
      if (!alreadyAskedTxid) {
        return lang === "es"
          ? `Entiendo que tienes un problema con un depósito. 💳\n\n**Información sobre depósitos:**\n• Mínimo: **$10 USDT** (o equivalente)\n• Máximo: Sin límite\n• Tiempo de acreditación: **10–30 minutos** (según la red)\n• Criptos aceptadas: USDT (TRC20/ERC20/BEP20), BTC, ETH, LTC, BNB, SOL\n\nPara ayudarte mejor, ¿podrías proporcionar:\n• El **TXID / Hash de transacción**\n• El **monto** depositado\n• La **criptomoneda** y red usada\n\nTus fondos están seguros. 🔍`
          : lang === "pt"
          ? `Entendo que você tem um problema com um depósito. 💳\n\n**Informações sobre depósitos:**\n• Mínimo: **$10 USDT** (ou equivalente)\n• Máximo: Sem limite\n• Tempo de crédito: **10–30 minutos** (dependendo da rede)\n• Criptos aceitas: USDT (TRC20/ERC20/BEP20), BTC, ETH, LTC, BNB, SOL\n\nPara ajudá-lo melhor, poderia fornecer:\n• O **TXID / Hash da transação**\n• O **valor** depositado\n• A **criptomoeda** e rede usada\n\nSeus fundos estão seguros. 🔍`
          : `I understand you have a deposit issue. 💳\n\n**Deposit information:**\n• Minimum: **$10 USDT** (or equivalent)\n• Maximum: No limit\n• Credit time: **10–30 minutes** (depending on the network)\n• Accepted cryptos: USDT (TRC20/ERC20/BEP20), BTC, ETH, LTC, BNB, SOL\n\nTo assist you better, could you please provide:\n• The **TXID / Transaction hash**\n• The **amount** deposited\n• The **cryptocurrency** and network used\n\nYour funds are safe. 🔍`;
      }
      return lang === "es"
        ? `Gracias por la información. Nuestro equipo revisará la transacción en breve. Los depósitos en blockchain requieren confirmaciones de red que pueden tardar entre 10–30 minutos. Si ya pasó más de 1 hora y el saldo no aparece, un agente humano podrá revisarlo directamente en nuestro sistema.`
        : lang === "pt"
        ? `Obrigado pela informação. Nossa equipe revisará a transação em breve. Depósitos em blockchain requerem confirmações de rede que podem levar de 10 a 30 minutos. Se já passou mais de 1 hora e o saldo não apareceu, um agente humano poderá verificá-lo diretamente.`
        : `Thank you for the information. Our team will review the transaction shortly. Blockchain deposits require network confirmations that can take 10–30 minutes. If more than 1 hour has passed and the balance hasn't appeared, a human agent can check it directly in our system.`;

    case "withdrawal":
      if (!alreadyAskedWallet) {
        return lang === "es"
          ? `Entiendo que tienes una consulta sobre retiros. 💸\n\n**Mínimos de retiro por moneda:**\n• USDT, BNB, TRX, ETH, USDC, SOL → **mínimo $5 USD**\n• LTC → **mínimo $10 USD**\n• BTC → **mínimo $50 USD**\n\n**Máximo:** $5,000 USD por día\n**Tiempo de procesamiento:** Generalmente **menos de 1 hora** ⚡\n*(En períodos de alta demanda puede tardar hasta 12 horas)*\n**Requisito:** Haber completado al menos **2x wager** del monto depositado\n\n¿Podrías indicarme:\n• El **monto** y **criptomoneda**\n• La **dirección de wallet** de destino\n• Cuándo realizaste la solicitud\n\n¡Tus fondos están completamente seguros! 💚`
          : lang === "pt"
          ? `Entendo que você tem uma consulta sobre saques. 💸\n\n**Mínimos de saque por moeda:**\n• USDT, BNB, TRX, ETH, USDC, SOL → **mínimo $5 USD**\n• LTC → **mínimo $10 USD**\n• BTC → **mínimo $50 USD**\n\n**Máximo:** $5.000 USD por dia\n**Tempo de processamento:** Geralmente **menos de 1 hora** ⚡\n*(Em períodos de alta demanda pode levar até 12 horas)*\n**Requisito:** Ter completado pelo menos **2x wager** do valor depositado\n\nVocê poderia me informar:\n• O **valor** e **criptomoeda**\n• O **endereço da carteira** de destino\n• Quando fez a solicitação\n\nSeus fundos estão completamente seguros! 💚`
          : `I understand you have a withdrawal inquiry. 💸\n\n**Withdrawal minimums by coin:**\n• USDT, BNB, TRX, ETH, USDC, SOL → **minimum $5 USD**\n• LTC → **minimum $10 USD**\n• BTC → **minimum $50 USD**\n\n**Maximum:** $5,000 USD per day\n**Processing time:** Usually **less than 1 hour** ⚡\n*(During high demand periods, can take up to 12 hours)*\n**Requirement:** Must complete at least **2x wager** of your deposited amount\n\nCould you please provide:\n• The **amount** and **cryptocurrency**\n• The destination **wallet address**\n• When you made the request\n\nYour funds are completely safe! 💚`;
      }
      return lang === "es"
        ? `Gracias. Los retiros se procesan por orden de llegada. El tiempo normal es **menos de 1 hora**, aunque en momentos de alta demanda puede tardar hasta **12 horas**. Si tu retiro lleva más de 12 horas en estado "pendiente", un agente lo verificará directamente. Recuerda confirmar que la dirección de wallet es correcta — los retiros a wallets incorrectas no pueden revertirse.`
        : lang === "pt"
        ? `Obrigado. Os saques são processados por ordem de chegada. O tempo normal é **menos de 1 hora**, embora em momentos de alta demanda possa levar até **12 horas**. Se o seu saque estiver "pendente" há mais de 12 horas, um agente verificará diretamente. Confirme que o endereço da carteira está correto — saques para carteiras erradas não podem ser revertidos.`
        : `Thank you. Withdrawals are processed in order. The normal time is **less than 1 hour**, though during high-demand periods it may take up to **12 hours**. If your withdrawal has been "pending" for more than 12 hours, an agent will verify it directly. Please confirm your wallet address is correct — withdrawals to wrong wallets cannot be reversed.`;

    case "balance":
      return lang === "es"
        ? `Entiendo que hay una discrepancia en tu saldo. Esto puede deberse a:\n• Un depósito pendiente de confirmación en la blockchain\n• Una apuesta que aún está siendo procesada\n• Un problema de actualización en la pantalla (prueba refrescando)\n\n¿Puedes decirme cuánto esperabas tener y cuánto muestra actualmente? Así verificamos juntos. 🔍`
        : lang === "pt"
        ? `Entendo que há uma discrepância no seu saldo. Isso pode ser devido a:\n• Um depósito pendente de confirmação na blockchain\n• Uma aposta que ainda está sendo processada\n• Um problema de atualização na tela (tente atualizar)\n\nVocê pode me dizer quanto esperava ter e quanto aparece atualmente? Assim verificamos juntos. 🔍`
        : `I understand there's a discrepancy in your balance. This can be due to:\n• A deposit pending blockchain confirmation\n• A bet still being processed\n• A display refresh issue (try refreshing the page)\n\nCould you tell me how much you expected to have and what it currently shows? Let's verify together. 🔍`;

    case "game":
      if (!alreadyAskedGame) {
        return lang === "es"
          ? `Lamento que hayas tenido un problema con un juego. Para investigarlo correctamente, necesito:\n• ¿En **qué juego** ocurrió? (Dice, Plinko, Blackjack, etc.)\n• ¿Qué pasó exactamente? (¿se congeló, resultado incorrecto, etc.)\n• ¿A qué hora aproximadamente?\n\nTodos nuestros juegos son **provably fair** — puedes verificar la equidad en la sección "Fairness". 🎲`
          : lang === "pt"
          ? `Lamento que você tenha tido um problema com um jogo. Para investigar corretamente, preciso:\n• Em **qual jogo** ocorreu? (Dice, Plinko, Blackjack, etc.)\n• O que aconteceu exatamente? (travou, resultado incorreto, etc.)\n• Aproximadamente que horas?\n\nTodos os nossos jogos são **provably fair** — você pode verificar a equidade na seção "Fairness". 🎲`
          : `I'm sorry to hear you had an issue with a game. To investigate correctly, I need:\n• Which **game** did it happen in? (Dice, Plinko, Blackjack, etc.)\n• What exactly happened? (froze, incorrect result, etc.)\n• Approximately what time?\n\nAll our games are **provably fair** — you can verify fairness in the "Fairness" section. 🎲`;
      }
      return lang === "es"
        ? `Gracias por los detalles. Nuestros juegos utilizan semillas de servidor verificables para garantizar resultados justos. Si crees que hubo un error técnico, nuestro equipo técnico puede revisar los logs de la partida. ¿Deseas que un agente humano revise este caso específicamente?`
        : lang === "pt"
        ? `Obrigado pelos detalhes. Nossos jogos usam sementes de servidor verificáveis para garantir resultados justos. Se você acredita que houve um erro técnico, nossa equipe técnica pode revisar os logs da partida. Deseja que um agente humano revise este caso especificamente?`
        : `Thank you for the details. Our games use verifiable server seeds to ensure fair results. If you believe there was a technical error, our tech team can review the game logs. Would you like a human agent to review this specific case?`;

    case "account":
      return lang === "es"
        ? `Entiendo que tienes un problema con tu cuenta. Por seguridad, nunca compartas tu contraseña con nadie, ni siquiera con el soporte.\n\nSi olvidaste tu contraseña, usa el enlace **"¿Olvidaste tu contraseña?"** en la pantalla de inicio de sesión para restablecerla.\n\nSi tu cuenta está bloqueada o suspendida, un agente humano necesita revisar el caso. ¿Necesitas ayuda con lo anterior?`
        : lang === "pt"
        ? `Entendo que você tem um problema com sua conta. Por segurança, nunca compartilhe sua senha com ninguém, nem mesmo com o suporte.\n\nSe esqueceu sua senha, use o link **"Esqueceu a senha?"** na tela de login para redefini-la.\n\nSe sua conta está bloqueada ou suspensa, um agente humano precisará revisar o caso. Precisa de ajuda com isso?`
        : `I understand you have an account issue. For security, never share your password with anyone, not even support.\n\nIf you forgot your password, use the **"Forgot password?"** link on the login screen to reset it.\n\nIf your account is blocked or suspended, a human agent will need to review the case. Do you need help with any of the above?`;

    // KYC removed — casino does not require KYC (falls through to account handling)

    case "bonus":
      return lang === "es"
        ? `En Mander no tenemos bonos de bienvenida ni promociones clásicas. En cambio, ofrecemos un sistema de **recompensas de rakeback** real y automático. 💰\n\n**¿Cómo funciona?**\nCada apuesta que realizás genera rakeback que se acumula en tu cuenta. Podés reclamarlo en cualquier momento desde la sección **Recompensas**.\n\n**Recompensas según tu rango VIP:**\n• 🥉 **Bronze** — 4% a 5% de rakeback\n• 🥈 **Silver** — 6% a 8% de rakeback\n• 🥇 **Gold** — 9% a 11% de rakeback\n• 💠 **Platinum** — 12% a 14% de rakeback\n• 💎 **Emerald** — 15% a 17% de rakeback\n\n**Recompensas adicionales:**\n• 📅 **Recompensa semanal** — basada en tu actividad de la semana\n• 🗓️ **Recompensa mensual** — basada en tu actividad del mes\n• 🏆 **Recompensa por subir de rango** — bonificación instantánea al alcanzar un nuevo nivel VIP\n\nEl rakeback se calcula sobre tus pérdidas netas y se puede reclamar desde la sección **Recompensas**. ¿Tenés alguna pregunta?`
        : lang === "pt"
        ? `Na Mander não temos bônus de boas-vindas nem promoções clássicas. Em vez disso, oferecemos um sistema de **recompensas de rakeback** real e automático. 💰\n\n**Como funciona?**\nCada aposta que você faz gera rakeback que se acumula na sua conta. Você pode resgatá-lo a qualquer momento na seção **Recompensas**.\n\n**Recompensas por rank VIP:**\n• 🥉 **Bronze** — 4% a 5% de rakeback\n• 🥈 **Silver** — 6% a 8% de rakeback\n• 🥇 **Gold** — 9% a 11% de rakeback\n• 💠 **Platinum** — 12% a 14% de rakeback\n• 💎 **Emerald** — 15% a 17% de rakeback\n\n**Recompensas adicionais:**\n• 📅 **Recompensa semanal** — baseada na sua atividade da semana\n• 🗓️ **Recompensa mensal** — baseada na sua atividade do mês\n• 🏆 **Recompensa por subir de rank** — bônus instantâneo ao atingir um novo nível VIP\n\nO rakeback é calculado sobre suas perdas líquidas e pode ser resgatado na seção **Recompensas**. Tem alguma dúvida?`
        : `At Mander we don't have welcome bonuses or classic promotions. Instead, we offer a real, automatic **rakeback rewards** system. 💰\n\n**How does it work?**\nEvery bet you place generates rakeback that accumulates in your account. You can claim it anytime from the **Rewards** section.\n\n**Rewards by VIP rank:**\n• 🥉 **Bronze** — 4% to 5% rakeback\n• 🥈 **Silver** — 6% to 8% rakeback\n• 🥇 **Gold** — 9% to 11% rakeback\n• 💠 **Platinum** — 12% to 14% rakeback\n• 💎 **Emerald** — 15% to 17% rakeback\n\n**Additional rewards:**\n• 📅 **Weekly reward** — based on your weekly activity\n• 🗓️ **Monthly reward** — based on your monthly activity\n• 🏆 **Rank-up reward** — instant bonus when you reach a new VIP level\n\nRakeback is calculated on your net losses and can be claimed from the **Rewards** section. Any questions?`;

    case "provably_fair":
      return lang === "es"
        ? `¡Excelente pregunta! Todos los juegos de Mander Casino son **Provably Fair**, lo que significa que puedes verificar matemáticamente la equidad de cada resultado.\n\nPara verificar:\n1. Ve a la sección **"Fairness"** en el menú\n2. Ingresa el hash del servidor y la semilla del cliente\n3. Verifica que el resultado coincida\n\nEsto garantiza que ni el casino ni el jugador pueden manipular los resultados. ¿Necesitas ayuda para verificar una partida específica?`
        : lang === "pt"
        ? `Excelente pergunta! Todos os jogos da Mander Casino são **Provably Fair**, o que significa que você pode verificar matematicamente a equidade de cada resultado.\n\nPara verificar:\n1. Vá à seção **"Fairness"** no menu\n2. Insira o hash do servidor e a semente do cliente\n3. Verifique se o resultado coincide\n\nIsso garante que nem o cassino nem o jogador podem manipular os resultados. Precisa de ajuda para verificar uma partida específica?`
        : `Great question! All Mander Casino games are **Provably Fair**, meaning you can mathematically verify the fairness of every outcome.\n\nTo verify:\n1. Go to the **"Fairness"** section in the menu\n2. Enter the server hash and client seed\n3. Verify the result matches\n\nThis ensures neither the casino nor the player can manipulate results. Do you need help verifying a specific game round?`;

    case "affiliate":
      return lang === "es"
        ? `¡El programa de afiliados de Mander es una de las mejores opciones del mercado! 🤝\n\n**Comisión:** **15% del NGR** (pérdidas netas de tus referidos)\n\n**¿Cómo funciona?**\n1. Entrá a la sección **"Afiliados"** del menú y copiá tu enlace único\n2. Compartilo donde quieras — redes sociales, grupos, etc.\n3. Cuando alguien se registra y deposita con tu link, queda vinculado a vos **para siempre**\n4. Ganás el **15% de sus pérdidas netas** en forma permanente\n\n**Pagos:** Las comisiones se acreditan a tu saldo a **principio de cada mes** y podés retirarlas cuando quieras.\n\n**Ventajas:**\n• Sin riesgo — no necesitás depositar ni apostar\n• Comisión fija del 15%, sin niveles ni condiciones ocultas\n• Seguimiento detallado de tus referidos desde el panel\n• Global y compatible con cripto\n\n¿Querés una oferta personalizada o tenés dudas? Contactanos en **partners@manderbet.com**`
        : lang === "pt"
        ? `O programa de afiliados da Mander é uma das melhores opções do mercado! 🤝\n\n**Comissão:** **15% do NGR** (perdas líquidas dos seus indicados)\n\n**Como funciona?**\n1. Acesse a seção **"Afiliados"** no menu e copie seu link único\n2. Compartilhe onde quiser — redes sociais, grupos, etc.\n3. Quando alguém se cadastra e deposita com seu link, fica vinculado a você **para sempre**\n4. Você ganha **15% das perdas líquidas deles** de forma permanente\n\n**Pagamentos:** As comissões são creditadas no seu saldo no **início de cada mês** e você pode sacar quando quiser.\n\n**Vantagens:**\n• Sem risco — não precisa depositar ou apostar\n• Comissão fixa de 15%, sem níveis ou condições ocultas\n• Acompanhamento detalhado dos seus indicados no painel\n• Global e compatível com cripto\n\nQuer uma oferta personalizada ou tem dúvidas? Contate-nos em **partners@manderbet.com**`
        : `Mander's affiliate program is one of the best on the market! 🤝\n\n**Commission: 15% of NGR** (your referrals' net losses)\n\n**How it works:**\n1. Go to the **"Affiliates"** section in the menu and copy your unique link\n2. Share it anywhere — social media, groups, etc.\n3. When someone signs up and deposits using your link, they're linked to you **forever**\n4. You earn **15% of their net losses** permanently\n\n**Payments:** Commissions are credited to your balance at the **beginning of each month** and you can withdraw them anytime.\n\n**Benefits:**\n• No risk — no need to deposit or bet\n• Fixed 15% commission, no levels or hidden conditions\n• Detailed tracking of your referrals from the dashboard\n• Global & crypto-friendly\n\nWant a custom offer or have questions? Contact us at **partners@manderbet.com**`;

    case "partners":
      return lang === "es"
        ? `¡Gracias por tu interés en colaborar con Mander Casino! 🤝\n\nPara consultas de partnerships, negocios o patrocinios, puedes contactar directamente a nuestro equipo de partners en:\n\n📧 **partners@manderbet.com**\n\nNuestro equipo te responderá en un plazo de 24-48 horas hábiles. ¿Hay algo más en lo que pueda ayudarte?`
        : lang === "pt"
        ? `Obrigado pelo seu interesse em colaborar com a Mander Casino! 🤝\n\nPara consultas de parcerias, negócios ou patrocínios, você pode entrar em contato diretamente com nossa equipe de parceiros em:\n\n📧 **partners@manderbet.com**\n\nNossa equipe responderá em 24-48 horas úteis. Posso ajudá-lo com mais alguma coisa?`
        : `Thanks for your interest in partnering with Mander Casino! 🤝\n\nFor partnership, business, or sponsorship inquiries, you can reach our partners team directly at:\n\n📧 **partners@manderbet.com**\n\nOur team will get back to you within 24-48 business hours. Is there anything else I can help you with?`;

    case "levels":
      return lang === "es"
        ? `¡Mander Casino tiene un sistema de rangos VIP exclusivo! 🏆\n\n**Rangos y wager requerido:**\n🥉 **Bronze I** — $0 apostado | 4% rakeback | recompensa hasta $10\n🥉 **Bronze II** — $500 | 4.5% | hasta $10\n🥉 **Bronze III** — $2,000 | 5% | hasta $10\n🥈 **Silver I** — $8,000 | 6% | hasta $75\n🥈 **Silver II** — $25,000 | 7% | hasta $75\n🥈 **Silver III** — $60,000 | 8% | hasta $75\n🥇 **Gold I** — $125,000 | 9% | hasta $400\n🥇 **Gold II** — $250,000 | 10% | hasta $400\n🥇 **Gold III** — $500,000 | 11% | hasta $400\n💠 **Platinum I** — $900,000 | 12% | hasta $2,000\n💠 **Platinum II** — $1,500,000 | 13% | hasta $2,000\n💠 **Platinum III** — $2,500,000 | 14% | hasta $2,000\n💎 **Emerald I** — $4,000,000 | 15% | hasta $7,000\n💎 **Emerald II** — $7,000,000 | 16% | hasta $7,000\n💎 **Emerald III** — $12,000,000 | 17% | hasta $7,000\n\n**¿Cómo funciona el rakeback?**\nSe acumula con cada apuesta y podés reclamarlo instantáneamente desde la sección **Recompensas**.\n\n**Al subir de rango** recibís una recompensa instantánea en tu saldo.\n\n¿Querés saber más sobre tu rango actual?`
        : lang === "pt"
        ? `A Mander Casino tem um sistema de ranks VIP exclusivo! 🏆\n\n**Ranks e wager necessário:**\n🥉 **Bronze I** — $0 apostado | 4% rakeback | recompensa até $10\n🥉 **Bronze II** — $500 | 4.5% | até $10\n🥉 **Bronze III** — $2.000 | 5% | até $10\n🥈 **Silver I** — $8.000 | 6% | até $75\n🥈 **Silver II** — $25.000 | 7% | até $75\n🥈 **Silver III** — $60.000 | 8% | até $75\n🥇 **Gold I** — $125.000 | 9% | até $400\n🥇 **Gold II** — $250.000 | 10% | até $400\n🥇 **Gold III** — $500.000 | 11% | até $400\n💠 **Platinum I** — $900.000 | 12% | até $2.000\n💠 **Platinum II** — $1.500.000 | 13% | até $2.000\n💠 **Platinum III** — $2.500.000 | 14% | até $2.000\n💎 **Emerald I** — $4.000.000 | 15% | até $7.000\n💎 **Emerald II** — $7.000.000 | 16% | até $7.000\n💎 **Emerald III** — $12.000.000 | 17% | até $7.000\n\n**Como funciona o rakeback?**\nAcumula com cada aposta e pode ser resgatado instantaneamente na seção **Recompensas**.\n\n**Ao subir de rank** você recebe uma recompensa instantânea no saldo.\n\nQuer saber mais sobre seu rank atual?`
        : `Mander Casino has an exclusive VIP rank system! 🏆\n\n**Ranks and wager required:**\n🥉 **Bronze I** — $0 wagered | 4% rakeback | reward up to $10\n🥉 **Bronze II** — $500 | 4.5% | up to $10\n🥉 **Bronze III** — $2,000 | 5% | up to $10\n🥈 **Silver I** — $8,000 | 6% | up to $75\n🥈 **Silver II** — $25,000 | 7% | up to $75\n🥈 **Silver III** — $60,000 | 8% | up to $75\n🥇 **Gold I** — $125,000 | 9% | up to $400\n🥇 **Gold II** — $250,000 | 10% | up to $400\n🥇 **Gold III** — $500,000 | 11% | up to $400\n💠 **Platinum I** — $900,000 | 12% | up to $2,000\n💠 **Platinum II** — $1,500,000 | 13% | up to $2,000\n💠 **Platinum III** — $2,500,000 | 14% | up to $2,000\n💎 **Emerald I** — $4,000,000 | 15% | up to $7,000\n💎 **Emerald II** — $7,000,000 | 16% | up to $7,000\n💎 **Emerald III** — $12,000,000 | 17% | up to $7,000\n\n**How does rakeback work?**\nIt accumulates on every bet and can be claimed instantly from the **Rewards** section.\n\n**On rank up** you receive an instant reward credited to your balance.\n\nWould you like to know more about your current rank?`;

    case "limits":
      return lang === "es"
        ? `Aquí tienes un resumen completo de los límites en Mander Casino: 📊\n\n**Depósitos:**\n• Mínimo: **$10 USDT** (o equivalente)\n• Máximo: **Sin límite**\n• Tiempo: 10–30 minutos\n\n**Retiros:**\n• Mínimo: **$20 USDT** (o equivalente)\n• Máximo diario: **$5,000 USDT**\n• Máximo semanal: **$10,000 USDT**\n• Tiempo: Generalmente **menos de 1 hora** ⚡\n  *(Puede tardar hasta 12 horas en alta demanda)*\n\n**Apuestas en juegos:**\n• Apuesta mínima: **$0.10**\n• Apuesta máxima: **$1,000** por ronda\n  *(Los jugadores VIP Platinum/Diamond tienen límites mayores)*\n\n¿Tienes alguna pregunta adicional?`
        : lang === "pt"
        ? `Aqui está um resumo completo dos limites na Mander Casino: 📊\n\n**Depósitos:**\n• Mínimo: **$10 USDT** (ou equivalente)\n• Máximo: **Sem limite**\n• Tempo: 10–30 minutos\n\n**Saques:**\n• Mínimo: **$20 USDT** (ou equivalente)\n• Máximo diário: **$5.000 USDT**\n• Máximo semanal: **$10.000 USDT**\n• Tempo: Geralmente **menos de 1 hora** ⚡\n  *(Pode levar até 12 horas em alta demanda)*\n\n**Apostas nos jogos:**\n• Aposta mínima: **$0,10**\n• Aposta máxima: **$1.000** por rodada\n  *(Jogadores VIP Platinum/Diamond têm limites maiores)*\n\nVocê tem mais alguma dúvida?`
        : `Here's a complete summary of limits at Mander Casino: 📊\n\n**Deposits:**\n• Minimum: **$10 USDT** (or equivalent)\n• Maximum: **No limit**\n• Time: 10–30 minutes\n\n**Withdrawals:**\n• Minimum: **$20 USDT** (or equivalent)\n• Daily maximum: **$5,000 USDT**\n• Weekly maximum: **$10,000 USDT**\n• Time: Usually **less than 1 hour** ⚡\n  *(Can take up to 12 hours during high demand)*\n\n**Game bets:**\n• Minimum bet: **$0.10**\n• Maximum bet: **$1,000** per round\n  *(Platinum/Diamond VIP players have higher limits)*\n\nDo you have any additional questions?`;

    case "wager":
      return lang === "es"
        ? `¡Buena pregunta sobre los requisitos de apuesta! 🎯\n\n**Requisito de Wagering en Mander Casino:**\n\n✅ **Para poder retirar**, necesitás haber apostado al menos **2x el monto depositado**.\n\n**Ejemplo:**\n• Depositás $100 → debés apostar $200 en total → podés retirar libremente\n\n**¿Qué juegos cuentan para el wagering?**\n• Todos los juegos originales cuentan al 100%: Dice, Plinko, Keno, Ruleta, HiLo, Blackjack, Baccarat y Mines\n\nPodés ver tu progreso de wagering en la sección **Recompensas** de tu perfil. ¿Tenés alguna duda específica?`
        : lang === "pt"
        ? `Ótima pergunta sobre os requisitos de apostas! 🎯\n\n**Requisito de Wagering na Mander Casino:**\n\n✅ **Para poder sacar**, você precisa ter apostado pelo menos **2x o valor depositado**.\n\n**Exemplo:**\n• Deposita $100 → deve apostar $200 no total → pode sacar livremente\n\n**Quais jogos contam para o wagering?**\n• Todos os jogos originais contam 100%: Dice, Plinko, Keno, Roleta, HiLo, Blackjack, Bacará e Mines\n\nVocê pode ver seu progresso de wagering na seção **Recompensas** do seu perfil. Tem alguma dúvida específica?`
        : `Great question about wagering requirements! 🎯\n\n**Wagering Requirement at Mander Casino:**\n\n✅ **To be able to withdraw**, you need to have wagered at least **2x your deposited amount**.\n\n**Example:**\n• Deposit $100 → wager $200 total → you can withdraw freely\n\n**Which games count toward wagering?**\n• All original games count 100%: Dice, Plinko, Keno, Roulette, HiLo, Blackjack, Baccarat, and Mines\n\nYou can check your wagering progress in the **Rewards** section of your profile. Do you have any specific questions?`;

    case "security":
      return lang === "es"
        ? `La seguridad de tu cuenta es nuestra prioridad. 🔐\n\n**Consejos para proteger tu cuenta:**\n• Usa una **contraseña fuerte y única** (mínimo 12 caracteres)\n• Nunca compartas tus credenciales con nadie, incluido el soporte\n• Cierra sesión en dispositivos públicos\n• Activa la **autenticación en dos pasos (2FA)** desde Configuración\n• Verifica siempre que estás en la URL oficial de Mander\n\n**Si crees que tu cuenta fue comprometida:**\n1. Cambia tu contraseña inmediatamente\n2. Contacta soporte para bloquear la cuenta temporalmente\n3. Proporciona información de verificación de identidad\n\n¿Necesitas ayuda con algo específico relacionado a la seguridad?`
        : lang === "pt"
        ? `A segurança da sua conta é nossa prioridade. 🔐\n\n**Dicas para proteger sua conta:**\n• Use uma **senha forte e única** (mínimo 12 caracteres)\n• Nunca compartilhe suas credenciais com ninguém, incluindo o suporte\n• Saia em dispositivos públicos\n• Ative a **autenticação em dois fatores (2FA)** nas Configurações\n• Verifique sempre se está na URL oficial da Mander\n\n**Se você acredita que sua conta foi comprometida:**\n1. Mude sua senha imediatamente\n2. Contate o suporte para bloquear a conta temporariamente\n3. Forneça informações de verificação de identidade\n\nPrecisa de ajuda com algo específico relacionado à segurança?`
        : `Account security is our top priority. 🔐\n\n**Tips to protect your account:**\n• Use a **strong, unique password** (minimum 12 characters)\n• Never share your credentials with anyone, including support\n• Log out on public devices\n• Enable **Two-Factor Authentication (2FA)** in Settings\n• Always verify you're on Mander's official URL\n\n**If you believe your account was compromised:**\n1. Change your password immediately\n2. Contact support to temporarily block the account\n3. Provide identity verification information\n\nDo you need help with anything specific related to security?`;

    case "responsible":
      return lang === "es"
        ? `En Mander Casino nos importa el juego responsable. 💙\n\n**Herramientas disponibles:**\n• **Límites de depósito** — establece un tope diario/semanal desde Configuración\n• **Límites de apuesta** — controla cuánto puedes apostar por sesión\n• **Auto-exclusión** — bloquea tu cuenta temporalmente (24h, 7 días, 30 días o permanente)\n• **Descanso forzado** — pausa tu cuenta por el tiempo que elijas\n\n**Recuerda:**\n• El juego debe ser entretenimiento, no una fuente de ingresos\n• Nunca apuestes más de lo que puedes permitirte perder\n• Si sientes que el juego se volvió un problema, busca ayuda\n\n**Organizaciones de ayuda:**\n• 🌐 gamblingtherapy.org\n• 🌐 begambleaware.org\n\nPara activar cualquier herramienta de juego responsable, contacta a un agente.`
        : lang === "pt"
        ? `Na Mander Casino nos importamos com o jogo responsável. 💙\n\n**Ferramentas disponíveis:**\n• **Limites de depósito** — defina um teto diário/semanal nas Configurações\n• **Limites de aposta** — controle quanto pode apostar por sessão\n• **Auto-exclusão** — bloqueie sua conta temporariamente (24h, 7 dias, 30 dias ou permanente)\n• **Pausa forçada** — pause sua conta pelo tempo que escolher\n\n**Lembre-se:**\n• O jogo deve ser entretenimento, não uma fonte de renda\n• Nunca aposte mais do que pode perder\n• Se sentir que o jogo se tornou um problema, busque ajuda\n\n**Organizações de apoio:**\n• 🌐 gamblingtherapy.org\n• 🌐 begambleaware.org\n\nPara ativar qualquer ferramenta de jogo responsável, entre em contato com um agente.`
        : `At Mander Casino we care about responsible gambling. 💙\n\n**Available tools:**\n• **Deposit limits** — set a daily/weekly cap in Settings\n• **Bet limits** — control how much you can bet per session\n• **Self-exclusion** — temporarily block your account (24h, 7 days, 30 days, or permanent)\n• **Forced break** — pause your account for any period you choose\n\n**Remember:**\n• Gambling should be entertainment, not a source of income\n• Never bet more than you can afford to lose\n• If gambling becomes a problem, seek help\n\n**Support organizations:**\n• 🌐 gamblingtherapy.org\n• 🌐 begambleaware.org\n\nTo activate any responsible gambling tool, please contact an agent.`;

    case "crypto_info":
      return lang === "es"
        ? `Aquí tienes toda la información sobre criptomonedas en Mander Casino: 💰\n\n**Criptomonedas aceptadas:**\n• **USDT** — TRC20 (Tron) ✅ | ERC20 (Ethereum) ✅ | BEP20 (BSC) ✅\n• **BTC** — Bitcoin Network ✅\n• **ETH** — Ethereum Network ✅\n• **LTC** — Litecoin Network ✅\n• **BNB** — BEP20 (BSC) ✅\n• **SOL** — Solana Network ✅\n\n**Tarifas de red (fees):**\n• Mander Casino **no cobra comisiones** por depósitos ni retiros\n• Los fees de red (gas) son asumidos por el casino en retiros\n• En depósitos, los fees de red dependen de la blockchain usada\n\n**Red recomendada:** USDT-TRC20 (Tron) por sus bajos fees y velocidad\n\n¿Tienes alguna otra pregunta sobre criptos?`
        : lang === "pt"
        ? `Aqui estão todas as informações sobre criptomoedas na Mander Casino: 💰\n\n**Criptomoedas aceitas:**\n• **USDT** — TRC20 (Tron) ✅ | ERC20 (Ethereum) ✅ | BEP20 (BSC) ✅\n• **BTC** — Bitcoin Network ✅\n• **ETH** — Ethereum Network ✅\n• **LTC** — Litecoin Network ✅\n• **BNB** — BEP20 (BSC) ✅\n• **SOL** — Solana Network ✅\n\n**Taxas de rede (fees):**\n• A Mander Casino **não cobra comissões** por depósitos ou saques\n• As taxas de rede (gas) são pagas pelo cassino nos saques\n• Nos depósitos, as taxas dependem da blockchain usada\n\n**Rede recomendada:** USDT-TRC20 (Tron) por suas baixas taxas e velocidade\n\nVocê tem mais alguma dúvida sobre criptos?`
        : `Here's all the info about cryptocurrencies at Mander Casino: 💰\n\n**Accepted cryptocurrencies:**\n• **USDT** — TRC20 (Tron) ✅ | ERC20 (Ethereum) ✅ | BEP20 (BSC) ✅\n• **BTC** — Bitcoin Network ✅\n• **ETH** — Ethereum Network ✅\n• **LTC** — Litecoin Network ✅\n• **BNB** — BEP20 (BSC) ✅\n• **SOL** — Solana Network ✅\n\n**Network fees:**\n• Mander Casino **does not charge commissions** on deposits or withdrawals\n• Network fees (gas) on withdrawals are covered by the casino\n• On deposits, network fees depend on the blockchain used\n\n**Recommended network:** USDT-TRC20 (Tron) for its low fees and speed\n\nDo you have any other questions about crypto?`;

    case "games_list":
      return lang === "es"
        ? `¡Mander Casino ofrece 8 juegos originales, todos **Provably Fair**! 🎮\n\n**Juegos disponibles ahora:**\n🎲 **Dice** — Adivina si el dado caerá por encima o por debajo de tu número objetivo. Multiplica hasta 9,900x.\n🔵 **Plinko** — Deja caer la bola y multiplica tus ganancias. Hasta 1,000x de multiplicador.\n🔢 **Keno** — Elige tus números y gana según cuántos coincidan. Jackpot hasta 10,000x.\n🎡 **Roulette** — Ruleta clásica con apuestas en números, colores y combinaciones.\n🃏 **HiLo** — Predice si la siguiente carta es mayor o menor. Gana en racha.\n♠️ **Blackjack** — 21 clásico contra el dealer. Estrategia y suerte.\n🎴 **Baccarat** — Apuesta al Jugador, Banca o Empate. El favorito de los VIPs.\n💣 **Mines** — Evita las minas y retira antes de explotar. Hasta 1,000x.\n\n**Próximamente:**\n🔥 Limbo · Flip · Crash · Rock Paper Scissors · Poker · Chicken · Darts · Dragon Tower\n\n¿Te gustaría saber más sobre algún juego en particular?`
        : lang === "pt"
        ? `A Mander Casino oferece 8 jogos originais, todos **Provably Fair**! 🎮\n\n**Jogos disponíveis agora:**\n🎲 **Dice** — Adivinhe se o dado cairá acima ou abaixo do seu número alvo. Até 9.900x.\n🔵 **Plinko** — Solte a bola e multiplique seus ganhos. Até 1.000x.\n🔢 **Keno** — Escolha seus números e ganhe. Jackpot até 10.000x.\n🎡 **Roleta** — Roleta clássica com apostas em números, cores e combinações.\n🃏 **HiLo** — Preveja se a próxima carta é maior ou menor. Ganhe em sequência.\n♠️ **Blackjack** — 21 clássico contra o dealer.\n🎴 **Bacará** — Aposte no Jogador, Banco ou Empate. O favorito dos VIPs.\n💣 **Mines** — Evite as minas e saque antes de explodir. Até 1.000x.\n\n**Em breve:**\n🔥 Limbo · Flip · Crash · Rock Paper Scissors · Poker · Chicken · Darts · Dragon Tower\n\nGostaria de saber mais sobre algum jogo específico?`
        : `Mander Casino offers 8 original games, all **Provably Fair**! 🎮\n\n**Games available now:**\n🎲 **Dice** — Guess if the dice lands above or below your target. Up to 9,900x.\n🔵 **Plinko** — Drop the ball and multiply your winnings. Up to 1,000x.\n🔢 **Keno** — Pick your numbers and win. Jackpot up to 10,000x.\n🎡 **Roulette** — Classic roulette with bets on numbers, colors, and combinations.\n🃏 **HiLo** — Predict if the next card is higher or lower. Win on streaks.\n♠️ **Blackjack** — Classic 21 against the dealer.\n🎴 **Baccarat** — Bet on Player, Banker, or Tie. The VIP favorite.\n💣 **Mines** — Avoid the mines and cash out before you explode. Up to 1,000x.\n\n**Coming soon:**\n🔥 Limbo · Flip · Crash · Rock Paper Scissors · Poker · Chicken · Darts · Dragon Tower\n\nWould you like to know more about any specific game?`;

    default:
      return lang === "es"
        ? `Gracias por contactarnos. ¿Puedes darme más detalles sobre tu consulta?\n\nPuedo ayudarte con:\nDepósitos - Retiros - Saldo - Juegos - Cuenta\nRakeback - Recompensas - Wagering - Rangos VIP - Seguridad\nCriptomonedas - Afiliados - Partners`
        : lang === "pt"
        ? `Obrigado por nos contatar. Você pode me dar mais detalhes?\n\nPosso ajudá-lo com:\nDepósitos - Saques - Saldo - Jogos - Conta\nRakeback - Recompensas - Wagering - Níveis VIP - Segurança\nCriptomoedas - Afiliados - Parcerias`
        : `Thank you for reaching out. Could you give me more details?\n\nI can help you with:\nDeposits - Withdrawals - Balance - Games - Account\nRakeback - Rewards - Wagering - VIP Ranks - Security\nCrypto - Affiliates - Partners`;
  }
}

// ── Detect escalation keywords in user message ────────────────────────────────
function userWantsHuman(message: string): boolean {
  const msg = message.toLowerCase();
  const keywords = [
    "human", "real person", "real agent", "agent", "manager", "supervisor",
    "quiero hablar", "hablar con alguien", "persona real", "agente humano",
    "gerente", "humano", "atención humana",
    "quero falar", "pessoa real", "atendente", "falar com alguém",
    "parler à quelqu", "agent humain",
    "mensch", "echter agent",
  ];
  return keywords.some(k => msg.includes(k));
}

// ── POST /api/support-chat ────────────────────────────────────────────────────
router.post("/support-chat", async (req, res) => {
  const { message, username, chat_id } = req.body as {
    message?: string;
    username?: string;
    chat_id?: string;
  };

  if (!message?.trim() || !username?.trim() || !chat_id) {
    return res.status(400).json({ error: "message, username and chat_id required" });
  }

  try {
    const [adminRes, historyRes, chatStatusRes] = await Promise.all([
      sbSvc(`support_messages?chat_id=eq.${encodeURIComponent(chat_id)}&sender=eq.admin&limit=1`, { headers: { Prefer: "count=none" } }),
      sbSvc(`support_messages?chat_id=eq.${encodeURIComponent(chat_id)}&order=created_at.asc&limit=25`, { headers: { Prefer: "count=none" } }),
      sbSvc(`support_chats?id=eq.${encodeURIComponent(chat_id)}&select=status`, { headers: { Prefer: "count=none" } }),
    ]);

    const adminMsgs: any[] = adminRes.ok ? await adminRes.json() : [];
    const historyMsgs: any[] = historyRes.ok ? await historyRes.json() : [];
    const chatRows: any[] = chatStatusRes.ok ? await chatStatusRes.json() : [];
    const currentStatus = chatRows[0]?.status ?? "open";

    const operatorJoined = adminMsgs.length > 0;
    const botRepliesCount = historyMsgs.filter(m => m.sender === "bot" || m.sender === "system" || m.sender === "assistant").length;
    const ticketNum = (parseInt(chat_id.replace(/-/g, "").slice(0, 12), 16) % 900000 + 100000).toString();

    // Save user message
    await sbSvc("support_messages", {
      method: "POST",
      body: JSON.stringify({ chat_id, username: username.trim(), sender: "user", message: message.trim() }),
    });

    // If operator has already joined, don't send bot reply
    if (operatorJoined) {
      await sbSvc(`support_chats?id=eq.${encodeURIComponent(chat_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
        headers: { Prefer: "return=minimal" },
      });
      return res.json({ reply: null });
    }

    // If already escalated, don't send more bot replies
    if (currentStatus === "escalated") {
      await sbSvc(`support_chats?id=eq.${encodeURIComponent(chat_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
        headers: { Prefer: "return=minimal" },
      });
      return res.json({ reply: null, escalated: true });
    }

    const isFirstMessage = historyMsgs.filter(m => m.sender === "user").length === 0;
    const lang = detectLang(message.trim());
    const topic = detectTopic(message.trim());

    const { reply: botReply, escalate: shouldEscalate } = generateBotReply({
      isFirstMessage,
      botRepliesCount,
      ticketNum,
      lang,
      topic,
      history: historyMsgs,
    });

    // Save bot reply (own try-catch so a DB error here doesn't prevent returning the reply)
    try {
      const saveRes = await sbSvc("support_messages", {
        method: "POST",
        body: JSON.stringify({ chat_id, username: username.trim(), sender: "assistant", message: botReply }),
      });
      if (!saveRes.ok) {
        const errText = await saveRes.text();
        console.error("[support-chat] bot reply save failed:", errText);
      }
    } catch (saveErr) {
      console.error("[support-chat] bot reply save exception:", saveErr instanceof Error ? saveErr.message : String(saveErr));
    }

    // Handle escalation
    if (shouldEscalate && currentStatus !== "escalated") {
      const escalationMsg = "🔴 This conversation has been escalated. A human agent will join shortly.";
      await sbSvc("support_messages", {
        method: "POST",
        body: JSON.stringify({ chat_id, username: username.trim(), sender: "assistant", message: escalationMsg }),
      });
      await sbSvc(`support_chats?id=eq.${encodeURIComponent(chat_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "escalated", updated_at: new Date().toISOString() }),
        headers: { Prefer: "return=minimal" },
      });
      console.log(`[support-bot] Ticket ${chat_id} escalated to human agent`);
    } else {
      await sbSvc(`support_chats?id=eq.${encodeURIComponent(chat_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
        headers: { Prefer: "return=minimal" },
      });
    }

    return res.json({ reply: botReply, escalated: shouldEscalate });
  } catch (err) {
    console.error("[support-chat] error:", err instanceof Error ? err.message : String(err));
    return res.json({ reply: "An agent will get back to you shortly. Thank you for your patience." });
  }
});

// ── POST /api/support-chat/init-session ──────────────────────────────────────
router.post("/support-chat/init-session", async (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  const uname = username.trim();
  try {
    const existingRes = await sbSvc(
      `support_chats?username=eq.${encodeURIComponent(uname)}&status=in.(open,escalated)&order=created_at.desc&limit=1`,
      { headers: { Prefer: "count=none" } },
    );

    if (existingRes.ok) {
      const rows: any[] = await existingRes.json();
      if (rows[0]) {
        return res.json({ chat_id: rows[0].id, is_existing: true, status: rows[0].status });
      }
    }

    const now = new Date().toISOString();
    const created = await sbSvc("support_chats", {
      method: "POST",
      body: JSON.stringify({ username: uname, status: "open", updated_at: now, created_at: now }),
    });
    if (!created.ok) {
      const txt = await created.text();
      console.error("[init-session] INSERT error:", txt);
      return res.status(502).json({ error: "Error creating chat.", detail: txt });
    }
    const newRows: any[] = await created.json();
    const newChatId = newRows[0]?.id ?? null;
    // Persist the initial welcome message so the admin panel shows the full conversation
    if (newChatId) {
      await sbSvc("support_messages", {
        method: "POST",
        body: JSON.stringify({
          chat_id: newChatId,
          username: uname,
          sender: "assistant",
          message: "Welcome to Manderbet Casino, how can we help you today? 👋",
        }),
      }).catch(() => {});
    }
    return res.json({ chat_id: newChatId, is_existing: false, status: "open" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/support-chat/save ───────────────────────────────────────────────
router.post("/support-chat/save", async (req, res) => {
  const { chat_id, username, sender, message } = req.body as {
    chat_id?: string; username?: string; sender?: string; message?: string;
  };
  if (!chat_id || !username || !sender || !message?.trim()) {
    return res.status(400).json({ error: "chat_id, username, sender and message required" });
  }

  try {
    const msgRes = await sbSvc("support_messages", {
      method: "POST",
      body: JSON.stringify({ chat_id, username, sender, message: message.trim() }),
    });
    if (!msgRes.ok) {
      const txt = await msgRes.text();
      return res.status(502).json({ error: "Error saving message.", detail: txt });
    }

    await sbSvc(`support_chats?id=eq.${encodeURIComponent(chat_id)}`, {
      method: "PATCH",
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    });

    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/support-chat/tickets/:username ───────────────────────────────────
router.get("/support-chat/tickets/:username", async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  try {
    const r = await sbSvc(
      `support_chats?username=eq.${encodeURIComponent(username.trim())}&order=created_at.desc&limit=20`,
      { headers: { Prefer: "count=none" } },
    );
    if (!r.ok) return res.status(502).json({ error: "Error fetching tickets" });
    const rows: any[] = await r.json();
    return res.json(rows.map(c => ({ chat_id: c.id, status: c.status ?? "open", updated_at: c.updated_at, created_at: c.created_at })));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/support-chat/status/:username ───────────────────────────────────
router.get("/support-chat/status/:username", async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  try {
    const r = await sbSvc(
      `support_chats?username=eq.${encodeURIComponent(username.trim())}&status=in.(open,escalated)&order=created_at.desc&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!r.ok) return res.status(502).json({ error: "Error checking status" });
    const rows: any[] = await r.json();
    if (rows[0]) {
      return res.json({ has_open_ticket: true, chat_id: rows[0].id, status: rows[0].status });
    }
    return res.json({ has_open_ticket: false, chat_id: null, status: null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/support-chat/:chatId/messages ────────────────────────────────────
router.get("/support-chat/:chatId/messages", async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) return res.status(400).json({ error: "chatId required" });

  try {
    const r = await sbSvc(
      `support_messages?chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.asc`,
      { headers: { Prefer: "count=none" } },
    );
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: "Error fetching messages", detail: txt });
    }
    const msgs: any[] = await r.json();
    return res.json(msgs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/support-chat/poll/:chatId ───────────────────────────────────────
router.get("/support-chat/poll/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const { since } = req.query as { since?: string };

  try {
    let msgUrl = `support_messages?chat_id=eq.${encodeURIComponent(chatId)}&sender=in.(admin,bot,system,assistant)&order=created_at.asc`;
    if (since) msgUrl += `&created_at=gt.${encodeURIComponent(since)}`;

    const [msgRes, chatRes] = await Promise.all([
      sbSvc(msgUrl, { headers: { Prefer: "count=none" } }),
      sbSvc(`support_chats?id=eq.${encodeURIComponent(chatId)}&select=status`, { headers: { Prefer: "count=none" } }),
    ]);

    if (!msgRes.ok) {
      const txt = await msgRes.text();
      return res.status(502).json({ error: "Error polling messages.", detail: txt });
    }

    const msgs: any[] = await msgRes.json();
    let ticketStatus = "open";
    if (chatRes.ok) {
      const chatRows: any[] = await chatRes.json();
      if (chatRows.length > 0) ticketStatus = chatRows[0].status ?? "open";
    }

    return res.json({ messages: msgs, ticket_status: ticketStatus });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/support/upload-image ────────────────────────────────────────────
router.post("/support/upload-image", async (req, res) => {
  const { imageData, filename, contentType } = req.body as {
    imageData?: string;
    filename?: string;
    contentType?: string;
  };
  if (!imageData || !filename) {
    return res.status(400).json({ error: "imageData and filename required" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
  const BUCKET = "chat-uploads";

  try {
    await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    });

    const base64 = imageData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const mime = contentType || "image/jpeg";

    const uploadRes = await fetchWithTimeout(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${uniqueName}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": mime,
        "x-upsert": "true",
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return res.status(502).json({ error: "Storage upload failed", detail: errText });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${uniqueName}`;
    return res.json({ url: publicUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

export default router;
