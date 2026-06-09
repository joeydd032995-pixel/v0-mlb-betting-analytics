/**
 * POST /api/backtest   — Run a walk-forward backtest and persist to BacktestRun table.
 * GET  /api/backtest   — List recent BacktestRun records for the authenticated user.
 *
 * The POST handler:
 *   1. Reads all complete ModelPrediction rows for the requested season range.
 *   2. Joins each to its GameResult (via gamePk = parseInt(id)) for ground truth.
 *   3. Cross-checks ModelPrediction.actualResult against GameResult.nrfi and logs mismatches.
 *   4. Computes Brier, accuracy, ROI-Kelly, Sharpe, and max-drawdown using the same
 *      Kelly formula as the TypeScript production engine (lib/nrfi-engine.ts:kellyFraction).
 *   5. Upserts a BacktestRun row with status="done" and the full results JSON blob.
 *
 * Metrics are computed by lib/backtest-metrics.ts so they stay in sync with any
 * future changes to the production Kelly parameters.
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { computeBacktestMetrics, type BacktestRow } from "@/lib/backtest-metrics"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// ─── POST /api/backtest ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let seasonStart: number
  let seasonEnd: number
  try {
    const body = await request.json()
    seasonStart = parseInt(body?.seasonStart)
    seasonEnd   = parseInt(body?.seasonEnd ?? body?.seasonStart)
    if (!Number.isFinite(seasonStart) || !Number.isFinite(seasonEnd)) {
      return NextResponse.json(
        { error: "seasonStart and seasonEnd must be integers (e.g. 2025)" },
        { status: 400 }
      )
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Create a placeholder row so the caller can poll for status
  const run = await prisma.backtestRun.create({
    data: { userId, seasonStart, seasonEnd, status: "running" },
  })

  try {
    const predictions = await prisma.modelPrediction.findMany({
      where: {
        season:  { gte: seasonStart, lte: seasonEnd },
        status:  "complete",
        correct: { not: null },
      },
      select: {
        id:              true,
        date:            true,
        nrfiProbability: true,
        confidence:      true,
        actualResult:    true,
        nrfiOdds:        true,
        yrfiOdds:        true,
      },
      orderBy: { date: "asc" },
    })

    if (predictions.length === 0) {
      await prisma.backtestRun.update({
        where: { id: run.id },
        data:  { status: "done", totalGames: 0 },
      })
      return NextResponse.json({ ...run, status: "done", totalGames: 0 })
    }

    // Join to GameResult for canonical ground truth
    const gamePks: number[] = predictions
      .map((p) => parseInt(p.id))
      .filter((n): n is number => Number.isFinite(n) && n > 0)

    const gameResults = await prisma.gameResult.findMany({
      where:  { gamePk: { in: gamePks } },
      select: { gamePk: true, nrfi: true },
    })
    const grMap = new Map<number, boolean>(
      gameResults.map((r) => [r.gamePk, r.nrfi] as [number, boolean])
    )

    let mismatchCount = 0
    const rows: BacktestRow[] = []

    for (const p of predictions) {
      const gamePk = parseInt(p.id)
      const grNrfi = grMap.get(gamePk)
      if (grNrfi === undefined) continue  // no GameResult — skip (not an error, just not synced)

      // Cross-check: flag any divergence between ModelPrediction.actualResult and GameResult.nrfi
      const mpNrfi = p.actualResult === "NRFI"
      if (grNrfi !== mpNrfi) {
        mismatchCount++
        console.warn(
          `[/api/backtest] actualResult mismatch gamePk=${p.id}: ` +
          `ModelPrediction.actualResult=${p.actualResult} vs GameResult.nrfi=${grNrfi}`
        )
      }

      // Use GameResult as the canonical source of truth.  Stored odds (when
      // present) let each side be priced at its real line; rows without odds
      // fall back to a symmetric -110 inside computeBacktestMetrics.
      rows.push({
        nrfiProbability: p.nrfiProbability,
        actualNrfi:      grNrfi,
        confidence:      p.confidence,
        nrfiOdds:        p.nrfiOdds,
        yrfiOdds:        p.yrfiOdds,
      })
    }

    const metrics = computeBacktestMetrics(rows, true)

    const updated = await prisma.backtestRun.update({
      where: { id: run.id },
      data:  {
        status:      "done",
        totalGames:  metrics.n,
        brierScore:  metrics.brierScore,
        accuracy:    metrics.accuracy,
        roiKelly:    metrics.roiKelly,
        roiFlat:     metrics.roiFlat,
        sharpe:      metrics.sharpe,
        maxDrawdown: metrics.maxDrawdown,
        results:     { ...metrics, mismatchCount } as object,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    await prisma.backtestRun.update({
      where: { id: run.id },
      data:  { status: "error" },
    }).catch(() => { /* best-effort */ })
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/backtest POST]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── GET /api/backtest ────────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const runs = await prisma.backtestRun.findMany({
    where:   { userId },
    orderBy: { createdAt: "desc" },
    take:    20,
    select:  {
      id:          true,
      seasonStart: true,
      seasonEnd:   true,
      totalGames:  true,
      brierScore:  true,
      accuracy:    true,
      roiKelly:    true,
      roiFlat:     true,
      sharpe:      true,
      maxDrawdown: true,
      status:      true,
      createdAt:   true,
    },
  })

  return NextResponse.json({ runs })
}
