/**
 * Walk-forward ensemble-weight cross-validation — DIAGNOSTIC ONLY (no engine writes).
 *
 * Goal: can re-weighting the stored base models raise held-out DISCRIMINATION
 * (AUC)?  The audit (AUDIT_REPORT.md P1-6 note) requires walk-forward CV
 * evidence before touching ENSEMBLE_WEIGHTS; this script produces it.
 *
 * Data: model_predictions stores GAME-LEVEL per-model probabilities
 * (poissonNrfi, zipNrfi, markovNrfi = product of the two half-inning values).
 * MAPRE is only present in modelBreakdown JSON for ~382 live-2026 rows, so the
 * CV runs over the three fully-stored base models.  NOTE: the live engine
 * blends at the HALF-INNING level then multiplies halves; blending game-level
 * products is a close approximation in this probability range, and ranking
 * (AUC) is what we score.
 *
 * Folds (strictly walk-forward — never select on the holdout):
 *   Fold A: train 2024        → holdout 2025
 *   Fold B: train 2024+2025   → holdout 2026
 *
 * Candidates:
 *   1. Current engine output (stored nrfiProbability)         — baseline
 *   2. Current design weights on the 3 models (12:30:48 norm) — baseline
 *   3. Simplex grid search (step 0.05), selected by TRAIN AUC — the CV answer
 *   4. Logistic stack on model logits, fit on train           — flexibility ceiling
 *   5. Holdout-best grid point — ORACLE, reported for context only, never selectable
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/cv-ensemble-weights.ts
 */

import { PrismaClient } from "@prisma/client"

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1) }
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })

