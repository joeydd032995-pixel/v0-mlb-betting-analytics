/**
 * Standalone backtest runner — no server or auth required.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/run-backtest.ts
 *   DATABASE_URL=... npx tsx scripts/run-backtest.ts --synthetic
 *   DATABASE_URL=... npx tsx scripts/run-backtest.ts --synthetic --lambda=0.6
 *
 * Odds resolution per row:
 *   1. real stored nrfiOdds/yrfiOdds if present (none in the 2024–2025 archive yet)
 *   2. else, when --synthetic is passed, a reconstructed market line (see
 *      lib/synthetic-odds.ts — read its header before trusting the ROI numbers)
 *   3. else, the flat −110 fallback inside backtest-metrics.ts
 */

import { PrismaClient } from "@prisma/client"
import { computeBacktestMetrics, type BacktestRow } from "../lib/backtest-metrics"
import { syntheticNrfiOdds, DEFAULT_SYNTH, type SyntheticOddsParams } from "../lib/synthetic-odds"

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1) }

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })

const SEASONS = [2024, 2025, 2026]

// ─── CLI flags ────────────────────────────────────────────────────────────────
const USE_SYNTHETIC = process.argv.includes("--synthetic")
const LAMBDA_ARG = process.argv.find(a => a.startsWith("--lambda="))
const SYNTH_PARAMS: SyntheticOddsParams = LAMBDA_ARG
  ? { ...DEFAULT_SYNTH, marketSharpness: parseFloat(LAMBDA_ARG.split("=")[1]) }
  : DEFAULT_SYNTH
const LAMBDA_SWEEP = [0.25, 0.5, 0.75, 1.0]

function pct(n: number) { return (n * 100).toFixed(2) + "%" }
function fmt(n: number, decimals = 4) { return n.toFixed(decimals) }

interface PredRow {
  id: string
  date: string
  nrfiProbability: number
  confidence: string
  nrfiOdds: number | null
  yrfiOdds: number | null
}

/**
 * Build BacktestRows. Real stored odds always win; synthetic only FILLS nulls
 * (never overwrites a real line), so this stays correct once live odds exist.
 */
function buildRows(
  predictions: PredRow[],
  grMap: Map<number, boolean>,
  synth: SyntheticOddsParams | null,
): { rows: BacktestRow[]; rowDates: string[]; skipped: number } {
  const rows: BacktestRow[] = []
  const rowDates: string[] = []
  let skipped = 0
  for (const p of predictions) {
    const grNrfi = grMap.get(parseInt(p.id))
    if (grNrfi === undefined) { skipped++; continue }

    let nrfiOdds = p.nrfiOdds
    let yrfiOdds = p.yrfiOdds
    if (synth && (nrfiOdds == null || yrfiOdds == null)) {
      const s = syntheticNrfiOdds(p.nrfiProbability, synth)
      nrfiOdds = nrfiOdds ?? s.nrfiOdds
      yrfiOdds = yrfiOdds ?? s.yrfiOdds
    }

    rows.push({
      nrfiProbability: p.nrfiProbability,
      actualNrfi: grNrfi,
      confidence: p.confidence,
      nrfiOdds,
      yrfiOdds,
    })
    rowDates.push(p.date.slice(0, 7))  // "YYYY-MM-DD" → "YYYY-MM"
  }
  return { rows, rowDates, skipped }
}

