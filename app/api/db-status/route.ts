import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Report which env vars are present (names only — never expose values)
  const vars = {
    DATABASE_URL:            !!process.env.DATABASE_URL,
    POSTGRES_URL_PGDATABASE: !!process.env.POSTGRES_URL_PGDATABASE,
    POSTGRES_PRISMA_URL:     !!process.env.POSTGRES_PRISMA_URL,
    POSTGRES_URL:            !!process.env.POSTGRES_URL,
  }
  const anyVarSet = Object.values(vars).some(Boolean)

  if (!anyVarSet) {
    return NextResponse.json({
      connected: false,
      error: "No database URL env var found. Set DATABASE_URL (or POSTGRES_URL) in Vercel → Settings → Environment Variables.",
      vars,
    })
  }

  try {
    // Lightweight connectivity check — doesn't touch app tables
    await prisma.$queryRaw`SELECT 1`
    const gameCount = await prisma.gameResult.count()

    // Statcast cache counts — confirms whether the backfill's rows are visible
    // to THIS database (the app's). 0 here while the Data Refresh Agent reported
    // success ⇒ the app and the backfill point at different databases.
    let pitcherStatcastCount: number | null = null
    let batterStatcastCount: number | null = null
    let samplePitcherIds: string[] = []
    try {
      const sc = prisma as unknown as {
        pitcherStatcast?: {
          count: () => Promise<number>
          findMany: (args: unknown) => Promise<Array<{ mlbamId: string }>>
        }
        batterStatcast?: { count: () => Promise<number> }
      }
      if (sc.pitcherStatcast) {
        pitcherStatcastCount = await sc.pitcherStatcast.count()
        const sample = await sc.pitcherStatcast.findMany({
          take: 3,
          select: { mlbamId: true },
          orderBy: { date: "desc" },
        })
        samplePitcherIds = sample.map((r) => r.mlbamId)
      }
      if (sc.batterStatcast) batterStatcastCount = await sc.batterStatcast.count()
    } catch {
      // Statcast tables may not exist yet — leave counts null.
    }

    return NextResponse.json({
      connected: true,
      gameCount,
      pitcherStatcastCount,
      batterStatcastCount,
      samplePitcherIds,
      vars,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ connected: false, error: message, vars }, { status: 500 })
  }
}
