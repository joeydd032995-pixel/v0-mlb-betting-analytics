/**
 * Which final-blend pipeline wrote a stored `ModelPrediction.nrfiProbability`.
 *
 * ── The problem ──────────────────────────────────────────────────────────────
 * The engine stores only the FINAL headline probability:
 *
 *   final = clamp( BLEND · cal(raw) + (1 − BLEND) · ANCHOR, CLAMP_MIN, CLAMP_MAX )
 *
 * Nothing persists `raw`, so every tool that needs the pre-anchor value —
 * scripts/refit-calibration.ts, scripts/run-backtest.ts's anchor sweep — has to
 * invert that formula.  The inversion is only correct with the ANCHOR and knots
 * that actually produced the row, and the archive now contains three
 * generations.  Inverting a row with the wrong anchor silently biases the
 * recovered value, which then contaminates a calibration refit or an anchor
 * sweep — the exact failure mode AUDIT_REPORT_V2.md V2-5 describes.
 *
 * Both scripts previously hard-coded `const ANCHOR = 0.516`, so each gained a
 * private, independently-stale copy of the number.  This module is the single
 * owner.
 *
 * ── Keeping it honest when the anchor next moves ─────────────────────────────
 * Every era's anchor is a FROZEN literal, including the current one, because an
 * era describes rows already written — it must not follow a constant that moves
 * underneath it.  `__tests__/anchor-eras.test.ts` asserts the newest era's
 * anchor equals the live `LEAGUE_AVG_NRFI`, so re-estimating the league rate
 * without appending a new era fails CI rather than quietly mis-inverting every
 * row written afterwards.
 *
 * There is no per-row provenance column to key off (see prisma/schema.prisma —
 * `ensembleVersion` tracks the model count, not the anchor), so eras are dated.
 * `recomputedAt` inside `inputsPresence` is the only positive evidence that a
 * row's probability was rewritten; `updatedAt` is bumped by settlement writes
 * that never touch the probability, so it cannot date a row's CONTENT.
 */

// Deliberately does NOT import LEAGUE_AVG_NRFI: every era anchor below is a
// frozen literal, because an era describes rows already written and must not
// follow a constant that moves underneath it. The pinning of the newest era to
// the live constant is done by __tests__/anchor-eras.test.ts, which imports
// both — keeping the dependency in the test rather than in the data.

/** The blend weight on the calibrated ensemble. Unchanged across all eras. */
export const ENSEMBLE_BLEND = 0.76
export const CLAMP_MIN = 0.18
export const CLAMP_MAX = 0.85

/**
 * The knot table in force before commit 09baf70 reset calibration to the
 * identity. Non-monotone-safe inversion is handled by `knotInverse` below.
 */
export const PRE_AUDIT_KNOTS: readonly [number, number][] = [
  [0.05, 0.060], [0.10, 0.114], [0.15, 0.168], [0.20, 0.224], [0.25, 0.278],
  [0.30, 0.324], [0.35, 0.382], [0.40, 0.436], [0.45, 0.489], [0.50, 0.542],
  [0.55, 0.595], [0.60, 0.648], [0.65, 0.692], [0.70, 0.730], [0.75, 0.765],
  [0.80, 0.800], [0.85, 0.828], [0.90, 0.855], [0.95, 0.930],
]

export interface AnchorEra {
  /** Stable identifier used in reports and fold labels. */
  id: string
  /** Inclusive lower bound on a row's CONTENT date; null = open-ended past. */
  from: Date | null
  /** Exclusive upper bound; null = current era. */
  to: Date | null
  /** The LEAGUE_ANCHOR this generation blended toward. Frozen, never derived. */
  anchor: number
  /** Null means the identity calibration (cal(raw) === raw). */
  knots: readonly [number, number][] | null
  /** Why the boundary exists — shown in reports so a verdict carries its caveat. */
  note: string
}

/** Commit 09baf70 — the audit reset to identity knots and a 0.516 anchor. */
export const AUDIT_FIX_AT = new Date("2026-06-09T22:20:23Z")

/**
 * When the 0.516 → 0.5056 league-rate re-estimation reached production.
 *
 * Override with `ANCHOR_RECAL_AT` (an ISO timestamp) if the deploy landed at a
 * different time than the commit — rows are dated by when the ENGINE wrote
 * them, not by when the code was authored. Getting this wrong shifts recovered
 * raw values by (1 − BLEND)(0.5056 − 0.516) / BLEND ≈ −0.0033 for the
 * mis-assigned rows, so `describeEraAssignment` prints the per-era counts for
 * exactly this reason: an implausible split is visible rather than silent.
 */
