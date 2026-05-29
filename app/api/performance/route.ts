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
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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
        nrfiGames: 0,
        yrfiGames: 0,
        nrfiRate: 0,
        yrfiRate: 0,
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
        deepNrfi:        true,
        ensembleVersion: true,
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

    // ── 3b. Baseline NRFI/YRFI rate for the same predicted-game population ──
    // Using withResult (not the broader GameResult table) so that NRFI Rate,
    // YRFI Rate, and Model Accuracy all share the same denominator and are
    // directly comparable on the stat cards.
    const nrfiInPredicted = withResult.filter((p) => p.actualResult === "NRFI").length
    const yrfiInPredicted = withResult.length - nrfiInPredicted

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
    // Only include predictions where the model probability is a valid non-zero
    // number.  Records backfilled before per-model columns existed can have
    // probability = 0, which would be silently classified as "YRFI" and corrupt
    // accuracy for all models sharing the same withResult denominator.
    function modelStats(getProb: (p: typeof withResult[0]) => number) {
      const validPreds = withResult.filter((p) => {
        const prob = getProb(p)
        return typeof prob === "number" && isFinite(prob) && prob > 0
      })
      if (validPreds.length === 0) return null
      let correct = 0; let maeSum = 0
      for (const p of validPreds) {
        const prob = getProb(p)
        if ((prob >= 0.5 ? "NRFI" : "YRFI") === p.actualResult) correct++
        maeSum += Math.abs(prob - (p.actualResult === "NRFI" ? 1 : 0))
      }
      return { accuracy: correct / validPreds.length, mae: maeSum / validPreds.length, total: validPreds.length, correct }
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

    const monthPredMap = new Map<string, { total: number; correct: number; backtested: number }>()
    for (const p of withResult) {
      const key = p.date.substring(0, 7)
      const m   = monthPredMap.get(key) ?? { total: 0, correct: 0, backtested: 0 }
      m.total++
      if (p.correct) m.correct++
      if (p.backtested) m.backtested++
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

      const yrfiGamesMonth = data.total - data.nrfi
      // backtestedFraction: fraction of this month's predictions that were backfilled
      // from historical-sync (which uses neutral weather, making accuracy ≈ nrfiRate).
      const backtestedFraction = pred && pred.total > 0 ? pred.backtested / pred.total : null
      return {
        key,
        label,
        totalGames:         data.total,
        nrfiGames:          data.nrfi,
        yrfiGames:          yrfiGamesMonth,
        nrfiRate:           data.nrfi / data.total,
        yrfiRate:           yrfiGamesMonth / data.total,
        predictions:        pred?.total       ?? 0,
        correctPredictions: pred?.correct     ?? 0,
        accuracy:           pred && pred.total > 0 ? pred.correct / pred.total : null,
        backtestedFraction,
      }
    })

    // ── 6b. By ensemble version (v1.7models vs v2.9models) ─────────────────
    function summariseGroup(pred: typeof withResult) {
      if (pred.length === 0) return null
      const correctCt = pred.filter((p) => p.correct).length
      const brierSum = pred.reduce((s, p) => {
        const actual = p.actualResult === "NRFI" ? 1 : 0
        return s + (p.nrfiProbability - actual) ** 2
      }, 0)
      return {
        total:    pred.length,
        correct:  correctCt,
        accuracy: correctCt / pred.length,
        brier:    brierSum / pred.length,
      }
    }

    const v1Preds = withResult.filter((p) => (p.ensembleVersion ?? "v1.7models") === "v1.7models")
    const v2Preds = withResult.filter((p) => p.ensembleVersion === "v2.9models")
    const byVersion = {
      v1: summariseGroup(v1Preds),
      v2: summariseGroup(v2Preds),
    }

    // ── 6c. By edge bucket (deviation from 0.5) ────────────────────────────
    // Without bookmaker odds we can't recover true edge after the fact, so we
    // bucket by |nrfiProbability − 0.5| as a proxy for model conviction.
    const edgeBuckets = [
      { key: "neutral", label: "≤ 2% from 50/50", lo: 0,    hi: 0.02 },
      { key: "small",   label: "2–5% from 50/50", lo: 0.02, hi: 0.05 },
      { key: "mid",     label: "5–8% from 50/50", lo: 0.05, hi: 0.08 },
      { key: "high",    label: "≥ 8% from 50/50", lo: 0.08, hi: 1 },
    ]
    const byEdgeBucket = edgeBuckets.map((b) => {
      const slice = withResult.filter((p) => {
        const d = Math.abs(p.nrfiProbability - 0.5)
        return d >= b.lo && d < b.hi
      })
      return { ...b, ...(summariseGroup(slice) ?? { total: 0, correct: 0, accuracy: 0, brier: 0 }) }
    })

    // ── 7. Sync status ─────────────────────────────────────────────────────
    const [latestResult, totalPredCount] = await Promise.all([
      prisma.gameResult.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.modelPrediction.count(),
    ])

    return NextResponse.json({
      hasData:          true,
      // totalGames here is the predicted-game count so all three top-level
      // stat cards (NRFI Rate, YRFI Rate, Model Accuracy) share the same denominator.
      totalGames:       withResult.length,
      nrfiGames:        nrfiInPredicted,
      yrfiGames:        yrfiInPredicted,
      nrfiRate:         withResult.length > 0 ? nrfiInPredicted / withResult.length : 0,
      yrfiRate:         withResult.length > 0 ? yrfiInPredicted / withResult.length : 0,
      totalPredictions: withResult.length,
      totalCorrect,
      accuracy,
      byConfidence,
      perModel,
      monthly,
      byVersion,
      byEdgeBucket,
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
