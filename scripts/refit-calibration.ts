/**
 * Walk-forward calibration refit (the deferred AUDIT P1-4 item) — DIAGNOSTIC,
 * prints proposed knots; never writes to lib/calibration.ts.
 *
 * Pipeline context (lib/nrfi-engine.ts):
 *   final = clamp( 0.76·cal(raw) + 0.24·ANCHOR, 0.18, 0.85 ),  ANCHOR = 0.516
 *
 * Stored nrfiProbability is `final` under the IDENTITY calibration, so the raw
 * ensemble is recoverable by inverting the affine map wherever the clamp
 * doesn't bind (it essentially never does — pred stddev ≈ 0.057 around 0.5).
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
 * Usage:  DATABASE_URL=... npx tsx scripts/refit-calibration.ts
 */

import { PrismaClient } from "@prisma/client"

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1) }
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })

const ENSEMBLE_BLEND = 0.76
const ANCHOR = 0.516
const CLAMP_MIN = 0.18
const CLAMP_MAX = 0.85
const KNOT_GRID = Array.from({ length: 19 }, (_, i) => 0.05 + i * 0.05)

interface Row { raw: number; final: number; y: 0 | 1 }

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

// ─── Data ─────────────────────────────────────────────────────────────────────

async function loadSeason(season: number): Promise<Row[]> {
  const preds = await prisma.modelPrediction.findMany({
    where: { season, status: "complete", correct: { not: null } },
    select: { id: true, nrfiProbability: true },
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
    rows.push({ raw: invertFinal(p.nrfiProbability), final: p.nrfiProbability, y: nrfi ? 1 : 0 })
  }
  return rows
}

// ─── Fold runner ──────────────────────────────────────────────────────────────

function runFold(name: string, train: Row[], holdout: Row[]) {
  console.log(`\n━━━ ${name} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  train n=${train.length}   holdout n=${holdout.length}`)

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

  console.log(`\n  Holdout Brier:`)
  console.log(`    identity (current engine):  ${brier(baseP, hY).toFixed(5)}`)
  console.log(`    naive refit:                ${brier(naiveP, hY).toFixed(5)}`)
  console.log(`    anchor-compensated refit:   ${brier(compP, hY).toFixed(5)}`)

  console.log(`\n  Holdout calibration — identity:`)
  for (const l of calBins(baseP, hY)) console.log(l)
  console.log(`  Holdout calibration — compensated refit:`)
  for (const l of calBins(compP, hY)) console.log(l)

  console.log(`\n  Proposed knots (anchor-compensated) — paste into lib/calibration.ts ONLY after review:`)
  console.log(`  const CALIBRATION_KNOTS = [`)
  for (const [x, y] of compensatedKnots) console.log(`    [${x.toFixed(2)}, ${y.toFixed(4)}],`)
  console.log(`  ]`)
}

async function main() {
  console.log("Walk-forward calibration refit (diagnostic — manual promotion only)")
  console.log(`Run at: ${new Date().toISOString()}`)

  const [s2024, s2025, s2026] = await Promise.all([loadSeason(2024), loadSeason(2025), loadSeason(2026)])

  runFold("Fold A: fit 2024 → holdout 2025", s2024, s2025)
  runFold("Fold B: fit 2024+2025 → holdout 2026", [...s2024, ...s2025], s2026)

  await prisma.$disconnect()
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
