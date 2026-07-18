/**
 * GET /api/export-data?model=all|poisson|zip|markov|mapre|logistic_meta|nn_interaction|hierarchical_bayes|ensemble
 *
 * Exports historical NRFI/YRFI data as a CSV download.
 * Combines GameResult (actual outcomes) and ModelPrediction (model calls)
 * joined on gamePk so each row has both ground truth and model output.
 *
 * `model=all` (default) CSV columns:
 *   date, season, homeTeam, awayTeam, homePitcher, awayPitcher,
 *   homeRuns1st, awayRuns1st, nrfi,
 *   modelPrediction, modelNrfiPct, confidence, confidenceScore,
 *   poissonNrfi, zipNrfi, markovNrfi, mapreNrfi, logisticMetaNrfi,
 *   nnInteractionNrfi, hierarchicalBayesNrfi, ensembleNrfi,
 *   correct, backtested
 *
 * `model=<single model>` scopes the CSV to that single model's probability
 * column plus a `modelCorrect` column computed from that model's own
 * P(NRFI) vs the 0.5 threshold (independent of the headline
 * `prediction`/`correct` fields, which reflect the blended ensemble call).
 * mapre/logistic_meta/nn_interaction/hierarchical_bayes are nullable —
 * absent on rows written before these columns existed.
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MODEL_KEYS = [
  "poisson", "zip", "markov", "mapre",
  "logistic_meta", "nn_interaction", "hierarchical_bayes", "ensemble",
] as const
type ModelKey = (typeof MODEL_KEYS)[number]

const MODEL_COLUMN = {
  poisson:            "poissonNrfi",
  zip:                "zipNrfi",
  markov:             "markovNrfi",
  mapre:              "mapreNrfi",
  logistic_meta:      "logisticMetaNrfi",
  nn_interaction:     "nnInteractionNrfi",
  hierarchical_bayes: "hierarchicalBayesNrfi",
  ensemble:           "ensembleNrfi",
} as const satisfies Record<ModelKey, string>

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

function pct(v: number | null | undefined): string {
  return typeof v === "number" ? (v * 100).toFixed(2) : ""
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const modelParam = new URL(request.url).searchParams.get("model")
  const model: ModelKey | "all" =
    modelParam && (MODEL_KEYS as readonly string[]).includes(modelParam) ? (modelParam as ModelKey) : "all"

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
          mapreNrfi:              true,
          logisticMetaNrfi:       true,
          nnInteractionNrfi:      true,
          hierarchicalBayesNrfi:  true,
          ensembleNrfi:    true,
          correct:         true,
          backtested:      true,
        },
      }),
    ])

    // Build lookup map: gamePk → prediction
    const predMap = new Map(predictions.map((p) => [p.id, p]))

    let header: string
    let lines: string[]

    if (model === "all") {
      header = row([
        "date", "season", "homeTeam", "awayTeam",
        "homePitcher", "awayPitcher",
        "homeRuns1st", "awayRuns1st", "nrfi",
        "modelPrediction", "modelNrfiPct", "confidence", "confidenceScore",
        "poissonNrfi", "zipNrfi", "markovNrfi", "mapreNrfi",
        "logisticMetaNrfi", "nnInteractionNrfi", "hierarchicalBayesNrfi", "ensembleNrfi",
        "correct", "backtested",
      ])

      lines = gameResults.map((g) => {
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
          pct(p?.poissonNrfi),
          pct(p?.zipNrfi),
          pct(p?.markovNrfi),
          pct(p?.mapreNrfi),
          pct(p?.logisticMetaNrfi),
          pct(p?.nnInteractionNrfi),
          pct(p?.hierarchicalBayesNrfi),
          pct(p?.ensembleNrfi),
          p?.correct   === true  ? "true"
            : p?.correct === false ? "false"
            : "",
          p?.backtested ? "true" : "false",
        ])
      })
    } else {
      const col = MODEL_COLUMN[model]
      const modelLabel = col

      header = row([
        "date", "season", "homeTeam", "awayTeam",
        "homePitcher", "awayPitcher",
        "homeRuns1st", "awayRuns1st", "nrfi",
        modelLabel, "modelPrediction", "modelCorrect", "backtested",
      ])

      lines = gameResults.map((g) => {
        const p = predMap.get(String(g.gamePk))
        const prob = p?.[col]
        const modelPrediction = typeof prob === "number" ? (prob >= 0.5 ? "NRFI" : "YRFI") : ""
        const modelCorrect =
          typeof prob === "number" ? String(modelPrediction === (g.nrfi ? "NRFI" : "YRFI")) : ""

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
          typeof prob === "number" ? (prob * 100).toFixed(2) : "",
          modelPrediction,
          modelCorrect,
          p?.backtested ? "true" : "false",
        ])
      })
    }

    const csv = [header, ...lines].join("\n")
    const suffix = model === "all" ? "" : `-${model}`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nrfi-data${suffix}-${new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())}.csv"`,
        "Cache-Control":       "no-store",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/export-data]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
