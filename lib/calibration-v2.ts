/**
 * Monotonic calibration spline for the 9-model Ensemble++ output (v2).
 *
 * Mirrors `lib/calibration.ts` exactly in shape (linear interp over knots) so
 * existing tests transfer.  Kept separate from v1 so the legacy pathway stays
 * bit-for-bit unchanged.
 *
 * Initial knots are seeded with v1's calibration curve.  After Phase 4 backtest
 * shows v2 distribution shift, run `scripts/deepnrfi/recalibrate.py` to refit
 * and replace `CALIBRATION_KNOTS_V2` below.
 */

const CALIBRATION_KNOTS_V2: [number, number][] = [
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

export function calibrateV2(rawProb: number): number {
  if (rawProb <= CALIBRATION_KNOTS_V2[0][0]) return CALIBRATION_KNOTS_V2[0][1]
  const last = CALIBRATION_KNOTS_V2[CALIBRATION_KNOTS_V2.length - 1]
  if (rawProb >= last[0]) return last[1]
  for (let i = 0; i < CALIBRATION_KNOTS_V2.length - 1; i++) {
    const [x1, y1] = CALIBRATION_KNOTS_V2[i]
    const [x2, y2] = CALIBRATION_KNOTS_V2[i + 1]
    if (rawProb >= x1 && rawProb <= x2) {
      const t = (rawProb - x1) / (x2 - x1)
      return y1 + t * (y2 - y1)
    }
  }
  return rawProb
}
