import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { resolveUserTierWithRetry } from "@/lib/subscription"
import { applyTierGating } from "@/lib/tier-gating"

// force-dynamic: tier-gated responses vary per user — cannot be edge-cached globally.
export const dynamic = "force-dynamic"
export const maxDuration = 300

// The response body embeds per-user state (tier, lockedCount, and predictions
// already field-stripped by applyTierGating). It must NEVER be stored in a
// shared cache: cookies are not part of a CDN cache key, so a `public` response
// generated for a signed-out visitor gets replayed to signed-in PRO/ELITE users,
// locking them out of the slate they paid for.
const CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())

  // Determine tier — FREE for unauthenticated requests. When the lookup itself
  // fails for a signed-in user we refuse to serve rather than silently
  // downgrading them to the FREE paywall.
  const { userId } = await auth()
  const { tier, resolved } = await resolveUserTierWithRetry(userId)
  if (!resolved) {
    return NextResponse.json(
      { error: "tier_unresolved", date: today },
      { status: 503, headers: CACHE_HEADERS }
    )
  }

  try {
    const { games, pitchers, teams } = await getLiveGameSlate(today)

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
        { headers: CACHE_HEADERS }
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
      { headers: CACHE_HEADERS }
    )
  } catch (err) {
    console.error("[/api/predictions]", err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: "Failed to generate predictions", date: today },
      { status: 500, headers: CACHE_HEADERS }
    )
  }
}
