// GET /api/subscription/me
// Returns the current user's subscription tier info.
// Used by client components that need tier awareness without a full page reload.

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getUserTierInfo } from "@/lib/subscription"
import { PRIVATE_NO_STORE_HEADERS as CACHE_HEADERS } from "@/lib/cache-headers"

export const dynamic = "force-dynamic"


export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json(
      {
        tier: "FREE",
        isActive: false,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
      { headers: CACHE_HEADERS }
    )
  }

  const info = await getUserTierInfo(userId)
  // Callers treat this endpoint as the authority on a user's tier — the home
  // page cross-checks a suspicious FREE against it. Answering "FREE" when we
  // simply could not reach the DB would launder a failure into a verdict.
  if (!info.resolved) {
    return NextResponse.json({ error: "tier_unresolved" }, { status: 503, headers: CACHE_HEADERS })
  }

  return NextResponse.json(info, { headers: CACHE_HEADERS })
}
