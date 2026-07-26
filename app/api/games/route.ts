import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { resolveUserTierWithRetry } from "@/lib/subscription"
import { applyTierGating } from "@/lib/tier-gating"
import { PRIVATE_NO_STORE_HEADERS as CACHE_HEADERS } from "@/lib/cache-headers"

// force-dynamic: tier-gated responses vary per user — cannot be edge-cached globally.
export const dynamic = "force-dynamic"
export const maxDuration = 300


export async function GET(request: Request) {
  const { userId } = await auth()
  const { tier, resolved } = await resolveUserTierWithRetry(userId)
  if (!resolved) {
    return NextResponse.json(
      { error: "tier_unresolved" },
      { status: 503, headers: CACHE_HEADERS }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const gameId = searchParams.get("gameId")
    const date   = searchParams.get("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())

    const { games, pitchers, teams } = await getLiveGameSlate(date)

    if (gameId) {
      const game = games.find(g => g.id === gameId)
      if (!game) {
        return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS })
      }
      // Gate against the FULL slate (not just this game) so a FREE caller can't
      // route around the "only the top pick is visible" rule by requesting each
      // gameId individually — applyTierGating's FREE ranking is only meaningful
      // when it sees every game to compare confidenceScore against.
      const rawPredictions = computeAllPredictions(games, pitchers, teams)
      const { gated } = applyTierGating(rawPredictions, tier)
      const matched = gated.find((p) => p.gameId === gameId)
      if (!matched) {
        return NextResponse.json({ error: "Prediction unavailable for this game" }, { status: 422, headers: CACHE_HEADERS })
      }
      return NextResponse.json({
        game,
        prediction: matched,
        pitchersById: Object.fromEntries(pitchers),
        teamsById:    Object.fromEntries(teams),
        date,
        tier,
      }, { headers: CACHE_HEADERS })
    }

    // Without gameId: return enriched game list with all predictions
    if (games.length === 0) {
      return NextResponse.json({
        predictions: [], games: [], pitchersById: {}, teamsById: {}, date, gameCount: 0, tier,
      }, { headers: CACHE_HEADERS })
    }

    const rawPredictions = computeAllPredictions(games, pitchers, teams)
    const { gated, lockedCount } = applyTierGating(rawPredictions, tier)

    return NextResponse.json({
      predictions: gated,
      games,
      pitchersById: Object.fromEntries(pitchers),
      teamsById:    Object.fromEntries(teams),
      date,
      gameCount: games.length,
      tier,
      lockedCount,
    }, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error("[/api/games]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Failed to load game data" }, { status: 500, headers: CACHE_HEADERS })
  }
}
