// lib/api/gated-predictions.ts
// Client-side fetcher for /api/predictions, shared by every surface that renders
// the tier-gated slate (home page, /grid, global search).
//
// Why this exists rather than a bare fetch(): the response body is tier-gated,
// so a cache anywhere between the browser and the route can hand a signed-in
// subscriber a payload that was generated for a signed-out visitor — the whole
// FREE paywall, shown to someone who paid. The server no longer emits
// shared-cacheable responses, but entries cached before that fix (or by an
// intermediary we don't control) can still be served. So when we are about to
// believe a FREE verdict for a signed-in user, we check it against the
// uncached subscription endpoint first.

import type { PredictionsPayload } from "@/lib/types"
import type { Tier } from "@/lib/tiers"

export type { PredictionsPayload } from "@/lib/types"

/** The tier could not be determined — distinct from a plain fetch failure. */
export class TierUnresolvedError extends Error {
  constructor() {
    super("tier_unresolved")
    this.name = "TierUnresolvedError"
  }
}

async function fetchPredictionsOnce(noStore: boolean): Promise<PredictionsPayload> {
  const res = await fetch("/api/predictions", noStore ? { cache: "no-store" } : undefined)
  const data = await res.json()
  if (res.status === 503 && data?.error === "tier_unresolved") throw new TierUnresolvedError()
  if (!res.ok) throw new Error(data?.error ?? `API returned ${res.status}`)
  return data as PredictionsPayload
}

/**
 * The authoritative tier for the current user.
 *
 * Throws TierUnresolvedError when the server explicitly reports it cannot
 * determine the tier — "unknown" must never collapse into "FREE", which is the
 * whole failure mode this module exists to prevent.
 *
 * Returns null only when the endpoint is unreachable (offline, aborted). That
 * is deliberately different: the payload we already hold came from a route that
 * refuses to answer when *it* can't resolve the tier, so its FREE verdict is
 * server-confirmed and worth keeping rather than replacing with an error screen
 * every time an auxiliary request blips.
 */
async function fetchAuthoritativeTier(): Promise<Tier | null> {
  let res: Response
  try {
    res = await fetch("/api/subscription/me", { cache: "no-store" })
  } catch {
    return null // unreachable — keep the server-confirmed payload
  }

  if (res.status === 503) throw new TierUnresolvedError()
  if (!res.ok) return null

  try {
    const info = await res.json()
    return (info?.tier as Tier) ?? null
  } catch {
    return null
  }
}

/**
 * Fetches the gated slate. When `isSignedIn` and the payload claims FREE, the
 * verdict is confirmed against /api/subscription/me and refetched uncached on
 * mismatch.
 *
 * Throws TierUnresolvedError when the tier couldn't be established — callers
 * must surface a retry rather than falling through to the paywall.
 */
export async function fetchGatedPredictions(
  { isSignedIn }: { isSignedIn: boolean } = { isSignedIn: false }
): Promise<PredictionsPayload> {
  const data = await fetchPredictionsOnce(false)

  if (!isSignedIn || (data.tier ?? "FREE") !== "FREE") return data

  const authoritative = await fetchAuthoritativeTier()
  if (!authoritative || authoritative === "FREE") return data

  // The payload disagrees with the subscription record — it's stale. Refetch
  // bypassing the browser cache.
  return fetchPredictionsOnce(true)
}
