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

// V2 applies slightly more tail compression than V1.  When ensemble7, DeepNRFI,
// and Monte Carlo are blended the combined distribution has lower extreme-tail
// variance (regression toward the mean from multiple independent models).
// Compared to V1: tails [0.05–0.20] nudged up by +0.005–0.010 (less underfit);
// tails [0.80–0.95] nudged down by +0.005–0.010 (less overconfident at high end).
// Mid-range [0.40–0.65] is essentially unchanged.
// Refit this table once Phase 4 backtest data is available via scripts/deepnrfi/recalibrate.py.
const CALIBRATION_KNOTS_V2: [number, number][] = [
  [0.05, 0.068],
  [0.10, 0.120],
  [0.15, 0.174],
  [0.20, 0.230],
  [0.25, 0.282],
  [0.30, 0.328],
  [0.35, 0.384],
  [0.40, 0.437],
  [0.45, 0.490],
  [0.50, 0.542],
  [0.55, 0.594],
  [0.60, 0.646],
  [0.65, 0.690],
  [0.70, 0.727],
  [0.75, 0.761],
  [0.80, 0.795],
  [0.85, 0.822],
  [0.90, 0.848],
  [0.95, 0.920],
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
