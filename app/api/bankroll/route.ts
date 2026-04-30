/**
 * /api/bankroll
 *
 * GET   — return the authenticated user's bankroll (null if not yet initialized)
 * POST  — initialize bankroll with a starting balance
 * PATCH — update the current balance (used for manual deposits/withdrawals)
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

  const bankroll = await prisma.bankroll.findUnique({ where: { userId } })
  return NextResponse.json({ bankroll })
}

// ─── POST (initialize) ────────────────────────────────────────────────────────

const InitSchema = z.object({
  startingBalance: z.number().positive(),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = InitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { startingBalance } = parsed.data

  // Ensure user row exists
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: `${userId}@placeholder.local` },
    update: {},
  })

  const existing = await prisma.bankroll.findUnique({ where: { userId } })
  if (existing) {
    return NextResponse.json({ error: "Bankroll already initialized" }, { status: 409 })
  }

  const [bankroll] = await prisma.$transaction([
    prisma.bankroll.create({
      data: { userId, startingBalance, currentBalance: startingBalance },
    }),
    prisma.bankrollTransaction.create({
      data: {
        userId,
        type: "deposit",
        amount: startingBalance,
        balance: startingBalance,
        note: "Initial bankroll deposit",
      },
    }),
  ])

  return NextResponse.json({ bankroll }, { status: 201 })
}

// ─── PATCH (deposit / withdrawal) ─────────────────────────────────────────────

const AdjustSchema = z.object({
  amount: z.number(),
  type: z.enum(["deposit", "withdrawal", "adjustment"]),
  note: z.string().optional(),
})

export async function PATCH(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = AdjustSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { amount, type, note } = parsed.data

  const bankroll = await prisma.bankroll.findUnique({ where: { userId } })
  if (!bankroll) return NextResponse.json({ error: "Bankroll not initialized" }, { status: 404 })

  const delta = type === "withdrawal" ? -Math.abs(amount) : Math.abs(amount)
  const newBalance = bankroll.currentBalance + delta

  const [updated] = await prisma.$transaction([
    prisma.bankroll.update({
      where: { userId },
      data: { currentBalance: newBalance },
    }),
    prisma.bankrollTransaction.create({
      data: {
        userId,
        type,
        amount: delta,
        balance: newBalance,
        note: note ?? null,
      },
    }),
  ])

  return NextResponse.json({ bankroll: updated })
}
