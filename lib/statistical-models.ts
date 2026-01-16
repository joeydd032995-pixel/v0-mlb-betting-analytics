import type { PitcherStats, ProjectionFactors } from "./types"

export class StatisticalModels {
  // Pythagorean Win Expectancy
  static pythagoreanWinPct(runsScored: number, runsAllowed: number, exponent = 1.83): number {
    return Math.pow(runsScored, exponent) / (Math.pow(runsScored, exponent) + Math.pow(runsAllowed, exponent))
  }

  // Park Factor Adjustment
  static parkFactorAdjustment(stat: number, parkFactor: number): number {
    return stat / (parkFactor / 100)
  }

  // Weather Impact on Runs
  static weatherImpact(temp: number, windSpeed: number, windDirection: string): number {
    let impact = 1.0

    // Temperature effect (higher temp = more runs)
    if (temp > 80) {
      impact += (temp - 80) * 0.002
    } else if (temp < 60) {
      impact -= (60 - temp) * 0.002
    }

    // Wind effect
    if (windDirection === "Out" || windDirection === "SW" || windDirection === "S") {
      impact += windSpeed * 0.005
    } else if (windDirection === "In" || windDirection === "NW" || windDirection === "N") {
      impact -= windSpeed * 0.003
    }

    return Math.max(0.85, Math.min(1.15, impact))
  }

  // Pitcher Quality Start Probability
  static qualityStartProb(era: number, whip: number, kPer9: number): number {
    const eraScore = Math.max(0, 1 - era / 6)
    const whipScore = Math.max(0, 1 - whip / 2)
    const kScore = Math.min(1, kPer9 / 12)

    return eraScore * 0.4 + whipScore * 0.3 + kScore * 0.3
  }

  // Run Production Estimation (simplified)
  static estimateRunProduction(
    pitcherStats: PitcherStats,
    teamOffenseRating: number,
    weatherFactor: number,
    homeAdvantage: boolean,
  ): number {
    const baseRuns = (pitcherStats.era / 9) * 9 // Runs per 9 innings
    const adjustedRuns = baseRuns * (teamOffenseRating / 100) * weatherFactor

    return homeAdvantage ? adjustedRuns * 0.95 : adjustedRuns * 1.05
  }

  // Composite Win Probability
  static calculateWinProbability(
    homeProjectedRuns: number,
    awayProjectedRuns: number,
    homeTeamStrength: number,
    awayTeamStrength: number,
  ): { home: number; away: number } {
    const runDiff = homeProjectedRuns - awayProjectedRuns
    const strengthDiff = homeTeamStrength - awayTeamStrength

    // Logistic function for win probability
    const logit = runDiff * 0.3 + strengthDiff * 0.15 + 0.2 // Home advantage
    const homeProb = 1 / (1 + Math.exp(-logit))

    return {
      home: Math.min(0.95, Math.max(0.05, homeProb)),
      away: Math.min(0.95, Math.max(0.05, 1 - homeProb)),
    }
  }

  // Projection Confidence Score
  static calculateConfidence(factors: ProjectionFactors): number {
    const weights = {
      pitcherMatchup: 0.25,
      recentForm: 0.2,
      homeAdvantage: 0.1,
      restDays: 0.15,
      weather: 0.1,
      bullpenStrength: 0.2,
    }

    let confidence = 0
    for (const [key, value] of Object.entries(factors)) {
      confidence += value * weights[key as keyof ProjectionFactors]
    }

    return Math.min(1, Math.max(0, confidence))
  }

  // Poisson Distribution for Total Runs
  static poissonProbability(lambda: number, k: number): number {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k)
  }

  static factorial(n: number): number {
    if (n <= 1) return 1
    return n * this.factorial(n - 1)
  }

  // Calculate Over/Under Probability
  static overUnderProbability(projectedTotal: number, line: number): { over: number; under: number } {
    const lambda = projectedTotal
    let underProb = 0

    for (let i = 0; i <= Math.floor(line); i++) {
      underProb += this.poissonProbability(lambda, i)
    }

    return {
      under: underProb,
      over: 1 - underProb,
    }
  }
}
