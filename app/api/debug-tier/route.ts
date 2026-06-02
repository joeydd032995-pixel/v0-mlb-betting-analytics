import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getUserTier } from "@/lib/subscription"

export const dynamic = "force-dynamic"

// Diagnostic endpoint — gated behind the same DEBUG_SECRET / ENABLE_DEBUG_ENDPOINT
// checks used by /api/debug. Pass the token via: x-debug-token: <DEBUG_SECRET>
export async function GET(request: Request) {
  const debugToken = request.headers.get("x-debug-token")
  const isProduction = process.env.NODE_ENV === "production"
  const tokenValid = !!process.env.DEBUG_SECRET && debugToken === process.env.DEBUG_SECRET

  if (isProduction && (!process.env.ENABLE_DEBUG_ENDPOINT || !tokenValid)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!isProduction && !tokenValid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

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
