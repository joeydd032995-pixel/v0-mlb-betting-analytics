import type { Projection, OddsData, BettingEdge } from "./types"
import { impliedProbability, calculateEV, kellyFraction, americanToDecimal, decimalToAmerican } from "./utils/odds"
import { projectionsEngine } from "./projections-engine"

export class EdgeCalculator {
  private readonly MIN_EDGE = 0.02 // Minimum 2% edge to recommend
  private readonly MIN_CONFIDENCE = 0.6 // Minimum confidence threshold
  private readonly KELLY_FRACTION = 0.25 // Conservative Kelly (quarter Kelly)
  private readonly MAX_UNITS = 5 // Maximum bet size in units

  // Find all betting edges for a game
  findEdges(projection: Projection, odds: OddsData): BettingEdge[] {
    const edges: BettingEdge[] = []

    // Check moneyline edges
    const mlHomeEdge = this.calculateMoneylineEdge(projection, odds, "home")
    if (mlHomeEdge) edges.push(mlHomeEdge)

    const mlAwayEdge = this.calculateMoneylineEdge(projection, odds, "away")
    if (mlAwayEdge) edges.push(mlAwayEdge)

    // Check spread edges
    const spreadHomeEdge = this.calculateSpreadEdge(projection, odds, "home")
    if (spreadHomeEdge) edges.push(spreadHomeEdge)

    const spreadAwayEdge = this.calculateSpreadEdge(projection, odds, "away")
    if (spreadAwayEdge) edges.push(spreadAwayEdge)

    // Check total edges
    const overEdge = this.calculateTotalEdge(projection, odds, "over")
    if (overEdge) edges.push(overEdge)

    const underEdge = this.calculateTotalEdge(projection, odds, "under")
    if (underEdge) edges.push(underEdge)

    // Sort by edge percentage descending
    return edges.sort((a, b) => b.edgePercent - a.edgePercent)
  }

  // Calculate moneyline betting edge
  private calculateMoneylineEdge(projection: Projection, odds: OddsData, side: "home" | "away"): BettingEdge | null {
    const fairProb = side === "home" ? projection.homeWinProb : projection.awayWinProb
    const marketOdds = side === "home" ? odds.moneylineHome : odds.moneylineAway

    // Calculate fair odds from our probability
    const fairDecimal = 1 / fairProb
    const fairOdds = decimalToAmerican(fairDecimal)

    // Calculate market implied probability (with vig removed)
    const marketImplied = impliedProbability(marketOdds)

    // Calculate edge
    const edgePercent = fairProb - marketImplied
    const ev = calculateEV(fairProb, marketOdds)

    // Check if bet is profitable
    if (edgePercent < this.MIN_EDGE || projection.confidence < this.MIN_CONFIDENCE) {
      return null
    }

    const kelly = kellyFraction(fairProb, marketOdds, this.KELLY_FRACTION)
    const recommendedUnits = Math.min(this.MAX_UNITS, Math.max(0.5, kelly * 100))

    return {
      gameId: projection.gameId,
      betType: "moneyline",
      side: side === "home" ? "Home" : "Away",
      fairOdds,
      marketOdds,
      edgePercent: edgePercent * 100,
      expectedValue: ev,
      confidence: projection.confidence,
      kellyFraction: kelly,
      recommendedUnits: Math.round(recommendedUnits * 10) / 10,
    }
  }

  // Calculate spread betting edge
  private calculateSpreadEdge(projection: Projection, odds: OddsData, side: "home" | "away"): BettingEdge | null {
    const line = side === "home" ? odds.spreadHome : odds.spreadAway
    const marketOdds = side === "home" ? odds.spreadHomeOdds : odds.spreadAwayOdds

    // Calculate probability of covering spread
    const spreadProbs = projectionsEngine.calculateSpreadProjection(projection, line)
    const fairProb = side === "home" ? spreadProbs.homeCoversProb : spreadProbs.awayCoversProb

    // Calculate fair odds
    const fairDecimal = 1 / fairProb
    const fairOdds = decimalToAmerican(fairDecimal)

    // Calculate market implied probability
    const marketImplied = impliedProbability(marketOdds)

    // Calculate edge
    const edgePercent = fairProb - marketImplied
    const ev = calculateEV(fairProb, marketOdds)

    // Check if bet is profitable
    if (edgePercent < this.MIN_EDGE || projection.confidence < this.MIN_CONFIDENCE) {
      return null
    }

    const kelly = kellyFraction(fairProb, marketOdds, this.KELLY_FRACTION)
    const recommendedUnits = Math.min(this.MAX_UNITS, Math.max(0.5, kelly * 100))

    const lineDisplay = line > 0 ? `+${line}` : line.toString()

    return {
      gameId: projection.gameId,
      betType: "spread",
      side: `${side === "home" ? "Home" : "Away"} ${lineDisplay}`,
      fairOdds,
      marketOdds,
      edgePercent: edgePercent * 100,
      expectedValue: ev,
      confidence: projection.confidence,
      kellyFraction: kelly,
      recommendedUnits: Math.round(recommendedUnits * 10) / 10,
    }
  }

