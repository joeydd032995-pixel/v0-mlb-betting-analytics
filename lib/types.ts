// Core data types for MLB betting analytics

export interface Team {
  id: string
  name: string
  abbreviation: string
  city: string
  division: string
  league: string
}

export interface Player {
  id: string
  name: string
  teamId: string
  position: string
  battingHand?: "L" | "R" | "S"
  throwingHand?: "L" | "R"
}

export interface PitcherStats {
  playerId: string
  season: number
  era: number
  whip: number
  kPer9: number
  bbPer9: number
  innings: number
  wins: number
  losses: number
  saves: number
  fip: number // Fielding Independent Pitching
  xFIP: number // Expected FIP
  babip: number // Batting Average on Balls In Play
}

export interface BatterStats {
  playerId: string
  season: number
  avg: number
  obp: number
  slg: number
  ops: number
  hr: number
  rbi: number
  sb: number
  wOBA: number // Weighted On-Base Average
  wRC: number // Weighted Runs Created
  babip: number
}

export interface Game {
  id: string
  date: Date
  homeTeamId: string
  awayTeamId: string
  homeStarterId: string
  awayStarterId: string
  venue: string
  weather?: Weather
  status: "scheduled" | "live" | "final"
  homeScore?: number
  awayScore?: number
  inning?: number
}

export interface Weather {
  temp: number
  windSpeed: number
  windDirection: string
  conditions: string
}

export interface OddsData {
  gameId: string
  bookmaker: string
  timestamp: Date
  moneylineHome: number
  moneylineAway: number
  spreadHome: number
  spreadHomeOdds: number
  spreadAway: number
  spreadAwayOdds: number
  totalOver: number
  totalOverOdds: number
  totalUnder: number
  totalUnderOdds: number
}

export interface Projection {
  gameId: string
  model: string
  homeWinProb: number
  awayWinProb: number
  projectedHomeScore: number
  projectedAwayScore: number
  projectedTotal: number
  confidence: number
  factors: ProjectionFactors
}

export interface ProjectionFactors {
  pitcherMatchup: number
  recentForm: number
  homeAdvantage: number
  restDays: number
  weather: number
  bullpenStrength: number
}

export interface BettingEdge {
  gameId: string
  betType: "moneyline" | "spread" | "total"
  side: string
  fairOdds: number
  marketOdds: number
  edgePercent: number
  expectedValue: number
  confidence: number
  kellyFraction: number
  recommendedUnits: number
}

export interface Bet {
  id: string
  gameId: string
  betType: string
  side: string
  odds: number
  stake: number
  result?: "win" | "loss" | "push"
  profit?: number
  placedAt: Date
  settledAt?: Date
}

export interface BankrollStats {
  totalBankroll: number
  startingBankroll: number
  totalWagered: number
  totalProfit: number
  roi: number
  winRate: number
  averageOdds: number
  unitSize: number
  totalBets: number
}

export interface DetailedPitcherStats extends PitcherStats {
  // Advanced metrics
  FIP_regressed: number
  xFIP: number
  SIERA: number
  xERA: number
  FIPMinus: number
  K_pct: number
  BB_pct: number
  K_BB_pct: number
  GB_pct: number
  HR_FB: number
  hardHit_pct_allowed: number
  barrel_pct_allowed: number
  xwOBA_allowed: number

  // Sample size
  BF: number
  battedBalls: number
}

export interface DetailedBatterStats extends BatterStats {
  // Advanced metrics
  wOBA_regressed: number
  xwOBA: number
  xwOBA_regressed: number
  ISO: number
  ISO_regressed: number
  K_pct: number
  BB_pct: number
  K_pct_regressed: number
  BB_pct_regressed: number
  hardHit_pct: number
  barrel_pct: number
  barrel_pct_regressed: number
  OSwing_pct: number
  Contact_pct: number

  // Sample size
  PA: number
  battedBalls: number
}

export interface EnhancedProjection extends Projection {
  // Confidence intervals
  homeScoreCI: [number, number] // 90% confidence interval
  awayScoreCI: [number, number]
  totalCI: [number, number]

  // Component breakdowns
  starterImpact: {
    home: number
    away: number
  }
  bullpenImpact: {
    home: number
    away: number
  }
  lineupStrength: {
    home: number
    away: number
  }

  // Model details
  pythagoreanWinPct: {
    home: number
    away: number
  }
  log5WinProb: {
    home: number
    away: number
  }

  // Volatility
  runsVolatility: number

  // Warnings
  warnings: string[]
}

export interface PlayerPropProjection {
  playerId: string
  playerName: string
  gameId: string
  propType: "strikeouts" | "hits" | "homeruns" | "total_bases"

  // Projection
  expectedValue: number
  lambda: number // Poisson parameter

  // Probabilities
  overUnder: {
    [line: string]: {
      overProb: number
      underProb: number
    }
  }

  // Market comparison
  marketLines: {
    line: number
    overOdds: number
    underOdds: number
  }[]

  // Edge
  bestEdge?: {
    line: number
    side: "over" | "under"
    fairProb: number
    marketProb: number
    edge: number
    ev: number
  }

  confidence: number
  warnings: string[]
}
