/**
 * Shared Telegram notification helpers.
 * Uses two separate chat IDs so withdrawals and deposits can go to different groups.
 */

async function sendToTelegram(token: string, chatId: string, message: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("[TELEGRAM] Failed to send notification:", e);
  }
}

/** Sends to the withdrawals group (TELEGRAM_WITHDRAW_CHAT_ID, fallback TELEGRAM_CHAT_ID). */
export async function sendTelegramWithdrawal(message: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_WITHDRAW_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await sendToTelegram(token, chatId, message);
}

/** Sends to the deposits group (TELEGRAM_DEPOSIT_CHAT_ID). */
export async function sendTelegramDeposit(message: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_DEPOSIT_CHAT_ID;
  if (!token || !chatId) return;
  await sendToTelegram(token, chatId, message);
}

/**
 * Returns a tag like " [VKNG]" if the username was referred via an affiliate code,
 * or "" if not. Never throws.
 */
export async function getRefTag(username: string): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || !username) return "";
  try {
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "count=none",
    };

    // Step 1: who referred this user?
    const rr = await fetch(
      `${url}/rest/v1/affiliate_referrals?referred_username=eq.${encodeURIComponent(username)}&select=referrer_username&limit=1`,
      { headers },
    );
    if (!rr.ok) return "";
    const refs: { referrer_username: string }[] = await rr.json();
    if (!refs.length || !refs[0].referrer_username) return "";
    const referrer = refs[0].referrer_username;

    // Step 2: what ref_code does that referrer have?
    const lr = await fetch(
      `${url}/rest/v1/affiliate_links?username=eq.${encodeURIComponent(referrer)}&select=ref_code&limit=1`,
      { headers },
    );
    if (!lr.ok) return ` [${referrer}]`;
    const links: { ref_code: string }[] = await lr.json();
    const code = links[0]?.ref_code;
    return code ? ` [${code}]` : ` [${referrer}]`;
  } catch {
    return "";
  }
}
