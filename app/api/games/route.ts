import { NextResponse } from "next/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions, computeNRFIPrediction } from "@/lib/nrfi-engine"

export const revalidate = 300 // 5-minute cache

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gameId = searchParams.get("gameId")
    const date   = searchParams.get("date") ?? new Date().toISOString().split("T")[0]

    const { games, pitchers, teams } = await getLiveGameSlate(date)

    if (gameId) {
      const game = games.find(g => g.id === gameId)
      if (!game) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 })
      }
      const prediction = computeNRFIPrediction(game, pitchers, teams)
      return NextResponse.json({
        game,
        prediction,
        pitchersById: Object.fromEntries(pitchers),
        teamsById:    Object.fromEntries(teams),
        date,
      })
    }

    // Without gameId: return enriched game list with all predictions
    if (games.length === 0) {
      return NextResponse.json({
        predictions: [], games: [], pitchersById: {}, teamsById: {}, date, gameCount: 0,
      })
    }

    const predictions = computeAllPredictions(games, pitchers, teams)
    return NextResponse.json({
      predictions,
      games,
      pitchersById: Object.fromEntries(pitchers),
      teamsById:    Object.fromEntries(teams),
      date,
      gameCount: games.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/games]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
