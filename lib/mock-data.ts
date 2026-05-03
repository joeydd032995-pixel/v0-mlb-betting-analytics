// Fallback data for local development when MLB/weather/odds APIs are unavailable.
// All values are plausible but synthetic — do not use for real betting decisions.

import type { Game, Pitcher, Team } from "./types"

export const mockTeams: Map<string, Team> = new Map([
  ["nyy", {
    id: "nyy", name: "New York Yankees", abbreviation: "NYY",
    city: "New York", league: "AL", division: "East", primaryColor: "#003087",
    firstInning: {
      runsPerGame: 0.52, offenseFactor: 1.12, ops: 0.758, woba: 0.328,
      kRate: 0.218, bbRate: 0.092, yrfiRate: 0.44, homeYrfiRate: 0.42,
      awayYrfiRate: 0.46, last10YrfiRate: 0.40, avgRunsVsRHP: 0.49,
      avgRunsVsLHP: 0.58, last5Results: [true, true, false, true, false],
    },
  }],
  ["bos", {
    id: "bos", name: "Boston Red Sox", abbreviation: "BOS",
    city: "Boston", league: "AL", division: "East", primaryColor: "#BD3039",
    firstInning: {
      runsPerGame: 0.55, offenseFactor: 1.08, ops: 0.745, woba: 0.320,
      kRate: 0.225, bbRate: 0.085, yrfiRate: 0.46, homeYrfiRate: 0.48,
      awayYrfiRate: 0.44, last10YrfiRate: 0.50, avgRunsVsRHP: 0.52,
      avgRunsVsLHP: 0.60, last5Results: [false, true, true, false, true],
    },
  }],
  ["lad", {
    id: "lad", name: "Los Angeles Dodgers", abbreviation: "LAD",
    city: "Los Angeles", league: "NL", division: "West", primaryColor: "#005A9C",
    firstInning: {
      runsPerGame: 0.58, offenseFactor: 1.15, ops: 0.775, woba: 0.338,
      kRate: 0.210, bbRate: 0.095, yrfiRate: 0.48, homeYrfiRate: 0.46,
      awayYrfiRate: 0.50, last10YrfiRate: 0.45, avgRunsVsRHP: 0.55,
      avgRunsVsLHP: 0.62, last5Results: [true, false, true, true, false],
    },
  }],
  ["sf", {
    id: "sf", name: "San Francisco Giants", abbreviation: "SF",
    city: "San Francisco", league: "NL", division: "West", primaryColor: "#FD5A1E",
    firstInning: {
      runsPerGame: 0.48, offenseFactor: 0.94, ops: 0.718, woba: 0.308,
      kRate: 0.232, bbRate: 0.082, yrfiRate: 0.40, homeYrfiRate: 0.38,
      awayYrfiRate: 0.42, last10YrfiRate: 0.38, avgRunsVsRHP: 0.45,
      avgRunsVsLHP: 0.52, last5Results: [true, true, true, false, true],
    },
  }],
  ["hou", {
    id: "hou", name: "Houston Astros", abbreviation: "HOU",
    city: "Houston", league: "AL", division: "West", primaryColor: "#002D62",
    firstInning: {
      runsPerGame: 0.50, offenseFactor: 1.05, ops: 0.738, woba: 0.318,
      kRate: 0.220, bbRate: 0.088, yrfiRate: 0.42, homeYrfiRate: 0.40,
      awayYrfiRate: 0.44, last10YrfiRate: 0.42, avgRunsVsRHP: 0.48,
      avgRunsVsLHP: 0.54, last5Results: [false, true, false, true, true],
    },
  }],
  ["atl", {
    id: "atl", name: "Atlanta Braves", abbreviation: "ATL",
    city: "Atlanta", league: "NL", division: "East", primaryColor: "#CE1141",
    firstInning: {
      runsPerGame: 0.54, offenseFactor: 1.10, ops: 0.752, woba: 0.325,
      kRate: 0.228, bbRate: 0.086, yrfiRate: 0.46, homeYrfiRate: 0.44,
      awayYrfiRate: 0.48, last10YrfiRate: 0.48, avgRunsVsRHP: 0.50,
      avgRunsVsLHP: 0.60, last5Results: [true, false, false, true, false],
    },
  }],
])

