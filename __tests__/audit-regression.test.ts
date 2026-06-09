/**
 * Regression guards for the 2026-06 prediction-engine audit (AUDIT_REPORT.md).
 *
 * Each test pins a property that the audit found violated.  If one of these
 * fails after a model change, consult the corresponding audit item before
 * adjusting the expectation.
 */
import { describe, it, expect } from "vitest"
import { computeNRFIPrediction } from "../lib/nrfi-engine"
import {
  computePAOutcomes,
  computeMarkovNrfi,
  LEAGUE_AVG_NRFI,
  LEAGUE_HALF_NRFI,
} from "../lib/nrfi-models"
import { estimateNrfiRate, estimateNrfiRateFromFirstInningRuns, LEAGUE_FIRST_INNING_RUNS_PER_HALF } from "../lib/api/shared-helpers"
import { computeBacktestMetrics } from "../lib/backtest-metrics"
import { CONFIG } from "../lib/config"
import type { Game, Pitcher, Team } from "../lib/types"

// ─── Truly league-average fixtures (2024 MLB) ─────────────────────────────────

const LEAGUE_ERA = CONFIG.league.ERA   // 4.12
const LEAGUE_WHIP = 1.28
const LEAGUE_HR9 = 1.16                // ≈ LEAGUE_HR_RATE (0.030/PA) × 38.7

function leaguePitcher(id: string): Pitcher {
  return {
    id,
    name: `Pitcher ${id}`,
    teamId: `team-${id}`,
    throws: "R",
    age: 28,
    firstInning: {
      era: LEAGUE_ERA,
      whip: LEAGUE_WHIP,
      kRate: 0.225,
      bbRate: 0.085,
      hrPer9: LEAGUE_HR9,
      babip: 0.295,
      nrfiRate: LEAGUE_HALF_NRFI,
      avgRunsAllowed: LEAGUE_FIRST_INNING_RUNS_PER_HALF,
      firstBatterOBP: 0.314,
      last5Results: [],          // empty → recent-form multiplier is exactly 1.0
      last5RunsAllowed: [],
      startCount: 20,
      homeNrfiRate: LEAGUE_HALF_NRFI,
      awayNrfiRate: LEAGUE_HALF_NRFI,
      careerFirstInnings: 300,   // k = 50 (established starter)
    },
    overall: {
      era: LEAGUE_ERA, fip: 3.95, xfip: 3.95, whip: LEAGUE_WHIP,
      kPer9: 8.7, bbPer9: 3.0, innings: 110, wins: 8, losses: 8,
    },
  } as unknown as Pitcher
}

function leagueTeam(id: string): Team {
  return {
    id,
    name: `Team ${id}`,
    abbreviation: id.toUpperCase().slice(0, 3),
    city: "", league: "AL", division: "East", primaryColor: "#000",
    firstInning: {
      offenseFactor: 1.0,
      runsPerGame: LEAGUE_FIRST_INNING_RUNS_PER_HALF,
      ops: 0.720, woba: 0.312, kRate: 0.225, bbRate: 0.085,
      yrfiRate: 1 - LEAGUE_HALF_NRFI,
      homeYrfiRate: 1 - LEAGUE_HALF_NRFI,
      awayYrfiRate: 1 - LEAGUE_HALF_NRFI,
      last10YrfiRate: 1 - LEAGUE_HALF_NRFI,
      last5Results: [],
      avgRunsVsRHP: LEAGUE_FIRST_INNING_RUNS_PER_HALF,
      avgRunsVsLHP: LEAGUE_FIRST_INNING_RUNS_PER_HALF,
    },
  } as unknown as Team
}

function neutralGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "718000",
    date: "2026-06-15",   // June → monthly λ factor = 1.0
    time: "7:05 PM",
    timeZone: "ET",
    homeTeamId: "th", awayTeamId: "ta",
    homePitcherId: "hp", awayPitcherId: "ap",
    venue: "Neutral Park",
    parkFactor: 1.0,
    weather: { temperature: 72, windSpeed: 0, windDirection: "calm", conditions: "clear", humidity: 50 },
    ...overrides,
  } as Game
}

function predict(game: Game = neutralGame()) {
  const pitchers = new Map([["hp", leaguePitcher("hp")], ["ap", leaguePitcher("ap")]])
  const teams = new Map([["th", leagueTeam("th")], ["ta", leagueTeam("ta")]])
  return computeNRFIPrediction(game, pitchers, teams)!
}

// ─── P0-1: center-of-distribution calibration ─────────────────────────────────

describe("audit P0-1 — league-average matchup lands on the league base rate", () => {
  it("engine(league-average everything) ≈ LEAGUE_AVG_NRFI ± 0.03", () => {
    const p = predict().nrfiProbability
    expect(p).toBeGreaterThan(LEAGUE_AVG_NRFI - 0.03)
    expect(p).toBeLessThan(LEAGUE_AVG_NRFI + 0.03)
  })

  it("estimateNrfiRate(league ERA) === LEAGUE_HALF_NRFI", () => {
    expect(estimateNrfiRate(LEAGUE_ERA)).toBeCloseTo(LEAGUE_HALF_NRFI, 6)
  })

  it("estimateNrfiRateFromFirstInningRuns(league rate) === LEAGUE_HALF_NRFI", () => {
    expect(estimateNrfiRateFromFirstInningRuns(LEAGUE_FIRST_INNING_RUNS_PER_HALF))
      .toBeCloseTo(LEAGUE_HALF_NRFI, 6)
  })
})

