/**
 * Umpire profile lookup.
 *
 * Phase 1 ships an empty static cache.  A future agent (Phase 6) will scrape
 * historical umpire data into a JSON blob keyed by MLB umpire ID.  All callers
 * must tolerate missing entries — the default profile is league-neutral.
 */

import { LEAGUE_AVG_NRFI } from "../nrfi-models"

export interface UmpireProfile {
  /** Zone-tightness score in [-1, 1].  +1 = very tight strike zone, −1 = very wide. */
  zoneTightness: number
  /** Career NRFI rate when this umpire is behind the plate (0-1). */
  careerNrfi: number
  /** Number of games in the sample (0 = no data). */
  sample: number
}

const NEUTRAL_PROFILE: UmpireProfile = {
  zoneTightness: 0,
  careerNrfi: LEAGUE_AVG_NRFI,
  sample: 0,
}

/**
 * Static umpire-profile cache.  Populated by `scripts/data/refresh_umpires.ts`
 * (deferred to Phase 6).  Until then this is empty and every lookup returns the
 * neutral profile.
 */
const UMPIRE_PROFILES: Record<string, UmpireProfile> = {}

export function getUmpireProfile(umpId: string | undefined): UmpireProfile {
  if (!umpId) return NEUTRAL_PROFILE
  return UMPIRE_PROFILES[umpId] ?? NEUTRAL_PROFILE
}
