/**
 * Monotonic calibration for the 9-model Ensemble++ output (v2).
 *
 * Mirrors `lib/calibration.ts` exactly in shape (linear interp over knots) so
 * existing tests transfer.  Kept separate from v1 so the legacy pathway stays
 * bit-for-bit unchanged.
 *
 * ── 2026-06 audit remediation ────────────────────────────────────────────────
 * The previous v2 knots were hand-nudged copies of the v1 curve, never fitted
 * to data (AUDIT_REPORT.md P1-4).  Reset to identity alongside v1; refit only
 * via scripts/deepnrfi/recalibrate.py on a held-out season of the post-fix
 * engine's v2 output.
 */

const CALIBRATION_KNOTS_V2: [number, number][] = [
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
