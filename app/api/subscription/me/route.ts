// GET /api/subscription/me
// Returns the current user's subscription tier info.
// Used by client components that need tier awareness without a full page reload.

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getUserTierInfo } from "@/lib/subscription"

export const dynamic = "force-dynamic"

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({
      tier: "FREE",
      isActive: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    })
  }

  const info = await getUserTierInfo(userId)
  return NextResponse.json(info)
}
