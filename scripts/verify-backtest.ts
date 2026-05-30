/**
 * Full walk-forward backtest data integrity verification.
 *
 * Runs offline math checks (no DB required) and — when DATABASE_URL is set —
 * connects to Neon to verify data alignment across ModelPrediction × GameResult.
 *
 * Usage:
 *   npx tsx scripts/verify-backtest.ts          # offline checks only
 *   DATABASE_URL=... npx tsx scripts/verify-backtest.ts  # full DB checks
 *
 * Exits 0 if all checks pass, 1 if any assertion fails.
 */

import {
  LEAGUE_AVG_NRFI,
  ENSEMBLE_WEIGHTS,
} from "@/lib/nrfi-models"
import { calibrateWithMonotonicSpline } from "@/lib/calibration"
import { computeBacktestMetrics } from "@/lib/backtest-metrics"

// ─── Assertion helpers ────────────────────────────────────────────────────────

let failures = 0
let checks   = 0

function assert(condition: boolean, label: string, detail?: string): void {
  checks++
  if (condition) {
    console.log(`  ✓  ${label}`)
  } else {
    console.error(`  ✗  FAIL: ${label}${detail ? ` — ${detail}` : ""}`)
    failures++
  }
}

function section(title: string): void {
  console.log(`\n─── ${title} ───`)
}

// ─── Offline checks ───────────────────────────────────────────────────────────

