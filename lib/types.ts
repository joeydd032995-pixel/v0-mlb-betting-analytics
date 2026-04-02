// ─── Core Types for NRFI/YRFI Prediction Engine ───────────────────────────────

export type Hand = "R" | "L" | "S"
export type League = "AL" | "NL"
export type Division = "East" | "Central" | "West"
export type WeatherCondition = "clear" | "cloudy" | "overcast" | "light-rain" | "dome"
export type WindDirection = "in" | "out" | "crosswind" | "calm"
export type ConfidenceLevel = "High" | "Medium" | "Low"
export type Recommendation =
  | "STRONG_NRFI"
  | "LEAN_NRFI"
  | "TOSS_UP"
  | "LEAN_YRFI"
  | "STRONG_YRFI"
export type ImpactDirection = "positive" | "negative" | "neutral"
export type ImpactMagnitude = "strong" | "moderate" | "slight"

// ─── Team ─────────────────────────────────────────────────────────────────────

export interface Team {
  id: string
  name: string
  abbreviation: string
  city: string
  league: League
  division: Division
  primaryColor: string
  firstInning: TeamFirstInningStats
}

export interface TeamFirstInningStats {
  /** Average runs scored per first inning */
  runsPerGame: number
  /** Offensive factor relative to league avg (1.0 = average) */
  offenseFactor: number
  /** OPS in the first inning */
  ops: number
  /** wOBA in first inning */
  woba: number
  /** K% in first inning */
  kRate: number
  /** BB% in first inning */
  bbRate: number
  /** Season YRFI rate (% games they score in 1st) */
  yrfiRate: number
  /** Home YRFI rate */
  homeYrfiRate: number
  /** Away YRFI rate */
  awayYrfiRate: number
  /** YRFI rate in last 10 games */
  last10YrfiRate: number
  /** Avg 1st-inning runs vs RHP */
  avgRunsVsRHP: number
  /** Avg 1st-inning runs vs LHP */
  avgRunsVsLHP: number
}

// ─── Pitcher ──────────────────────────────────────────────────────────────────

export interface Pitcher {
  id: string
  name: string
  teamId: string
  throws: Hand
  age: number
  firstInning: PitcherFirstInningStats
  overall: PitcherOverallStats
}

export interface PitcherFirstInningStats {
  /** ERA in just the first inning */
  era: number
  /** WHIP in the first inning */
  whip: number
  /** Strikeout % in 1st inning */
  kRate: number
  /** Walk % in 1st inning */
  bbRate: number
  /** HR rate per 9 in 1st inning */
  hrPer9: number
  /** BABIP in 1st inning */
  babip: number
  /** % of starts where 0 runs allowed in 1st inning */
  nrfiRate: number
  /** Average runs allowed per first inning */
  avgRunsAllowed: number
  /** % of time the first batter reaches base */
  firstBatterOBP: number
  /** Results of last 5 starts: true = NRFI achieved */
  last5Results: boolean[]
  /** Runs allowed in 1st inning over last 5 starts */
  last5RunsAllowed: number[]
  /** Number of starts this season (sample size) */
  startCount: number
  /** NRFI rate at home */
  homeNrfiRate: number
  /** NRFI rate on the road */
  awayNrfiRate: number
}

export interface PitcherOverallStats {
  era: number
  fip: number
  xfip: number
  whip: number
  kPer9: number
  bbPer9: number
  innings: number
  wins: number
  losses: number
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export interface Game {
  id: string
  date: string
  time: string
  timeZone: string
  homeTeamId: string
  awayTeamId: string
  homePitcherId: string
  awayPitcherId: string
  venue: string
  /** Run-scoring park factor (1.0 = neutral, >1 hitter-friendly) */
  parkFactor: number
  weather: Weather
  odds?: GameOdds
}

export interface Weather {
  temperature: number
  windSpeed: number
  windDirection: WindDirection
  conditions: WeatherCondition
  humidity: number
}

export interface GameOdds {
  nrfiOdds: number   // American odds  e.g. -140
  yrfiOdds: number
  bookmaker: string
}

// ─── Prediction Output ────────────────────────────────────────────────────────

export interface NRFIPrediction {
  gameId: string
  /** P(neither team scores in 1st inning) */
  nrfiProbability: number
  yrfiProbability: number
  /** Poisson λ — expected runs for home team in 1st */
  homeExpectedRuns: number
  /** Poisson λ — expected runs for away team in 1st */
  awayExpectedRuns: number
  /** P(home team scores 0) */
  homeScores0Prob: number
  /** P(away team scores 0) */
  awayScores0Prob: number
  confidence: ConfidenceLevel
  confidenceScore: number
  recommendation: Recommendation
  factors: PredictionFactor[]
  modelInputs: ModelInputs
  valueAnalysis?: ValueAnalysis
}

export interface PredictionFactor {
  name: string
  /** positive = favors NRFI; negative = favors YRFI */
  impact: ImpactDirection
  magnitude: ImpactMagnitude
  description: string
  value?: string
}

export interface ModelInputs {
  homePitcherNrfiRate: number
  awayPitcherNrfiRate: number
  homeOffenseFactor: number
  awayOffenseFactor: number
  parkFactor: number
  weatherMultiplier: number
  recentFormMultiplier: number
}

export interface ValueAnalysis {
  impliedNrfiProb: number
  impliedYrfiProb: number
  nrfiEdge: number
  yrfiEdge: number
  nrfiOdds: number
  yrfiOdds: number
  recommendedBet: "NRFI" | "YRFI" | "NO_BET"
  kellyFraction: number
  expectedValue: number
}

// ─── Historical Results ───────────────────────────────────────────────────────

export interface HistoricalResult {
  id: string
  date: string
  homeTeam: string
  awayTeam: string
  homePitcher: string
  awayPitcher: string
  venue: string
  nrfiProbability: number
  prediction: "NRFI" | "YRFI"
  actualResult: "NRFI" | "YRFI"
  correct: boolean
  confidence: ConfidenceLevel
  runsFirstInning: { home: number; away: number }
  nrfiOdds?: number
  yrfiOdds?: number
  profitLoss?: number
}

export interface ModelAccuracy {
  totalPredictions: number
  correct: number
  accuracy: number
  nrfiAccuracy: number
  yrfiAccuracy: number
  highConfAccuracy: number
  medConfAccuracy: number
  roi: number
  calibrationData: CalibrationPoint[]
  monthlyData: MonthlyAccuracy[]
}

export interface CalibrationPoint {
  predictedBin: number
  actualRate: number
  count: number
}

export interface MonthlyAccuracy {
  month: string
  accuracy: number
  predictions: number
  roi: number
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

export interface FilterOptions {
  confidenceLevel: "all" | "High" | "Medium" | "Low"
  recommendation: "all" | "NRFI" | "YRFI" | "toss-up"
  league: "all" | "AL" | "NL"
  minEdge: number
  sortBy: "probability" | "confidence" | "edge" | "time"
  showValueOnly: boolean
}
