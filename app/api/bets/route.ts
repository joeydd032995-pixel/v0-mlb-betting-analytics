/**
 * /api/bets
 *
 * GET  — list the authenticated user's bets (newest first)
 * POST — place a new bet; atomically debits bankroll and writes a ledger entry
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

  // Ensure user row exists (covers users who signed up before the webhook was configured)
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: `${userId}@placeholder.local` },
    update: {},
  })

  // Interactive transaction: bet creation, bankroll debit, and ledger entry are atomic.
  // Using tx.bankroll.update's return value for the post-debit balance avoids stale reads.
  const bet = await prisma.$transaction(async (tx) => {
    // Ensure bankroll row exists
    await tx.bankroll.upsert({
      where: { userId },
      create: { userId, startingBalance: 0, currentBalance: 0 },
      update: {},
    })

    const newBet = await tx.bet.create({
      data: { userId, gameId, amount, odds, prediction },
    })

    const updatedBankroll = await tx.bankroll.update({
      where: { userId },
      data: { currentBalance: { decrement: amount } },
    })

    await tx.bankrollTransaction.create({
      data: {
        userId,
        type: "wager",
        amount: -amount,
        balance: updatedBankroll.currentBalance,
        betId: newBet.id,
        note: `Placed ${prediction} bet on game ${gameId}`,
      },
    })

    return newBet
  })

  return NextResponse.json({ bet }, { status: 201 })
}