export const LEAGUE_RECAL_AT = new Date(
  process.env.ANCHOR_RECAL_AT ?? "2026-10-10T00:00:00Z"
)

/**
 * Ordered oldest → newest, contiguous, non-overlapping.
 *
 * PRE_AUDIT rows are recoverable but NOT commensurable with later ones: the
 * same commit also fixed the P0-1 shrinkage scale bug, which changes `raw`
 * itself. Inverting them correctly does not make them the same model.
 */
export const ANCHOR_ERAS: readonly AnchorEra[] = [
  {
    id: "PRE_AUDIT",
    from: null,
    to: AUDIT_FIX_AT,
    anchor: 0.559,
    knots: PRE_AUDIT_KNOTS,
    note: "pre-audit engine: non-identity knots, 0.559 anchor, and the P0-1 shrinkage scale bug — raw is recoverable but not commensurable with later eras",
  },
  {
    id: "POST_AUDIT",
    from: AUDIT_FIX_AT,
    to: LEAGUE_RECAL_AT,
    anchor: 0.516,
    knots: null,
    note: "identity knots, 0.516 anchor (fitted to a 2024-2025 window containing the 2024 outlier)",
  },
  {
    id: "POST_RECAL",
    from: LEAGUE_RECAL_AT,
    to: null,
    anchor: 0.5056,
    knots: null,
    note: "identity knots, 0.5056 anchor re-estimated from four complete seasons",
  },
]

/** The era in force now. Its `anchor` is pinned to LEAGUE_AVG_NRFI by a test. */
export const CURRENT_ERA: AnchorEra = ANCHOR_ERAS[ANCHOR_ERAS.length - 1]

/**
 * Which era wrote a row, by its CONTENT date.
 *
 * Pass `inputsPresence.recomputedAt` when present and `createdAt` otherwise —
 * a recompute rewrites the probability under the then-current pipeline, while a
 * row that was never recomputed still carries what was written at insert.
 */
export function eraForContentDate(contentDate: Date): AnchorEra {
  for (const era of ANCHOR_ERAS) {
    if (era.from !== null && contentDate < era.from) continue
    if (era.to !== null && contentDate >= era.to) continue
    return era
  }
  // Unreachable while the table stays contiguous and open at both ends; a test
  // pins that. Returning the oldest era is the conservative fallback.
  return ANCHOR_ERAS[0]
}

/** Inverse of a strictly increasing knot table. */
export function knotInverse(knots: readonly [number, number][], y: number): number {
  if (y <= knots[0][1]) return knots[0][0]
  const last = knots[knots.length - 1]
  if (y >= last[1]) return last[0]
  for (let i = 0; i < knots.length - 1; i++) {
    const [x0, y0] = knots[i]
    const [x1, y1] = knots[i + 1]
    if (y <= y1) return x0 + ((y - y0) / (y1 - y0)) * (x1 - x0)
  }
  return last[0]
}

/**
 * Recover the pre-anchor calibrated ensemble value from a stored final, using
 * the pipeline that actually wrote it.
 *
 * Exact wherever the clamp did not bind; a clamped row maps to the clamp
 * boundary's preimage and cannot be recovered better than that.
 */
export function invertFinalForEra(final: number, era: AnchorEra): number {
  const calibrated = (final - (1 - ENSEMBLE_BLEND) * era.anchor) / ENSEMBLE_BLEND
  return era.knots === null ? calibrated : knotInverse(era.knots, calibrated)
}

/**
 * Human-readable per-era row counts, for printing at the top of any report
 * built on these inversions. A split that disagrees with the deploy history is
 * the signal that `ANCHOR_RECAL_AT` needs setting.
 */
export function describeEraAssignment(counts: Map<string, number>): string {
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0)
  const lines = ANCHOR_ERAS.map((era) => {
    const n = counts.get(era.id) ?? 0
    const pct = total > 0 ? ((100 * n) / total).toFixed(1) : "0.0"
    const window =
      `${era.from?.toISOString().slice(0, 10) ?? "-inf"} .. ${era.to?.toISOString().slice(0, 10) ?? "now"}`
    return `  ${era.id.padEnd(11)} anchor=${era.anchor.toFixed(4)} ${window}  n=${n} (${pct}%)\n` +
           `              ${era.note}`
  })
  return `anchor-era assignment (total ${total} rows):\n${lines.join("\n")}`
}
