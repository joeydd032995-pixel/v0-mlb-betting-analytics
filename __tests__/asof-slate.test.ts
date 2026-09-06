/**
 * Point-in-time slate — leakage regression guard.
 *
 * The bug this pins: `/api/backfill` built its slate with `getLiveGameSlate`,
 * whose stat fetches return CURRENT season-to-date totals no matter which date
 * is requested. A game from April was therefore scored with a season line that
 * already contained that game's own result, and every game after it. The
 * client-side accuracy dashboard fed by that route reported ~60.8% where
 * predictions written before first pitch scored ~53.0%.
 *
 * The invariant, stated once: a prediction for date D must not change when a
 * game played after D is appended to any input.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  computePitcherStatsAsOf,
  computeTeamStatsAsOf,
  type PitcherGameLogSplit,
  type TeamGameLogSplit,
  type MLBPitcherSeasonStats,
} from "@/lib/api/mlb-stats"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CUTOFF = "2026-05-01"

/** Three ordinary April starts, all strictly before the cutoff. */
const priorStarts: PitcherGameLogSplit[] = [
  { date: "2026-04-05", stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 2, strikeOuts: 7, baseOnBalls: 1, hits: 4, homeRuns: 1 } },
  { date: "2026-04-11", stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 2, strikeOuts: 7, baseOnBalls: 1, hits: 4, homeRuns: 1 } },
  { date: "2026-04-17", stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 2, strikeOuts: 7, baseOnBalls: 1, hits: 4, homeRuns: 1 } },
]

/**
 * A wildly different start AFTER the cutoff. If any of it reaches the
 * aggregate, the model is seeing the future.
 */
const futureStart: PitcherGameLogSplit = {
  date: "2026-08-14",
  stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 9, strikeOuts: 0, baseOnBalls: 9, hits: 9, homeRuns: 9 },
}

const priorSeason: MLBPitcherSeasonStats = {
  fullName: "Test Pitcher", throws: "R", era: 3.80, whip: 1.20,
  inningsPitched: 180, strikeOuts: 190, baseOnBalls: 55, hits: 160,
  homeRuns: 20, gamesStarted: 30, wins: 12, losses: 8,
}

const meta = { fullName: "Test Pitcher", throws: "R" as const }

const teamPriorGames: TeamGameLogSplit[] = [
  { date: "2026-04-06", stat: { atBats: 35, hits: 11, baseOnBalls: 4, hitByPitch: 1, sacFlies: 0, totalBases: 18, runs: 5 } },
  { date: "2026-04-13", stat: { atBats: 35, hits: 10, baseOnBalls: 4, hitByPitch: 0, sacFlies: 1, totalBases: 17, runs: 4 } },
]

const teamFutureGame: TeamGameLogSplit = {
  date: "2026-09-02",
  stat: { atBats: 35, hits: 35, baseOnBalls: 9, hitByPitch: 9, sacFlies: 9, totalBases: 99, runs: 99 },
}

// ─── The invariant ───────────────────────────────────────────────────────────

describe("as-of aggregation ignores everything after the cutoff", () => {
  it("pitcher stats are unchanged when a future start is appended", () => {
    const withoutFuture = computePitcherStatsAsOf(priorStarts, CUTOFF, priorSeason, meta)
    const withFuture = computePitcherStatsAsOf([...priorStarts, futureStart], CUTOFF, priorSeason, meta)
    expect(withFuture).toEqual(withoutFuture)
  })

  it("a future start does not move ERA even though it is a 9-ER blowup", () => {
    const before = computePitcherStatsAsOf(priorStarts, CUTOFF, priorSeason, meta)
    const after = computePitcherStatsAsOf([...priorStarts, futureStart], CUTOFF, priorSeason, meta)
    expect(after?.era).toBeCloseTo(before?.era ?? NaN, 10)
  })

  it("ordering of the game log does not matter — only the cutoff does", () => {
    const shuffled = [futureStart, priorStarts[2], priorStarts[0], priorStarts[1]]
    expect(computePitcherStatsAsOf(shuffled, CUTOFF, priorSeason, meta))
      .toEqual(computePitcherStatsAsOf(priorStarts, CUTOFF, priorSeason, meta))
  })

  it("team stats are unchanged when a future 19-run game is appended", () => {
    const withoutFuture = computeTeamStatsAsOf(teamPriorGames, CUTOFF, null)
    const withFuture = computeTeamStatsAsOf([...teamPriorGames, teamFutureGame], CUTOFF, null)
    expect(withFuture).toEqual(withoutFuture)
  })

  it("a game exactly ON the cutoff date is excluded (strictly before)", () => {
    const sameDay: PitcherGameLogSplit = {
      date: CUTOFF,
      stat: { gamesStarted: 1, inningsPitched: "6.0", earnedRuns: 9, strikeOuts: 0, baseOnBalls: 9, hits: 9, homeRuns: 9 },
    }
    expect(computePitcherStatsAsOf([...priorStarts, sameDay], CUTOFF, priorSeason, meta))
      .toEqual(computePitcherStatsAsOf(priorStarts, CUTOFF, priorSeason, meta))
  })
})

