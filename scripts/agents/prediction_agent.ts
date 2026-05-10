/**
 * Prediction Agent — daily cron entrypoint.
 *
 * Pulls today's slate via the same live-data path used by /api/predictions,
 * runs the engine (legacy or Ensemble++ depending on FLAGS), upserts each
 * game into ModelPrediction (idempotent on `(date, id)`), and posts a
 * webhook alert for any prediction whose value-analysis edge is ≥ 5%.
 *
 * The agent is intentionally a thin wrapper — all model logic stays in
 * lib/nrfi-engine.  Failures don't crash the workflow; they exit 1 so the
 * GH Actions run is marked failed but the rest of the day continues.
 *
 * Usage (locally):
 *   tsx scripts/agents/prediction_agent.ts          # today's date, ET
 *   tsx scripts/agents/prediction_agent.ts --date 2026-05-10
 *   tsx scripts/agents/prediction_agent.ts --dry-run
 *
 * Env (all optional):
 *   AGENT_WEBHOOK_URL          POST {text} alerts (Slack/Discord-compatible)
 *   AGENT_MIN_ALERT_EDGE       Override the alert threshold (default 0.05)
 *   AGENT_DRY_RUN=1            Skip DB writes and webhook calls
 */

import { computeAllPredictions } from "@/lib/nrfi-engine"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { buildTrackedPrediction } from "@/lib/prediction-store"
import { prisma } from "@/lib/prisma"
import { FLAGS } from "@/lib/config"
import type { NRFIPrediction, Game, Pitcher, Team } from "@/lib/types"
import { Prisma } from "@prisma/client"

type Json = Prisma.InputJsonValue | typeof Prisma.JsonNull

interface AgentArgs { date: string; dryRun: boolean }

function parseArgs(): AgentArgs {
  const argv = process.argv.slice(2)
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    if (i < 0) return undefined
    const v = argv[i + 1]
    return v === undefined || v.startsWith("-") ? undefined : v
  }
  const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
  return {
    date:   get("--date") ?? todayET,
    dryRun: argv.includes("--dry-run") || process.env.AGENT_DRY_RUN === "1",
  }
}

async function postWebhook(message: string): Promise<void> {
  const url = process.env.AGENT_WEBHOOK_URL
  if (!url) return
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ text: message }),
    })
    if (!res.ok) {
      console.warn(`[prediction-agent] webhook ${res.status}: ${await res.text().catch(() => "")}`)
    }
  } catch (err) {
    console.warn(`[prediction-agent] webhook error:`, (err as Error).message)
  }
}

interface Persisted {
  id:              string
  date:            string
  season:          number
  homeTeam:        string
  awayTeam:        string
  homePitcher:     string
  awayPitcher:     string
  nrfiProbability: number
  prediction:      "NRFI" | "YRFI"
  confidence:      string
  confidenceScore: number
  poissonNrfi:     number
  zipNrfi:         number
  markovNrfi:      number
  ensembleNrfi:    number
  modelBreakdown:  Json
  modelConsensus:  number
  ensembleVersion: "v1.7models" | "v2.9models"
  deepNrfi:        number | null
  deepNrfiTopFeatures: Json
  monteCarloPNrfi:    number | null
  monteCarloMeanRuns: number | null
  monteCarloVariance: number | null
  monteCarloDistribution: Json
}

function buildRow(
  pred: NRFIPrediction,
  game: Game,
  pitchers: Map<string, Pitcher>,
  teams: Map<string, Team>,
  date: string,
): Persisted {
  const tracked = buildTrackedPrediction(pred, game, pitchers, teams, date)
  const season  = Number.parseInt(date.slice(0, 4), 10)
  return {
    id:              game.id,
    date,
    season,
    homeTeam:        tracked.homeTeam,
    awayTeam:        tracked.awayTeam,
    homePitcher:     tracked.homePitcher,
    awayPitcher:     tracked.awayPitcher,
    nrfiProbability: pred.nrfiProbability,
    prediction:      tracked.prediction,
    confidence:      pred.confidence,
    confidenceScore: pred.confidenceScore,
    poissonNrfi:     tracked.poissonNrfi,
    zipNrfi:         tracked.zipNrfi,
    markovNrfi:      tracked.markovNrfi,
    ensembleNrfi:    tracked.ensembleNrfi,
    modelBreakdown:  (pred.modelBreakdown ?? Prisma.JsonNull) as Json,
    modelConsensus:  tracked.modelConsensus,
    ensembleVersion: pred.ensembleVersion ?? "v1.7models",
    deepNrfi:        pred.deepNrfi?.probability ?? null,
    deepNrfiTopFeatures: (pred.deepNrfi?.topFeatures ?? Prisma.JsonNull) as Json,
    monteCarloPNrfi:    pred.monteCarlo?.pNRFI ?? null,
    monteCarloMeanRuns: pred.monteCarlo?.meanRuns ?? null,
    monteCarloVariance: pred.monteCarlo?.variance ?? null,
    monteCarloDistribution: (pred.monteCarlo?.runDistribution ?? Prisma.JsonNull) as Json,
  }
}

