/**
 * Walk-forward calibration refit (the deferred AUDIT P1-4 item) — DIAGNOSTIC,
 * prints proposed knots; never writes to lib/calibration.ts.
 *
 * ── Recovering the raw ensemble ──────────────────────────────────────────────
 * No raw pre-calibration probability is persisted (EnsembleDiagnostic.rawEnsemble7
 * has no writer), so raw must be recovered by inverting the deployed transform:
 *
 *   final = clamp( ENSEMBLE_BLEND·cal(raw) + (1-ENSEMBLE_BLEND)·ANCHOR, 0.18, 0.85 )
 *
 * That inversion depends on WHICH ENGINE wrote the row, and the archive contains
 * two.  Commit 09baf70 (2026-06-09T22:20:23Z, "Fix all findings from the
 * prediction-engine audit") reset the knot table to the identity and moved
 * LEAGUE_ANCHOR from 0.559 to 0.516.  Rows written before it went through
 * non-identity knots and the 0.559 anchor, so inverting them with the current
 * identity/0.516 pipeline yields a value that is NOT their raw ensemble.
 *
 * Each row is therefore inverted with the pipeline that actually produced it:
 *   POST_FIX  final = 0.76·raw          + 0.24·0.516   (identity knots)
 *   PRE_FIX   final = 0.76·calOld(raw)  + 0.24·0.559   (OLD_KNOTS, inverted)
 *
 * Dating a row's CONTENT is subtle: `updatedAt` is bumped by settlement writes
 * that never touch nrfiProbability, so a late updatedAt does not prove a
 * recompute.  The only positive evidence of a recompute is
 * `inputsPresence.recomputedAt`.  So content date = recomputedAt when present,
 * else createdAt (the probability was written at insert and never recomputed).
 *
 * Even with a correct inversion, PRE_FIX rows come from a different model — the
 * same commit fixed the P0-1 shrinkage scale bug, which changes raw itself.  Their
 * raw values are recoverable but not commensurable with the current engine's, so
 * `--pool=verified` (the default) restricts every fold to rows whose recompute
 * stamp proves post-fix provenance.  `--pool=all` includes PRE_FIX rows, inverted
 * correctly, and marks the affected folds PROVISIONAL.
 *
 * ── Knot variants ────────────────────────────────────────────────────────────
 *   naive:        knots = isotonic(raw → y) sampled at the 19-knot grid.
 *                 The anchor blend then drags the output back toward the anchor,
 *                 re-introducing miscalibration.
 *   compensated:  knots = (isotonic − 0.24·ANCHOR) / 0.76, so the DEPLOYED
 *                 final output equals the isotonic estimate exactly.
 * Both are evaluated against two readings of the isotonic fit — the interpolated
 * one (linear between pooled-block centres, matching sklearn's IsotonicRegression
 * and scripts/deepnrfi/recalibrate.py) and the exact PAV step function — so the
 * verdict cannot be an artefact of how the fit is read back.
 *
 * Usage:
 *   PRISMA_NEON_HTTP=true NODE_ENV=development npx tsx scripts/refit-calibration.ts
 *   ... --pool=all --folds=engine-aware --seed=7 --bootstrap=2000
 *
 * Reads through lib/prisma so the PRISMA_NEON_HTTP escape hatch works in
 * sandboxes that block the Postgres wire port (see lib/prisma.ts).
 */

import { computeBacktestMetrics, logLoss } from "../lib/backtest-metrics"
import { prisma } from "../lib/prisma"

const ENSEMBLE_BLEND = 0.76
const ANCHOR = 0.516
const CLAMP_MIN = 0.18
const CLAMP_MAX = 0.85
const CLAMP_EPS = 1e-4
const KNOT_GRID = Array.from({ length: 19 }, (_, i) => 0.05 + i * 0.05)
const SEASONS = [2023, 2024, 2025, 2026]

/** Commit 09baf70 — the audit reset that made the knots identity and the anchor 0.516. */
const AUDIT_FIX_AT = new Date("2026-06-09T22:20:23Z")

