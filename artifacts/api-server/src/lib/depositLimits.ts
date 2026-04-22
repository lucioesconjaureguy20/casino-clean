const MIN_DEPOSIT_MAP: Record<string, number> = {
  "USDT:BEP20":    5,
  "USDT:TRC20":    5,
  "USDT:ERC20":    50,
  "USDC:BEP20":    5,
  "USDC:SOL":      5,
  "USDC:ERC20":    50,
  "BNB:BEP20":     5,
  "BNB:Optimism":  5,
  "ETH:ERC20":     50,
  "ETH:Optimism":  5,
  "BTC:BTC":       50,
  "SOL:SOL":       5,
  "LTC:LTC":       5,
  "TRX:TRC20":     5,
};

const DEFAULT_MIN = 5;

export function getMinDepositUsd(currency: string, network: string): number {
  const key = `${currency.trim().toUpperCase()}:${network.trim()}`;
  return MIN_DEPOSIT_MAP[key] ?? DEFAULT_MIN;
}
