/**
 * Walk-forward calibration refit (the deferred AUDIT P1-4 item) — DIAGNOSTIC,
 * prints proposed knots; never writes to lib/calibration.ts.
 *
 * Pipeline context (lib/nrfi-engine.ts):
 *   final = clamp( 0.76·cal(raw) + 0.24·ANCHOR, 0.18, 0.85 ),  ANCHOR = 0.516
 *
 * Stored nrfiProbability is `final` under the IDENTITY calibration, so the raw
 * ensemble is recoverable by inverting the affine map wherever the clamp
 * doesn't bind.  This script ASSERTS the clamp is non-binding rather than
 * assuming it (see assertClampNonBinding) — if a boundary row ever appears the
 * inversion is silently wrong, so the run aborts instead.
 *
 * Two knot variants are fit on the TRAIN fold and scored on the HOLDOUT:
 *   naive:        knots = isotonic(raw → y) sampled at the 19-knot grid.
 *                 The anchor blend then drags the output back toward 0.516,
 *                 re-introducing miscalibration.
 *   compensated:  knots = (isotonic − 0.24·ANCHOR) / 0.76, so the DEPLOYED
 *                 final output equals the isotonic estimate exactly
 *                 (anchor blend cancelled; calibrated end-to-end).
 *
 * Both are monotone (affine transform of a monotone fit), satisfying the
 * engine's monotonicity requirement.  Selection criterion: holdout Brier.
 *
 * ── Fold families ────────────────────────────────────────────────────────────
 * `--folds=committed`    the original two folds (2024→2025, 2024+2025→2026).
 * `--folds=engine-aware` folds confined to ONE engine generation (below).
 * `--folds=both`         (default) runs both, so the gap between them is visible.
 *
 * The archive is not the output of a single engine.  Rows carry a generation:
 *   A_pre_audit_bulk  — the 2026-04-18 bulk backfill, written by the PRE-audit
 *                       engine (no `recomputedAt`, no weather).
 *   B_recomputed      — rows carrying `inputsPresence.recomputedAt`, i.e. rebuilt
 *                       by the post-fix engine.
 *   C_post_audit_live — written live by the daily cron on/after the audit fix.
 * Fitting a curve on one generation and deploying it against another repeats
 * exactly the mistake AUDIT_REPORT.md P1-4 documents, so the engine-aware folds
 * keep train and holdout inside a single generation, and the cross-generation
 * transfer table quantifies what happens when you don't.
 *
 * Usage:
 *   PRISMA_NEON_HTTP=true NODE_ENV=development npx tsx scripts/refit-calibration.ts
 *   ... --folds=engine-aware --seed=7 --bootstrap=2000
 *
 * Reads through lib/prisma so the PRISMA_NEON_HTTP escape hatch works in
 * sandboxes that block the Postgres wire port (see lib/prisma.ts).
 */

import { prisma } from "../lib/prisma"
import { computeBacktestMetrics, logLoss } from "../lib/backtest-metrics"

const ENSEMBLE_BLEND = 0.76
const ANCHOR = 0.516
const CLAMP_MIN = 0.18
const CLAMP_MAX = 0.85
const CLAMP_EPS = 1e-4
const KNOT_GRID = Array.from({ length: 19 }, (_, i) => 0.05 + i * 0.05)
const SEASONS = [2023, 2024, 2025, 2026]

// ─── CLI ──────────────────────────────────────────────────────────────────────

const argOf = (name: string, fallback: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback

const FOLD_MODE = argOf("folds", "both")
const SEED = parseInt(argOf("seed", "20260827"), 10)
const N_BOOT = parseInt(argOf("bootstrap", "2000"), 10)

if (!["both", "committed", "engine-aware"].includes(FOLD_MODE)) {
  console.error(`--folds must be one of: both | committed | engine-aware (got "${FOLD_MODE}")`)
  process.exit(1)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Gen = "A_pre_audit_bulk" | "B_recomputed" | "C_post_audit_live"

interface Row {
  raw: number
  final: number
  y: 0 | 1
  season: number
  date: string
  gen: Gen
}

const clampFinal = (p: number) => Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, p))

/** Invert final = 0.76·raw + 0.24·ANCHOR (identity calibration, clamp non-binding). */
const invertFinal = (final: number) => (final - (1 - ENSEMBLE_BLEND) * ANCHOR) / ENSEMBLE_BLEND

// ─── Isotonic regression (pool-adjacent-violators) ───────────────────────────