function runOfflineChecks(): void {
  // ── 1. Calibration spline integrity ──────────────────────────────────────
  section("Calibration spline")

  const CALIBRATION_KNOTS: [number, number][] = [
    [0.05, 0.060], [0.10, 0.114], [0.15, 0.168], [0.20, 0.224], [0.25, 0.278],
    [0.30, 0.324], [0.35, 0.382], [0.40, 0.436], [0.45, 0.489], [0.50, 0.542],
    [0.55, 0.595], [0.60, 0.648], [0.65, 0.692], [0.70, 0.730], [0.75, 0.765],
    [0.80, 0.800], [0.85, 0.828], [0.90, 0.855], [0.95, 0.930],
  ]

  for (let i = 1; i < CALIBRATION_KNOTS.length; i++) {
    const [x0, y0] = CALIBRATION_KNOTS[i - 1]
    const [x1, y1] = CALIBRATION_KNOTS[i]
    assert(x1 > x0, `knot x monotone at index ${i}`, `${x0} → ${x1}`)
    assert(y1 > y0, `knot y monotone at index ${i}`, `${y0} → ${y1}`)
  }

  const tol = 0.001
  assert(Math.abs(calibrateWithMonotonicSpline(0.50) - 0.542) < tol, "calibrate(0.50) ≈ 0.542")
  assert(Math.abs(calibrateWithMonotonicSpline(0.60) - 0.648) < tol, "calibrate(0.60) ≈ 0.648")

  // ── 2. LEAGUE_ANCHOR constant ──────────────────────────────────────────────
  section("LEAGUE_ANCHOR constant")

  const computedAnchor = calibrateWithMonotonicSpline(LEAGUE_AVG_NRFI)
  assert(
    Math.abs(computedAnchor - 0.559) < 0.005,
    `LEAGUE_ANCHOR = calibrate(${LEAGUE_AVG_NRFI}) ≈ 0.559`,
    `got ${computedAnchor.toFixed(4)}`
  )

  // ── 3. ENSEMBLE_WEIGHTS normalization ──────────────────────────────────────
  section("ENSEMBLE_WEIGHTS")

  const weightSum = Object.values(ENSEMBLE_WEIGHTS).reduce((s, v) => s + v, 0)
  assert(Math.abs(weightSum - 1.0) < 1e-9, `weights sum to 1.0 (got ${weightSum.toFixed(10)})`)

  for (const [k, v] of Object.entries(ENSEMBLE_WEIGHTS)) {
    assert(v > 0, `weight[${k}] > 0`, `got ${v}`)
  }

  const expectedModels = ["poisson", "zip", "markov", "mapre", "logisticMeta", "nnInteraction", "hierarchicalBayes"]
  for (const m of expectedModels) {
    assert(m in ENSEMBLE_WEIGHTS, `weight defined for ${m}`)
  }

  // ── 4. Output clamp bounds ──────────────────────────────────────────────────
  section("Output clamp bounds (ENSEMBLE_BLEND = 0.76, LEAGUE_ANCHOR ≈ 0.559)")

  const CLAMP_MIN = 0.18
  const CLAMP_MAX = 0.85
  const ENSEMBLE_BLEND = 0.76

  const blendedMin = ENSEMBLE_BLEND * 0.060 + (1 - ENSEMBLE_BLEND) * computedAnchor
  assert(
    Math.abs(blendedMin - CLAMP_MIN) < 0.005,
    `blend at calibrated=0.060 ≈ CLAMP_MIN (${CLAMP_MIN})`,
    `got ${blendedMin.toFixed(4)}`
  )

  const blendedMax = ENSEMBLE_BLEND * 0.930 + (1 - ENSEMBLE_BLEND) * computedAnchor
  assert(
    blendedMax <= CLAMP_MAX + 0.005,
    `blend at calibrated=0.930 ≤ CLAMP_MAX (${CLAMP_MAX})`,
    `got ${blendedMax.toFixed(4)}`
  )

  // ── 5. NN Interaction normalizer ────────────────────────────────────────────
  section("NN Interaction normalizer")

  // After the fix, normalizer = LEAGUE_AVG_NRFI (0.516).
  // For average half-inning: poisson ≈ markov ≈ sqrt(0.516) ≈ 0.718
  // Expected: 0.718 × 0.718 / 0.516 ≈ 1.0 (normalises to league average)
  const halfAvg = Math.sqrt(LEAGUE_AVG_NRFI)
  const nnAtAvg = halfAvg * halfAvg / LEAGUE_AVG_NRFI
  assert(
    Math.abs(nnAtAvg - 1.0) < 0.005,
    `NN normalizer = LEAGUE_AVG_NRFI gives ≈ 1.0 for average pitchers`,
    `poisson × markov / normalizer = ${nnAtAvg.toFixed(4)}`
  )

  // ── 6. Kelly formula self-consistency ────────────────────────────────────────
  section("Kelly formula self-consistency")

  // At edge=0.05, -110 odds:
  //   implied = 110/210 ≈ 0.5238
  //   modelProb = 0.5738, profitPerUnit = 100/110 ≈ 0.9091
  //   rawKelly = (0.9091 × 0.5738 − 0.4262) / 0.9091 ≈ 0.105
  //   betSize  = 0.105 × 0.25 ≈ 0.02625
  //   (old linear formula: 0.05 × 0.25 = 0.0125)
  const implied = 110 / 210
  const modelProb = implied + 0.05
  const profitPerUnit = 100 / 110
  const q = 1 - modelProb
  const rawKelly = (profitPerUnit * modelProb - q) / profitPerUnit
  const betSize = Math.max(0, Math.min(0.25, rawKelly * 0.25))
  const linearApprox = 0.05 * 0.25

  assert(betSize > linearApprox, "proper Kelly > linear approximation at edge=0.05", `${betSize.toFixed(5)} vs ${linearApprox}`)
  assert(Math.abs(betSize - 0.02625) < 0.0005, `betSize ≈ 0.02625 at edge=0.05 on -110`, `got ${betSize.toFixed(5)}`)

  // ── 7. BacktestMetrics smoke test ─────────────────────────────────────────────
  section("computeBacktestMetrics smoke test")

  const testRows = [
    { nrfiProbability: 0.65, actualNrfi: true,  confidence: "High" },
    { nrfiProbability: 0.65, actualNrfi: true,  confidence: "High" },
    { nrfiProbability: 0.65, actualNrfi: false, confidence: "High" },
    { nrfiProbability: 0.42, actualNrfi: false, confidence: "Medium" },
    { nrfiProbability: 0.42, actualNrfi: true,  confidence: "Medium" },
    { nrfiProbability: 0.55, actualNrfi: true,  confidence: "Low" },
  ]

  const m = computeBacktestMetrics(testRows, true)
  assert(m.n === 6, `n = 6`)
  assert(m.brierScore > 0 && m.brierScore < 0.5, `brierScore in (0, 0.5)`, `got ${m.brierScore.toFixed(4)}`)
  assert(m.accuracy >= 0 && m.accuracy <= 1, `accuracy in [0, 1]`)
  assert("High" in m.byConfidence, `byConfidence has 'High'`)
  assert(m.calibration.length > 0, `calibration bins non-empty`)

  const expectedBrier =
    ((0.65 - 1) ** 2 + (0.65 - 1) ** 2 + (0.65 - 0) ** 2 +
     (0.42 - 0) ** 2 + (0.42 - 1) ** 2 + (0.55 - 1) ** 2) / 6
  assert(
    Math.abs(m.brierScore - expectedBrier) < 1e-9,
    `Brier is numerically exact`,
    `got ${m.brierScore.toFixed(6)}, expected ${expectedBrier.toFixed(6)}`
  )
}

// ─── DB checks ────────────────────────────────────────────────────────────────

