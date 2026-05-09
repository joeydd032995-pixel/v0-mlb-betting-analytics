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
} as const

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

  // FIP constant (calculated per season as lgERA - lgFIP)
  FIP_constant: 3.2,

  // Pythagorean exponent
  pythagorean: {
    exponent: 1.83, // Can use fixed or dynamic
    useDynamic: false, // If true, calculate from run environment
  },

  // Home field advantage
  homeAdvantage: 0.54, // ~54% win rate for home teams

  // Park factor window
  parkFactorYears: 3,

  // Kelly Criterion
  kelly: {
    scaling: 0.25, // Quarter Kelly
    minEdge: 0.02, // 2% minimum edge
    maxBet: 0.05, // 5% max of bankroll
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

  // League averages (2024 MLB)
  league: {
    ERA: 4.2,
    FIP: 4.1,
    wOBA: 0.315,
    K_pct: 22.5,
    BB_pct: 8.5,
    HR_FB: 12.8,
    BABIP: 0.295,
    runsPerGame: 4.5,
  },
}
