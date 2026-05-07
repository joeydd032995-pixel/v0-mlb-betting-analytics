/**
 * GET /api/dashboard-stats
 *
 * Returns all data needed by the dashboard intelligence cards in one round-trip:
 *   - Season NRFI accuracy  (prediction="NRFI", status="complete")
 *   - Season YRFI accuracy  (prediction="YRFI", status="complete")
 *   - Yesterday's best model for NRFI-actual games
 *   - Yesterday's best model for YRFI-actual games
 *   - Yesterday's results summary (correct/predicted counts per side)
 *   - Model ROI in units (−110 assumed, 1 unit per prediction)
 *   - Top 2 models ranked by overall accuracy (dynamic)
 *
 * Models evaluated: Poisson, ZIP, Markov, Ensemble (the 4 stored columns).
 * A model "predicts NRFI" when its probability >= 0.5.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getETDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d)
}

const MODEL_KEYS = ["Poisson", "ZIP", "Markov", "Ensemble"] as const
type ModelKey = typeof MODEL_KEYS[number]

type PredRow = {
  prediction:   string
  actualResult: string | null
  correct:      boolean | null
  poissonNrfi:  number
  zipNrfi:      number
  markovNrfi:   number
  ensembleNrfi: number
}

function getModelProb(row: {
  poissonNrfi: number
  zipNrfi: number
  markovNrfi: number
  ensembleNrfi: number
}, model: ModelKey): number {
  switch (model) {
    case "Poisson":  return row.poissonNrfi
    case "ZIP":      return row.zipNrfi
    case "Markov":   return row.markovNrfi
    case "Ensemble": return row.ensembleNrfi
  }
}

/** A model's prediction: NRFI if prob >= 0.5, else YRFI */
function modelCall(prob: number): "NRFI" | "YRFI" {
  return prob >= 0.5 ? "NRFI" : "YRFI"
}

interface ModelAccuracy {
  model: ModelKey
  correct: number
  total: number
  accuracy: number
}