  // Calculate total (over/under) betting edge
  private calculateTotalEdge(projection: Projection, odds: OddsData, side: "over" | "under"): BettingEdge | null {
    const line = odds.totalOver // Same for both
    const marketOdds = side === "over" ? odds.totalOverOdds : odds.totalUnderOdds

    // Calculate probability
    const totalProbs = projectionsEngine.calculateTotalProjection(projection, line)
    const fairProb = side === "over" ? totalProbs.overProb : totalProbs.underProb

    // Calculate fair odds
    const fairDecimal = 1 / fairProb
    const fairOdds = decimalToAmerican(fairDecimal)

    // Calculate market implied probability
    const marketImplied = impliedProbability(marketOdds)

    // Calculate edge
    const edgePercent = fairProb - marketImplied
    const ev = calculateEV(fairProb, marketOdds)

    // Check if bet is profitable
    if (edgePercent < this.MIN_EDGE || projection.confidence < this.MIN_CONFIDENCE) {
      return null
    }

    const kelly = kellyFraction(fairProb, marketOdds, this.KELLY_FRACTION)
    const recommendedUnits = Math.min(this.MAX_UNITS, Math.max(0.5, kelly * 100))

    return {
      gameId: projection.gameId,
      betType: "total",
      side: `${side === "over" ? "Over" : "Under"} ${line}`,
      fairOdds,
      marketOdds,
      edgePercent: edgePercent * 100,
      expectedValue: ev,
      confidence: projection.confidence,
      kellyFraction: kelly,
      recommendedUnits: Math.round(recommendedUnits * 10) / 10,
    }
  }

  // Adjust edge thresholds
  setThresholds(minEdge?: number, minConfidence?: number, kellyFraction?: number) {
    if (minEdge !== undefined) {
      ;(this as any).MIN_EDGE = minEdge
    }
    if (minConfidence !== undefined) {
      ;(this as any).MIN_CONFIDENCE = minConfidence
    }
    if (kellyFraction !== undefined) {
      ;(this as any).KELLY_FRACTION = kellyFraction
    }
  }

  // Calculate closing line value (CLV) - important metric
  calculateCLV(betOdds: number, closingOdds: number): number {
    const betImplied = impliedProbability(betOdds)
    const closingImplied = impliedProbability(closingOdds)

    return ((closingImplied - betImplied) / betImplied) * 100
  }

  // Simulate bet outcomes for risk assessment
  simulateBet(
    probability: number,
    odds: number,
    stake: number,
    iterations = 10000,
  ): {
    expectedProfit: number
    winRate: number
    maxDrawdown: number
    sharpeRatio: number
  } {
    const decimalOdds = americanToDecimal(odds)
    let totalProfit = 0
    let wins = 0
    let bankroll = 0
    let maxDrawdown = 0
    let peak = 0
    const returns: number[] = []

    for (let i = 0; i < iterations; i++) {
      const won = Math.random() < probability

      if (won) {
        const profit = stake * (decimalOdds - 1)
        totalProfit += profit
        bankroll += profit
        wins++
        returns.push(profit / stake)
      } else {
        totalProfit -= stake
        bankroll -= stake
        returns.push(-1)
      }

      peak = Math.max(peak, bankroll)
      const drawdown = peak - bankroll
      maxDrawdown = Math.max(maxDrawdown, drawdown)
    }

    // Calculate Sharpe ratio
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    const stdDev = Math.sqrt(variance)
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0

    return {
      expectedProfit: totalProfit / iterations,
      winRate: wins / iterations,
      maxDrawdown: maxDrawdown / stake,
      sharpeRatio,
    }
  }
}

// Export singleton instance
export const edgeCalculator = new EdgeCalculator()
