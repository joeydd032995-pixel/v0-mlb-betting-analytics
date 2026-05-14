/**
 * Standalone verification for the point-in-time stat aggregators in
 * lib/api/mlb-stats.ts.  The repo has no test runner (CI is type-check + lint +
 * build only), so this is a self-contained assertion script:
 *
 *   npx tsx scripts/verify-mlb-asof.ts
 *
 * Exits 0 on success, 1 on the first failed assertion.
 */

import {
  computePitcherStatsAsOf,
  computeTeamStatsAsOf,
  type PitcherGameLogSplit,
  type TeamGameLogSplit,
  type MLBPitcherSeasonStats,
} from "@/lib/api/mlb-stats"

let failures = 0

function ok(label: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ok   ${label}`)
  } else {
    failures++
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

function approx(label: string, actual: number, expected: number, tol = 1e-3) {
  ok(label, Math.abs(actual - expected) <= tol, `got ${actual}, want ${expected}`)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Three identical 6-IP starts in April: ip=18, er=6, k=21, bb=3, h=12, hr=3.
const pitcherStarts: PitcherGameLogSplit[] = [
  { date: "2024-04-05", stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 2, strikeOuts: 7, baseOnBalls: 1, hits: 4, homeRuns: 1 } },
  { date: "2024-04-11", stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 2, strikeOuts: 7, baseOnBalls: 1, hits: 4, homeRuns: 1 } },
  { date: "2024-04-17", stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 2, strikeOuts: 7, baseOnBalls: 1, hits: 4, homeRuns: 1 } },
  // A start AFTER the cutoff — must be excluded.
  { date: "2024-09-01", stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 9, strikeOuts: 0, baseOnBalls: 9, hits: 9, homeRuns: 9 } },
]

const priorSeason: MLBPitcherSeasonStats = {
  fullName: "Test Pitcher",
  throws: "R",
  gamesStarted: 30,
  era: 5.0,
  whip: 1.4,
  strikeOuts: 150,
  baseOnBalls: 50,
  inningsPitched: 180,
  hits: 200,
  homeRuns: 25,
  wins: 10,
  losses: 10,
}

const meta = { fullName: "Test Pitcher", throws: "R" as const }
const CUTOFF = "2024-05-01"

// ─── 1. Aggregation excludes post-cutoff games ────────────────────────────────

console.log("computePitcherStatsAsOf — no prior (raw season-to-date):")
const raw = computePitcherStatsAsOf(pitcherStarts, CUTOFF, null, meta)
if (!raw) {
  console.error("  FAIL raw result was null")
  process.exit(1)
}
approx("gamesStarted = 3 (Sept start excluded)", raw.gamesStarted, 3)
approx("inningsPitched = 18", raw.inningsPitched, 18)
approx("era = 3.00  (6er * 9 / 18ip)", raw.era, 3.0)
approx("whip = 0.8333  ((3bb + 12h) / 18ip)", raw.whip, 15 / 18)

// ─── 2. Bayesian blend gradient ───────────────────────────────────────────────

console.log("computePitcherStatsAsOf — with prior (blended):")
const blended = computePitcherStatsAsOf(pitcherStarts, CUTOFF, priorSeason, meta)
if (!blended) {
  console.error("  FAIL blended result was null")
  process.exit(1)
}
// w = 3 / (3 + 1.14) = 0.724638
const w = 3 / (3 + 1.14)
approx("blended era between td(3.0) and prior(5.0)", blended.era, w * 3.0 + (1 - w) * 5.0)
ok("blended era is pulled toward prior", blended.era > 3.0 && blended.era < 5.0,
   `got ${blended.era}`)

// More starts → blend weight closer to 1 → result closer to season-to-date.
const manyStarts: PitcherGameLogSplit[] = Array.from({ length: 10 }, (_, i) => ({
  date: `2024-04-${String(i + 1).padStart(2, "0")}`,
  stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 2, strikeOuts: 7, baseOnBalls: 1, hits: 4, homeRuns: 1 },
}))
const blended10 = computePitcherStatsAsOf(manyStarts, CUTOFF, priorSeason, meta)!
ok("10 starts blends closer to season-to-date than 3 starts",
   Math.abs(blended10.era - 3.0) < Math.abs(blended.era - 3.0),
   `era@10=${blended10.era} era@3=${blended.era}`)

// ─── 3. Round-trip: synthesized counts re-derive the blended rates ────────────

console.log("round-trip — buildLightPitcher's rate formulas reproduce the blend:")
const bf = Math.max(1, blended.inningsPitched * 4.3)
const reKRate = blended.strikeOuts / bf
const tdKRate = 21 / (18 * 4.3)
const priorKRate = priorSeason.strikeOuts / (priorSeason.inningsPitched * 4.3)
approx("re-derived kRate equals the blend of td & prior kRate",
       reKRate, w * tdKRate + (1 - w) * priorKRate)

// ─── 4. No qualifying starts → returns the prior ──────────────────────────────

console.log("computePitcherStatsAsOf — no starts before cutoff:")
const earlyCutoff = "2024-03-01"
const noStarts = computePitcherStatsAsOf(pitcherStarts, earlyCutoff, priorSeason, meta)
ok("returns the prior-season record verbatim", noStarts === priorSeason)
ok("returns null when there's no prior either",
   computePitcherStatsAsOf(pitcherStarts, earlyCutoff, null, meta) === null)

// ─── 5. Baseball innings notation (".1" = ⅓, ".2" = ⅔) ────────────────────────

console.log("computePitcherStatsAsOf — innings notation:")
// "5.1" = 5⅓, "6.2" = 6⅔ → total ip should be exactly 12, not 11.3.
const fractionalStarts: PitcherGameLogSplit[] = [
  { date: "2024-04-05", stat: { gamesStarted: 1, inningsPitched: "5.1", earnedRuns: 0, strikeOuts: 0, baseOnBalls: 0, hits: 0, homeRuns: 0 } },
  { date: "2024-04-11", stat: { gamesStarted: 1, inningsPitched: "6.2", earnedRuns: 0, strikeOuts: 0, baseOnBalls: 0, hits: 0, homeRuns: 0 } },
]
const fractional = computePitcherStatsAsOf(fractionalStarts, CUTOFF, null, meta)!
approx('"5.1" + "6.2" aggregates to 12.0 IP (thirds, not decimals)', fractional.inningsPitched, 12.0)

// ─── 6. Team aggregation ──────────────────────────────────────────────────────

console.log("computeTeamStatsAsOf — aggregation:")
// Two games: ab=70, h=21, bb=8, hbp=1, sf=1, tb=35, runs=9
const teamGames: TeamGameLogSplit[] = [
  { date: "2024-04-05", stat: { atBats: 35, hits: 11, baseOnBalls: 4, hitByPitch: 1, sacFlies: 0, totalBases: 18, runs: 5 } },
  { date: "2024-04-06", stat: { atBats: 35, hits: 10, baseOnBalls: 4, hitByPitch: 0, sacFlies: 1, totalBases: 17, runs: 4 } },
  { date: "2024-09-09", stat: { atBats: 35, hits: 35, baseOnBalls: 9, hitByPitch: 9, sacFlies: 9, totalBases: 99, runs: 99 } },
]
const teamRaw = computeTeamStatsAsOf(teamGames, CUTOFF, null)
if (!teamRaw) {
  console.error("  FAIL teamRaw was null")
  process.exit(1)
}
approx("avg = 21/70", teamRaw.avg, 21 / 70)
approx("obp = (21+8+1) / (70+8+1+1)", teamRaw.obp, 30 / 80)
approx("slg = 35/70", teamRaw.slg, 35 / 70)
approx("ops = obp + slg", teamRaw.ops, 30 / 80 + 35 / 70)
approx("runs = 9 (Sept game excluded)", teamRaw.runs, 9)

console.log("")
if (failures > 0) {
  console.error(`${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log("All point-in-time aggregator checks passed.")
