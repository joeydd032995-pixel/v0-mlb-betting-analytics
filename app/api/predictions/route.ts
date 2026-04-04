import { NextResponse } from "next/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0]
    const { games, pitchers, teams } = await getLiveGameSlate(today)
    const predictions = computeAllPredictions(games, pitchers, teams)

    return NextResponse.json({
      predictions,
      games,
      pitchersById: Object.fromEntries(pitchers),
      teamsById: Object.fromEntries(teams),
      date: today,
      gameCount: games.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/predictions]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