// ─── The wiring ──────────────────────────────────────────────────────────────
//
// The aggregators above were always correct; the bug was that /api/backfill
// never called them. These assertions pin the wiring, not the arithmetic.

vi.mock("@/lib/api/mlb-stats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/mlb-stats")>()
  return {
    ...actual,
    fetchPitcherStatsAsOf: vi.fn(async () => null),
    fetchTeamStatsAsOf: vi.fn(async () => null),
    fetchPitcherStats: vi.fn(async () => {
      throw new Error("current-season fetchPitcherStats must never run in an as-of slate")
    }),
    fetchTeamStats: vi.fn(async () => {
      throw new Error("current-season fetchTeamStats must never run in an as-of slate")
    }),
  }
})

const apiGame = {
  gamePk: 778001,
  gameDate: "2026-05-01T23:10:00Z",
  status: { abstractGameState: "Final", detailedState: "Final" },
  teams: {
    home: { team: { id: 147, name: "New York Yankees" }, probablePitcher: { id: 543037, fullName: "Home Arm" } },
    away: { team: { id: 111, name: "Boston Red Sox" }, probablePitcher: { id: 605483, fullName: "Away Arm" } },
  },
  venue: { name: "Yankee Stadium" },
}

describe("buildAsOfSlate wiring", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads stats through the as-of aggregators, with the game date as cutoff", async () => {
    const { buildAsOfSlate } = await import("@/lib/server/asof-slate")
    const mlb = await import("@/lib/api/mlb-stats")

    await buildAsOfSlate([apiGame as never], "2026-05-01", 2026)

    expect(mlb.fetchPitcherStatsAsOf).toHaveBeenCalled()
    expect(mlb.fetchTeamStatsAsOf).toHaveBeenCalled()
    // Never the current-season endpoints — those are what leaked.
    expect(mlb.fetchPitcherStats).not.toHaveBeenCalled()
    expect(mlb.fetchTeamStats).not.toHaveBeenCalled()

    for (const call of vi.mocked(mlb.fetchPitcherStatsAsOf).mock.calls) {
      expect(call[2]).toBe("2026-05-01")
    }
    for (const call of vi.mocked(mlb.fetchTeamStatsAsOf).mock.calls) {
      expect(call[2]).toBe("2026-05-01")
    }
  })

  it("derives weather from the date, not from today's conditions", async () => {
    const { buildAsOfSlate, buildSeasonalWeather } = await import("@/lib/server/asof-slate")

    const april = await buildAsOfSlate([apiGame as never], "2026-04-10", 2026)
    const august = await buildAsOfSlate([apiGame as never], "2026-08-10", 2026)

    expect(april.games[0].weather.temperature).toBe(buildSeasonalWeather("2026-04-10").temperature)
    expect(august.games[0].weather.temperature).toBe(buildSeasonalWeather("2026-08-10").temperature)
    // An April game must not be scored with August weather.
    expect(april.games[0].weather.temperature).not.toBe(august.games[0].weather.temperature)
  })

  it("carries no odds snapshot — a present-day line is not a past game's price", async () => {
    const { buildAsOfSlate } = await import("@/lib/server/asof-slate")
    const slate = await buildAsOfSlate([apiGame as never], "2026-05-01", 2026)
    expect(slate.games[0].odds).toBeUndefined()
  })
})
