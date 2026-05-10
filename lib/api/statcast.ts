/**
 * Statcast adapter for DeepNRFI features.
 *
 * Reads from the `pitcher_statcast` and `batter_statcast` Postgres tables that
 * are populated nightly by `scripts/data/refresh_statcast.py` (pybaseball pull).
 * Returns null when no row exists for the given mlbamId — callers must impute
 * with league-average defaults.
 *
 * The shape stored in `payload Json` mirrors `StatcastPitcherSummary` /
 * `StatcastBatterSummary` exactly so we can pass it through without reshaping.
 */

import type { StatcastPitcherSummary } from "@/lib/types"
import { prisma } from "@/lib/prisma"

export interface StatcastBatterSummary {
  /** xwOBA over the rolling window. */
  xwoba: number
  /** Barrel rate over the rolling window (0-1). */
  barrel_pct: number
  /** Hard-hit rate (0-1). */
  hardhit_pct: number
  /** Average exit velocity (mph). */
  avg_ev: number
}

/**
 * Fetch the most recent Statcast summary for a pitcher.  Returns null when the
 * `pitcher_statcast` table is empty or missing for this player.  Tolerates a
 * missing table (returns null rather than throwing) so the engine still runs
 * before the schema migration is applied.
 */
export async function fetchStatcastPitcher(mlbamId: string): Promise<StatcastPitcherSummary | null> {
  if (!mlbamId) return null
  try {
    const client = prisma as unknown as {
      pitcherStatcast?: { findFirst: (args: unknown) => Promise<{ payload: StatcastPitcherSummary } | null> }
    }
    if (!client.pitcherStatcast) return null
    const row = await client.pitcherStatcast.findFirst({
      where: { mlbamId },
      orderBy: { date: "desc" },
    })
    return row?.payload ?? null
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[statcast] fetchStatcastPitcher unavailable:", (err as Error).message)
    }
    return null
  }
}

export async function fetchStatcastBatter(mlbamId: string): Promise<StatcastBatterSummary | null> {
  if (!mlbamId) return null
  try {
    const client = prisma as unknown as {
      batterStatcast?: { findFirst: (args: unknown) => Promise<{ payload: StatcastBatterSummary } | null> }
    }
    if (!client.batterStatcast) return null
    const row = await client.batterStatcast.findFirst({
      where: { mlbamId },
      orderBy: { date: "desc" },
    })
    return row?.payload ?? null
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[statcast] fetchStatcastBatter unavailable:", (err as Error).message)
    }
    return null
  }
}
