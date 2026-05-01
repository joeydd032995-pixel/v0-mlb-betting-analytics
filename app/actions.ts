"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import type { TrackedPrediction } from "@/lib/prediction-store"

// ─── Shared result type ────────────────────────────────────────────────────────

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const PlaceBetSchema = z.object({
  gameId:     z.string().min(1),
  amount:     z.number().positive(),
  odds:       z.number(),
  prediction: z.enum(["NRFI", "YRFI"]),
})

const SettleBetSchema = z.object({
  betId:  z.string().min(1),
  result: z.enum(["NRFI", "YRFI"]),
  pnl:    z.number(),
})

const AdjustBankrollSchema = z.object({
  amount: z.number(),
  type:   z.enum(["deposit", "withdrawal", "adjustment"]),
  note:   z.string().optional(),
})

const InitBankrollSchema = z.object({
  startingBalance: z.number().positive(),
})

// ─── Bets ─────────────────────────────────────────────────────────────────────

export async function placeBetAction(
  input: z.infer<typeof PlaceBetSchema>
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthorized" }

  const parsed = PlaceBetSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().formErrors.join(", ") }

  const { gameId, amount, odds, prediction } = parsed.data

  try {
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: `${userId}@placeholder.local` },
      update: {},
    })

    await prisma.$transaction(async (tx) => {
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
    })
  } catch (err) {
    console.error("[placeBetAction]", err)
    return { ok: false, error: "Failed to place bet" }
  }

  revalidatePath("/bets")
  revalidatePath("/bankroll")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function settleBetAction(
  input: z.infer<typeof SettleBetSchema>
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthorized" }

  const parsed = SettleBetSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().formErrors.join(", ") }

  const { betId, result, pnl } = parsed.data

  const existing = await prisma.bet.findUnique({ where: { id: betId } })
  if (!existing) return { ok: false, error: "Bet not found" }
  if (existing.userId !== userId) return { ok: false, error: "Forbidden" }
  if (existing.result) return { ok: false, error: "Bet already settled" }

  const returnAmount = pnl > 0 ? pnl + existing.amount : 0

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bet.update({ where: { id: betId }, data: { result, pnl } })

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
          betId,
          note: `Settled ${existing.prediction} bet: ${result} (P&L $${pnl.toFixed(2)})`,
        },
      })
    })
  } catch (err) {
    console.error("[settleBetAction]", err)
    return { ok: false, error: "Failed to settle bet" }
  }

  revalidatePath("/bets")
  revalidatePath("/bankroll")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function deleteBetAction(betId: string): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthorized" }

  const existing = await prisma.bet.findUnique({ where: { id: betId } })
  if (!existing) return { ok: false, error: "Bet not found" }
  if (existing.userId !== userId) return { ok: false, error: "Forbidden" }

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
            betId,
            note: `Cancelled ${existing.prediction} bet on game ${existing.gameId}`,
          },
        })

        await tx.bet.delete({ where: { id: betId } })
      })
    } catch (err) {
      console.error("[deleteBetAction] Failed to reverse bankroll debit:", err)
      return { ok: false, error: "Failed to reverse bankroll debit" }
    }
  } else {
    await prisma.bet.delete({ where: { id: betId } })
  }

  revalidatePath("/bets")
  revalidatePath("/bankroll")
  return { ok: true }
}

// ─── Bankroll ─────────────────────────────────────────────────────────────────

export async function initBankrollAction(
  input: z.infer<typeof InitBankrollSchema>
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthorized" }

  const parsed = InitBankrollSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().formErrors.join(", ") }

  const { startingBalance } = parsed.data

  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: `${userId}@placeholder.local` },
    update: {},
  })

  const existing = await prisma.bankroll.findUnique({ where: { userId } })
  if (existing) return { ok: false, error: "Bankroll already initialized" }

  await prisma.$transaction([
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

  revalidatePath("/bankroll")
  revalidatePath("/dashboard")
  redirect("/bankroll")
}

export async function adjustBankrollAction(
  input: z.infer<typeof AdjustBankrollSchema>
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthorized" }

  const parsed = AdjustBankrollSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.flatten().formErrors.join(", ") }

  const { amount, type, note } = parsed.data

  const exists = await prisma.bankroll.findUnique({ where: { userId } })
  if (!exists) return { ok: false, error: "Bankroll not initialized" }

  const delta = type === "withdrawal" ? -Math.abs(amount) : Math.abs(amount)

  try {
    await prisma.$transaction(async (tx) => {
      const bankroll = await tx.bankroll.update({
        where: { userId },
        data: { currentBalance: { increment: delta } },
      })

      await tx.bankrollTransaction.create({
        data: {
          userId,
          type,
          amount: delta,
          balance: bankroll.currentBalance,
          note: note ?? null,
        },
      })
    })
  } catch (err) {
    console.error("[adjustBankrollAction]", err)
    return { ok: false, error: "Failed to update bankroll" }
  }

  revalidatePath("/bankroll")
  revalidatePath("/dashboard")
  return { ok: true }
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export async function addWatchlistAction(gameId: string): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthorized" }
  if (!gameId) return { ok: false, error: "gameId is required" }

  try {
    await prisma.watchlistItem.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: { userId, gameId },
      update: {},
    })
  } catch (err) {
    console.error("[addWatchlistAction]", err)
    return { ok: false, error: "Failed to add to watchlist" }
  }

  revalidatePath("/watchlist")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function removeWatchlistAction(gameId: string): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthorized" }

  const { count } = await prisma.watchlistItem.deleteMany({
    where: { userId, gameId },
  })

  if (count === 0) return { ok: false, error: "Not found" }

  revalidatePath("/watchlist")
  revalidatePath("/dashboard")
  return { ok: true }
}