function scoreModels(
  rows: Array<{
    poissonNrfi: number
    zipNrfi: number
    markovNrfi: number
    ensembleNrfi: number
    actualResult: string | null
  }>
): ModelAccuracy[] {
  const counts: Record<ModelKey, { correct: number; total: number }> = {
    Poisson:  { correct: 0, total: 0 },
    ZIP:      { correct: 0, total: 0 },
    Markov:   { correct: 0, total: 0 },
    Ensemble: { correct: 0, total: 0 },
  }
  for (const row of rows) {
    if (!row.actualResult) continue
    for (const m of MODEL_KEYS) {
      const prob = getModelProb(row, m)
      counts[m].total++
      if (modelCall(prob) === row.actualResult) counts[m].correct++
    }
  }
  return MODEL_KEYS.map((m) => ({
    model: m,
    correct: counts[m].correct,
    total:   counts[m].total,
    accuracy: counts[m].total > 0 ? counts[m].correct / counts[m].total : 0,
  })).sort((a, b) => b.accuracy - a.accuracy || a.model.localeCompare(b.model))
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const yesterday = getETDate(-1)

    // Fetch all completed predictions in parallel
    const [allCompleteRaw, yesterdayCompleteRaw] = await Promise.all([
      prisma.modelPrediction.findMany({
        where:  { status: "complete" },
        select: {
          prediction:   true,
          actualResult: true,
          correct:      true,
          poissonNrfi:  true,
          zipNrfi:      true,
          markovNrfi:   true,
          ensembleNrfi: true,
        },
      }),
      prisma.modelPrediction.findMany({
        where:  { status: "complete", date: yesterday },
        select: {
          prediction:   true,
          actualResult: true,
          correct:      true,
          poissonNrfi:  true,
          zipNrfi:      true,
          markovNrfi:   true,
          ensembleNrfi: true,
        },
      }),
    ])
    const allComplete       = allCompleteRaw       as PredRow[]
    const yesterdayComplete = yesterdayCompleteRaw as PredRow[]

    const withResult = allComplete.filter((p) => p.correct !== null)

    // ── Season NRFI accuracy ─────────────────────────────────────────────────
    const nrfiPreds  = withResult.filter((p) => p.prediction === "NRFI")
    const nrfiCorrect = nrfiPreds.filter((p) => p.correct).length
    const seasonNrfi = {
      total:    nrfiPreds.length,
      correct:  nrfiCorrect,
      accuracy: nrfiPreds.length > 0 ? nrfiCorrect / nrfiPreds.length : 0,
    }

    // ── Season YRFI accuracy ─────────────────────────────────────────────────
    const yrfiPreds   = withResult.filter((p) => p.prediction === "YRFI")
    const yrfiCorrect = yrfiPreds.filter((p) => p.correct).length
    const seasonYrfi = {
      total:    yrfiPreds.length,
      correct:  yrfiCorrect,
      accuracy: yrfiPreds.length > 0 ? yrfiCorrect / yrfiPreds.length : 0,
    }

    // ── Yesterday's best model per side ──────────────────────────────────────
    const yesterdayNrfiGames = yesterdayComplete.filter((p) => p.actualResult === "NRFI")
    const yesterdayYrfiGames = yesterdayComplete.filter((p) => p.actualResult === "YRFI")

    const bestNrfiModel: { model: ModelKey | null; accuracy: number } =
      yesterdayNrfiGames.length > 0
        ? (() => {
            const ranked = scoreModels(yesterdayNrfiGames)
            return { model: ranked[0].model, accuracy: ranked[0].accuracy }
          })()
        : { model: null, accuracy: 0 }

    const bestYrfiModel: { model: ModelKey | null; accuracy: number } =
      yesterdayYrfiGames.length > 0
        ? (() => {
            const ranked = scoreModels(yesterdayYrfiGames)
            return { model: ranked[0].model, accuracy: ranked[0].accuracy }
          })()
        : { model: null, accuracy: 0 }

    // ── Yesterday's results summary ──────────────────────────────────────────
    const yNrfiPredicted = yesterdayComplete.filter((p) => p.prediction === "NRFI")
    const yYrfiPredicted = yesterdayComplete.filter((p) => p.prediction === "YRFI")

    const yesterdayResults = {
      date:          yesterday,
      hasData:       yesterdayComplete.length > 0,
      nrfiPredicted: yNrfiPredicted.length,
      nrfiCorrect:   yNrfiPredicted.filter((p) => p.prediction === p.actualResult).length,
      yrfiPredicted: yYrfiPredicted.length,
      yrfiCorrect:   yYrfiPredicted.filter(
        (p) => p.prediction === p.actualResult
      ).length,
      totalPredicted: yesterdayComplete.length,
      totalCorrect:   yesterdayComplete.filter((p) => p.prediction === p.actualResult).length,
    }

    // ── Model ROI (unit-based, −110 assumed) ──────────────────────────────────
    // Win = +0.909 units (100/110), Loss = −1.0 unit
    const WIN_UNIT  =  100 / 110   // ≈ 0.9091
    const LOSS_UNIT = -1.0

    let totalUnits = 0
    let roiBets    = 0
    for (const p of withResult) {
      totalUnits += p.correct ? WIN_UNIT : LOSS_UNIT
      roiBets++
    }
    const modelRoi = {
      totalUnits: parseFloat(totalUnits.toFixed(2)),
      totalBets:  roiBets,
      roiPct:     roiBets > 0 ? parseFloat(((totalUnits / roiBets) * 100).toFixed(1)) : 0,
    }

    // ── Best overall models (top 2) ──────────────────────────────────────────
    const allRanked  = scoreModels(withResult)
    const topModels  = allRanked.slice(0, 2).map((m) => ({
      model:    m.model,
      accuracy: parseFloat((m.accuracy * 100).toFixed(1)),
      correct:  m.correct,
      total:    m.total,
    }))

    return NextResponse.json({
      hasData: withResult.length > 0,
      seasonNrfi,
      seasonYrfi,
      bestNrfiModel,
      bestYrfiModel,
      yesterdayResults,
      modelRoi,
      topModels,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/dashboard-stats]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