/** The knot table and anchor in force BEFORE that commit (git show 09baf70^). */
const OLD_KNOTS: [number, number][] = [
  [0.05, 0.060], [0.10, 0.114], [0.15, 0.168], [0.20, 0.224], [0.25, 0.278],
  [0.30, 0.324], [0.35, 0.382], [0.40, 0.436], [0.45, 0.489], [0.50, 0.542],
  [0.55, 0.595], [0.60, 0.648], [0.65, 0.692], [0.70, 0.730], [0.75, 0.765],
  [0.80, 0.800], [0.85, 0.828], [0.90, 0.855], [0.95, 0.930],
]
const OLD_ANCHOR = 0.559

// ─── CLI ──────────────────────────────────────────────────────────────────────

const argOf = (name: string, fallback: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback

const FOLD_MODE = argOf("folds", "both")
const POOL = argOf("pool", "verified")
const SEED = parseInt(argOf("seed", "20260827"), 10)
const N_BOOT = parseInt(argOf("bootstrap", "2000"), 10)

if (!["both", "committed", "engine-aware"].includes(FOLD_MODE)) {
  console.error(`--folds must be one of: both | committed | engine-aware (got "${FOLD_MODE}")`)
  process.exit(1)
}
if (!["verified", "all"].includes(POOL)) {
  console.error(`--pool must be one of: verified | all (got "${POOL}")`)
  process.exit(1)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Pipeline = "POST_FIX" | "PRE_FIX"

interface Row {
  raw: number
  final: number
  y: 0 | 1
  season: number
  date: string
  pipeline: Pipeline
  /** True when a recompute stamp proves the row was written by the post-fix engine. */
  verified: boolean
  cohort: string
}

const clampFinal = (p: number) => Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, p))

// ─── Piecewise-linear knot map and its inverse ───────────────────────────────

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

/** Inverse of knotPredict for a strictly increasing knot table (used for OLD_KNOTS). */
function knotInverse(knots: [number, number][], y: number): number {
  if (y <= knots[0][1]) return knots[0][0]
  const last = knots[knots.length - 1]
  if (y >= last[1]) return last[0]
  for (let i = 0; i < knots.length - 1; i++) {
    const [x0, y0] = knots[i]
    const [x1, y1] = knots[i + 1]
    if (y <= y1) return x0 + ((y - y0) / (y1 - y0)) * (x1 - x0)
  }
  return last[0]
}

/** Invert the deployed transform using the pipeline that actually wrote the row. */
function invertFinal(final: number, pipeline: Pipeline): number {
  if (pipeline === "POST_FIX") {
    return (final - (1 - ENSEMBLE_BLEND) * ANCHOR) / ENSEMBLE_BLEND
  }
  // PRE_FIX: undo the 0.559 anchor blend, then undo the old non-identity knots.
  const calibrated = (final - (1 - ENSEMBLE_BLEND) * OLD_ANCHOR) / ENSEMBLE_BLEND
  return knotInverse(OLD_KNOTS, calibrated)
}

// ─── Isotonic regression (pool-adjacent-violators) ───────────────────────────

interface IsoBlock { mean: number; minX: number; maxX: number }
interface IsoModel { blocks: IsoBlock[]; xs: number[]; ys: number[] }

function fitIsotonic(x: number[], y: number[]): IsoModel {
  const idx = x.map((_, i) => i).sort((a, b) => x[a] - x[b])
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
    blocks: blocks.map(b => ({ mean: b.sumY / b.n, minX: b.minX, maxX: b.maxX })),
    xs: blocks.map(b => (b.minX + b.maxX) / 2),
    ys: blocks.map(b => b.sumY / b.n),
  }
}

/**
 * Interpolated reading: linear between pooled-block centres. This is what
 * sklearn's IsotonicRegression returns (and therefore what
 * scripts/deepnrfi/recalibrate.py would produce), so it is the variant that
 * matters for "would the canonical refit path help?".
 */
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

/**
 * Exact PAV reading: the pooled mean across each block's FULL span, i.e. the
 * true isotonic solution as a step function. Reported alongside the
 * interpolated variant so the verdict cannot be blamed on the smoothing.
 */
