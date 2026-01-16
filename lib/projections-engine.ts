import { StatisticalModels } from "./statistical-models"
import type { Game, Team, PitcherStats, Projection, ProjectionFactors } from "./types"
import { teams, pitcherStats } from "./mock-data"

export class ProjectionsEngine {
  private teams: Map<string, Team>
  private pitcherStats: Map<string, PitcherStats>

  constructor(teamsData: Team[], pitcherStatsData: PitcherStats[]) {
    this.teams = new Map(teamsData.map((t) => [t.id, t]))
    this.pitcherStats = new Map(pitcherStatsData.map((s) => [s.playerId, s]))
  }

  // Generate comprehensive game projection
  generateProjection(game: Game): Projection {
    const homeTeam = this.teams.get(game.homeTeamId)
    const awayTeam = this.teams.get(game.awayTeamId)
    const homeStarter = this.pitcherStats.get(game.homeStarterId)
    const awayStarter = this.pitcherStats.get(game.awayStarterId)

    if (!homeTeam || !awayTeam || !homeStarter || !awayStarter) {
      throw new Error("Missing team or pitcher data")
    }

    // Calculate weather impact
    const weatherFactor = game.weather
      ? StatisticalModels.weatherImpact(game.weather.temp, game.weather.windSpeed, game.weather.windDirection)
      : 1.0

    // Estimate team offensive ratings (simplified - would use real historical data)
    const homeOffenseRating = this.getTeamOffenseRating(game.homeTeamId)
    const awayOffenseRating = this.getTeamOffenseRating(game.awayTeamId)

    // Project runs for each team
    const projectedHomeRuns = StatisticalModels.estimateRunProduction(
      awayStarter, // Away pitcher facing home offense
      homeOffenseRating,
      weatherFactor,
      true,
    )

    const projectedAwayRuns = StatisticalModels.estimateRunProduction(
      homeStarter, // Home pitcher facing away offense
      awayOffenseRating,
      weatherFactor,
      false,
    )

    // Calculate team strengths (simplified - based on pitcher stats)
    const homeStrength = this.calculateTeamStrength(homeStarter)
    const awayStrength = this.calculateTeamStrength(awayStarter)

    // Calculate win probabilities
    const winProbs = StatisticalModels.calculateWinProbability(
      projectedHomeRuns,
      projectedAwayRuns,
      homeStrength,
      awayStrength,
    )

    // Build projection factors
    const factors: ProjectionFactors = {
      pitcherMatchup: this.evaluatePitcherMatchup(homeStarter, awayStarter),
      recentForm: this.getRecentForm(game.homeTeamId, game.awayTeamId),
      homeAdvantage: 0.62, // Standard home field advantage
      restDays: 0.9, // Assume normal rest
      weather: game.weather ? this.weatherQualityScore(game.weather.temp, game.weather.conditions) : 0.7,
      bullpenStrength: this.getBullpenStrength(game.homeTeamId, game.awayTeamId),
    }

    const confidence = StatisticalModels.calculateConfidence(factors)

    return {
      gameId: game.id,
      model: "Composite",
      homeWinProb: winProbs.home,
      awayWinProb: winProbs.away,
      projectedHomeScore: Math.round(projectedHomeRuns * 10) / 10,
      projectedAwayScore: Math.round(projectedAwayRuns * 10) / 10,
      projectedTotal: Math.round((projectedHomeRuns + projectedAwayRuns) * 10) / 10,
      confidence,
      factors,
    }
  }

  // Multiple model ensemble projection
  generateEnsembleProjection(game: Game): Projection {
    // In production, this would run multiple models (Elo, regression, ML, etc.)
    // For now, we'll simulate with variations

    const baseProjection = this.generateProjection(game)

    // Simulate multiple models with slight variations
    const models = [
      baseProjection,
      this.adjustProjection(baseProjection, 0.95, 1.05),
      this.adjustProjection(baseProjection, 1.05, 0.95),
    ]

    // Average the projections
    const avgHomeScore = models.reduce((sum, p) => sum + p.projectedHomeScore, 0) / models.length
    const avgAwayScore = models.reduce((sum, p) => sum + p.projectedAwayScore, 0) / models.length
    const avgHomeWinProb = models.reduce((sum, p) => sum + p.homeWinProb, 0) / models.length

    return {
      ...baseProjection,
      projectedHomeScore: Math.round(avgHomeScore * 10) / 10,
      projectedAwayScore: Math.round(avgAwayScore * 10) / 10,
      projectedTotal: Math.round((avgHomeScore + avgAwayScore) * 10) / 10,
      homeWinProb: Math.round(avgHomeWinProb * 100) / 100,
      awayWinProb: Math.round((1 - avgHomeWinProb) * 100) / 100,
      confidence: baseProjection.confidence * 1.1, // Ensemble increases confidence
    }
  }

