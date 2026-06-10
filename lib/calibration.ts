/**
 * Monotonic Calibration via Linear Interpolation over Knots (Opt #6)
 *
 * Maps the raw ensemble probability → calibrated probability via monotone
 * linear interpolation over (raw, calibrated) knot pairs.
 *
 * ── 2026-06 audit remediation ────────────────────────────────────────────────
 * The previous knot table ("backtest regression Apr 2025") was fitted to the
 * PRE-audit engine, whose raw output carried a systematic −0.03 to −0.09 NRFI
 * bias from the half-inning/game-level scale mismatch in the shrinkage prior
 * (see AUDIT_REPORT.md P0-1).  Those knots were near-identity in the mid-range
 * and demonstrably did not correct that bias; keeping them after the engine
 * fix would have ADDED a +0.04 NRFI bias instead.
 *
 * The table is therefore reset to the identity mapping.  The fixed engine is
 * approximately calibrated at the league mean by construction (a regression
 * test pins engine(league-average inputs) ≈ LEAGUE_AVG_NRFI).  Refit these
 * knots ONLY from a walk-forward backtest of the post-fix engine
 * (scripts/deepnrfi/recalibrate.py) on a held-out season — never hand-tune.
 */

const CALIBRATION_KNOTS: [number, number][] = [
  [0.05, 0.05],
  [0.10, 0.10],
  [0.15, 0.15],
  [0.20, 0.20],
  [0.25, 0.25],
  [0.30, 0.30],
  [0.35, 0.35],
  [0.40, 0.40],
  [0.45, 0.45],
  [0.50, 0.50],
  [0.55, 0.55],
  [0.60, 0.60],
  [0.65, 0.65],
  [0.70, 0.70],
  [0.75, 0.75],
  [0.80, 0.80],
  [0.85, 0.85],
  [0.90, 0.90],
  [0.95, 0.95],
]

/**
 * Calibrate a raw ensemble probability using monotone linear interpolation over
 * the fitted knots. Values outside [first knot, last knot] are clamped
 * to the corresponding boundary calibrated value.
 */
export function calibrateWithMonotonicSpline(rawProb: number): number {
  if (rawProb <= CALIBRATION_KNOTS[0][0]) return CALIBRATION_KNOTS[0][1]
  const last = CALIBRATION_KNOTS[CALIBRATION_KNOTS.length - 1]
  if (rawProb >= last[0]) return last[1]

  for (let i = 0; i < CALIBRATION_KNOTS.length - 1; i++) {
    const [x1, y1] = CALIBRATION_KNOTS[i]
    const [x2, y2] = CALIBRATION_KNOTS[i + 1]
    if (rawProb >= x1 && rawProb <= x2) {
      const t = (rawProb - x1) / (x2 - x1)
      return y1 + t * (y2 - y1)
    }
  }
  return rawProb // unreachable; satisfies TypeScript
}