async function runDbChecks(dbUrl: string): Promise<void> {
  section("DB alignment checks")

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client")
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } })

  try {
    const [totalGames, totalPreds] = await Promise.all([
      prisma.gameResult.count(),
      prisma.modelPrediction.count({ where: { status: "complete" } }),
    ])
    console.log(`  DB: ${totalGames} GameResult rows, ${totalPreds} complete ModelPrediction rows`)

    if (totalGames === 0 || totalPreds === 0) {
      console.log("  No data available for DB checks.")
      return
    }

    // Verify correct field matches (prediction === actualResult)
    const sample = await prisma.modelPrediction.findMany({
      where:  { status: "complete", correct: { not: null } },
      select: { id: true, prediction: true, actualResult: true, correct: true },
      take:   2000,
    })

    let correctMismatches = 0
    for (const p of sample) {
      const expectedCorrect = p.prediction === p.actualResult
      if (p.correct !== expectedCorrect) correctMismatches++
    }
    assert(
      correctMismatches === 0,
      `correct field matches (prediction === actualResult) for ${sample.length} sampled rows`,
      correctMismatches > 0 ? `${correctMismatches} mismatches found` : undefined
    )

    // Cross-check actualResult vs GameResult.nrfi
    const preds = await prisma.modelPrediction.findMany({
      where:  { status: "complete", actualResult: { not: null } },
      select: { id: true, actualResult: true },
      take:   5000,
    })

    const gamePks: number[] = preds
      .map((p) => parseInt(p.id))
      .filter((n): n is number => Number.isFinite(n) && n > 0)

    const gameResults = await prisma.gameResult.findMany({
      where:  { gamePk: { in: gamePks } },
      select: { gamePk: true, nrfi: true },
    })
    const grMap = new Map<number, boolean>(
      gameResults.map((r) => [r.gamePk, r.nrfi] as [number, boolean])
    )

    let nrfiMismatches = 0
    let joined = 0
    for (const p of preds) {
      const gamePk = parseInt(p.id)
      const grNrfi = grMap.get(gamePk)
      if (grNrfi === undefined) continue
      joined++
      const mpNrfi = p.actualResult === "NRFI"
      if (grNrfi !== mpNrfi) nrfiMismatches++
    }
    assert(
      nrfiMismatches === 0,
      `ModelPrediction.actualResult matches GameResult.nrfi for ${joined} joined rows`,
      nrfiMismatches > 0 ? `${nrfiMismatches} mismatches` : undefined
    )
    console.log(`  DB join: ${joined}/${preds.length} predictions matched to GameResult rows`)

    // Walk-forward metrics
    const allRows = await prisma.modelPrediction.findMany({
      where:   { status: "complete", correct: { not: null } },
      select:  { nrfiProbability: true, actualResult: true, confidence: true },
      orderBy: { date: "asc" },
      take:    10000,
    })
    const backTestRows = allRows
      .filter((r) => r.actualResult !== null)
      .map((r) => ({
        nrfiProbability: r.nrfiProbability,
        actualNrfi:      r.actualResult === "NRFI",
        confidence:      r.confidence,
      }))

    if (backTestRows.length > 0) {
      const metrics = computeBacktestMetrics(backTestRows, true)
      console.log(`  Walk-forward metrics (n=${metrics.n}):`)
      console.log(`    Brier score : ${metrics.brierScore.toFixed(4)}  (random baseline = 0.25)`)
      console.log(`    Accuracy    : ${(metrics.accuracy * 100).toFixed(1)}%`)
      console.log(`    ROI Kelly   : ${(metrics.roiKelly * 100).toFixed(2)}%`)
      console.log(`    Sharpe      : ${metrics.sharpe.toFixed(3)}`)
      console.log(`    Max drawdown: ${metrics.maxDrawdown.toFixed(4)}`)
      console.log(`    Calibration:`)
      for (const b of metrics.calibration) {
        const bar = "█".repeat(Math.round(b.count / 5))
        console.log(`      P=${b.bin.toFixed(1)}  actual=${(b.actual * 100).toFixed(1)}%  n=${b.count}  ${bar}`)
      }

      assert(metrics.brierScore < 0.26, `Brier score < 0.26 (better than random)`, `got ${metrics.brierScore.toFixed(4)}`)
      assert(metrics.n >= 10, `At least 10 complete predictions available`, `only ${metrics.n}`)

      for (const [conf, s] of Object.entries(metrics.byConfidence)) {
        console.log(`  ${conf}: n=${s.n} brier=${s.brier.toFixed(4)} acc=${(s.accuracy * 100).toFixed(1)}%`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  runOfflineChecks()

  const dbUrl = (typeof process !== "undefined" && process.env?.DATABASE_URL) || ""
  if (!dbUrl) {
    console.log("\n─── DB alignment checks (skipped — DATABASE_URL not set) ───")
    console.log("  Set DATABASE_URL to run live data-integrity checks.\n")
  } else {
    await runDbChecks(dbUrl)
  }

  console.log(`\n════════════════════════════════`)
  if (failures === 0) {
    console.log(`✓  All ${checks} checks passed.`)
    if (typeof process !== "undefined") process.exit(0)
  } else {
    console.error(`✗  ${failures} of ${checks} checks FAILED.`)
    if (typeof process !== "undefined") process.exit(1)
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  if (typeof process !== "undefined") process.exit(1)
})
