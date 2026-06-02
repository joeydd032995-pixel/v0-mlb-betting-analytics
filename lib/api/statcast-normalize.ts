/**
 * Validation for Statcast pitcher payloads read from the `pitcher_statcast`
 * table.
 *
 * The `payload Json` column is untyped at the Prisma boundary, so a malformed
 * or partial row (a backfill that skipped a field, a NaN that slipped through)
 * must not reach the NRFI feature vector or the pitcher UI panels. This module
 * is pure (no prisma import) so it can be unit-tested without instantiating a
 * PrismaClient or needing DATABASE_URL.
 */

import type { StatcastPitcherSummary, StatcastPitchType } from "@/lib/types"

/** Length of the strike-zone whiff grid (5×5), enforced on read. */
const ZONE_WHIFF_CELLS = 25

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** Keep only well-formed pitch-type entries; returns undefined if none remain. */
function normalizePitchMix(value: unknown): StatcastPitchType[] | undefined {
  if (!Array.isArray(value)) return undefined
  const cleaned: StatcastPitchType[] = []
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue
    const e = entry as Record<string, unknown>
    if (typeof e.code === "string" && isFiniteNumber(e.usage) && isFiniteNumber(e.velocityMph)) {
      cleaned.push({ code: e.code, usage: e.usage, velocityMph: e.velocityMph })
    }
  }
  return cleaned.length > 0 ? cleaned : undefined
}

/** Accept the whiff grid only when it's exactly 25 finite cells. */
function normalizeZoneWhiff(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length !== ZONE_WHIFF_CELLS) return undefined
  if (!value.every(isFiniteNumber)) return undefined
  return value as number[]
}

/**
 * Coerce an untyped Statcast payload into a `StatcastPitcherSummary`, or return
 * null when the four core fields aren't all finite numbers. Optional release
 * fields are passed through only when finite; the rich `pitchMix`/`zoneWhiff`
 * fields are validated and omitted (never empty/malformed) when they don't pass.
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

  const pitchMix = normalizePitchMix(p.pitchMix)
  if (pitchMix) summary.pitchMix = pitchMix
  const zoneWhiff = normalizeZoneWhiff(p.zoneWhiff)
  if (zoneWhiff) summary.zoneWhiff = zoneWhiff

  return summary
}
