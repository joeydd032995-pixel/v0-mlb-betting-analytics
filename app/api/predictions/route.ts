import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { getUserTier, type Tier } from "@/lib/subscription"
import type { NRFIPrediction } from "@/lib/types"

// force-dynamic: tier-gated responses vary per user — cannot be edge-cached globally.
export const dynamic = "force-dynamic"
export const maxDuration = 30

// ── Tier-based field stripping ────────────────────────────────────────────────

// For the FREE teaser we expose the NRFI probability + basic matchup context but
// strip every actionable signal (recommendation, confidence, value analysis, etc.)
// so the raw fetch never leaks data that should only be visible to paying users.
type TeaseFields = Pick<
  NRFIPrediction,
  "gameId" | "nrfiProbability" | "yrfiProbability" | "calibratedNrfiPct" |
  "homeExpectedRuns" | "awayExpectedRuns" | "homeScores0Prob" | "awayScores0Prob"
> & { _tierLocked: boolean }

function buildFreeTeaser(pred: NRFIPrediction): TeaseFields {
  return {
    gameId: pred.gameId,
    nrfiProbability: pred.nrfiProbability,
    yrfiProbability: pred.yrfiProbability,
    calibratedNrfiPct: pred.calibratedNrfiPct,
    homeExpectedRuns: pred.homeExpectedRuns,
    awayExpectedRuns: pred.awayExpectedRuns,
    homeScores0Prob: pred.homeScores0Prob,
    awayScores0Prob: pred.awayScores0Prob,
    _tierLocked: false,
  }
}

// PRO strips the ELITE-only fields so the model breakdown tab stays locked.
function buildProPrediction(pred: NRFIPrediction): Omit<NRFIPrediction, "modelBreakdown" | "deepNrfi" | "monteCarlo" | "ensembleWeights"> & { _tierLocked: boolean } {
  const { modelBreakdown: _mb, deepNrfi: _dn, monteCarlo: _mc, ensembleWeights: _ew, ...rest } = pred
  void _mb; void _dn; void _mc; void _ew
  return { ...rest, _tierLocked: false }
}

function applyTierGating(predictions: NRFIPrediction[], tier: Tier) {
  // Sort by confidenceScore descending so the highest-confidence game is always first
  const sorted = [...predictions].sort((a, b) => b.confidenceScore - a.confidenceScore)

  if (tier === "FREE") {
    const [top, ...rest] = sorted
    if (!top) return { gated: [], lockedCount: 0 }

    // The single visible teaser card
    const teaser = buildFreeTeaser(top)

    // Ghost placeholders: send just gameId + _tierLocked flag so the frontend can
    // render blurred placeholder cards without exposing prediction data.
    const ghosts = rest.map((p) => ({ gameId: p.gameId, _tierLocked: true as const }))

    return {
      gated: [teaser, ...ghosts],
      lockedCount: rest.length,
    }
  }

  if (tier === "PRO") {
    return {
      gated: sorted.map(buildProPrediction),
      lockedCount: 0,
    }
  }

  // ELITE — full data, no stripping
  return {
    gated: sorted.map((p) => ({ ...p, _tierLocked: false as const })),
    lockedCount: 0,
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())

  // Determine tier — gracefully falls back to FREE for unauthenticated requests.
  const { userId } = await auth()
  const tier = await getUserTier(userId)
  const isAuthenticated = !!userId

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
        tier,
        lockedCount: 0,
      })
    }

    const rawPredictions = computeAllPredictions(games, pitchers, teams)
    const { gated, lockedCount } = applyTierGating(rawPredictions, tier)

    // Only include game/pitcher/team map entries for games visible to this tier.
    // Ghost locked-card entries (only contain gameId) don't need full game objects.
    const visibleGameIds = new Set(
      gated.filter((p) => !(p as { _tierLocked?: boolean })._tierLocked).map((p) => p.gameId)
    )
    const visibleGames = games.filter((g) => visibleGameIds.has(g.id))

    const cacheHeaders = isAuthenticated
      ? { "Cache-Control": "private, no-store" }
      : { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" }

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
