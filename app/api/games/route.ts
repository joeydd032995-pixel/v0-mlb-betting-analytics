import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions, computeNRFIPrediction } from "@/lib/nrfi-engine"
import { getUserTier } from "@/lib/subscription"
import { applyTierGating } from "@/lib/tier-gating"

// force-dynamic: tier-gated responses vary per user — cannot be edge-cached globally.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { userId } = await auth()
  const tier = await getUserTier(userId)

  try {
    const { searchParams } = new URL(request.url)
    const gameId = searchParams.get("gameId")
    const date   = searchParams.get("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())

    const { games, pitchers, teams } = await getLiveGameSlate(date)

    if (gameId) {
      const game = games.find(g => g.id === gameId)
      if (!game) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 })
      }
      const prediction = computeNRFIPrediction(game, pitchers, teams)
      if (!prediction) {
        return NextResponse.json({ error: "Prediction unavailable for this game" }, { status: 422 })
      }
      // Gate the single-game response the same way as the list — otherwise a
      // caller could fetch full detail one gameId at a time to route around
      // the list-level tier gating below.
      const { gated } = applyTierGating([prediction], tier)
      return NextResponse.json({
        game,
        prediction: gated[0],
        pitchersById: Object.fromEntries(pitchers),
        teamsById:    Object.fromEntries(teams),
        date,
        tier,
      })
    }

    // Without gameId: return enriched game list with all predictions
    if (games.length === 0) {
      return NextResponse.json({
        predictions: [], games: [], pitchersById: {}, teamsById: {}, date, gameCount: 0, tier,
      })
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
    })
  } catch (err) {
    console.error("[/api/games]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Failed to load game data" }, { status: 500 })
  }
}
