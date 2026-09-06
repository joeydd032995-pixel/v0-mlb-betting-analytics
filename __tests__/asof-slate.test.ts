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

// ─── Fallback paths (Codex review, PR #150) ──────────────────────────────────
//
// Two holes found after the first push, both of which let non-as-of data back
// into an as-of slate through a fallback rather than the main path.

describe("dome venues keep dome conditions in the seasonal fallback", () => {
  it("a roofed park is 72F/dome regardless of month", async () => {
    const { buildSeasonalWeather } = await import("@/lib/server/asof-slate")
    for (const date of ["2026-04-10", "2026-07-20", "2026-09-28"]) {
      const w = buildSeasonalWeather(date, "Tropicana Field")
      expect(w.conditions).toBe("dome")
      expect(w.temperature).toBe(72)
    }
  })

  it("an open-air park still tracks the month", async () => {
    const { buildSeasonalWeather } = await import("@/lib/server/asof-slate")
    const april = buildSeasonalWeather("2026-04-10", "Fenway Park")
    const july = buildSeasonalWeather("2026-07-20", "Fenway Park")
    expect(april.conditions).toBe("clear")
    expect(april.temperature).toBeLessThan(july.temperature)
  })

  it("buildAsOfSlate applies the dome check per venue", async () => {
    const { buildAsOfSlate } = await import("@/lib/server/asof-slate")
    const domeGame = {
      ...apiGame,
      gamePk: 778002,
      venue: { name: "Tropicana Field" },
    }
    const slate = await buildAsOfSlate([domeGame as never], "2026-04-10", 2026)
    expect(slate.games[0].weather.conditions).toBe("dome")
    expect(slate.games[0].weather.temperature).toBe(72)
  })
})

describe("the as-of fallback carries no season measurements", () => {
  it("computePitcherStatsAsOf yields null with no prior and no pre-cutoff start", async () => {
    const mlb = await import("@/lib/api/mlb-stats")
    // This is the branch the old fallback mishandled: it reached for
    // fetchPitcherStats(playerId, season) — the FULL current-season line.
    expect(mlb.computePitcherStatsAsOf([], CUTOFF, null, meta)).toBeNull()
    expect(mlb.computePitcherStatsAsOf([futureStart], CUTOFF, null, meta)).toBeNull()
  })

  it("the neutral record it falls back to has zero season measurements", async () => {
    const { neutralPitcherRecord } = await import("@/lib/api/mlb-stats")
    const r = neutralPitcherRecord({ fullName: "Rookie Arm", throws: "L" })
    // Nothing here can encode a game that has not been played.
    expect(r.inningsPitched).toBe(0)
    expect(r.gamesStarted).toBe(0)
    expect(r.strikeOuts).toBe(0)
    expect(r.baseOnBalls).toBe(0)
    expect(r.hits).toBe(0)
    expect(r.homeRuns).toBe(0)
    // Identity survives: handedness is a fixed attribute, not a measurement.
    expect(r.fullName).toBe("Rookie Arm")
    expect(r.throws).toBe("L")
    // League-average rate stand-ins, not this pitcher's season.
    expect(r.era).toBe(4.0)
    expect(r.whip).toBe(1.28)
  })

  it("a pitcher built from the neutral record shrinks hard toward league average", async () => {
    const { buildLightPitcher } = await import("@/lib/server/asof-slate")
    const { neutralPitcherRecord } = await import("@/lib/api/mlb-stats")
    const { getDynamicPriorWeight } = await import("@/lib/nrfi-models")

    const p = buildLightPitcher("605483", "bos", "Rookie Arm",
      neutralPitcherRecord({ fullName: "Rookie Arm", throws: "L" }))

    expect(p.firstInning.startCount).toBe(0)
    expect(p.overall.innings).toBe(0)
    expect(p.throws).toBe("L")
    // 0 career innings -> the small-sample prior weight, not the k=50 tier an
    // inflated current-season IP total would have earned.
    expect(getDynamicPriorWeight(p)).toBe(30)
  })
})
