import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
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
    return NextResponse.json({ connected: true, gameCount, vars })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ connected: false, error: message, vars }, { status: 500 })
  }
}
