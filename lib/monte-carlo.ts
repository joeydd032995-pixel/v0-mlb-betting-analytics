/**
 * Monte Carlo first-inning simulator.
 *
 * Walks the same 24-state base-out machine encoded in `computeMarkovNrfi`
 * (`lib/nrfi-models.ts`) but stochastically per plate appearance.  Default
 * 8000 sims per game (~30ms each), seeded by gameId so results are reproducible.
 *
 * Outputs include the run distribution histogram needed for the Phase 5 UI
 * (deferred) and a variance signal that augments confidence scoring.
 */

import type { PerPAProbs, MonteCarloHalfResult, MonteCarloResult } from "./types"

/** Mulberry32 — small, fast, deterministic 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Build a CDF over the 6 PA outcomes; returned in fixed order out/walk/single/double/triple/hr. */
function buildCdf(p: PerPAProbs): number[] {
  const c = [p.out, p.out + p.walk, p.out + p.walk + p.single, p.out + p.walk + p.single + p.double, p.out + p.walk + p.single + p.double + p.triple, 1]
  // Final entry is forced to 1 even if the inputs sum slightly under (HR catches the rest).
  return c
}

type Outcome = 0 | 1 | 2 | 3 | 4 | 5  // out, walk, single, double, triple, hr

function sampleOutcome(rand: number, cdf: number[]): Outcome {
  if (rand < cdf[0]) return 0
  if (rand < cdf[1]) return 1
  if (rand < cdf[2]) return 2
  if (rand < cdf[3]) return 3
  if (rand < cdf[4]) return 4
  return 5
}

/** Apply an outcome to a runner-state.  Returns [next runner bits, runs scored]. */
function applyOutcome(o: Outcome, runners: number): [number, number] {
  switch (o) {
    case 0: return [runners, 0]
    case 1: {  // walk: force advance
      const has1 = (runners & 1) !== 0
      const has2 = (runners & 2) !== 0
      const has3 = (runners & 4) !== 0
      if (has1 && has2 && has3) return [0b111, 1]
      if (has1 && has2) return [0b111, 0]
      if (has1) return [(runners | 0b011), 0]
      return [(runners | 0b001), 0]
    }
    case 2: {  // single: batter to 1st, runners advance ~1; 3rd scores
      let runs = 0
      let next = 0b001
      if (runners & 0b100) runs++
      if (runners & 0b010) next |= 0b100
      if (runners & 0b001) next |= 0b010
      return [next, runs]
    }
    case 3: {  // double: batter to 2nd; 2nd and 3rd score; 1st → 3rd
      let runs = 0
      let next = 0b010
      if (runners & 0b100) runs++
      if (runners & 0b010) runs++
      if (runners & 0b001) next |= 0b100
      return [next, runs]
    }
    case 4: {  // triple: all runners score; batter to 3rd
      let runs = 0
      if (runners & 0b001) runs++
      if (runners & 0b010) runs++
      if (runners & 0b100) runs++
      return [0b100, runs]
    }
    case 5: {  // HR: batter + all runners score; bases empty
      let runs = 1
      if (runners & 0b001) runs++
      if (runners & 0b010) runs++
      if (runners & 0b100) runs++
      return [0, runs]
    }
  }
}

export interface SimulateOpts {
  nSims?: number
  seed?: number
}

/**
 * Simulate one half-inning N times and return a histogram of runs scored.
 *
 * The half-inning ends when 3 outs have been recorded.  No early termination
 * on first run (we want the full run distribution, not just NRFI/YRFI).
 */
export function simulateFirstInning(paProbs: PerPAProbs, opts: SimulateOpts = {}): MonteCarloHalfResult {
  const nSims = opts.nSims ?? 8000
  const seed = opts.seed ?? 0xCAFEBABE
  const rand = mulberry32(seed)
  const cdf = buildCdf(paProbs)

  const histogram = new Array<number>(11).fill(0)  // 0..10 runs (anything beyond bucket 10)
  let zero = 0
  let totalRuns = 0
  let totalRunsSq = 0
  for (let s = 0; s < nSims; s++) {
    let outs = 0
    let runners = 0
    let runs = 0
    let safety = 0
    while (outs < 3 && safety < 30) {
      safety++
      const o = sampleOutcome(rand(), cdf)
      if (o === 0) {
        outs++
      } else {
        const [nextRunners, addedRuns] = applyOutcome(o, runners)
        runners = nextRunners
        runs += addedRuns
      }
    }
    if (runs === 0) zero++
    histogram[Math.min(runs, 10)]++
    totalRuns += runs
    totalRunsSq += runs * runs
  }
  const mean = totalRuns / nSims
  const variance = totalRunsSq / nSims - mean * mean
  return {
    pZero: zero / nSims,
    meanRuns: mean,
    variance,
    runDistribution: histogram.map((c) => c / nSims),
  }
}

/**
 * Simulate the full first inning (both halves) and return the joint distribution.
 *
 * Halves are simulated independently and convolved to get the total-runs histogram.
 * P(NRFI) = pZero(home) × pZero(away).  Mean and variance also follow the
 * independence assumption (matches the existing 7-model engine).
 */
export function simulateGameFirstInning(
  homePAProbs: PerPAProbs,
  awayPAProbs: PerPAProbs,
  opts: SimulateOpts = {},
): MonteCarloResult {
  const nSims = opts.nSims ?? 8000
  const seed = opts.seed ?? 0xCAFEBABE
  const home = simulateFirstInning(homePAProbs, { nSims, seed: seed ^ 0xAAAA5555 })
  const away = simulateFirstInning(awayPAProbs, { nSims, seed: seed ^ 0x5555AAAA })

  // Convolve the two histograms to get the total-runs distribution (capped at 12).
  const cap = 12
  const total = new Array<number>(cap + 1).fill(0)
  for (let i = 0; i < home.runDistribution.length; i++) {
    for (let j = 0; j < away.runDistribution.length; j++) {
      const sum = Math.min(i + j, cap)
      total[sum] += home.runDistribution[i] * away.runDistribution[j]
    }
  }

  let cumulative = 0
  let p90 = 0
  for (let k = 0; k < total.length; k++) {
    cumulative += total[k]
    if (cumulative >= 0.9) { p90 = k; break }
  }

  return {
    pNRFI: home.pZero * away.pZero,
    meanRuns: home.meanRuns + away.meanRuns,
    variance: home.variance + away.variance,  // independent halves
    runDistribution: total,
    percentile90: p90,
    nSims,
    seed,
  }
}
