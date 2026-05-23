import { NextResponse } from "next/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"

// Cache at Vercel edge for 5 minutes — game slates don't change faster than this.
// Replaces force-dynamic which fired fresh upstream API calls on every page visit.
export const revalidate = 300
export const maxDuration = 30  // 30s is sufficient; 300s masked hung API calls

export async function GET() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
  try {
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

    return NextResponse.json(
      {
        predictions,
        games,
        pitchersById: Object.fromEntries(pitchers),
        teamsById: Object.fromEntries(teams),
        date: today,
        gameCount: games.length,
        noGames: false,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    )
  } catch (err) {
    console.error("[/api/predictions]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Failed to generate predictions", date: today }, { status: 500 })
  }
}