// ─── P1-1: PA outcome scale ───────────────────────────────────────────────────

describe("audit P1-1 — per-PA outcome probabilities on the real MLB scale", () => {
  const pa = computePAOutcomes(leaguePitcher("x"), 1.0)

  it("HR per PA is near the league ~0.031 (was 0.075 pre-fix)", () => {
    expect(pa.hr).toBeGreaterThan(0.02)
    expect(pa.hr).toBeLessThan(0.045)
  })

  it("implied OBP per PA is near the league .314 (was .380 pre-fix)", () => {
    const obp = 1 - pa.out
    expect(obp).toBeGreaterThan(0.29)
    expect(obp).toBeLessThan(0.34)
  })

  it("Markov half-inning P(0) is near the empirical ~0.72 (was 0.61 pre-fix)", () => {
    const p0 = computeMarkovNrfi(pa).nrfiProb
    expect(p0).toBeGreaterThan(0.68)
    expect(p0).toBeLessThan(0.78)
  })
})

// ─── P1-2: park factor reaches the headline probability ───────────────────────

describe("audit P1-2 — environment routing", () => {
  it("park factor materially moves the headline (Coors vs Petco)", () => {
    const coors = predict(neutralGame({ parkFactor: 1.15, venue: "Coors Field" })).nrfiProbability
    const petco = predict(neutralGame({ parkFactor: 0.87, venue: "Petco Park" })).nrfiProbability
    // Pre-fix only the 10.9%-weight Poisson saw the park; the spread between
    // the most extreme parks was ~2 points.  Post-fix it must exceed 4 points.
    expect(petco - coors).toBeGreaterThan(0.04)
  })

  it("wind blowing out lowers P(NRFI) vs calm", () => {
    const calm = predict().nrfiProbability
    const windOut = predict(neutralGame({
      weather: { temperature: 72, windSpeed: 15, windDirection: "out", conditions: "clear", humidity: 50 },
    })).nrfiProbability
    expect(windOut).toBeLessThan(calm)
  })
})

// ─── P0-3 / P1-3: backtester staking ─────────────────────────────────────────

describe("audit P0-3/P1-3 — backtest Kelly sizing and per-side odds", () => {
  it("quarter-Kelly ROI at -110 pays 100/110 per unit on a win", () => {
    const m = computeBacktestMetrics([
      { nrfiProbability: 0.60, actualNrfi: true, confidence: "High", nrfiOdds: -110, yrfiOdds: -110 },
    ], true)
    // ROI = P&L / wagered = profit-per-unit for a single winning bet,
    // independent of stake — but the stake itself must use b = 0.909:
    expect(m.roiKelly).toBeCloseTo(100 / 110, 6)
  })

  it("YRFI bets are priced at the YRFI line, not the NRFI line", () => {
    // Model 40% NRFI → bets YRFI.  Market: NRFI -130 / YRFI +105.
    // A YRFI win must pay 1.05/unit (old code paid 100/130 ≈ 0.769).
    const m = computeBacktestMetrics([
      { nrfiProbability: 0.40, actualNrfi: false, confidence: "High", nrfiOdds: -130, yrfiOdds: 105 },
    ], true)
    expect(m.roiKelly).toBeCloseTo(1.05, 6)
  })

  it("no bet is placed when neither side clears the minimum edge", () => {
    const m = computeBacktestMetrics([
      { nrfiProbability: 0.53, actualNrfi: true, confidence: "High", nrfiOdds: -110, yrfiOdds: -110 },
    ], true)
    expect(m.roiKelly).toBe(0)
  })
})

// ─── Output integrity ─────────────────────────────────────────────────────────

describe("audit §3a — output integrity", () => {
  it("P(NRFI) + P(YRFI) = 1 exactly and bounds hold", () => {
    const p = predict()
    expect(p.nrfiProbability + p.yrfiProbability).toBeCloseTo(1, 12)
    expect(p.nrfiProbability).toBeGreaterThanOrEqual(0.18)
    expect(p.nrfiProbability).toBeLessThanOrEqual(0.85)
  })

  it("all per-model half-inning values are probabilities in (0, 1)", () => {
    const bd = predict().modelBreakdown!
    for (const half of [bd.homeHalfInning, bd.awayHalfInning]) {
      for (const v of [half.poissonNrfi, half.zipNrfi, half.markovNrfi, half.mapreNrfi,
                       half.logisticMetaNrfi!, half.nnInteractionNrfi!, half.hierarchicalBayesNrfi!]) {
        expect(v).toBeGreaterThan(0)
        expect(v).toBeLessThan(1)
      }
    }
  })

  it("value analysis exposes no-vig fair probabilities that sum to 1", () => {
    const game = neutralGame({ odds: { nrfiOdds: -130, yrfiOdds: 105, bookmaker: "test" } })
    const va = predict(game).valueAnalysis!
    expect(va.fairNrfiProb + va.fairYrfiProb).toBeCloseTo(1, 9)
    // Vigged implied probs sum to > 1 (the overround) — fair probs must not.
    expect(va.impliedNrfiProb + va.impliedYrfiProb).toBeGreaterThan(1)
  })
})
