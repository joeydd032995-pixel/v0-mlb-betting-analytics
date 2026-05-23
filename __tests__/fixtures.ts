import type { Game, Pitcher, Team } from "../lib/types"
import { LEAGUE_AVG_NRFI } from "../lib/nrfi-models"

export function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id:             "test-game-1",
    date:           "2026-05-01",
    time:           "7:05 PM",
    timeZone:       "ET",
    homeTeamId:     "team-home",
    awayTeamId:     "team-away",
    homePitcherId:  "pitcher-home",
    awayPitcherId:  "pitcher-away",
    venue:          "Test Stadium",
    parkFactor:     1.0,
    weather: {
      temperature:   72,
      windSpeed:     0,
      windDirection: "calm",
      conditions:    "clear",
      humidity:      50,
    },
    ...overrides,
  } as Game
}

export function makePitcher(
  id: string,
  overrides: {
    nrfiRate?: number
    startCount?: number
    kRate?: number
    isBullpenGame?: boolean
    careerFirstInnings?: number
  } = {}
): Pitcher {
  return {
    id,
    name:   `Pitcher ${id}`,
    throws: "R",
    overall: {
      era: 3.80, fip: 3.70, xfip: 3.75, whip: 1.15,
      kPer9: 9.0, bbPer9: 2.5, innings: 150, wins: 10, losses: 8,
    },
    firstInning: {
      era:                3.80,
      whip:               1.15,
      kRate:              overrides.kRate ?? 0.225,
      bbRate:             0.085,
      hrPer9:             1.0,
      babip:              0.295,
      nrfiRate:           overrides.nrfiRate ?? LEAGUE_AVG_NRFI,
      avgRunsAllowed:     0.52,
      firstBatterOBP:     0.300,
      last5Results:       [true, true, false, true, false],
      last5RunsAllowed:   [0, 0, 1, 0, 1],
      startCount:         overrides.startCount ?? 20,
      homeNrfiRate:       LEAGUE_AVG_NRFI,
      awayNrfiRate:       LEAGUE_AVG_NRFI,
      isBullpenGame:      overrides.isBullpenGame ?? false,
      careerFirstInnings: overrides.careerFirstInnings,
    },
  } as unknown as Pitcher
}

export function makeTeam(id: string): Team {
  return {
    id,
    name:         `Team ${id}`,
    abbreviation: id.toUpperCase().slice(0, 3),
    city:         "Test City",
    league:       "AL",
    division:     "East",
    primaryColor: "#000000",
    firstInning: {
      offenseFactor: 1.0,
      runsPerGame:   0.52,
      ops:           0.720,
      woba:          0.310,
      kRate:         0.225,
      bbRate:        0.085,
      yrfiRate:      0.40,
      homeYrfiRate:  0.42,
      awayYrfiRate:  0.38,
      last10YrfiRate: 0.40,
      last5Results:  [false, true, false, false, true],
      avgRunsVsRHP:  0.52,
      avgRunsVsLHP:  0.55,
      vsLHP:         1.0,
      vsRHP:         1.0,
    },
  } as unknown as Team
}

export function makePitchers(): Map<string, Pitcher> {
  return new Map([
    ["pitcher-home", makePitcher("pitcher-home")],
    ["pitcher-away", makePitcher("pitcher-away")],
  ])
}

export function makeTeams(): Map<string, Team> {
  return new Map([
    ["team-home", makeTeam("team-home")],
    ["team-away", makeTeam("team-away")],
  ])
}