async function runSeason(season: number) {
  const predictions = await prisma.modelPrediction.findMany({
    where: { season, status: "complete", correct: { not: null } },
    select: {
      id: true, date: true, nrfiProbability: true,
      confidence: true, nrfiOdds: true, yrfiOdds: true,
    },
    orderBy: { date: "asc" },
  })

  if (predictions.length === 0) {
    console.log(`  Season ${season}: no complete predictions found\n`)
    return
  }

  const gamePks = predictions.map(p => parseInt(p.id)).filter(n => Number.isFinite(n) && n > 0)
  const gameResults = await prisma.gameResult.findMany({
    where: { gamePk: { in: gamePks } },
    select: { gamePk: true, nrfi: true },
  })
  const grMap = new Map<number, boolean>(gameResults.map(r => [r.gamePk, r.nrfi]))

  const primarySynth = USE_SYNTHETIC ? SYNTH_PARAMS : null
  const { rows, rowDates, skipped } = buildRows(predictions, grMap, primarySynth)
  const m = computeBacktestMetrics(rows, true)

  const oddsLabel = USE_SYNTHETIC
    ? `synthetic (λ=${SYNTH_PARAMS.marketSharpness}, vig=${pct(SYNTH_PARAMS.totalVig)}, skew=${SYNTH_PARAMS.nrfiVigSkew})`
    : "stored odds / −110 fallback"

  console.log(`━━━ Season ${season} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  Odds source:  ${oddsLabel}`)
  console.log(`  Games:        ${m.n}  (${skipped} skipped — no GameResult match)`)
  console.log(`  Accuracy:     ${pct(m.accuracy)}`)
  console.log(`  AUC:          ${fmt(m.auc, 4)}  (DISCRIMINATION; 0.5 = no ranking signal)`)
  console.log(`  Pred StdDev:  ${fmt(m.predStdDev, 4)}  (spread of predictions; near 0 = bunched at mean)`)
  console.log(`  Brier Score:  ${fmt(m.brierScore)}  (lower = better; coin-flip = 0.25)`)
  console.log(`  ROI Kelly:    ${pct(m.roiKelly)}`)
  console.log(`  ROI Flat:     ${pct(m.roiFlat)}`)
  console.log(`  Sharpe:       ${fmt(m.sharpe, 3)}`)
  console.log(`  Max Drawdown: ${fmt(m.maxDrawdown, 4)} units`)

  console.log(`\n  Calibration (predicted → actual NRFI rate):`)
  for (const b of m.calibration) {
    if (b.count < 5) continue
    const bar = "█".repeat(Math.round(b.actual * 20)).padEnd(20)
    const diff = b.actual - b.bin
    const sign = diff >= 0 ? "+" : ""
    console.log(`    ${fmt(b.bin, 1)} → ${pct(b.actual).padStart(7)}  [${bar}]  n=${b.count}  err=${sign}${fmt(diff, 3)}`)
  }

  console.log(`\n  By Confidence:`)
  for (const [conf, s] of Object.entries(m.byConfidence).sort()) {
    console.log(`    ${conf.padEnd(8)} n=${String(s.n).padStart(5)}  acc=${pct(s.accuracy).padStart(7)}  brier=${fmt(s.brier)}  roiKelly=${pct(s.roiKelly).padStart(8)}`)
  }

  // Monthly breakdown
  const monthlyMap = new Map<string, BacktestRow[]>()
  for (let i = 0; i < rows.length; i++) {
    const ym = rowDates[i]
    const bucket = monthlyMap.get(ym) ?? []
    bucket.push(rows[i])
    monthlyMap.set(ym, bucket)
  }

  console.log(`\n  Monthly Breakdown:`)
  console.log(`    ${"Month".padEnd(8)}  ${"n".padStart(5)}  ${"Accuracy".padStart(9)}  ${"Brier".padStart(7)}  ${"ROI-Kelly".padStart(10)}  ${"ROI-Flat".padStart(9)}`)
  console.log(`    ${"─".repeat(60)}`)
  for (const ym of [...monthlyMap.keys()].sort()) {
    const slice = monthlyMap.get(ym)!
    const ms = computeBacktestMetrics(slice, false)
    console.log(`    ${ym.padEnd(8)}  ${String(ms.n).padStart(5)}  ${pct(ms.accuracy).padStart(9)}  ${fmt(ms.brierScore).padStart(7)}  ${pct(ms.roiKelly).padStart(10)}  ${pct(ms.roiFlat).padStart(9)}`)
  }

  // λ sensitivity sweep — only meaningful in synthetic mode.
  if (USE_SYNTHETIC) {
    console.log(`\n  Synthetic-odds λ sweep (market sharpness → ROI sensitivity):`)
    console.log(`    ${"λ".padStart(4)}  ${"ROI-Kelly".padStart(10)}  ${"ROI-Flat".padStart(9)}`)
    console.log(`    ${"─".repeat(30)}`)
    for (const lambda of LAMBDA_SWEEP) {
      const sweepParams: SyntheticOddsParams = { ...DEFAULT_SYNTH, marketSharpness: lambda }
      const { rows: sweepRows } = buildRows(predictions, grMap, sweepParams)
      const sm = computeBacktestMetrics(sweepRows, true)
      console.log(`    ${fmt(lambda, 2).padStart(4)}  ${pct(sm.roiKelly).padStart(10)}  ${pct(sm.roiFlat).padStart(9)}`)
    }
    console.log(`    (λ=0 → market==model→0 edge; λ=1 → market==league base rate. Real`)
    console.log(`     sharp books sit near the LOW end, so read these as optimistic.)`)
  }

  console.log()
}

async function main() {
  console.log("\nMLB NRFI/YRFI Backtest Results")
  console.log(`Run at: ${new Date().toISOString()}`)
  if (USE_SYNTHETIC) {
    console.log("\n⚠  SYNTHETIC ODDS MODE — ROI/Kelly/Sharpe numbers price against a")
    console.log("   reconstructed market proxy, NOT real lines. See lib/synthetic-odds.ts.")
    console.log("   Accuracy / Brier / Calibration are unaffected and remain fully valid.")
  }
  console.log()

  for (const season of SEASONS) {
    await runSeason(season)
  }

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