function isoPredictStep(m: IsoModel, x: number): number {
  const b = m.blocks
  if (x <= b[0].maxX) return b[0].mean
  for (let i = 0; i < b.length; i++) {
    if (x >= b[i].minX && x <= b[i].maxX) return b[i].mean
    if (i + 1 < b.length && x > b[i].maxX && x < b[i + 1].minX) {
      // Between blocks: PAV is undefined here; nearest block edge keeps it monotone.
      return x - b[i].maxX <= b[i + 1].minX - x ? b[i].mean : b[i + 1].mean
    }
  }
  return b[b.length - 1].mean
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

/**
 * AUC via computeBacktestMetrics. Computed SEPARATELY for every variant: rank
 * invariance holds only for a STRICTLY increasing transform, and an isotonic fit
 * is merely non-decreasing — flat blocks, knot clipping to [0,1] and the output
 * clamp can all collapse distinct scores into ties and move AUC.
 */
const aucOf = (p: number[], y: (0 | 1)[]) =>
  computeBacktestMetrics(p.map((prob, i) => ({
    nrfiProbability: prob, actualNrfi: y[i] === 1, confidence: "All",
  }))).auc

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

const sgn = (v: number) => (v >= 0 ? "+" : "")
const fmtCI = (d: number, ci: { lo: number; hi: number }) =>
  `${sgn(d)}${d.toFixed(5)}  [${sgn(ci.lo)}${ci.lo.toFixed(5)}, ${sgn(ci.hi)}${ci.hi.toFixed(5)}]`

// ─── Data ─────────────────────────────────────────────────────────────────────

interface RawRow {
  id: string
  date: string
  season: number
  final: number
  recomputed_at: string | null
  created_at: string
  nrfi: boolean
}

/**
 * Goes through $queryRaw rather than findMany because the PrismaNeonHTTP adapter
 * cannot convert a DateTime column ("expected a string in column 'createdAt',
 * found {}"), and the timestamps are what date a row's content. Doing the join
 * here also avoids pulling ~9k predictions and ~9k results over HTTPS separately.
 */
async function loadRows(): Promise<Row[]> {
  const minSeason = Math.min(...SEASONS)
  const maxSeason = Math.max(...SEASONS)
  const raw = await prisma.$queryRaw<RawRow[]>`
    SELECT mp.id,
           mp.date,
           mp.season,
           mp."nrfiProbability"                    AS final,
           mp."inputsPresence" ->> 'recomputedAt'  AS recomputed_at,
           mp."createdAt"::text                    AS created_at,
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
  return raw.map(r => {
    // A recompute stamp is the only positive evidence of when the PROBABILITY was
    // written; updatedAt is bumped by settlement writes that never touch it.
    const recomputedAt = r.recomputed_at ? new Date(r.recomputed_at) : null
    const contentAt = recomputedAt ?? new Date(r.created_at)
    const pipeline: Pipeline = contentAt >= AUDIT_FIX_AT ? "POST_FIX" : "PRE_FIX"
    const verified = recomputedAt !== null && recomputedAt >= AUDIT_FIX_AT
    const final = Number(r.final)
    return {
      raw: invertFinal(final, pipeline),
      final,
      y: (r.nrfi ? 1 : 0) as 0 | 1,
      season: Number(r.season),
      date: r.date,
      pipeline,
      verified,
      cohort: `${verified ? "V" : pipeline === "POST_FIX" ? "U" : "P"}/${r.season}`,
    }
  })
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
      `Persist the pre-calibration probability (a new ModelPrediction column) before ` +
      `refitting — see AUDIT_REPORT_V2.md:172.`
    )
    process.exit(1)
  }
}

// ─── Fold runner ──────────────────────────────────────────────────────────────

interface FoldResult {
  name: string
  provisional: boolean
  nTrain: number
  nHold: number
  identityBrier: number
  bestBrier: number
  best: string
  deltaBrier: number
  compensatedKnots: number[][]
  trainCohorts: string[]
}

type Variant = { label: string; knots: number[][] }

function buildVariants(iso: IsoModel): Variant[] {
  const compensate = (t: number) => (t - (1 - ENSEMBLE_BLEND) * ANCHOR) / ENSEMBLE_BLEND
  const clip01 = (v: number) => Math.max(0, Math.min(1, v))
  const grid = (f: (x: number) => number) => KNOT_GRID.map(x => [x, clip01(f(x))])
  return [
    { label: "naive (interp)", knots: grid(x => isoPredict(iso, x)) },
    { label: "compensated (interp)", knots: grid(x => compensate(isoPredict(iso, x))) },
    { label: "naive (PAV step)", knots: grid(x => isoPredictStep(iso, x)) },
    { label: "compensated (PAV step)", knots: grid(x => compensate(isoPredictStep(iso, x))) },
  ]
}

function runFold(
  name: string, note: string, train: Row[], holdout: Row[], trainCohorts: string[],
): FoldResult | null {
  const provisional = [...train, ...holdout].some(r => !r.verified)
  console.log(`\n━━━ ${name}${provisional ? "  [PROVISIONAL]" : ""} ━━━━━━━━━━━━━━━━━━━━━━━━`)
  if (note) console.log(`  ${note}`)
  console.log(`  train n=${train.length}   holdout n=${holdout.length}`)
  if (train.length === 0 || holdout.length === 0) {
    console.log("  SKIPPED — empty fold")
    return null
  }
  if (provisional) {
    console.log(`  PROVISIONAL: contains rows with no post-fix recompute stamp. Their raw`)
    console.log(`  values are reconstructed through the pre-fix pipeline (OLD_KNOTS, anchor`)
    console.log(`  ${OLD_ANCHOR}); that inversion is arithmetically correct but the engine that`)
    console.log(`  produced them also predates the P0-1 shrinkage fix, so its raw scale is not`)
    console.log(`  commensurable with today's. Treat as indicative only.`)
  }

  const iso = fitIsotonic(train.map(r => r.raw), train.map(r => r.y))
  const hY = holdout.map(r => r.y)
  const baseP = holdout.map(r => r.final)
  const deployed = (knots: number[][]) =>
    holdout.map(r => clampFinal(ENSEMBLE_BLEND * knotPredict(knots, r.raw) + (1 - ENSEMBLE_BLEND) * ANCHOR))

  const score = (p: number[]) => ({
    brier: brier(p, hY), logLoss: logLoss(p, hY), ece: ece(p, hY),
    auc: aucOf(p, hY), ...calibrationCurve(p, hY),
  })

  const trainRate = train.reduce((a, r) => a + r.y, 0) / train.length
  const baseRateBrier = brier(holdout.map(() => trainRate), hY)
  const sBase = score(baseP)

  console.log(`\n  Benchmark: predicting the train base rate ${trainRate.toFixed(4)} flat → Brier ${baseRateBrier.toFixed(5)}`)
  console.log(`\n  ${"variant".padEnd(24)}${"Brier".padEnd(10)}${"logLoss".padEnd(10)}${"ECE".padEnd(10)}${"AUC".padEnd(9)}${"icept".padEnd(9)}slope`)
  const line = (label: string, s: ReturnType<typeof score>) =>
    console.log(`  ${label.padEnd(24)}${s.brier.toFixed(5).padEnd(10)}${s.logLoss.toFixed(5).padEnd(10)}` +
      `${s.ece.toFixed(5).padEnd(10)}${s.auc.toFixed(4).padEnd(9)}${s.intercept.toFixed(4).padEnd(9)}${s.slope.toFixed(4)}`)
  line("identity (deployed)", sBase)

  const variants = buildVariants(iso)
  const scored = variants.map(v => {
    const p = deployed(v.knots)
    return { ...v, p, s: score(p) }
  })
  for (const v of scored) line(v.label, v.s)

  console.log(`\n  Paired delta vs identity, 95% bootstrap CI (${N_BOOT} resamples, seed ${SEED}):`)
  for (const v of scored) {
    const ciB = bootstrapDeltaCI(baseP, v.p, hY, SEED, N_BOOT, brier)
    const ciL = bootstrapDeltaCI(baseP, v.p, hY, SEED, N_BOOT, (p, y) => logLoss(p, y))
    console.log(`    ${v.label.padEnd(24)} Brier ${fmtCI(v.s.brier - sBase.brier, ciB)}`)
    console.log(`    ${"".padEnd(24)} logL  ${fmtCI(v.s.logLoss - sBase.logLoss, ciL)}`)
  }
  console.log(`    (negative = refit better; a CI spanning 0 = no detectable difference either way)`)

  const comp = scored.find(v => v.label === "compensated (interp)")!
  console.log(`\n  Holdout calibration — identity:`)
  for (const l of calBins(baseP, hY)) console.log(l)
  console.log(`  Holdout calibration — compensated (interp):`)
  for (const l of calBins(comp.p, hY)) console.log(l)

  const bestVariant = scored.reduce((a, b) => (b.s.brier < a.s.brier ? b : a))
  const best = bestVariant.s.brier < sBase.brier ? bestVariant.label : "identity"
  console.log(`\n  Lowest holdout Brier: ${best.toUpperCase()}`)

  console.log(`\n  Proposed knots (compensated, interp) — paste into lib/calibration.ts ONLY after review:`)
  console.log(`  const CALIBRATION_KNOTS = [`)
  for (const [x, y] of comp.knots) console.log(`    [${x.toFixed(2)}, ${y.toFixed(4)}],`)
  console.log(`  ]`)

  return {
    name, provisional, nTrain: train.length, nHold: holdout.length,
    identityBrier: sBase.brier, bestBrier: Math.min(sBase.brier, bestVariant.s.brier), best,
    deltaBrier: comp.s.brier - sBase.brier, compensatedKnots: comp.knots, trainCohorts,
  }
}

