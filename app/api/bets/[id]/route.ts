/**
 * /api/bets/[id]
 *
 * PATCH  — settle a bet (set result + pnl); updates bankroll and ledger
 * DELETE — remove a bet and reverse any bankroll debit
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

  const bankroll = await prisma.bankroll.findUnique({ where: { userId } })
  const currentBalance = bankroll?.currentBalance ?? 0

  const [bet] = await prisma.$transaction([
    prisma.bet.update({
      where: { id },
      data: { result, pnl },
    }),
    prisma.bankroll.upsert({
      where: { userId },
      create: { userId, startingBalance: 0, currentBalance: pnl },
      update: { currentBalance: { increment: pnl > 0 ? pnl + existing.amount : 0 } },
    }),
  ])

  // Credit/loss ledger entry
  await prisma.bankrollTransaction.create({
    data: {
      userId,
      type: pnl > 0 ? "win" : "loss",
      amount: pnl > 0 ? pnl + existing.amount : 0,  // return principal + profit on win
      balance: currentBalance + (pnl > 0 ? pnl + existing.amount : 0),
      betId: id,
      note: `Settled ${existing.prediction} bet: ${result} (P&L $${pnl.toFixed(2)})`,
    },
  }).catch((err) => console.error("[bets] Settle ledger entry failed:", err))

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

  // If the bet is still pending, reverse the debit on the bankroll
  if (!existing.result) {
    await prisma.bankroll.update({
      where: { userId },
      data: { currentBalance: { increment: existing.amount } },
    }).catch(() => {})
  }

  await prisma.bet.delete({ where: { id } })

  return new NextResponse(null, { status: 204 })
}
