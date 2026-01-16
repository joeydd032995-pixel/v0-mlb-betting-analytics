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
