/**
 * GET /api/weekly-recap
 *
 * Returns real, DB-backed weekly performance for the Weekly Recap page.
 *
 * The week shown is the Monday–Sunday window containing the most recent
 * completed-and-scored prediction, so it auto-advances as the historical sync
 * ingests new days (no more hardcoded April data, no manual navigation).
 *
 * Accuracy / ROI are computed with the same Kelly/flat machinery as the
 * backtester (lib/backtest-metrics.ts). ModelPrediction has no stored odds, so
 * ROI is the flat 1-unit @ -110 figure (roiFlat).
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { computeBacktestMetrics, type BacktestRow } from "@/lib/backtest-metrics"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const EMPTY = { hasData: false } as const

/** Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD calendar string, TZ-independent. */
function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

/** Add `days` to a YYYY-MM-DD string and return a YYYY-MM-DD string. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The 7 YYYY-MM-DD strings (Mon→Sun) of the week containing `date`. */
function weekOf(date: string): string[] {
  const dow = weekdayOf(date)
  const offsetToMonday = dow === 0 ? -6 : 1 - dow // Sunday rolls back to prior Monday
  const monday = addDays(date, offsetToMonday)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** "May 26 – Jun 1, 2026" style label for a Mon–Sun pair. */
function rangeLabel(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
  const year = end.slice(0, 4)
  return `${fmt(start)} – ${fmt(end)}, ${year}`
}

type WeekPred = {
  date: string
  prediction: string
  actualResult: string | null
  correct: boolean | null
  confidence: string
  nrfiProbability: number
  homeTeam: string
  awayTeam: string
}

/** Adapt a stored prediction row into the BacktestRow shape computeBacktestMetrics expects. */
const toRow = (p: WeekPred): BacktestRow => ({
  nrfiProbability: p.nrfiProbability,
  actualNrfi: p.actualResult === "NRFI",
  confidence: p.confidence,
})

/**
 * GET /api/weekly-recap — public, system-wide weekly performance for the most
 * recent week containing completed predictions (auto-advances over time).
 * Returns weekly + per-day accuracy/ROI, confidence-tier stats, highlights and
 * insights, or `{ hasData: false }` when no scored predictions exist.
 */
export async function GET() {
  // Public endpoint: /weekly-recap is an unauthenticated page (not in middleware's
  // protected matcher), so the recap shows system-wide shared predictions only.
  // Scope every query to userId: null to exclude users' private saved predictions —
  // this keeps the recap deterministic for all visitors and avoids cross-user leakage.
  try {
    // ── 1. Anchor on the latest completed, scored system prediction ─────────
    const latest = await prisma.modelPrediction.findFirst({
      where:   { userId: null, status: "complete", correct: { not: null } },
      orderBy: { date: "desc" },
      select:  { date: true },
    })
    if (!latest) return NextResponse.json(EMPTY)

    // ── 2. Derive the Mon–Sun window containing that date ───────────────────
    const days = weekOf(latest.date)
    const weekStart = days[0]
    const weekEnd = days[6]

    // ── 3. Pull the week's completed predictions ────────────────────────────
    const preds = (await prisma.modelPrediction.findMany({
      where: {
        userId: null,
        date:   { gte: weekStart, lte: weekEnd },
        status: "complete",
      },
      select: {
        date:            true,
        prediction:      true,
        actualResult:    true,
        correct:         true,
        confidence:      true,
        nrfiProbability: true,
        homeTeam:        true,
        awayTeam:        true,
      },
    })) as WeekPred[]

    const scored = preds.filter((p) => p.correct !== null)
    if (scored.length === 0) {
      // Anchor exists but the week has nothing scored (shouldn't happen, but be safe).
      return NextResponse.json(EMPTY)
    }

    // ── 4. Per-day breakdown (always 7 rows, Mon→Sun) ───────────────────────
    const daily = days.map((date, i) => {
      const rows = scored.filter((p) => p.date === date)
      const metrics = computeBacktestMetrics(rows.map(toRow))
      return {
        date,
        dayLabel:  DAY_LABELS[i],
        dateLabel: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
          month: "numeric",
          day:   "numeric",
          timeZone: "UTC",
        }),
        predictions: rows.length,
        accuracy:    metrics.accuracy,
        roi:         metrics.roiFlat,
      }
    })

    // ── 5. Week totals + by-confidence ──────────────────────────────────────
    const week = computeBacktestMetrics(scored.map(toRow))
    const confTier = (label: string) => {
      const c = week.byConfidence[label]
      return c ? { accuracy: c.accuracy, count: c.n } : null
    }
    const byConfidence = {
      High:   confTier("High"),
      Medium: confTier("Medium"),
      Low:    confTier("Low"),
    }

    // ── 6. Highlights & derived insights (all real) ─────────────────────────
    const correctRows = scored.filter((p) => p.correct)
    const nrfiActual = scored.filter((p) => p.actualResult === "NRFI").length
    const yrfiActual = scored.length - nrfiActual

    const matchup = (p: WeekPred) => `${p.awayTeam} @ ${p.homeTeam}`

    // Best day: highest accuracy among days with at least 3 predictions.
    const bestDay = [...daily]
      .filter((d) => d.predictions >= 3)
      .sort((a, b) => b.accuracy - a.accuracy)[0] ?? null

    // Top correct call: highest NRFI probability among correct NRFI picks.
    const topGame = [...correctRows]
      .filter((p) => p.prediction === "NRFI")
      .sort((a, b) => b.nrfiProbability - a.nrfiProbability)[0] ?? null

    // Highest-conviction correct call: max distance from a coin flip that hit.
    const topConviction = [...correctRows].sort(
      (a, b) => Math.abs(b.nrfiProbability - 0.5) - Math.abs(a.nrfiProbability - 0.5),
    )[0] ?? null

    return NextResponse.json({
      hasData:   true,
      weekStart,
      weekEnd,
      weekLabel: rangeLabel(weekStart, weekEnd),
      totals: {
        games:            scored.length,
        predictions:      scored.length,
        accuracy:         week.accuracy,
        roiFlat:          week.roiFlat,
        winRate:          week.accuracy, // binary outcome → win rate == accuracy
        highConfAccuracy: byConfidence.High?.accuracy ?? null,
      },
      daily,
      byConfidence,
      highlights: {
        bestDay: bestDay
          ? { dayLabel: bestDay.dayLabel, accuracy: bestDay.accuracy, roi: bestDay.roi }
          : null,
        topGame: topGame
          ? { matchup: matchup(topGame), nrfiProbability: topGame.nrfiProbability }
          : null,
        topConviction: topConviction
          ? {
              matchup:    matchup(topConviction),
              prediction: topConviction.prediction,
              // Report the predicted-side probability: a YRFI pick at nrfiProbability
              // 0.2 means 80% conviction on YRFI, not 20%.
              probability:
                topConviction.prediction === "YRFI"
                  ? 1 - topConviction.nrfiProbability
                  : topConviction.nrfiProbability,
            }
          : null,
      },
      insights: {
        nrfiActual,
        yrfiActual,
        nrfiRate: scored.length > 0 ? nrfiActual / scored.length : 0,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/weekly-recap]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
