const COIN_PRICES_USD: Record<string, number> = {
  USDT: 1.00,
  USDC: 1.00,
  BTC:  66431,
  ETH:  2044,
  BNB:  585,
  SOL:  79,
  LTC:  52,
  TRX:  0.315,
};

const COINGECKO_IDS: Record<string, string> = {
  USDT: "tether",
  USDC: "usd-coin",
  BTC:  "bitcoin",
  ETH:  "ethereum",
  BNB:  "binancecoin",
  SOL:  "solana",
  LTC:  "litecoin",
  TRX:  "tron",
};

export const LIVE_PRICES: Record<string, number> = { ...COIN_PRICES_USD };

async function refreshPrices(): Promise<void> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return;
    const data = await res.json();
    for (const [coin, id] of Object.entries(COINGECKO_IDS)) {
      if (data[id]?.usd) LIVE_PRICES[coin] = data[id].usd;
    }
    console.log("[Prices] Updated from CoinGecko:", JSON.stringify(LIVE_PRICES));
  } catch (e: any) {
    console.error("[Prices] CoinGecko error:", e.message);
  }
}

refreshPrices();
setInterval(refreshPrices, 5 * 60 * 1000);

export function getPriceUsd(currency: string): number {
  const cur = (currency || "").trim().toUpperCase();
  return LIVE_PRICES[cur] ?? COIN_PRICES_USD[cur] ?? 1;
}

export function toUsd(nativeAmount: number, currency: string): number {
  return Math.max(0, Number(nativeAmount || 0)) * getPriceUsd(currency);
}
