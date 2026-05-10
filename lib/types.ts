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
  // ── Ensemble++ Phase 1 extensions (all optional) ──────────────────────────────
  /** Handedness offense factor when facing a left-handed pitcher (multiplier vs league). */
  vsLHP?: number
  /** Handedness offense factor when facing a right-handed pitcher (multiplier vs league). */
  vsRHP?: number
  /** Aggregate quality of the top 4 hitters in the batting order (Phase 1 lineup feature). */
  topFour?: {
    /** Average OPS of the top 4 hitters. Range ~ [0.6, 1.0]. */
    ops: number
    /** Average wRC+ of the top 4 hitters. 100 = league average. */
    wRC_plus: number
    /** Average strikeout rate (0-1). */
    k_pct: number
    /** Average walk rate (0-1). */
    bb_pct: number
  }
}

export interface Pitcher {
  id: string
  name: string
  teamId: string
  throws: Hand
  age: number
  firstInning: PitcherFirstInningStats
  overall: PitcherOverallStats
  // ── Ensemble++ Phase 1 extensions (all optional) ──────────────────────────────
  // Note: careerFirstInnings and isBullpenGame live on PitcherFirstInningStats
  // (added by the code-quality-audit branch); the engine reads them there.
  /** Statcast pitcher summary (velocity, spin, stuff). Source: pybaseball nightly dump. */
  statcast?: StatcastPitcherSummary
  /** Workload + rest-day fatigue indicators. */
  fatigue?: PitcherFatigue
  /** First-inning splits keyed by top-of-order matchup quality. */
  firstInningSplits?: PitcherFirstInningSplits
}

export interface StatcastPitcherSummary {
  /** Average four-seam velocity (mph). League avg ~93.5. */
  fbVeloAvg: number
  /** Average four-seam spin rate (rpm). League avg ~2300. */
  fbSpinAvg: number
  /** Share of breaking-ball pitches (slider+curve+sweeper) in arsenal, 0-1. */
  breaking_pct: number
  /** Stuff+ score (Driveline-style). 100 = league average. */
  stuffPlus: number
  /** Average release-point height (ft). */
  releaseHeight?: number
  /** Average release-point side (ft, signed; positive = arm side). */
  releaseSide?: number
}

export interface PitcherFatigue {
  /** Pitches thrown across the last 5 game logs. */
  pitchesLast5: number
  /** Days since last appearance. */
  daysRest: number
  /** Average IP across the last 3 starts. */
  rolling3StartIP: number
}

export interface PitcherFirstInningSplits {
  /** Performance in the 1st inning vs the top of an opposing order. */
  vsTopOfOrder: {
    wobaAllowed: number
    k_pct: number
  }
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
  /** Career first-inning appearances — used by getDynamicPriorWeight for shrinkage k selection */
  careerFirstInnings?: number
  /** True when this pitcher is used as a bulk/opener reliever, not a traditional starter */
  isBullpenGame?: boolean
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
  // ── Ensemble++ Phase 1 extensions (all optional) ──────────────────────────────
  /** MLB umpire ID for joining against historical umpire profile data. */
  umpireId?: string
  /** Days of rest since each team's previous game. */
  restDays?: { home: number; away: number }
  /** Approximate cross-country travel distance (miles) since previous game. */
  travelMiles?: { home: number; away: number }
  /** True when the listed starter is acting as an opener / bullpen day. */
  bullpenStart?: { home: boolean; away: boolean }
  /** Probable-lineup snapshot from MLB Stats boxscore (top of order matters most). */
  lineups?: { home?: Lineup; away?: Lineup }
}

export interface Weather {
  temperature: number
  windSpeed: number
  windDirection: WindDirection
  conditions: WeatherCondition
  humidity: number
  // ── Ensemble++ Phase 1 extensions (all optional) ──────────────────────────────
  /** Probability of precipitation, 0-1, from OpenWeatherMap when available. */
  precipProb?: number
  /** Atmospheric pressure (hPa), used for air-density calculation. */
  pressureHPa?: number
  /** Computed air density (kg/m³). Lower = ball carries farther. */
  airDensity?: number
}

export interface Lineup {
  gamePk: string | number
  teamId: string
  slots: LineupSlot[]
}

