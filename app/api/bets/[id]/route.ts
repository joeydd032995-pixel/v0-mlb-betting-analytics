/**
 * /api/bets/[id]
 *
 * PATCH  — settle a bet (set result + pnl); atomically updates bankroll and ledger
 * DELETE — remove a bet and surface any error when reversing the bankroll debit
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

export const dynamic = "force-dynamic"

// ─── PATCH (settle) ───────────────────────────────────────────────────────────

const SettleSchema = z.object({
  result: z.enum(["NRFI", "YRFI"]),
  pnl: z.number(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = SettleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { result, pnl } = parsed.data

  const existing = await prisma.bet.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (existing.result) return NextResponse.json({ error: "Bet already settled" }, { status: 409 })

  // On a win return the principal + profit; on a loss nothing is credited
  // (the wager was already debited at placement time).
  const returnAmount = pnl > 0 ? pnl + existing.amount : 0

  // Interactive transaction: settle bet, credit bankroll, and write ledger entry atomically.
  const bet = await prisma.$transaction(async (tx) => {
    const settled = await tx.bet.update({
      where: { id },
      data: { result, pnl },
    })

    const updatedBankroll = await tx.bankroll.upsert({
      where: { userId },
      create: { userId, startingBalance: 0, currentBalance: returnAmount },
      update: { currentBalance: { increment: returnAmount } },
    })

    await tx.bankrollTransaction.create({
      data: {
        userId,
        type: pnl > 0 ? "win" : "loss",
        amount: returnAmount,
        balance: updatedBankroll.currentBalance,
        betId: id,
        note: `Settled ${existing.prediction} bet: ${result} (P&L $${pnl.toFixed(2)})`,
      },
    })

    return settled
  })

  return NextResponse.json({ bet })
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const existing = await prisma.bet.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Atomically reverse the wager debit, write a compensating ledger entry,
  // and delete the bet in one transaction to prevent double-credits on retry.
  if (!existing.result) {
    try {
      await prisma.$transaction(async (tx) => {
        const updatedBankroll = await tx.bankroll.update({
          where: { userId },
          data: { currentBalance: { increment: existing.amount } },
        })

        await tx.bankrollTransaction.create({
          data: {
            userId,
            type: "refund",
            amount: existing.amount,
            balance: updatedBankroll.currentBalance,
            betId: id,
            note: `Cancelled ${existing.prediction} bet on game ${existing.gameId}`,
          },
        })

        await tx.bet.delete({ where: { id } })
      })
    } catch (err) {
      console.error("[bets] Failed to reverse bankroll debit on delete:", err)
      return NextResponse.json({ error: "Failed to reverse bankroll debit" }, { status: 500 })
    }
  } else {
    await prisma.bet.delete({ where: { id } })
  }

  return new NextResponse(null, { status: 204 })
}