interface IsoModel { xs: number[]; ys: number[] }  // step-function blocks (x = block right edge mean)

function fitIsotonic(x: number[], y: number[]): IsoModel {
  const idx = x.map((_, i) => i).sort((a, b) => x[a] - x[b])
  // Blocks: { sumY, n, minX, maxX }
  const blocks: { sumY: number; n: number; minX: number; maxX: number }[] = []
  for (const i of idx) {
    blocks.push({ sumY: y[i], n: 1, minX: x[i], maxX: x[i] })
    // Pool while the mean decreases
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]
      const a = blocks[blocks.length - 2]
      if (a.sumY / a.n <= b.sumY / b.n) break
      a.sumY += b.sumY; a.n += b.n; a.maxX = b.maxX
      blocks.pop()
    }
  }
  return {
    xs: blocks.map(b => (b.minX + b.maxX) / 2),
    ys: blocks.map(b => b.sumY / b.n),
  }
}

/** Predict by linear interpolation between block centers (clip outside). */
function isoPredict(m: IsoModel, x: number): number {
  const { xs, ys } = m
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  let lo = 0
  while (lo < xs.length - 1 && xs[lo + 1] < x) lo++
  const span = xs[lo + 1] - xs[lo]
  const t = span > 0 ? (x - xs[lo]) / span : 0
  return ys[lo] + t * (ys[lo + 1] - ys[lo])
}

/** Engine's piecewise-linear knot interpolation (mirrors lib/calibration.ts). */
function knotPredict(knots: number[][], x: number): number {
  if (x <= knots[0][0]) return knots[0][1]
  for (let i = 0; i < knots.length - 1; i++) {
    const [x0, y0] = knots[i]
    const [x1, y1] = knots[i + 1]
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  }
  return knots[knots.length - 1][1]
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function brier(p: number[], y: (0 | 1)[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) s += (p[i] - y[i]) ** 2
  return s / p.length
}

/** Expected calibration error over 10 equal-width bins, weighted by bin count. */
function ece(p: number[], y: (0 | 1)[], nBins = 10): number {
  const sum = new Array(nBins).fill(0)
  const pos = new Array(nBins).fill(0)
  const cnt = new Array(nBins).fill(0)
  for (let i = 0; i < p.length; i++) {
    const b = Math.min(nBins - 1, Math.floor(p[i] * nBins))
    sum[b] += p[i]; pos[b] += y[i]; cnt[b]++
  }
  let e = 0
  for (let b = 0; b < nBins; b++) {
    if (cnt[b] === 0) continue
    e += (cnt[b] / p.length) * Math.abs(sum[b] / cnt[b] - pos[b] / cnt[b])
  }
  return e
}

const logit = (p: number) => {
  const c = Math.max(1e-6, Math.min(1 - 1e-6, p))
  return Math.log(c / (1 - c))
}

/**
 * Calibration intercept/slope: fit y ~ sigmoid(a + b·logit(p)) by IRLS.
 * Perfect calibration is a = 0, b = 1. a < 0 means the probabilities are too
 * high (systematic over-prediction); b < 1 means they are over-confident.
 */
function calibrationCurve(p: number[], y: (0 | 1)[]): { intercept: number; slope: number } {
  const x = p.map(logit)
  let a = 0, b = 1
  for (let iter = 0; iter < 50; iter++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0
    for (let i = 0; i < x.length; i++) {
      const eta = a + b * x[i]
      const mu = 1 / (1 + Math.exp(-eta))
      const w = Math.max(1e-9, mu * (1 - mu))
      const r = y[i] - mu
      g0 += r; g1 += r * x[i]
      h00 += w; h01 += w * x[i]; h11 += w * x[i] * x[i]
    }
    const det = h00 * h11 - h01 * h01
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) break
    const da = (h11 * g0 - h01 * g1) / det
    const db = (h00 * g1 - h01 * g0) / det
    a += da; b += db
    if (Math.abs(da) < 1e-10 && Math.abs(db) < 1e-10) break
  }
  return { intercept: a, slope: b }
}

