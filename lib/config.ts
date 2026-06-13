// ─── Ensemble++ Feature Flags ─────────────────────────────────────────────────
// Read from env at module-load time. Defaults are OFF so the existing 7-model
// ensemble path stays bit-for-bit identical until a deployment opts in.

export type EnsembleVersion = "v1.7models" | "v2.9models"

function envBool(name: string): boolean {
  const v = process.env[name]
  return v === "1" || v === "true" || v === "TRUE"
}

/**
 * Parse a positive-integer env var, falling back to `fallback` on NaN, 0,
 * negative, non-finite, or above-cap values. The cap protects simulation loops
 * from being asked to run an unreasonable number of iterations.
 */
function envPositiveInt(name: string, fallback: number, cap = 100_000): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10)
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return Math.min(raw, cap)
}

export const FLAGS = {
  /** Enable DeepNRFI LightGBM scoring layer. Requires a model artifact under scripts/deepnrfi/artifacts/. */
  ENABLE_DEEPNRFI: envBool("ENABLE_DEEPNRFI"),
  /** Enable Monte Carlo simulation layer (8k sims/game by default). */
  ENABLE_MONTECARLO: envBool("ENABLE_MONTECARLO"),
  /**
   * Active ensemble version. "v1.7models" = legacy 7-model path (default).
   * "v2.9models" = stacker over 7-model + DeepNRFI + MonteCarlo.
   */
  ENSEMBLE_VERSION: (process.env.ENSEMBLE_VERSION === "v2.9models" ? "v2.9models" : "v1.7models") as EnsembleVersion,
  /** Number of Monte Carlo simulations per game (overrideable for tests). */
  MONTECARLO_SIMS: envPositiveInt("MONTECARLO_SIMS", 8000),
  /**
   * Fetch the actual posted batting order per game (~2 h pre-game) and use the
   * leadoff trio's hand mix to tilt the team-level vs-hand offense factor.
   * Falls back to the team rolling average when the lineup isn't posted yet or
   * the flag is off — so safe to enable mid-day.
   */
  USE_REAL_LINEUPS: envBool("USE_REAL_LINEUPS"),
} as const

/**
 * MLB Opening Day dates by year.
 * Used to determine the full backfill range for the accuracy dashboard.
 * Update each off-season when the schedule is announced.
 */
export const MLB_SEASON_START: Record<number, string> = {
  2024: "2024-03-20",
  2025: "2025-03-27",
  2026: "2026-03-27",
}

/**
 * Minimum season-to-date pitches before Statcast pitch-mix / zone-whiff
 * aggregates are trusted enough to store and display. Kept in sync manually with
 * the same constant in `scripts/data/refresh_statcast.py` (no cross-runtime
 * import); this value is the source of truth.
 */
export const MIN_PITCHES = 200

// Configuration for all statistical models and regression parameters
export const CONFIG = {
  // Regression parameters (N_reg values for empirical Bayes)
  regression: {
    wOBA_PA: 200,
    xwOBA_PA: 200,
    FIP_IP: 100,
    K_BB_BF: 150,
    barrel_hardHit_BIP: 125,
    ISO_PA: 180,
    BABIP_BIP: 150,
  },

  // wOBA weights (2024 season - configurable)
  wOBA_weights: {
    uBB: 0.69,
    HBP: 0.72,
    single: 0.89,
    double: 1.27,
    triple: 1.62,
    HR: 2.1,
    wOBAScale: 1.24, // Scales wOBA to OBP
  },

  // FIP constant (calculated per season as lgERA - lgFIP; 2024 MLB ≈ 3.17)
  FIP_constant: 3.17,

  // Pythagorean exponent
  pythagorean: {
    exponent: 1.83, // Can use fixed or dynamic
    useDynamic: false, // If true, calculate from run environment
  },

  // Home field advantage
  homeAdvantage: 0.54, // ~54% win rate for home teams

  // Park factor window
  parkFactorYears: 3,

  // Kelly Criterion — single source of truth for the engine
  // (lib/nrfi-engine.ts) and the backtester (lib/backtest-metrics.ts).
  kelly: {
    scaling: 0.25, // Quarter Kelly
    minEdge: 0.03, // 3% minimum edge before a bet is recommended
    maxBet: 0.05, // 5% max of bankroll per bet (cap on the fractional-Kelly stake)

    // Optional confidence-scaled fractional Kelly. When `enabled` is false the
    // engine sizes every bet at the flat quarter-Kelly above, so live behaviour
    // and the audited Kelly regression invariants are unchanged. When enabled,
    // the fraction is multiplied by a factor that ramps linearly with the
    // reliability score (10 → minFactor, 98 → maxFactor), still capped by maxBet.
    // Keep OFF until a walk-forward ROI backtest shows the scaling helps.
    confidenceScaling: {
      enabled:   false,
      minFactor: 0.5, // multiplier at the lowest confidence score (10)
      maxFactor: 1.0, // multiplier at the highest confidence score (98)
    },

    // Liquidity guard on value bets. The two-way overround (sum of the vigged
    // implied probabilities) is a proxy for market quality: a healthy book sits
    // just above 1.0 (a few points of vig); an inverted (< minOverround) or
    // very wide (> maxOverround) market signals a stale, thin, or mispriced
    // line that shouldn't drive a recommended bet.
    minOverround: 1.0,  // < 1.0 ⇒ inverted / arb-looking ⇒ untrustworthy
    maxOverround: 1.15, // > 15% combined vig ⇒ treat as illiquid
  },

  // Projection model
  projection: {
    starterIPShare: 0.6,
    bullpenIPShare: 0.4,
    useStarterHandedness: true,
    weatherSensitivity: 1.0,
  },

  // Confidence thresholds
  confidence: {
    lowSampleSize: {
      PA: 50,
      IP: 30,
      BF: 100,
    },
    extremeEdgeWarning: 0.15, // 15% edge triggers warning
  },

  // League averages (2024 MLB — pitch clock era; update annually)
  league: {
    ERA: 4.12,       // 2024 MLB ERA (slight improvement from pitch clock pace)
    FIP: 3.95,       // 2024 MLB FIP
    wOBA: 0.312,     // 2024 MLB wOBA (slight decrease from strikeout uptick)
    K_pct: 22.7,     // 2024 MLB K% (up slightly from pitch clock)
    BB_pct: 8.4,     // 2024 MLB BB% (down slightly)
    HR_FB: 12.5,     // 2024 MLB HR/FB rate
    BABIP: 0.296,    // 2024 MLB BABIP (stable)
    runsPerGame: 4.4, // 2024 MLB R/G (slight decrease from 2023)
  },
}
