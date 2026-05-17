/**
 * MLB Stats /people lookups.  Batter handedness never changes for adults, so
 * we cache forever in-process.  The cache is intentionally module-scoped (not
 * a Map<Promise, ...> with deduping) — concurrent calls for the same id during
 * a slate build will trigger a few duplicate requests, which is cheaper than
 * the synchronisation cost.
 */

import type { Hand } from "@/lib/types"

interface PeopleResponse {
  people?: Array<{
    id: number
    batSide?: { code?: string }
  }>
}

const BASE = "https://statsapi.mlb.com/api/v1"

const handCache = new Map<string, Hand>()

function parseHand(code: string | undefined): Hand {
  if (code === "L" || code === "R" || code === "S") return code
  return "R"
}

/** Fetch a single batter's handedness from MLB Stats.  Returns "R" on failure. */
export async function fetchBatterHand(personId: string | number): Promise<Hand> {
  const key = String(personId)
  const cached = handCache.get(key)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(`${BASE}/people/${key}`, { next: { revalidate: 86400 } })
    if (!res.ok) {
      handCache.set(key, "R")
      return "R"
    }
    const data = (await res.json()) as PeopleResponse
    const hand = parseHand(data.people?.[0]?.batSide?.code)
    handCache.set(key, hand)
    return hand
  } catch {
    handCache.set(key, "R")
    return "R"
  }
}