function calBins(p: number[], y: (0 | 1)[]): string[] {
  const buckets = new Map<number, { n: number; pos: number; sumP: number }>()
  for (let i = 0; i < p.length; i++) {
    const bin = Math.round(p[i] * 10) / 10
    const b = buckets.get(bin) ?? { n: 0, pos: 0, sumP: 0 }
    b.n++; b.pos += y[i]; b.sumP += p[i]
    buckets.set(bin, b)
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0])
    .filter(([, b]) => b.n >= 5)
    .map(([bin, b]) => `    ${bin.toFixed(1)}: pred ${(b.sumP / b.n).toFixed(3)} → actual ${(b.pos / b.n).toFixed(3)}  n=${b.n}`)
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/** mulberry32 — small seeded PRNG so every reported CI is reproducible. */
function rng(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Percentile CI for the PAIRED delta (variant − baseline) on the same resampled
 * rows. Pairing matters: the two series are scored on identical games, so the
 * paired delta has far tighter error bars than two independent CIs would suggest.
 */
function bootstrapDeltaCI(
  base: number[], variant: number[], y: (0 | 1)[], seed: number, nBoot: number,
  metric: (p: number[], y: (0 | 1)[]) => number,
): { lo: number; hi: number } {
  const n = y.length
  const rand = rng(seed)
  const deltas: number[] = []
  const bp = new Array(n), vp = new Array(n), by = new Array(n)
  for (let b = 0; b < nBoot; b++) {
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n)
      bp[i] = base[j]; vp[i] = variant[j]; by[i] = y[j]
    }
    deltas.push(metric(vp, by) - metric(bp, by))
  }
  deltas.sort((a, b) => a - b)
  const at = (q: number) => deltas[Math.min(deltas.length - 1, Math.max(0, Math.floor(q * deltas.length)))]
  return { lo: at(0.025), hi: at(0.975) }
}

const fmtCI = (d: number, ci: { lo: number; hi: number }) =>
  `${d >= 0 ? "+" : ""}${d.toFixed(5)}  [${ci.lo >= 0 ? "+" : ""}${ci.lo.toFixed(5)}, ${ci.hi >= 0 ? "+" : ""}${ci.hi.toFixed(5)}]`

// ─── Data ─────────────────────────────────────────────────────────────────────

/** The audit fix landed 2026-06-11 (scripts/deepnrfi/artifacts/manifest.json trainedAt). */
const AUDIT_FIX_DATE = new Date("2026-06-11T00:00:00Z")

function generationOf(recomputed: boolean, createdAt: Date): Gen {
  if (recomputed) return "B_recomputed"
  return createdAt < AUDIT_FIX_DATE ? "A_pre_audit_bulk" : "C_post_audit_live"
}

/**
 * Row shape returned by the raw query below.
 *
 * This goes through $queryRaw rather than findMany for one reason: the
 * PrismaNeonHTTP adapter cannot convert a DateTime column (it fails with
 * "expected a string in column 'createdAt', found {}"), and `createdAt` is what
 * separates the pre- from the post-audit engine generation. Casting it to text
 * in SQL sidesteps the adapter entirely, and doing the join here avoids pulling
 * ~9k predictions and ~9k results over HTTPS just to join them in memory.
 */
interface RawRow {
  id: string
  date: string
  season: number
  final: number
  recomputed: boolean
  created_at: string
  nrfi: boolean
}

async function loadRows(): Promise<Row[]> {
  const minSeason = Math.min(...SEASONS)
  const maxSeason = Math.max(...SEASONS)
  const raw = await prisma.$queryRaw<RawRow[]>`
    SELECT mp.id,
           mp.date,
           mp.season,
           mp."nrfiProbability"                              AS final,
           (mp."inputsPresence" -> 'recomputedAt') IS NOT NULL AS recomputed,
           mp."createdAt"::text                              AS created_at,
           gr.nrfi
      FROM model_predictions mp
      JOIN game_results gr
        ON gr."gamePk" = (CASE WHEN mp.id ~ '^[0-9]+$' THEN mp.id::int END)
     WHERE mp."userId" IS NULL
       AND mp.status = 'complete'
       AND mp.correct IS NOT NULL
       AND mp.season BETWEEN ${minSeason} AND ${maxSeason}
     ORDER BY mp.date ASC
  `
  return raw.map(r => ({
    raw: invertFinal(Number(r.final)),
    final: Number(r.final),
    y: (r.nrfi ? 1 : 0) as 0 | 1,
    season: Number(r.season),
    date: r.date,
    gen: generationOf(r.recomputed, new Date(r.created_at)),
  }))
}

/**
 * The affine inversion is exact only where the [0.18, 0.85] clamp did not bind.
 * A boundary row means the stored `final` lost information and its `raw` is
 * unrecoverable, which would corrupt every fit downstream — so refuse to run.
 */