interface Row {
  date: string
  poisson: number
  zip: number
  markov: number
  engine: number   // stored nrfiProbability (current engine, post-anchor/clamp)
  y: 0 | 1         // actual NRFI
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

/** Mann-Whitney AUC with tie correction. 0.5 = no ranking signal. */
function auc(probs: number[], ys: (0 | 1)[]): number {
  const n = probs.length
  const idx = probs.map((_, i) => i).sort((a, b) => probs[a] - probs[b])
  let pos = 0
  for (const y of ys) if (y === 1) pos++
  const neg = n - pos
  if (pos === 0 || neg === 0) return 0.5
  let rankSumPos = 0
  let i = 0
  while (i < n) {
    let j = i
    while (j < n && probs[idx[j]] === probs[idx[i]]) j++
    const avgRank = (i + 1 + j) / 2
    for (let k = i; k < j; k++) if (ys[idx[k]] === 1) rankSumPos += avgRank
    i = j
  }
  return (rankSumPos - (pos * (pos + 1)) / 2) / (pos * neg)
}

function brier(probs: number[], ys: (0 | 1)[]): number {
  let s = 0
  for (let i = 0; i < probs.length; i++) s += (probs[i] - ys[i]) ** 2
  return s / probs.length
}

// ─── Candidates ───────────────────────────────────────────────────────────────

type W = [number, number, number]  // poisson, zip, markov

function blend(rows: Row[], w: W): number[] {
  return rows.map(r => w[0] * r.poisson + w[1] * r.zip + w[2] * r.markov)
}

/** All weight triples on the simplex with the given step. */
function simplexGrid(step: number): W[] {
  const out: W[] = []
  const n = Math.round(1 / step)
  for (let a = 0; a <= n; a++)
    for (let b = 0; b <= n - a; b++)
      out.push([a / n, b / n, (n - a - b) / n])
  return out
}

const logit = (p: number) => Math.log(Math.max(1e-6, Math.min(1 - 1e-6, p)) / (1 - Math.max(1e-6, Math.min(1 - 1e-6, p))))
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

/** Logistic regression on [logit(poisson), logit(zip), logit(markov)] via batch GD. */
function fitLogisticStack(rows: Row[]): { coef: number[]; predict: (r: Row) => number } {
  const X = rows.map(r => [1, logit(r.poisson), logit(r.zip), logit(r.markov)])
  const ys = rows.map(r => r.y)
  const coef = [0, 0, 0, 0]
  const lr = 0.1
  const n = rows.length
  for (let epoch = 0; epoch < 3000; epoch++) {
    const grad = [0, 0, 0, 0]
    for (let i = 0; i < n; i++) {
      const z = coef[0] * X[i][0] + coef[1] * X[i][1] + coef[2] * X[i][2] + coef[3] * X[i][3]
      const err = sigmoid(z) - ys[i]
      for (let k = 0; k < 4; k++) grad[k] += err * X[i][k]
    }
    for (let k = 0; k < 4; k++) coef[k] -= lr * (grad[k] / n + 0.001 * (k === 0 ? 0 : coef[k]))  // small L2, no penalty on intercept
  }
  return {
    coef,
    predict: (r: Row) => sigmoid(coef[0] + coef[1] * logit(r.poisson) + coef[2] * logit(r.zip) + coef[3] * logit(r.markov)),
  }
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function loadSeason(season: number): Promise<Row[]> {
  const preds = await prisma.modelPrediction.findMany({
    where: { season, status: "complete", correct: { not: null } },
    select: { id: true, date: true, poissonNrfi: true, zipNrfi: true, markovNrfi: true, nrfiProbability: true },
    orderBy: { date: "asc" },
  })
  const gamePks = preds.map(p => parseInt(p.id)).filter(n => Number.isFinite(n) && n > 0)
  const results = await prisma.gameResult.findMany({
    where: { gamePk: { in: gamePks } },
    select: { gamePk: true, nrfi: true },
  })
  const grMap = new Map(results.map(r => [r.gamePk, r.nrfi]))
  const rows: Row[] = []
  for (const p of preds) {
    const nrfi = grMap.get(parseInt(p.id))
    if (nrfi === undefined) continue
    rows.push({
      date: p.date,
      poisson: p.poissonNrfi,
      zip: p.zipNrfi,
      markov: p.markovNrfi,
      engine: p.nrfiProbability,
      y: nrfi ? 1 : 0,
    })
  }
  return rows
}

// ─── Fold runner ──────────────────────────────────────────────────────────────

const fmtW = (w: W) => `[${w.map(x => x.toFixed(2)).join(", ")}]`
const f4 = (x: number) => x.toFixed(4)

function runFold(name: string, train: Row[], holdout: Row[]) {
  console.log(`\n━━━ ${name} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  train n=${train.length}   holdout n=${holdout.length}`)

  const hYs = holdout.map(r => r.y)
  const tYs = train.map(r => r.y)

  // 1. Current engine baseline
  const engineAuc = auc(holdout.map(r => r.engine), hYs)
  console.log(`\n  Current engine (stored nrfiProbability):   holdout AUC ${f4(engineAuc)}  brier ${f4(brier(holdout.map(r => r.engine), hYs))}`)

  // 2. Design weights restricted to the 3 stored models (12:30:48 normalized)
  const designW: W = [0.12 / 0.90, 0.30 / 0.90, 0.48 / 0.90]
  const designProbs = blend(holdout, designW)
  console.log(`  Design weights ${fmtW(designW)}:        holdout AUC ${f4(auc(designProbs, hYs))}  brier ${f4(brier(designProbs, hYs))}`)

  // 3. Grid search selected on TRAIN AUC
  const grid = simplexGrid(0.05)
  let bestTrain: { w: W; trainAuc: number } | null = null
  const scored = grid.map(w => {
    const trainAuc = auc(blend(train, w), tYs)
    if (!bestTrain || trainAuc > bestTrain.trainAuc) bestTrain = { w, trainAuc }
    return { w, trainAuc }
  })
  const cvProbs = blend(holdout, bestTrain!.w)
  console.log(`  CV pick ${fmtW(bestTrain!.w)} (train AUC ${f4(bestTrain!.trainAuc)}): holdout AUC ${f4(auc(cvProbs, hYs))}  brier ${f4(brier(cvProbs, hYs))}`)

  // Stability: top 10 train combos and their holdout AUCs
  console.log(`\n  Top-10 by train AUC (stability check):`)
  console.log(`    ${"weights".padEnd(20)} ${"trainAUC".padStart(9)} ${"holdoutAUC".padStart(11)}`)
  for (const s of [...scored].sort((a, b) => b.trainAuc - a.trainAuc).slice(0, 10)) {
    console.log(`    ${fmtW(s.w).padEnd(20)} ${f4(s.trainAuc).padStart(9)} ${f4(auc(blend(holdout, s.w), hYs)).padStart(11)}`)
  }

  // 4. Logistic stack (train-fit)
  const stack = fitLogisticStack(train)
  const stackProbs = holdout.map(stack.predict)
  console.log(`\n  Logistic stack coef [b, poi, zip, mkv] = [${stack.coef.map(c => c.toFixed(3)).join(", ")}]`)
  console.log(`  Logistic stack:                            holdout AUC ${f4(auc(stackProbs, hYs))}  brier ${f4(brier(stackProbs, hYs))}`)

  // 5. Oracle (context only — selected ON the holdout, never promotable)
  let oracle: { w: W; a: number } | null = null
  for (const w of grid) {
    const a = auc(blend(holdout, w), hYs)
    if (!oracle || a > oracle.a) oracle = { w, a }
  }
  console.log(`  ORACLE (holdout-selected, context only):   ${fmtW(oracle!.w)} AUC ${f4(oracle!.a)}`)

  // Per-model individual AUCs on holdout
  console.log(`\n  Individual model holdout AUCs:  poisson ${f4(auc(holdout.map(r => r.poisson), hYs))}` +
              `  zip ${f4(auc(holdout.map(r => r.zip), hYs))}` +
              `  markov ${f4(auc(holdout.map(r => r.markov), hYs))}`)
}

async function main() {
  console.log("Ensemble-weight walk-forward CV (diagnostic — no engine changes)")
  console.log(`Run at: ${new Date().toISOString()}`)

  const [s2024, s2025, s2026] = await Promise.all([loadSeason(2024), loadSeason(2025), loadSeason(2026)])

  runFold("Fold A: train 2024 → holdout 2025", s2024, s2025)
  runFold("Fold B: train 2024+2025 → holdout 2026", [...s2024, ...s2025], s2026)

  await prisma.$disconnect()
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