export const mockPitchers: Map<string, Pitcher> = new Map([
  ["p-gerrit-cole", {
    id: "p-gerrit-cole", name: "Gerrit Cole", teamId: "nyy", throws: "R", age: 34,
    firstInning: {
      era: 1.85, whip: 0.820, kRate: 0.315, bbRate: 0.058, hrPer9: 0.85,
      babip: 0.265, nrfiRate: 0.78, avgRunsAllowed: 0.22, firstBatterOBP: 0.245,
      last5Results: [true, true, true, false, true], last5RunsAllowed: [0,0,0,1,0],
      startCount: 14, homeNrfiRate: 0.80, awayNrfiRate: 0.76,
    },
    overall: { era: 2.45, fip: 2.38, xfip: 2.52, whip: 0.890, kPer9: 10.8, bbPer9: 1.9, innings: 82, wins: 7, losses: 2 },
  }],
  ["p-nick-pivetta", {
    id: "p-nick-pivetta", name: "Nick Pivetta", teamId: "bos", throws: "R", age: 31,
    firstInning: {
      era: 3.20, whip: 1.12, kRate: 0.265, bbRate: 0.088, hrPer9: 1.20,
      babip: 0.292, nrfiRate: 0.65, avgRunsAllowed: 0.38, firstBatterOBP: 0.295,
      last5Results: [false, true, false, true, true], last5RunsAllowed: [1,0,1,0,0],
      startCount: 12, homeNrfiRate: 0.68, awayNrfiRate: 0.62,
    },
    overall: { era: 3.85, fip: 3.72, xfip: 3.90, whip: 1.18, kPer9: 9.2, bbPer9: 3.1, innings: 72, wins: 5, losses: 4 },
  }],
  ["p-tyler-glasnow", {
    id: "p-tyler-glasnow", name: "Tyler Glasnow", teamId: "lad", throws: "R", age: 31,
    firstInning: {
      era: 2.10, whip: 0.870, kRate: 0.328, bbRate: 0.065, hrPer9: 0.90,
      babip: 0.270, nrfiRate: 0.76, avgRunsAllowed: 0.25, firstBatterOBP: 0.252,
      last5Results: [true, true, false, true, true], last5RunsAllowed: [0,0,1,0,0],
      startCount: 11, homeNrfiRate: 0.78, awayNrfiRate: 0.74,
    },
    overall: { era: 2.85, fip: 2.75, xfip: 2.95, whip: 0.920, kPer9: 11.2, bbPer9: 2.2, innings: 66, wins: 6, losses: 2 },
  }],
  ["p-logan-webb", {
    id: "p-logan-webb", name: "Logan Webb", teamId: "sf", throws: "R", age: 27,
    firstInning: {
      era: 2.55, whip: 0.950, kRate: 0.225, bbRate: 0.062, hrPer9: 0.65,
      babip: 0.278, nrfiRate: 0.72, avgRunsAllowed: 0.30, firstBatterOBP: 0.265,
      last5Results: [true, false, true, true, true], last5RunsAllowed: [0,1,0,0,0],
      startCount: 13, homeNrfiRate: 0.75, awayNrfiRate: 0.69,
    },
    overall: { era: 3.05, fip: 2.98, xfip: 3.15, whip: 1.00, kPer9: 7.8, bbPer9: 2.1, innings: 78, wins: 7, losses: 3 },
  }],
  ["p-framber-valdez", {
    id: "p-framber-valdez", name: "Framber Valdez", teamId: "hou", throws: "L", age: 30,
    firstInning: {
      era: 2.80, whip: 1.02, kRate: 0.235, bbRate: 0.078, hrPer9: 0.55,
      babip: 0.285, nrfiRate: 0.70, avgRunsAllowed: 0.32, firstBatterOBP: 0.272,
      last5Results: [true, true, true, false, true], last5RunsAllowed: [0,0,0,1,0],
      startCount: 12, homeNrfiRate: 0.72, awayNrfiRate: 0.68,
    },
    overall: { era: 3.25, fip: 3.18, xfip: 3.30, whip: 1.08, kPer9: 8.1, bbPer9: 2.7, innings: 74, wins: 6, losses: 3 },
  }],
  ["p-spencer-strider", {
    id: "p-spencer-strider", name: "Spencer Strider", teamId: "atl", throws: "R", age: 26,
    firstInning: {
      era: 1.95, whip: 0.840, kRate: 0.345, bbRate: 0.055, hrPer9: 0.80,
      babip: 0.258, nrfiRate: 0.80, avgRunsAllowed: 0.20, firstBatterOBP: 0.235,
      last5Results: [true, true, true, true, false], last5RunsAllowed: [0,0,0,0,1],
      startCount: 13, homeNrfiRate: 0.82, awayNrfiRate: 0.78,
    },
    overall: { era: 2.25, fip: 2.18, xfip: 2.32, whip: 0.860, kPer9: 11.8, bbPer9: 1.8, innings: 80, wins: 8, losses: 2 },
  }],
])

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())

export const mockGames: Game[] = [
  {
    id: "mock-nyy-bos-001",
    date: today, time: "7:05 PM", timeZone: "ET",
    homeTeamId: "nyy", awayTeamId: "bos",
    homePitcherId: "p-gerrit-cole", awayPitcherId: "p-nick-pivetta",
    venue: "Yankee Stadium", parkFactor: 1.05,
    weather: { temperature: 68, windSpeed: 8, windDirection: "crosswind", conditions: "clear", humidity: 55 },
    odds: { nrfiOdds: -115, yrfiOdds: -105, bookmaker: "DraftKings" },
    umpire: { nrfiFactor: 0.05 },
  },
  {
    id: "mock-lad-sf-002",
    date: today, time: "10:10 PM", timeZone: "ET",
    homeTeamId: "lad", awayTeamId: "sf",
    homePitcherId: "p-tyler-glasnow", awayPitcherId: "p-logan-webb",
    venue: "Dodger Stadium", parkFactor: 0.92,
    weather: { temperature: 72, windSpeed: 5, windDirection: "calm", conditions: "clear", humidity: 45 },
    odds: { nrfiOdds: -130, yrfiOdds: +110, bookmaker: "FanDuel" },
    umpire: { nrfiFactor: 0.10 },
  },
  {
    id: "mock-hou-atl-003",
    date: today, time: "8:10 PM", timeZone: "ET",
    homeTeamId: "hou", awayTeamId: "atl",
    homePitcherId: "p-framber-valdez", awayPitcherId: "p-spencer-strider",
    venue: "Minute Maid Park", parkFactor: 0.88,
    weather: { temperature: 72, windSpeed: 0, windDirection: "calm", conditions: "dome", humidity: 50 },
    odds: { nrfiOdds: -120, yrfiOdds: +100, bookmaker: "BetMGM" },
    umpire: { nrfiFactor: -0.02 },
  },
]