async function upsertPrediction(row: Persisted): Promise<void> {
  await prisma.modelPrediction.upsert({
    where:  { id: row.id },
    create: { ...row, status: "pending" },
    update: {
      nrfiProbability: row.nrfiProbability,
      prediction:      row.prediction,
      confidence:      row.confidence,
      confidenceScore: row.confidenceScore,
      poissonNrfi:     row.poissonNrfi,
      zipNrfi:         row.zipNrfi,
      markovNrfi:      row.markovNrfi,
      ensembleNrfi:    row.ensembleNrfi,
      modelBreakdown:  row.modelBreakdown,
      modelConsensus:  row.modelConsensus,
      ensembleVersion: row.ensembleVersion,
      deepNrfi:        row.deepNrfi,
      deepNrfiTopFeatures: row.deepNrfiTopFeatures,
      monteCarloPNrfi:    row.monteCarloPNrfi,
      monteCarloMeanRuns: row.monteCarloMeanRuns,
      monteCarloVariance: row.monteCarloVariance,
      monteCarloDistribution: row.monteCarloDistribution,
    },
  })
}

async function main(): Promise<number> {
  const args = parseArgs()
  console.log(`[prediction-agent] date=${args.date} dryRun=${args.dryRun} ensembleVersion=${FLAGS.ENSEMBLE_VERSION}`)

  const slate = await getLiveGameSlate(args.date)
  if (slate.games.length === 0) {
    console.log("[prediction-agent] no games today — exiting 0")
    return 0
  }

  const predictions = computeAllPredictions(slate.games, slate.pitchers, slate.teams)
  console.log(`[prediction-agent] computed ${predictions.length} predictions for ${slate.games.length} games`)

  const minEdge = Number.parseFloat(process.env.AGENT_MIN_ALERT_EDGE ?? "0.05")
  const edges: Array<{ row: Persisted; edge: number; pick: string }> = []
  let written = 0
  let writeErrors = 0

  for (const pred of predictions) {
    const game = slate.games.find((g) => g.id === pred.gameId)
    if (!game) continue
    const row = buildRow(pred, game, slate.pitchers, slate.teams, args.date)

    if (!args.dryRun) {
      try {
        await upsertPrediction(row)
        written++
      } catch (err) {
        writeErrors++
        console.error(`[prediction-agent] upsert failed for ${row.id}: ${(err as Error).message}`)
      }
    }

    const va = pred.valueAnalysis
    if (va && va.recommendedBet !== "NO_BET") {
      const edge = va.recommendedBet === "NRFI" ? va.nrfiEdge : va.yrfiEdge
      if (edge >= minEdge) {
        edges.push({ row, edge, pick: va.recommendedBet })
      }
    }
  }

  if (edges.length > 0) {
    edges.sort((a, b) => b.edge - a.edge)
    const lines = edges.slice(0, 10).map(
      (e) =>
        `• ${e.pick} ${e.row.awayTeam} @ ${e.row.homeTeam} — edge ${(e.edge * 100).toFixed(1)}% (${e.row.confidence}, ${(e.row.nrfiProbability * 100).toFixed(1)}% NRFI)`,
    )
    const message = [
      `📈 *Ensemble++ alerts* · ${args.date} · ${edges.length} edge(s) ≥ ${(minEdge * 100).toFixed(0)}%`,
      ...lines,
    ].join("\n")
    console.log(message)
    if (!args.dryRun) await postWebhook(message)
  } else {
    console.log(`[prediction-agent] no edges ≥ ${(minEdge * 100).toFixed(1)}% today`)
  }

  console.log(`[prediction-agent] persisted=${written} errors=${writeErrors}`)
  return writeErrors > 0 ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[prediction-agent] fatal:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
