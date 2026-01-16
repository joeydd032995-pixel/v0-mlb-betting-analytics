// Utility functions for odds calculations

export function americanToDecimal(american: number): number {
  if (american > 0) {
    return american / 100 + 1
  }
  return 100 / Math.abs(american) + 1
}

export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100)
  }
  return Math.round(-100 / (decimal - 1))
}

export function impliedProbability(american: number): number {
  if (american > 0) {
    return 100 / (american + 100)
  }
  return Math.abs(american) / (Math.abs(american) + 100)
}

export function calculateEV(probability: number, odds: number): number {
  const decimalOdds = americanToDecimal(odds)
  return probability * (decimalOdds - 1) - (1 - probability) * 1
}

export function kellyFraction(probability: number, odds: number, fractional = 0.5): number {
  const decimalOdds = americanToDecimal(odds)
  const q = 1 - probability
  const b = decimalOdds - 1
  const kelly = (probability * b - q) / b
  return Math.max(0, kelly * fractional)
}

export function calculateROI(profit: number, wagered: number): number {
  return (profit / wagered) * 100
}

export function formatOdds(odds: number): string {
  if (odds > 0) return `+${odds}`
  return odds.toString()
}

export function oddsToMoneyRisk(odds: number, toWin = 100): { risk: number; win: number } {
  if (odds > 0) {
    return {
      risk: (toWin / odds) * 100,
      win: toWin,
    }
  }
  return {
    risk: Math.abs(odds),
    win: (100 / Math.abs(odds)) * 100,
  }
}
