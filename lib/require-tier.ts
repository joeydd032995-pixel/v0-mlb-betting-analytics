// lib/require-tier.ts
// Route guard for endpoints that serve tier-gated data.
// Server-only — imports Clerk + Prisma via lib/subscription.
//
// Use this instead of a bare auth() check on any route that returns PRO/ELITE
// data. A signed-in check alone lets a FREE account read paid output.

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { resolveUserTierWithRetry, type TierResolution } from "@/lib/subscription"
import { hasAccess, FEATURE_MIN_TIER, type Feature, type Tier } from "@/lib/tiers"

// Tier of the current request's user, for server components. Pages using this
// read cookies and therefore must be dynamic (`export const dynamic = "force-dynamic"`).
export async function getPageTier(): Promise<TierResolution> {
  const { userId } = await auth()
  return resolveUserTierWithRetry(userId)
}

export type TierGuardResult =
  | { ok: true; tier: Tier; userId: string }
  | { ok: false; response: NextResponse }

export async function requireFeature(feature: Feature): Promise<TierGuardResult> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { tier, resolved } = await resolveUserTierWithRetry(userId)
  // Failing closed here would lock a paying subscriber out of a feature they
  // bought, so say so explicitly and let the caller retry.
  if (!resolved) {
    return { ok: false, response: NextResponse.json({ error: "tier_unresolved" }, { status: 503 }) }
  }

  if (!hasAccess(tier, feature)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "upgrade_required", feature, requiredTier: FEATURE_MIN_TIER[feature], tier },
        { status: 403 }
      ),
    }
  }

  return { ok: true, tier, userId }
}
