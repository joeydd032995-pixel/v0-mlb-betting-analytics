/**
 * Win/loss/push bucketing for settled bets.
 *
 * Split out of the dashboard so the rules are testable and stated once.  The
 * page previously counted a win as `pnl && pnl > 0` against a denominator of
 * every bet with a non-null `result`, which silently classified two distinct
 * cases as losses:
 *
 *   - a push (`pnl === 0`), where the stake was returned, and
 *   - a bet settled without a recorded P/L (`pnl === null`), where the outcome
 *     is simply unknown.
 */

export interface BetLike {
  result: string | null
  pnl: number | null
}

export interface BetRecord {
  /** Bets with a recorded result, whatever the P/L. */
  settled: number
  wins: number
  losses: number
  /** Stake returned — excluded from the win-rate on both sides. */
  pushes: number
  /** Settled but with no P/L recorded, so the outcome is unknown. */
  unresolved: number
  /** wins + losses — the denominator of `winRate`. */
  decided: number
  /** Percentage 0–100, or null when nothing has been decided. */
  winRate: number | null
  /** Sum of recorded P/L, in dollars. */
  totalPnL: number
}

export function summariseBetRecord(bets: BetLike[]): BetRecord {
  const settledBets = bets.filter((b) => b.result)

  let wins = 0
  let losses = 0
  let pushes = 0
  let unresolved = 0
  let totalPnL = 0

  for (const b of settledBets) {
    if (b.pnl == null) { unresolved++; continue }
    totalPnL += b.pnl
    if (b.pnl > 0) wins++
    else if (b.pnl < 0) losses++
    else pushes++
  }

  const decided = wins + losses

  return {
    settled: settledBets.length,
    wins,
    losses,
    pushes,
    unresolved,
    decided,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    totalPnL,
  }
}