// ─── Predictions ──────────────────────────────────────────────────────────────

export async function savePredictionsToDBAction(
  predictions: TrackedPrediction[]
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthenticated" }
  if (!predictions.length) return { ok: true }

  const CHUNK = 25
  try {
    for (let i = 0; i < predictions.length; i += CHUNK) {
      const chunk = predictions.slice(i, i + CHUNK)
      await Promise.all(
        chunk.map((p) => {
          const season = parseInt(p.date.substring(0, 4), 10)
          const modelBreakdown = {
            logisticMetaNrfi:     p.logisticMetaNrfi,
            nnInteractionNrfi:    p.nnInteractionNrfi,
            hierarchicalBayesNrfi: p.hierarchicalBayesNrfi,
            homeZipOmega:         p.homeZipOmega,
            awayZipOmega:         p.awayZipOmega,
            homeBayesianWeight:   p.homeBayesianWeight,
            awayBayesianWeight:   p.awayBayesianWeight,
            modelInputs:          p.modelInputs,
          }
          return prisma.modelPrediction.upsert({
            where: { id: p.id },
            create: {
              id:             p.id,
              userId,
              date:           p.date,
              season,
              homeTeam:       p.homeTeam,
              awayTeam:       p.awayTeam,
              homePitcher:    p.homePitcher,
              awayPitcher:    p.awayPitcher,
              nrfiProbability: p.nrfiProbability,
              prediction:     p.prediction,
              confidence:     p.confidence,
              confidenceScore: p.confidenceScore,
              poissonNrfi:    p.poissonNrfi,
              zipNrfi:        p.zipNrfi,
              markovNrfi:     p.markovNrfi,
              ensembleNrfi:   p.ensembleNrfi,
              modelConsensus: p.modelConsensus,
              modelBreakdown,
              actualResult:   p.actualResult ?? null,
              correct:        p.correct ?? null,
              status:         p.status === "complete" ? "complete" : "pending",
            },
            update: {
              nrfiProbability: p.nrfiProbability,
              prediction:      p.prediction,
              confidence:      p.confidence,
              confidenceScore: p.confidenceScore,
              poissonNrfi:     p.poissonNrfi,
              zipNrfi:         p.zipNrfi,
              markovNrfi:      p.markovNrfi,
              ensembleNrfi:    p.ensembleNrfi,
              modelConsensus:  p.modelConsensus,
              modelBreakdown,
              actualResult:    p.actualResult ?? null,
              correct:         p.correct ?? null,
              status:          p.status === "complete" ? "complete" : "pending",
            },
          })
        })
      )
    }
  } catch (err) {
    console.error("[savePredictionsToDBAction]", err)
    return { ok: false, error: "Failed to save predictions" }
  }

  return { ok: true }
}

export async function recordResultAction(
  predictionId: string,
  homeRuns: number,
  awayRuns: number
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthorized" }

  const nrfi = homeRuns === 0 && awayRuns === 0
  const actualResult = nrfi ? "NRFI" : "YRFI"

  try {
    const existing = await prisma.modelPrediction.findFirst({
      where: { id: predictionId, userId },
    })
    if (!existing) return { ok: false, error: "Prediction not found in DB" }

    await prisma.modelPrediction.update({
      where: { id: predictionId },
      data: {
        actualResult,
        correct: existing.prediction === actualResult,
        status: "complete",
      },
    })
  } catch (err) {
    console.error("[recordResultAction]", err)
    return { ok: false, error: "Failed to record result" }
  }

  return { ok: true }
}

export async function deletePredictionAction(id: string): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "Unauthorized" }

  await prisma.modelPrediction.deleteMany({ where: { id, userId } })

  revalidatePath("/history")
  return { ok: true }
}
