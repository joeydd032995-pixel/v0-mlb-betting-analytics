import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getUserTier } from "@/lib/subscription"

export const dynamic = "force-dynamic"

// Diagnostic endpoint — returns the resolved userId and tier for the current session.
// Safe to expose: only reveals the caller's own data.
export async function GET() {
  const { userId } = await auth()
  const tier = await getUserTier(userId)
  const adminRaw = process.env.ADMIN_USER_IDS ?? ""
  const adminIds = adminRaw.split(",").map((s) => s.trim()).filter(Boolean)

  return NextResponse.json({
    userId,
    tier,
    adminIdsPresent: adminIds.length,
    adminMatch: userId ? adminIds.includes(userId) : false,
  })
}
