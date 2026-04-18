/**
 * GET /api/export-data
 *
 * Exports all historical NRFI/YRFI data as a CSV download.
 * Combines GameResult (actual outcomes) and ModelPrediction (model calls)
 * joined on gamePk so each row has both ground truth and model output.
 *
 * CSV columns:
 *   date, season, homeTeam, awayTeam, homePitcher, awayPitcher,
 *   homeRuns1st, awayRuns1st, nrfi,
 *   modelPrediction, modelNrfiPct, confidence, confidenceScore,
 *   poissonNrfi, zipNrfi, markovNrfi, ensembleNrfi,
 *   correct, backtested
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ""
  const s = String(v)
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function row(fields: unknown[]): string {
  return fields.map(csvEscape).join(",")
}

export async function GET() {
  try {
    const [gameResults, predictions] = await Promise.all([
      prisma.gameResult.findMany({
        orderBy: [{ date: "asc" }],
        select: {
          gamePk:   true,
          date:     true,
          season:   true,
          homeTeam: true,
          awayTeam: true,
          homeRuns: true,
          awayRuns: true,
          nrfi:     true,
        },
      }),
      prisma.modelPrediction.findMany({
        select: {
          id:              true,   // matches gamePk as string
          homePitcher:     true,
          awayPitcher:     true,
          prediction:      true,
          nrfiProbability: true,
          confidence:      true,
          confidenceScore: true,
          poissonNrfi:     true,
          zipNrfi:         true,
          markovNrfi:      true,
          ensembleNrfi:    true,
          correct:         true,
          backtested:      true,
        },
      }),
    ])

    // Build lookup map: gamePk → prediction
    const predMap = new Map(predictions.map((p) => [p.id, p]))

    const header = row([
      "date", "season", "homeTeam", "awayTeam",
      "homePitcher", "awayPitcher",
      "homeRuns1st", "awayRuns1st", "nrfi",
      "modelPrediction", "modelNrfiPct", "confidence", "confidenceScore",
      "poissonNrfi", "zipNrfi", "markovNrfi", "ensembleNrfi",
      "correct", "backtested",
    ])

    const lines = gameResults.map((g) => {
      const p = predMap.get(String(g.gamePk))
      return row([
        g.date,
        g.season,
        g.homeTeam,
        g.awayTeam,
        p?.homePitcher ?? "",
        p?.awayPitcher ?? "",
        g.homeRuns,
        g.awayRuns,
        g.nrfi ? "NRFI" : "YRFI",
        p?.prediction   ?? "",
        p ? (p.nrfiProbability * 100).toFixed(2) : "",
        p?.confidence   ?? "",
        p ? p.confidenceScore.toFixed(1) : "",
        p ? (p.poissonNrfi  * 100).toFixed(2) : "",
        p ? (p.zipNrfi      * 100).toFixed(2) : "",
        p ? (p.markovNrfi   * 100).toFixed(2) : "",
        p ? (p.ensembleNrfi * 100).toFixed(2) : "",
        p?.correct   === true  ? "true"
          : p?.correct === false ? "false"
          : "",
        p?.backtested ? "true" : "false",
      ])
    })

    const csv = [header, ...lines].join("\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nrfi-data-${new Date().toISOString().split("T")[0]}.csv"`,
        "Cache-Control":       "no-store",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/export-data]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