function assertClampNonBinding(rows: Row[]): void {
  const stuck = rows.filter(r => r.final <= CLAMP_MIN + CLAMP_EPS || r.final >= CLAMP_MAX - CLAMP_EPS)
  if (stuck.length > 0) {
    console.error(
      `\nABORT: ${stuck.length} of ${rows.length} rows sit on the [${CLAMP_MIN}, ${CLAMP_MAX}] clamp ` +
      `boundary, so inverting the anchor blend cannot recover their raw ensemble value.\n` +
      `Persist the pre-calibration probability (ModelPrediction.ensembleNrfi or a new column) ` +
      `before refitting — see AUDIT_REPORT_V2.md:172.`
    )
    process.exit(1)
  }
}

// ─── Fold runner ──────────────────────────────────────────────────────────────

interface FoldResult {
  name: string
  nTrain: number
  nHold: number
  identity: { brier: number; logLoss: number; ece: number; intercept: number; slope: number }
  best: "identity" | "naive" | "compensated"
  /** Cohort labels the curve was FIT on — those cells are in-sample, not evidence. */
  trainLabels: string[]
  auc: number
  baseRateBrier: number
  compensatedKnots: number[][]
  deltaBrier: number
}

function runFold(name: string, note: string, train: Row[], holdout: Row[], trainLabels: string[]): FoldResult | null {
  console.log(`\n━━━ ${name} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  if (note) console.log(`  ${note}`)
  console.log(`  train n=${train.length}   holdout n=${holdout.length}`)
  if (train.length === 0 || holdout.length === 0) {
    console.log("  SKIPPED — empty fold")
    return null
  }

  const iso = fitIsotonic(train.map(r => r.raw), train.map(r => r.y))

  // Knot variants sampled at the 19-point grid
  const naiveKnots       = KNOT_GRID.map(x => [x, Math.max(0, Math.min(1, isoPredict(iso, x)))])
  const compensatedKnots = KNOT_GRID.map(x => {
    const target = isoPredict(iso, x)
    const g = (target - (1 - ENSEMBLE_BLEND) * ANCHOR) / ENSEMBLE_BLEND
    return [x, Math.max(0, Math.min(1, g))]
  })

  const hY = holdout.map(r => r.y)
  const deployed = (knots: number[][]) =>
    holdout.map(r => clampFinal(ENSEMBLE_BLEND * knotPredict(knots, r.raw) + (1 - ENSEMBLE_BLEND) * ANCHOR))

  const baseP  = holdout.map(r => r.final)
  const naiveP = deployed(naiveKnots)
  const compP  = deployed(compensatedKnots)

  const score = (p: number[]) => ({
    brier: brier(p, hY),
    logLoss: logLoss(p, hY),
    ece: ece(p, hY),
    ...calibrationCurve(p, hY),
  })
  const sBase = score(baseP), sNaive = score(naiveP), sComp = score(compP)

  // Discrimination + the do-nothing benchmark. AUC is reported once because every
  // variant here is a monotone transform of the same raw ensemble, so all three
  // share it exactly. `trainRate` is the train fold's base rate predicted flat on
  // the holdout — the score to beat before any calibration work is worth shipping.
  const auc = computeBacktestMetrics(
    holdout.map(r => ({ nrfiProbability: r.final, actualNrfi: r.y === 1, confidence: "All" })),
  ).auc
  const trainRate = train.reduce((a, r) => a + r.y, 0) / train.length
  const baseRateBrier = brier(holdout.map(() => trainRate), hY)

  const ciNaive = bootstrapDeltaCI(baseP, naiveP, hY, SEED, N_BOOT, brier)
  const ciComp  = bootstrapDeltaCI(baseP, compP,  hY, SEED, N_BOOT, brier)
  const ciNaiveLL = bootstrapDeltaCI(baseP, naiveP, hY, SEED, N_BOOT, (p, y) => logLoss(p, y))
  const ciCompLL  = bootstrapDeltaCI(baseP, compP,  hY, SEED, N_BOOT, (p, y) => logLoss(p, y))

  console.log(`\n  Benchmarks:  AUC ${auc.toFixed(4)} (identical for all variants — monotone)   ` +
    `flat-${trainRate.toFixed(4)} base-rate Brier ${baseRateBrier.toFixed(5)}`)
  console.log(`\n  Holdout metrics (Brier / log-loss / ECE / intercept / slope):`)
  console.log(`    identity (current engine):  ${sBase.brier.toFixed(5)}  ${sBase.logLoss.toFixed(5)}  ${sBase.ece.toFixed(5)}  ${sBase.intercept.toFixed(4)}  ${sBase.slope.toFixed(4)}`)
  console.log(`    naive refit:                ${sNaive.brier.toFixed(5)}  ${sNaive.logLoss.toFixed(5)}  ${sNaive.ece.toFixed(5)}  ${sNaive.intercept.toFixed(4)}  ${sNaive.slope.toFixed(4)}`)
  console.log(`    anchor-compensated refit:   ${sComp.brier.toFixed(5)}  ${sComp.logLoss.toFixed(5)}  ${sComp.ece.toFixed(5)}  ${sComp.intercept.toFixed(4)}  ${sComp.slope.toFixed(4)}`)

  console.log(`\n  Paired delta vs identity, 95% bootstrap CI (${N_BOOT} resamples, seed ${SEED}):`)
  console.log(`    Brier    naive:        ${fmtCI(sNaive.brier - sBase.brier, ciNaive)}`)
  console.log(`    Brier    compensated:  ${fmtCI(sComp.brier - sBase.brier, ciComp)}`)
  console.log(`    log-loss naive:        ${fmtCI(sNaive.logLoss - sBase.logLoss, ciNaiveLL)}`)
  console.log(`    log-loss compensated:  ${fmtCI(sComp.logLoss - sBase.logLoss, ciCompLL)}`)
  console.log(`    (negative = refit is better; a CI spanning 0 = no detectable difference)`)

  console.log(`\n  Holdout calibration — identity:`)
  for (const l of calBins(baseP, hY)) console.log(l)
  console.log(`  Holdout calibration — compensated refit:`)
  for (const l of calBins(compP, hY)) console.log(l)

  const best: FoldResult["best"] =
    sComp.brier < sBase.brier && sComp.brier <= sNaive.brier ? "compensated"
      : sNaive.brier < sBase.brier ? "naive"
      : "identity"
  console.log(`\n  Lowest holdout Brier: ${best.toUpperCase()}`)

  console.log(`\n  Proposed knots (anchor-compensated) — paste into lib/calibration.ts ONLY after review:`)
  console.log(`  const CALIBRATION_KNOTS = [`)
  for (const [x, y] of compensatedKnots) console.log(`    [${x.toFixed(2)}, ${y.toFixed(4)}],`)
  console.log(`  ]`)

  return {
    name, nTrain: train.length, nHold: holdout.length,
    identity: sBase, best, compensatedKnots, auc, baseRateBrier, trainLabels,
    deltaBrier: sComp.brier - sBase.brier,
  }
}

/**
 * Applies each fold's fitted curve to every OTHER cohort's holdout. This is the
 * measurement that decides whether a refit is shippable at all: a curve that
 * only helps the cohort it was fit on is an artefact, not a calibration.
 */
function crossGenerationTransfer(fits: FoldResult[], cohorts: { label: string; rows: Row[] }[]) {
  console.log(`\n\n━━━ Cross-generation transfer ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  Holdout Brier delta vs identity when a fold's compensated curve is`)
  console.log(`  applied to a cohort it was NOT fit on. Positive = worse than shipping nothing.`)
  console.log(`  Cells marked * are IN-SAMPLE (that cohort was part of the fit) — not evidence.\n`)
  const pad = (s: string, n: number) => s.padEnd(n)
  const LABEL_W = Math.max(34, ...fits.map(f => f.name.length + 2))
  console.log(`  ${pad("fitted on", LABEL_W)}${cohorts.map(c => pad(c.label, 12)).join("")}`)
  for (const f of fits) {
    const cells = cohorts.map(c => {
      const y = c.rows.map(r => r.y)
      const base = c.rows.map(r => r.final)
      const dep = c.rows.map(r => clampFinal(ENSEMBLE_BLEND * knotPredict(f.compensatedKnots, r.raw) + (1 - ENSEMBLE_BLEND) * ANCHOR))
      const d = brier(dep, y) - brier(base, y)
      const inSample = f.trainLabels.includes(c.label)
      return pad(`${d >= 0 ? "+" : ""}${d.toFixed(5)}${inSample ? "*" : " "}`, 12)
    })
    console.log(`  ${pad(f.name, LABEL_W)}${cells.join("")}`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Walk-forward calibration refit (diagnostic — manual promotion only)")
  console.log(`Run at: ${new Date().toISOString()}`)
  console.log(`Folds: ${FOLD_MODE}   seed: ${SEED}   bootstrap: ${N_BOOT}`)

  const rows = await loadRows()
  assertClampNonBinding(rows)
  console.log(`\nLoaded ${rows.length} scored system predictions joined to ground truth.`)
  console.log(`Clamp check: 0 of ${rows.length} rows on the [${CLAMP_MIN}, ${CLAMP_MAX}] boundary — inversion is exact.`)

  const bySeason = (s: number) => rows.filter(r => r.season === s)
  const cohort = (gen: Gen, season: number) => rows.filter(r => r.gen === gen && r.season === season)

  console.log(`\nCohorts (generation × season):`)
  const cohortKeys: { label: string; rows: Row[] }[] = []
  for (const gen of ["A_pre_audit_bulk", "B_recomputed", "C_post_audit_live"] as Gen[]) {
    for (const s of SEASONS) {
      const c = cohort(gen, s)
      if (c.length === 0) continue
      const label = `${gen.split("_")[0]}/${s}`
      cohortKeys.push({ label, rows: c })
      const meanP = c.reduce((a, r) => a + r.final, 0) / c.length
      const act = c.reduce((a, r) => a + r.y, 0) / c.length
      console.log(
        `  ${label.padEnd(10)} n=${String(c.length).padStart(4)}  ${c[0].date}→${c[c.length - 1].date}  ` +
        `mean pred ${meanP.toFixed(4)}  actual ${act.toFixed(4)}  bias ${(meanP - act >= 0 ? "+" : "")}${(meanP - act).toFixed(4)}`
      )
    }
  }

  const fits: FoldResult[] = []

  if (FOLD_MODE === "both" || FOLD_MODE === "committed") {
    console.log(`\n\n═══ COMMITTED FOLDS (season-based; mixes engine generations) ═══`)
    const a = runFold("Fold A: fit 2024 → holdout 2025", "", bySeason(2024), bySeason(2025), ["A/2024"])
    const b = runFold("Fold B: fit 2024+2025 → holdout 2026", "", [...bySeason(2024), ...bySeason(2025)], bySeason(2026), ["A/2024", "A/2025"])
    if (a) fits.push(a)
    if (b) fits.push(b)
  }

  if (FOLD_MODE === "both" || FOLD_MODE === "engine-aware") {
    console.log(`\n\n═══ ENGINE-AWARE FOLDS (train and holdout share one generation) ═══`)
    const ea1 = runFold(
      "Fold EA-1: A/2024 → A/2025",
      "Pre-audit bulk backfill only; temporal order preserved.",
      cohort("A_pre_audit_bulk", 2024), cohort("A_pre_audit_bulk", 2025), ["A/2024"],
    )
    const ea2 = runFold(
      "Fold EA-2: B/2023 → B/2026",
      "Recomputed (post-fix engine) only — the generation that actually ships.",
      cohort("B_recomputed", 2023), cohort("B_recomputed", 2026), ["B/2023"],
    )
    if (ea1) fits.push(ea1)
    if (ea2) fits.push(ea2)

    const c2026 = cohort("C_post_audit_live", 2026)
    console.log(`\n━━━ Cohort C/2026 (post-audit live) — holdout only ━━━━━━━━━━━━━`)
    console.log(`  n=${c2026.length}. No same-generation training data exists, so this cohort`)
    console.log(`  cannot support its own fold; it appears in the transfer table below.`)
  }

  if (fits.length > 0) crossGenerationTransfer(fits, cohortKeys)

  console.log(`\n\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  AUC is unchanged by every variant here: the deployed transform is monotone`)
  console.log(`  in raw, and AUC is rank-based (lib/backtest-metrics.ts:46-52). Recalibration`)
  console.log(`  can only move the calibration component of Brier, never discrimination.\n`)
  for (const f of fits) {
    console.log(
      `  ${f.name.padEnd(40)} best=${f.best.padEnd(12)} ` +
      `ΔBrier(comp)=${f.deltaBrier >= 0 ? "+" : ""}${f.deltaBrier.toFixed(5)}  ` +
      `AUC=${f.auc.toFixed(4)}  engine ${f.identity.brier.toFixed(5)} vs flat ${f.baseRateBrier.toFixed(5)}`
    )
  }
  console.log(`\n  Nothing was written. lib/calibration.ts remains the identity mapping.`)

  await prisma.$disconnect()
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
