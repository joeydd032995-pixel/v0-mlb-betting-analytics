import type { Bet, BankrollStats } from "./types"
import { calculateROI } from "./utils/odds"

export class BankrollManager {
  private bets: Bet[] = []
  private startingBankroll: number
  private currentBankroll: number

  constructor(startingBankroll: number) {
    this.startingBankroll = startingBankroll
    this.currentBankroll = startingBankroll
  }

  // Add a new bet
  placeBet(bet: Omit<Bet, "id">): Bet {
    const newBet: Bet = {
      ...bet,
      id: `bet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }

    this.bets.push(newBet)
    this.currentBankroll -= bet.stake

    return newBet
  }

  // Settle a bet
  settleBet(betId: string, result: "win" | "loss" | "push", profit: number): void {
    const bet = this.bets.find((b) => b.id === betId)
    if (!bet) throw new Error("Bet not found")

    bet.result = result
    bet.profit = profit
    bet.settledAt = new Date()

    if (result === "win") {
      this.currentBankroll += bet.stake + profit
    } else if (result === "push") {
      this.currentBankroll += bet.stake
    }
    // Loss: stake already deducted when placed
  }

  // Get bankroll statistics
  getStats(): BankrollStats {
    const settledBets = this.bets.filter((b) => b.result)
    const totalWagered = settledBets.reduce((sum, b) => sum + b.stake, 0)
    const totalProfit = settledBets.reduce((sum, b) => sum + (b.profit || 0), 0)
    const wins = settledBets.filter((b) => b.result === "win").length
    const winRate = settledBets.length > 0 ? wins / settledBets.length : 0
    const averageOdds =
      settledBets.length > 0 ? settledBets.reduce((sum, b) => sum + b.odds, 0) / settledBets.length : 0
    const roi = totalWagered > 0 ? calculateROI(totalProfit, totalWagered) : 0

    return {
      totalBankroll: this.currentBankroll,
      startingBankroll: this.startingBankroll,
      totalWagered,
      totalProfit,
      roi,
      winRate,
      averageOdds,
      unitSize: this.startingBankroll * 0.01, // 1% of starting bankroll
      totalBets: settledBets.length,
    }
  }

  // Get all bets
  getBets(): Bet[] {
    return [...this.bets]
  }

  // Get pending bets
  getPendingBets(): Bet[] {
    return this.bets.filter((b) => !b.result)
  }

  // Get settled bets
  getSettledBets(): Bet[] {
    return this.bets.filter((b) => b.result)
  }

  // Calculate profit/loss over time
  getProfitTimeline(): { date: Date; profit: number; cumulativeProfit: number }[] {
    const settledBets = this.getSettledBets().sort((a, b) => a.settledAt!.getTime() - b.settledAt!.getTime())

    let cumulativeProfit = 0
    return settledBets.map((bet) => {
      cumulativeProfit += bet.profit || 0
      return {
        date: bet.settledAt!,
        profit: bet.profit || 0,
        cumulativeProfit,
      }
    })
  }

  // Calculate max drawdown
  getMaxDrawdown(): { amount: number; percentage: number } {
    const timeline = this.getProfitTimeline()
    let peak = this.startingBankroll
    let maxDrawdown = 0

    timeline.forEach((point) => {
      const currentBankroll = this.startingBankroll + point.cumulativeProfit
      peak = Math.max(peak, currentBankroll)
      const drawdown = peak - currentBankroll
      maxDrawdown = Math.max(maxDrawdown, drawdown)
    })

    return {
      amount: maxDrawdown,
      percentage: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
    }
  }

  // Get performance by bet type
  getPerformanceByBetType(): Record<
    string,
    { count: number; wins: number; profit: number; roi: number; avgOdds: number }
  > {
    const settledBets = this.getSettledBets()
    const byType: Record<string, Bet[]> = {}

    settledBets.forEach((bet) => {
      if (!byType[bet.betType]) byType[bet.betType] = []
      byType[bet.betType].push(bet)
    })

    const performance: Record<string, { count: number; wins: number; profit: number; roi: number; avgOdds: number }> =
      {}

    Object.entries(byType).forEach(([type, bets]) => {
      const wins = bets.filter((b) => b.result === "win").length
      const profit = bets.reduce((sum, b) => sum + (b.profit || 0), 0)
      const wagered = bets.reduce((sum, b) => sum + b.stake, 0)
      const avgOdds = bets.reduce((sum, b) => sum + b.odds, 0) / bets.length

      performance[type] = {
        count: bets.length,
        wins,
        profit,
        roi: calculateROI(profit, wagered),
        avgOdds,
      }
    })

    return performance
  }

  // Reset bankroll
  reset(newStartingBankroll?: number): void {
    this.bets = []
    this.startingBankroll = newStartingBankroll || this.startingBankroll
    this.currentBankroll = this.startingBankroll
  }

  // Import bets (for loading saved data)
  importBets(bets: Bet[], currentBankroll: number): void {
    this.bets = bets
    this.currentBankroll = currentBankroll
  }
}
