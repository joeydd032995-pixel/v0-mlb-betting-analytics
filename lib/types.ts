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
  runsPerGame: number
  offenseFactor: number
  ops: number
  woba: number
  kRate: number
  bbRate: number
  yrfiRate: number
  homeYrfiRate: number
  awayYrfiRate: number
  last10YrfiRate: number
  avgRunsVsRHP: number
  avgRunsVsLHP: number
  /** Last 5 games: true = team did NOT score in 1st (NRFI half), false = scored (YRFI half) */
  last5Results?: boolean[]
}

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
  era: number
  whip: number
  kRate: number
  bbRate: number
  hrPer9: number
  babip: number
  nrfiRate: number
  avgRunsAllowed: number
  firstBatterOBP: number
  last5Results: boolean[]
  last5RunsAllowed: number[]
  startCount: number
  homeNrfiRate: number
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
  parkFactor: number
  weather: Weather
  odds?: GameOdds
  /** Opt #4: positive nrfiFactor → umpire tightens zone → fewer runs → increases P(NRFI) */
  umpire?: { nrfiFactor?: number }
}

export interface Weather {
  temperature: number
  windSpeed: number
  windDirection: WindDirection
  conditions: WeatherCondition
  humidity: number
}

export interface GameOdds {
  nrfiOdds: number
  yrfiOdds: number
  bookmaker: string
}

export interface NRFIPrediction {
  gameId: string
  nrfiProbability: number
  yrfiProbability: number
  /** Calibrated NRFI percentage (0–100). Decision threshold: 34 = NRFI call, <34 = YRFI call. */
  calibratedNrfiPct: number
  homeExpectedRuns: number
  awayExpectedRuns: number
  homeScores0Prob: number
  awayScores0Prob: number
  confidence: ConfidenceLevel
  confidenceScore: number
  recommendation: Recommendation
  factors: PredictionFactor[]
  modelInputs: ModelInputs
  valueAnalysis?: ValueAnalysis
  /** Multi-model breakdown (Poisson + ZIP + Markov + Bayesian ensemble) */
  modelBreakdown?: ModelBreakdown
}

export interface PredictionFactor {
  name: string
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
  recentFormMultiplier?: number
}

// ─── New types for Phase 2+ (ensemble deep dive, sensitivity, Markov UI) ─────

export interface SensitivityAdjustments {
  /** ±mph added to game.weather.windSpeed */
  windSpeedDelta: number
  /** ±°F added to game.weather.temperature */
  temperatureDelta: number
  /** Override for umpire nrfiFactor, clamped to [-0.5, 0.5] */
  umpireNrfiFactor: number
  /** Multiplies pitcher startCount for shrinkage weight (0.5–2.0) */
  sampleSizeMultiplier: number
}

export interface EnsembleDiagnostics {
  gameId: string
  rawEnsemble7: number
  calibratedBeforeBlend: number
  finalBlended: number
}

/** Per-half-inning breakdown from the 7-model ensemble */
export interface HalfInningModelBreakdown {
  /** Base Poisson P(no score) using Bayesian-shrunk rate */
  poissonNrfi: number
  /** Zero-Inflated Poisson P(no score) */
  zipNrfi: number
  /** ZIP lockdown component: probability of a dominant 1-2-3 inning */
  zipOmega: number
  /** ZIP active-inning scoring rate λ */
  zipLambda: number
  /** Markov Chain P(no score) via 24-state base-out transition */
  markovNrfi: number
  /** MAPRE P(no score) for this half (per-half, no ρ) */
  mapreNrfi: number
  /** MAPRE adjusted λ — stored so combineHalfInnings can apply ρ and Neg Binomial */
  mapreLambdaAdj: number
  /** 0–1: how much weight is on actual season data vs league average */
  bayesianDataWeight: number
  /** Bayesian-shrunk pitcher NRFI rate fed into models */
  shrunkNrfiRate: number
  // ── Meta-models (Opt #8) — optional so old 4-model data loads cleanly ──────
  /** Logistic Stack meta-model P(no score) — logistic regression on base-4 avg */
  logisticMetaNrfi?: number
  /** NN Interaction meta-model P(no score) — Poisson × Markov cross-term */
  nnInteractionNrfi?: number
  /** Hierarchical Bayes meta-model P(no score) — dynamic-prior shrunk pitcher rate */
  hierarchicalBayesNrfi?: number
  /** PA outcomes used to build the Markov chain — enables MarkovDiamond interactive UI */
  paOutcomes?: {
    outProb: number
    walkProb: number
    singleProb: number
    doubleProb: number
    tripleProb: number
    hrProb: number
  }
}

/** Full multi-model breakdown for a game prediction */
export interface ModelBreakdown {
  /** Ensemble P(NRFI) — final blended probability */
  ensembleNrfi: number
  /** Ensemble P(YRFI) = 1 − ensembleNrfi */
  ensembleYrfi: number
  /** Half-inning breakdown: home team at bat (vs away pitcher) */
  homeHalfInning: HalfInningModelBreakdown
  /** Half-inning breakdown: away team at bat (vs home pitcher) */
  awayHalfInning: HalfInningModelBreakdown
  /** Model agreement score 0–1: 1.0 = all models agree perfectly */
  modelConsensus: number
  /** Indicates which model is an outlier, if any */
  consensusNote?: string
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

export interface FilterOptions {
  confidenceLevel: "all" | "High" | "Medium" | "Low"
  recommendation: "all" | "NRFI" | "YRFI" | "toss-up"
  league: "all" | "AL" | "NL"
  sortBy: "probability" | "confidence" | "edge" | "time"
  showValueOnly: boolean
}

export const METRIC_GLOSSARY: Record<string, string> = {
  pNRFI: "Poisson-calculated probability that neither team scores a run in the first inning (0–100%)",
  pYRFI: "Poisson-calculated probability that at least one team scores a run in the first inning (0–100%)",
  confidence: "Model confidence in the prediction, based on input data quality and historical accuracy",
  edge: "Expected value of the bet relative to public betting odds; positive = favorable for NRFI",
  kelly: "Kelly Criterion fraction; recommended bet size as a percentage of bankroll (use cautiously)",
  parkFactor: "Adjustment factor for home-run-friendly or pitcher-friendly stadiums (0.8–1.2)",
  xR: "Expected runs in the first inning, calculated from Statcast data and team stats",
  woba: "Weighted on-base average; measures offensive value per plate appearance (scale: 0–.450)",
  ops: "On-base plus slugging; combined measure of offensive output (scale: 0–1.0+)",
  kRate: "Strikeout rate; percentage of plate appearances ending in strikeout (0–100%)",
  bbRate: "Walk rate; percentage of plate appearances ending in a walk (0–100%)",
  yrfiRate: "Empirical rate at which a team scored in the first inning over a sample period (0–100%)",
  nrfiRate: "Empirical rate at which neither team scored in the first inning over a sample period (0–100%)",
  accuracy: "Percentage of predictions that were correct (0–100%), only available after games complete",
  roi: "Return on investment if you bet at published odds on all recommendations (e.g., +12.5%)",
  starter: "The primary pitcher assigned to start the game, usually pitching the first 5–7 innings",
  relief: "A pitcher who enters the game after the starter, typically in later innings",
  weather: "Environmental conditions (temperature, wind direction/speed) affecting ball carry and play",
  dome: "Retractable or permanent roof protecting field from weather; eliminates wind/weather factors",
  playoff: "Post-season tournament; higher intensity and different roster composition than regular season",
  ensembleModel: "Combination of multiple prediction models (Poisson, Markov, ZIP) for increased robustness",
}