export interface LineupSlot {
  /** Batting order position (1-9). */
  order: number
  mlbamId: string
  hand: Hand
  /** Rolling weighted on-base average over the last 15 days. */
  rolling_woba?: number
  k_pct?: number
  bb_pct?: number
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
  // ── Ensemble++ extensions (all optional, populated when feature flags enabled) ──
  /** Active ensemble version. Defaults to "v1.7models". */
  ensembleVersion?: "v1.7models" | "v2.9models"
  /** Final per-model weights actually used in the v2 stack (when v2 enabled). */
  ensembleWeights?: Record<string, number>
  /** Built feature vector (only populated when DeepNRFI or MonteCarlo are enabled). */
  features?: DeepNrfiFeatureVector
  /** Presence mask aligned with `features`. 1 = real data, 0 = imputed default. */
  featurePresence?: DeepNrfiFeaturePresence
  /** DeepNRFI scoring result (only populated when ENABLE_DEEPNRFI and artifact present). */
  deepNrfi?: DeepNrfiResult
  /** Monte Carlo simulation result (only populated when ENABLE_MONTECARLO). */
  monteCarlo?: MonteCarloResult
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
  /** Minimum edge as a decimal fraction (e.g. 0.02 = 2%). */
  minEdge?: number
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

// ─── Ensemble++ Phase 1–4 Types ───────────────────────────────────────────────

/**
 * Flat numeric feature vector consumed by DeepNRFI (LightGBM) and the
 * Monte-Carlo per-PA bridge.  Field names are stable across versions; new
 * fields are appended (never re-ordered) so artifact compatibility is preserved.
 *
 * Every field has a documented unit/range and a sensible league-average default
 * when source data is missing.  See lib/features/feature-vector.ts.
 */
export interface DeepNrfiFeatureVector {
  // ── Pitcher: home (top of 1st = away batting vs home pitcher) ───────────────
  home_pitcher_shrunk_nrfi: number
  home_pitcher_k_rate: number
  home_pitcher_bb_rate: number
  home_pitcher_hr_per9: number
  home_pitcher_babip: number
  home_pitcher_first_batter_obp: number
  home_pitcher_start_count: number
  home_pitcher_recent_form: number
  home_pitcher_fb_velo: number
  home_pitcher_fb_spin: number
  home_pitcher_breaking_pct: number
  home_pitcher_stuff_plus: number
  home_pitcher_pitches_last5: number
  home_pitcher_days_rest: number
  home_pitcher_rolling3_ip: number
  home_pitcher_vstop_woba: number
  home_pitcher_vstop_k: number
  home_pitcher_is_bullpen: number
  // ── Pitcher: away ────────────────────────────────────────────────────────────
  away_pitcher_shrunk_nrfi: number
  away_pitcher_k_rate: number
  away_pitcher_bb_rate: number
  away_pitcher_hr_per9: number
  away_pitcher_babip: number
  away_pitcher_first_batter_obp: number
  away_pitcher_start_count: number
  away_pitcher_recent_form: number
  away_pitcher_fb_velo: number
  away_pitcher_fb_spin: number
  away_pitcher_breaking_pct: number
  away_pitcher_stuff_plus: number
  away_pitcher_pitches_last5: number
  away_pitcher_days_rest: number
  away_pitcher_rolling3_ip: number
  away_pitcher_vstop_woba: number
  away_pitcher_vstop_k: number
  away_pitcher_is_bullpen: number
  // ── Lineups (top of order is what matters in the 1st) ──────────────────────
  home_top4_ops: number
  home_top4_wrcplus: number
  home_top4_k_pct: number
  home_top4_bb_pct: number
  away_top4_ops: number
  away_top4_wrcplus: number
  away_top4_k_pct: number
  away_top4_bb_pct: number
  home_offense_factor: number
  away_offense_factor: number
  home_offense_vs_hand: number
  away_offense_vs_hand: number
  // ── Context: weather + park + umpire + travel ──────────────────────────────
  weather_temp_f: number
  weather_wind_mph: number
  weather_wind_in_out: number     // signed: +1 out, −1 in, 0 cross/calm
  weather_humidity: number
  weather_precip_prob: number
  weather_pressure_hpa: number
  weather_air_density: number
  is_dome: number
  park_factor: number
  park_first_inning_runs: number
  park_hr_factor: number
  park_elevation_ft: number
  umpire_zone_tightness: number
  umpire_career_nrfi: number
  umpire_sample: number
  home_rest_days: number
  away_rest_days: number
  home_travel_miles: number
  away_travel_miles: number
  is_bullpen_game: number
  // ── Engine signal (the 7-model ensemble probability itself, used by stacker) ─
  ensemble7_nrfi: number
}

/** Boolean-as-0/1 mask aligned with DeepNrfiFeatureVector keys. */
export type DeepNrfiFeaturePresence = Record<keyof DeepNrfiFeatureVector, 0 | 1>

export interface FeatureContribution {
  /** Feature key from DeepNrfiFeatureVector. */
  name: keyof DeepNrfiFeatureVector | string
  /** Signed SHAP-like contribution (positive → pushed toward NRFI). */
  value: number
  presence: 0 | 1
  impact: "NRFI" | "YRFI" | "NEUTRAL"
}

export interface DeepNrfiResult {
  /** Calibrated probability of NRFI. */
  probability: number
  /** Top contributing features with signed SHAP values, sorted by |value|. */
  topFeatures: FeatureContribution[]
  /** Active model artifact version. */
  modelVersion: string
}

/** Per-PA outcome distribution used by the Monte Carlo simulator. */
export interface PerPAProbs {
  out: number
  walk: number
  single: number
  double: number
  triple: number
  hr: number
}

export interface MonteCarloHalfResult {
  /** P(zero runs in this half-inning) from simulation. */
  pZero: number
  /** Mean runs scored in this half. */
  meanRuns: number
  /** Variance of runs scored. */
  variance: number
  /** Histogram: index = runs, value = P(exactly that many runs). Sums to 1.0. */
  runDistribution: number[]
}

export interface MonteCarloResult {
  /** P(NRFI) — both halves zero — from simulation. */
  pNRFI: number
  /** Mean total first-inning runs across both halves. */
  meanRuns: number
  /** Variance of total first-inning runs. */
  variance: number
  /** Histogram: index = total runs in 1st, value = P(that many). Sums to 1.0. */
  runDistribution: number[]
  /** 90th percentile of total first-inning runs. */
  percentile90: number
  /** Number of simulations actually run. */
  nSims: number
  /** RNG seed used (deterministic per game). */
  seed: number
}
