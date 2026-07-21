import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { getUserTier } from "@/lib/subscription"
import { applyTierGating } from "@/lib/tier-gating"

// force-dynamic: tier-gated responses vary per user — cannot be edge-cached globally.
export const dynamic = "force-dynamic"
export const maxDuration = 300

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())

  // Determine tier — gracefully falls back to FREE for unauthenticated requests.
  const { userId } = await auth()
  const tier = await getUserTier(userId)
  const isAuthenticated = !!userId

  try {
    const { games, pitchers, teams } = await getLiveGameSlate(today)

    const cacheHeaders = isAuthenticated
      ? { "Cache-Control": "private, no-store" }
      : { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" }

    if (games.length === 0) {
      return NextResponse.json(
        {
          predictions: [],
          games: [],
          pitchersById: {},
          teamsById: {},
          date: today,
          gameCount: 0,
          noGames: true,
          tier,
          lockedCount: 0,
        },
        { headers: cacheHeaders }
      )
    }

    const rawPredictions = computeAllPredictions(games, pitchers, teams)
    const { gated, lockedCount } = applyTierGating(rawPredictions, tier)

    // Only include game/pitcher/team map entries for games visible to this tier.
    // Ghost locked-card entries (only contain gameId) don't need full game objects.
    const visibleGameIds = new Set(
      gated.filter((p) => !(p as { _tierLocked?: boolean })._tierLocked).map((p) => p.gameId)
    )
    const visibleGames = games.filter((g) => visibleGameIds.has(g.id))

    return NextResponse.json(
      {
        predictions: gated,
        games: visibleGames,
        pitchersById: Object.fromEntries(pitchers),
        teamsById: Object.fromEntries(teams),
        date: today,
        gameCount: games.length,
        noGames: false,
        tier,
        lockedCount,
      },
      { headers: cacheHeaders }
    )
  } catch (err) {
    console.error("[/api/predictions]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Failed to generate predictions", date: today }, { status: 500 })
  }
}