/**
 * Applies each fold's fitted curve to every other cohort's holdout, WITH bootstrap
 * CIs — a bare point delta cannot distinguish negative transfer from noise.
 */
function crossGenerationTransfer(fits: FoldResult[], cohorts: { label: string; rows: Row[] }[]) {
  console.log(`\n\n━━━ Cross-cohort transfer ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  Holdout Brier delta vs identity when a fold's compensated curve is applied`)
  console.log(`  to another cohort, with 95% paired bootstrap CIs. Positive = worse than`)
  console.log(`  shipping nothing. Cells marked * are IN-SAMPLE — not evidence.\n`)
  for (const f of fits) {
    console.log(`  ${f.name}`)
    for (const c of cohorts) {
      const y = c.rows.map(r => r.y)
      const base = c.rows.map(r => r.final)
      const dep = c.rows.map(r => clampFinal(
        ENSEMBLE_BLEND * knotPredict(f.compensatedKnots, r.raw) + (1 - ENSEMBLE_BLEND) * ANCHOR))
      const d = brier(dep, y) - brier(base, y)
      const ci = bootstrapDeltaCI(base, dep, y, SEED, N_BOOT, brier)
      const mark = f.trainCohorts.includes(c.label) ? "*" : " "
      console.log(`    → ${c.label.padEnd(8)}${mark} n=${String(c.rows.length).padStart(4)}  ${fmtCI(d, ci)}`)
    }
  }
}

