/**
 * Validation for Statcast payloads read from the `pitcher_statcast` table.
 *
 * The `payload Json` column is untyped at the Prisma boundary, so a malformed
 * or partial row (e.g. a backfill that skipped spin rate) must not reach the
 * DeepNRFI feature vector — an injected NaN/undefined would silently poison
 * every Statcast-derived feature.  This module is pure (no prisma import) so it
 * can be unit-tested without instantiating a PrismaClient or needing
 * DATABASE_URL.
 */

import type { StatcastPitcherSummary } from "@/lib/types"

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Coerce an untyped Statcast payload into a `StatcastPitcherSummary`, or return
 * null when the four core fields aren't all finite numbers.  Optional release
 * fields are passed through only when finite, and unknown keys are dropped.
 */
export function normalizeStatcastPitcher(payload: unknown): StatcastPitcherSummary | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null
  }

  const p = payload as Record<string, unknown>
  if (
    !isFiniteNumber(p.fbVeloAvg) ||
    !isFiniteNumber(p.fbSpinAvg) ||
    !isFiniteNumber(p.breaking_pct) ||
    !isFiniteNumber(p.stuffPlus)
  ) {
    return null
  }

  const summary: StatcastPitcherSummary = {
    fbVeloAvg: p.fbVeloAvg,
    fbSpinAvg: p.fbSpinAvg,
    breaking_pct: p.breaking_pct,
    stuffPlus: p.stuffPlus,
  }
  if (isFiniteNumber(p.releaseHeight)) summary.releaseHeight = p.releaseHeight
  if (isFiniteNumber(p.releaseSide)) summary.releaseSide = p.releaseSide

  return summary
}
