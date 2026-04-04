/**
 * Per-game house edge configuration.
 * To add a new game: add an entry with the lowercase game name as the key.
 * Formula: Rake = Bet × houseEdge   |   Rakeback = Rake × userRankPct
 */
export const GAME_HOUSE_EDGES: Record<string, number> = {
  dice:      0.04,   // 4%
  plinko:    0.05,   // 5%
  baccarat:  0.012,  // 1.2% (European)
  blackjack: 0.01,   // 1%
  mines:     0.05,   // 5%
  keno:      0.06,   // 6%
  roulette:  0.027,  // 2.7% (European)
  ruleta:    0.027,  // alias — Spanish name used internally
  hilo:      0.03,   // 3%
};

/** Default house edge for any game not listed above */
const DEFAULT_HOUSE_EDGE = 0.02;

/**
 * Returns the house edge for a given game name.
 * Matching is case-insensitive. Returns DEFAULT_HOUSE_EDGE if unknown.
 */
export function getHouseEdge(game: string): number {
  return GAME_HOUSE_EDGES[game.toLowerCase()] ?? DEFAULT_HOUSE_EDGE;
}
