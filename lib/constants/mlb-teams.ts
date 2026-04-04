import type { League, Division } from "../types"

export interface MLBTeamInfo {
  id: string
  abbreviation: string
  name: string
  city: string
  league: League
  division: Division
  primaryColor: string
}

export const MLB_TEAMS: Record<string, MLBTeamInfo> = {
  // American League East
  bal: { id: "bal", abbreviation: "BAL", name: "Orioles", city: "Baltimore", league: "AL", division: "East", primaryColor: "#DF4601" },
  bos: { id: "bos", abbreviation: "BOS", name: "Red Sox", city: "Boston", league: "AL", division: "East", primaryColor: "#BD3039" },
  nyy: { id: "nyy", abbreviation: "NYY", name: "Yankees", city: "New York", league: "AL", division: "East", primaryColor: "#003087" },
  tb: { id: "tb", abbreviation: "TB", name: "Rays", city: "Tampa Bay", league: "AL", division: "East", primaryColor: "#092C5C" },
  tor: { id: "tor", abbreviation: "TOR", name: "Blue Jays", city: "Toronto", league: "AL", division: "East", primaryColor: "#134A8E" },
  // American League Central
  cws: { id: "cws", abbreviation: "CWS", name: "White Sox", city: "Chicago", league: "AL", division: "Central", primaryColor: "#27251F" },
  cle: { id: "cle", abbreviation: "CLE", name: "Guardians", city: "Cleveland", league: "AL", division: "Central", primaryColor: "#00385D" },
  det: { id: "det", abbreviation: "DET", name: "Tigers", city: "Detroit", league: "AL", division: "Central", primaryColor: "#0C2340" },
  kc: { id: "kc", abbreviation: "KC", name: "Royals", city: "Kansas City", league: "AL", division: "Central", primaryColor: "#004687" },
  min: { id: "min", abbreviation: "MIN", name: "Twins", city: "Minnesota", league: "AL", division: "Central", primaryColor: "#002B5C" },
  // American League West
  hou: { id: "hou", abbreviation: "HOU", name: "Astros", city: "Houston", league: "AL", division: "West", primaryColor: "#002D62" },
  laa: { id: "laa", abbreviation: "LAA", name: "Angels", city: "Los Angeles", league: "AL", division: "West", primaryColor: "#BA0021" },
  oak: { id: "oak", abbreviation: "OAK", name: "Athletics", city: "Oakland", league: "AL", division: "West", primaryColor: "#003831" },
  sea: { id: "sea", abbreviation: "SEA", name: "Mariners", city: "Seattle", league: "AL", division: "West", primaryColor: "#0C2C56" },
  tex: { id: "tex", abbreviation: "TEX", name: "Rangers", city: "Texas", league: "AL", division: "West", primaryColor: "#003278" },
  // National League East
  atl: { id: "atl", abbreviation: "ATL", name: "Braves", city: "Atlanta", league: "NL", division: "East", primaryColor: "#CE1141" },
  mia: { id: "mia", abbreviation: "MIA", name: "Marlins", city: "Miami", league: "NL", division: "East", primaryColor: "#00A3E0" },
  nym: { id: "nym", abbreviation: "NYM", name: "Mets", city: "New York", league: "NL", division: "East", primaryColor: "#002D72" },
  phi: { id: "phi", abbreviation: "PHI", name: "Phillies", city: "Philadelphia", league: "NL", division: "East", primaryColor: "#E81828" },
  wsh: { id: "wsh", abbreviation: "WSH", name: "Nationals", city: "Washington", league: "NL", division: "East", primaryColor: "#AB0003" },
  // National League Central
  chc: { id: "chc", abbreviation: "CHC", name: "Cubs", city: "Chicago", league: "NL", division: "Central", primaryColor: "#0E3386" },
  cin: { id: "cin", abbreviation: "CIN", name: "Reds", city: "Cincinnati", league: "NL", division: "Central", primaryColor: "#C6011F" },
  mil: { id: "mil", abbreviation: "MIL", name: "Brewers", city: "Milwaukee", league: "NL", division: "Central", primaryColor: "#12284B" },
  pit: { id: "pit", abbreviation: "PIT", name: "Pirates", city: "Pittsburgh", league: "NL", division: "Central", primaryColor: "#FDB827" },
  stl: { id: "stl", abbreviation: "STL", name: "Cardinals", city: "St. Louis", league: "NL", division: "Central", primaryColor: "#C41E3A" },
  // National League West
  ari: { id: "ari", abbreviation: "ARI", name: "Diamondbacks", city: "Arizona", league: "NL", division: "West", primaryColor: "#A71930" },
  col: { id: "col", abbreviation: "COL", name: "Rockies", city: "Colorado", league: "NL", division: "West", primaryColor: "#33006F" },
  lad: { id: "lad", abbreviation: "LAD", name: "Dodgers", city: "Los Angeles", league: "NL", division: "West", primaryColor: "#005A9C" },
  sd: { id: "sd", abbreviation: "SD", name: "Padres", city: "San Diego", league: "NL", division: "West", primaryColor: "#2F241D" },
  sf: { id: "sf", abbreviation: "SF", name: "Giants", city: "San Francisco", league: "NL", division: "West", primaryColor: "#FD5A1E" },
}

/** Lookup by full team name (as returned by API-Sports) */
const MLB_TEAMS_BY_NAME: Record<string, MLBTeamInfo> = {}
for (const team of Object.values(MLB_TEAMS)) {
  MLB_TEAMS_BY_NAME[team.name.toLowerCase()] = team
  MLB_TEAMS_BY_NAME[`${team.city.toLowerCase()} ${team.name.toLowerCase()}`] = team
}

export function getTeamByName(name: string): MLBTeamInfo | undefined {
  return MLB_TEAMS_BY_NAME[name.toLowerCase()]
}

export function getTeamByAbbreviation(abbr: string): MLBTeamInfo | undefined {
  return MLB_TEAMS[abbr.toLowerCase()]
}