/**
 * Tests the "opposite biases ⇒ no single monotone curve can serve both" claim
 * properly. Aggregate bias alone does NOT establish it: a monotone curve may cross
 * the identity line (shrinkage raises low probabilities and lowers high ones), and
 * cohorts with different prediction distributions can both be helped by one curve.
 * The claim only holds if, at MATCHED raw values, the cohorts disagree about which
 * direction the correction should go. That is what this measures.
 */
function conditionalConflict(cohorts: { label: string; rows: Row[] }[]) {
  console.log(`\n\n━━━ Conditional check: do cohorts disagree at the SAME raw value? ━━━`)
  console.log(`  Realized NRFI rate minus mean raw, within shared raw-probability bins.`)
  console.log(`  A monotone curve can serve two cohorts iff the required correction has the`)
  console.log(`  same sign in every shared bin. Bins with n < 30 in a cohort are omitted.\n`)
  const edges = [0.40, 0.45, 0.50, 0.55, 0.60]
  const shown = cohorts.filter(c => c.rows.length >= 200)
  console.log(`  ${"raw bin".padEnd(14)}${shown.map(c => c.label.padEnd(18)).join("")}`)
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1]
    const cells = shown.map(c => {
      const inBin = c.rows.filter(r => r.raw >= lo && r.raw < hi)
      if (inBin.length < 30) return "—".padEnd(18)
      const mr = inBin.reduce((a, r) => a + r.raw, 0) / inBin.length
      const act = inBin.reduce((a, r) => a + r.y, 0) / inBin.length
      return `${sgn(act - mr)}${(act - mr).toFixed(3)} (n=${inBin.length})`.padEnd(18)
    })
    console.log(`  ${`[${lo.toFixed(2)},${hi.toFixed(2)})`.padEnd(14)}${cells.join("")}`)
  }
  console.log(`\n  Read: a sign disagreement across cohorts WITHIN a bin is direct evidence that`)
  console.log(`  no single monotone curve serves both. Agreement means the failed transfer is`)
  console.log(`  an empirical result, not a structural impossibility.`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Walk-forward calibration refit (diagnostic — manual promotion only)")
  console.log(`Run at: ${new Date().toISOString()}`)
  console.log(`Pool: ${POOL}   folds: ${FOLD_MODE}   seed: ${SEED}   bootstrap: ${N_BOOT}`)

  const all = await loadRows()
  assertClampNonBinding(all)
  const rows = POOL === "verified" ? all.filter(r => r.verified) : all

  console.log(`\nLoaded ${all.length} scored system predictions joined to ground truth.`)
  console.log(`Clamp check: 0 on the [${CLAMP_MIN}, ${CLAMP_MAX}] boundary — inversion arithmetic is exact.`)
  console.log(`Provenance: ${all.filter(r => r.verified).length} verified post-fix (recompute stamp ≥ ` +
    `${AUDIT_FIX_AT.toISOString()}), ${all.filter(r => !r.verified).length} unverified.`)
  console.log(`Pool "${POOL}" → ${rows.length} rows in play.`)

  const cohortsPresent = [...new Set(rows.map(r => r.cohort))].sort()
  console.log(`\nCohorts (V=verified post-fix, U=unverified post-fix, P=pre-fix pipeline):`)
  const cohortList: { label: string; rows: Row[] }[] = []
  for (const label of cohortsPresent) {
    const c = rows.filter(r => r.cohort === label)
    cohortList.push({ label, rows: c })
    const meanP = c.reduce((a, r) => a + r.final, 0) / c.length
    const meanRaw = c.reduce((a, r) => a + r.raw, 0) / c.length
    const act = c.reduce((a, r) => a + r.y, 0) / c.length
    console.log(
      `  ${label.padEnd(8)} n=${String(c.length).padStart(4)}  ${c[0].date}→${c[c.length - 1].date}  ` +
      `mean raw ${meanRaw.toFixed(4)}  mean final ${meanP.toFixed(4)}  actual ${act.toFixed(4)}  ` +
      `bias ${sgn(meanP - act)}${(meanP - act).toFixed(4)}`)
  }

  const inCohort = (label: string) => rows.filter(r => r.cohort === label)
  const bySeason = (s: number) => rows.filter(r => r.season === s)
  const fits: FoldResult[] = []

  if (FOLD_MODE === "both" || FOLD_MODE === "committed") {
    console.log(`\n\n═══ COMMITTED FOLDS (season-based) ═══`)
    const a = runFold("Fold A: fit 2024 → holdout 2025", "", bySeason(2024), bySeason(2025),
      [...new Set(bySeason(2024).map(r => r.cohort))])
    const b = runFold("Fold B: fit 2024+2025 → holdout 2026", "",
      [...bySeason(2024), ...bySeason(2025)], bySeason(2026),
      [...new Set([...bySeason(2024), ...bySeason(2025)].map(r => r.cohort))])
    if (a) fits.push(a)
    if (b) fits.push(b)
  }

  if (FOLD_MODE === "both" || FOLD_MODE === "engine-aware") {
    console.log(`\n\n═══ ENGINE-AWARE FOLDS (train and holdout share a pipeline) ═══`)
    const ea2 = runFold(
      "Fold EA-2: V/2023 → V/2026",
      "Verified post-fix rows only — the only fold whose inversion is provably valid.",
      inCohort("V/2023"), inCohort("V/2026"), ["V/2023"])
    if (ea2) fits.push(ea2)

    if (POOL === "all") {
      const ea1 = runFold(
        "Fold EA-1: P/2024 → P/2025",
        "Pre-fix pipeline only; inverted through OLD_KNOTS.",
        inCohort("P/2024"), inCohort("P/2025"), ["P/2024"])
      if (ea1) fits.push(ea1)
    }
  }

  if (fits.length > 0) crossGenerationTransfer(fits, cohortList)
  conditionalConflict(cohortList)

  console.log(`\n\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  for (const f of fits) {
    console.log(`  ${(f.name + (f.provisional ? " [PROV]" : "")).padEnd(48)} best=${f.best.padEnd(24)} ` +
      `identity ${f.identityBrier.toFixed(5)}  Δcomp ${sgn(f.deltaBrier)}${f.deltaBrier.toFixed(5)}`)
  }
  console.log(`\n  Nothing was written. lib/calibration.ts remains the identity mapping.`)

  await prisma.$disconnect()
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
