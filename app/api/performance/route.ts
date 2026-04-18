/**
 * GET /api/performance
 *
 * Returns real accuracy and historical statistics computed from the database:
 *   - GameResult rows: actual first-inning NRFI/YRFI outcomes (ground truth)
 *   - ModelPrediction rows: model predictions matched against outcomes
 *
 * Used by the Insights → Performance tab.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // ── 1. Overall game result counts ──────────────────────────────────────
    const [totalGames, nrfiGames] = await Promise.all([
      prisma.gameResult.count(),
      prisma.gameResult.count({ where: { nrfi: true } }),
    ])

    if (totalGames === 0) {
      return NextResponse.json({
        hasData: false,
        totalGames: 0,
        nrfiRate: 0,
        totalPredictions: 0,
        accuracy: 0,
        byConfidence: { High: null, Medium: null, Low: null },
        perModel: null,
        monthly: [],
        syncStatus: { totalGames: 0, totalPredictions: 0, latestDate: null },
      })
    }

    // ── 2. Completed predictions ───────────────────────────────────────────
    const completePreds = await prisma.modelPrediction.findMany({
      where:  { status: "complete" },
      select: {
        date:            true,
        season:          true,
        confidence:      true,
        nrfiProbability: true,
        poissonNrfi:     true,
        zipNrfi:         true,
        markovNrfi:      true,
        ensembleNrfi:    true,
        prediction:      true,
        actualResult:    true,
        correct:         true,
        backtested:      true,
      },
    })

    const withResult = completePreds.filter((p) => p.correct !== null)

    // ── 3. Overall accuracy ────────────────────────────────────────────────
    const totalCorrect = withResult.filter((p) => p.correct).length
    const accuracy = withResult.length > 0 ? totalCorrect / withResult.length : 0

    // ── 4. By confidence level ─────────────────────────────────────────────
    const confGroup = (label: string) => {
      const s = withResult.filter((p) => p.confidence === label)
      const c = s.filter((p) => p.correct).length
      return s.length > 0
        ? { total: s.length, correct: c, accuracy: c / s.length }
        : null
    }
    const byConfidence = {
      High:   confGroup("High"),
      Medium: confGroup("Medium"),
      Low:    confGroup("Low"),
    }

    // ── 5. Per-model accuracy ──────────────────────────────────────────────
    function modelStats(getProb: (p: typeof withResult[0]) => number) {
      let correct = 0; let maeSum = 0
      for (const p of withResult) {
        const prob = getProb(p)
        if ((prob >= 0.5 ? "NRFI" : "YRFI") === p.actualResult) correct++
        maeSum += Math.abs(prob - (p.actualResult === "NRFI" ? 1 : 0))
      }
      return withResult.length > 0
        ? { accuracy: correct / withResult.length, mae: maeSum / withResult.length, total: withResult.length, correct }
        : null
    }
    const perModel = withResult.length > 0 ? {
      Poisson:  modelStats((p) => p.poissonNrfi),
      ZIP:      modelStats((p) => p.zipNrfi),
      Markov:   modelStats((p) => p.markovNrfi),
      Ensemble: modelStats((p) => p.ensembleNrfi),
    } : null

    // ── 6. Monthly breakdown ──────────────────────────────────────────────
    //    Pull all game results and bucket by YYYY-MM
    const allGameResults = await prisma.gameResult.findMany({
      select: { date: true, nrfi: true },
      orderBy: { date: "asc" },
    })

    const monthResultMap = new Map<string, { total: number; nrfi: number }>()
    for (const r of allGameResults) {
      const key = r.date.substring(0, 7)
      const m   = monthResultMap.get(key) ?? { total: 0, nrfi: 0 }
      m.total++
      if (r.nrfi) m.nrfi++
      monthResultMap.set(key, m)
    }

    const monthPredMap = new Map<string, { total: number; correct: number }>()
    for (const p of withResult) {
      const key = p.date.substring(0, 7)
      const m   = monthPredMap.get(key) ?? { total: 0, correct: 0 }
      m.total++
      if (p.correct) m.correct++
      monthPredMap.set(key, m)
    }

    const monthly = [...monthResultMap.entries()].sort().map(([key, data]) => {
      const pred = monthPredMap.get(key)
      const [yearStr, monthStr] = key.split("-")
      const label = new Date(
        parseInt(yearStr),
        parseInt(monthStr) - 1,
        1
      ).toLocaleDateString("en-US", { month: "short", year: "numeric" })

      return {
        key,
        label,
        totalGames:        data.total,
        nrfiGames:         data.nrfi,
        nrfiRate:          data.nrfi / data.total,
        predictions:       pred?.total       ?? 0,
        correctPredictions: pred?.correct    ?? 0,
        accuracy:          pred && pred.total > 0 ? pred.correct / pred.total : null,
      }
    })

    // ── 7. Sync status ─────────────────────────────────────────────────────
    const [latestResult, totalPredCount] = await Promise.all([
      prisma.gameResult.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.modelPrediction.count(),
    ])

    return NextResponse.json({
      hasData:          true,
      totalGames,
      nrfiGames,
      nrfiRate:         nrfiGames / totalGames,
      totalPredictions: withResult.length,
      totalCorrect,
      accuracy,
      byConfidence,
      perModel,
      monthly,
      syncStatus: {
        totalGames,
        totalPredictions: totalPredCount,
        latestDate:       latestResult?.date ?? null,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/performance]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