  // Helper: Adjust projection by factors
  private adjustProjection(projection: Projection, homeFactor: number, awayFactor: number): Projection {
    const newHomeScore = projection.projectedHomeScore * homeFactor
    const newAwayScore = projection.projectedAwayScore * awayFactor

    const newWinProbs = StatisticalModels.calculateWinProbability(newHomeScore, newAwayScore, 100, 100)

    return {
      ...projection,
      projectedHomeScore: newHomeScore,
      projectedAwayScore: newAwayScore,
      projectedTotal: newHomeScore + newAwayScore,
      homeWinProb: newWinProbs.home,
      awayWinProb: newWinProbs.away,
    }
  }

  // Helper: Get team offense rating (mock - would use real stats)
  private getTeamOffenseRating(teamId: string): number {
    const ratings: Record<string, number> = {
      nyy: 108,
      bos: 102,
      lad: 112,
      sf: 98,
      atl: 115,
      hou: 110,
    }
    return ratings[teamId] || 100
  }

  // Helper: Calculate team strength from pitcher
  private calculateTeamStrength(pitcher: PitcherStats): number {
    const eraComponent = (5.0 - pitcher.era) / 5.0
    const whipComponent = (1.5 - pitcher.whip) / 1.5
    const kComponent = pitcher.kPer9 / 12

    return (eraComponent * 40 + whipComponent * 30 + kComponent * 30) * 100
  }

  // Helper: Evaluate pitcher matchup quality
  private evaluatePitcherMatchup(home: PitcherStats, away: PitcherStats): number {
    const homeQuality = StatisticalModels.qualityStartProb(home.era, home.whip, home.kPer9)
    const awayQuality = StatisticalModels.qualityStartProb(away.era, away.whip, away.kPer9)

    return (homeQuality + awayQuality) / 2
  }

  // Helper: Get recent form (mock)
  private getRecentForm(homeTeamId: string, awayTeamId: string): number {
    // Would analyze last 10 games record
    return 0.75 + Math.random() * 0.2
  }

  // Helper: Weather quality score
  private weatherQualityScore(temp: number, conditions: string): number {
    let score = 0.7

    if (temp >= 65 && temp <= 85 && conditions === "Clear") {
      score = 0.9
    } else if (conditions.includes("Rain") || conditions.includes("Storm")) {
      score = 0.3
    }

    return score
  }

  // Helper: Bullpen strength (mock)
  private getBullpenStrength(homeTeamId: string, awayTeamId: string): number {
    const strength: Record<string, number> = {
      nyy: 0.82,
      bos: 0.68,
      lad: 0.85,
      sf: 0.75,
      atl: 0.88,
      hou: 0.79,
    }
    return (strength[homeTeamId] || 0.7 + strength[awayTeamId] || 0.7) / 2
  }

  // Calculate spread projection
  calculateSpreadProjection(projection: Projection, line: number): { homeCoversProb: number; awayCoversProb: number } {
    const runDiff = projection.projectedHomeScore - projection.projectedAwayScore
    const expectedSpread = runDiff

    // Use normal distribution approximation
    const stdDev = 2.5 // Standard deviation of run differential
    const zScore = (line - expectedSpread) / stdDev

    // Cumulative probability
    const awayCoversProb = this.normalCDF(zScore)
    const homeCoversProb = 1 - awayCoversProb

    return { homeCoversProb, awayCoversProb }
  }

  // Calculate total projection
  calculateTotalProjection(projection: Projection, line: number): { overProb: number; underProb: number } {
    const probs = StatisticalModels.overUnderProbability(projection.projectedTotal, line)
    return { overProb: probs.over, underProb: probs.under }
  }

  // Helper: Normal CDF approximation
  private normalCDF(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z))
    const d = 0.3989423 * Math.exp((-z * z) / 2)
    const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))

    return z > 0 ? 1 - probability : probability
  }
}

// Export singleton instance
export const projectionsEngine = new ProjectionsEngine(teams, pitcherStats)
