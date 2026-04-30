/**
 * /api/bets
 *
 * GET  — list the authenticated user's bets (newest first)
 * POST — place a new bet; also creates an opening BankrollTransaction debit
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

export const dynamic = "force-dynamic"

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const bets = await prisma.bet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ bets })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

const PlaceBetSchema = z.object({
  gameId: z.string().min(1),
  amount: z.number().positive(),
  odds: z.number(),
  prediction: z.enum(["NRFI", "YRFI"]),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = PlaceBetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { gameId, amount, odds, prediction } = parsed.data

  // Ensure user row exists (graceful upsert — covers users who signed up before
  // the webhook was configured)
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: `${userId}@placeholder.local` },
    update: {},
  })

  // Get or create bankroll so we can record the debit
  const bankroll = await prisma.bankroll.upsert({
    where: { userId },
    create: { userId, startingBalance: 0, currentBalance: 0 },
    update: {},
  })

  const [bet] = await prisma.$transaction([
    prisma.bet.create({
      data: { userId, gameId, amount, odds, prediction },
    }),
    // Debit the wager from the bankroll
    prisma.bankroll.update({
      where: { userId },
      data: { currentBalance: { decrement: amount } },
    }),
  ])

  // Record the debit ledger entry (outside transaction — non-critical)
  await prisma.bankrollTransaction.create({
    data: {
      userId,
      type: "loss",          // treated as a pending debit; flipped to "win" on settle
      amount: -amount,
      balance: bankroll.currentBalance - amount,
      betId: bet.id,
      note: `Placed ${prediction} bet on game ${gameId}`,
    },
  }).catch((err) => console.error("[bets] Ledger entry failed:", err))

  return NextResponse.json({ bet }, { status: 201 })
}
