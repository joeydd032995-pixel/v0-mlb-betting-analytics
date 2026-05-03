import { NextResponse } from "next/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
    const { games, pitchers, teams } = await getLiveGameSlate(today)

    if (games.length === 0) {
      return NextResponse.json({
        predictions: [],
        games: [],
        pitchersById: {},
        teamsById: {},
        date: today,
        gameCount: 0,
        noGames: true,
      })
    }

    const predictions = computeAllPredictions(games, pitchers, teams)

    return NextResponse.json({
      predictions,
      games,
      pitchersById: Object.fromEntries(pitchers),
      teamsById: Object.fromEntries(teams),
      date: today,
      gameCount: games.length,
      noGames: false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/predictions]", message)
    return NextResponse.json({ error: message, date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()) }, { status: 500 })
  }
}
