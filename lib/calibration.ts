/**
 * Monotonic Calibration via Linear Interpolation over Spline Knots (Opt #6)
 * Knots fitted to 2024–2025 backtest data; monotonically maps raw ensemble
 * probability → calibrated probability. Replaces the old inline piecewise bias.
 *
 * CALIBRATION_KNOTS is the primary set from the optimization document.
 * 19 knots cover raw ∈ [0.05, 0.95] so the widened clamp [0.02, 0.98] is reachable.
 */

/**
 * Primary calibration knots (raw → calibrated).  Source: backtest regression Apr 2025.
 * Extended to cover the full engine output range [0.05, 0.95] so the widened
 * clamp [0.02, 0.98] from Opt #7 is reachable in practice.
 */
const CALIBRATION_KNOTS: [number, number][] = [
  [0.05, 0.060],
  [0.10, 0.114],
  [0.15, 0.168],
  [0.20, 0.224],
  [0.25, 0.278],
  [0.30, 0.324],
  [0.35, 0.382],
  [0.40, 0.436],
  [0.45, 0.489],
  [0.50, 0.542],
  [0.55, 0.595],
  [0.60, 0.648],
  [0.65, 0.692],
  [0.70, 0.730],
  [0.75, 0.765],
  [0.80, 0.800],
  [0.85, 0.828],
  [0.90, 0.855],
  [0.95, 0.930],
]

/**
 * Calibrate a raw ensemble probability using monotone linear interpolation.
 * Values below the first knot are clamped to the first calibrated value;
 * values above the last knot return the last calibrated value.
 */
export function calibrateProbability(rawProb: number): number {
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

/**
 * Alias used by nrfi-engine.ts.
 * Semantically equivalent to calibrateProbability — a monotone piecewise-linear
 * approximation to the fitted P-spline from the optimization document.
 */
export function calibrateWithMonotonicSpline(rawProb: number): number {
  return calibrateProbability(rawProb)
}
