// lib/search.ts
// Simple in-memory search utilities for games and pitchers.
// Filters by team abbreviations, pitcher names, and matchup strings.

import type { Game, Pitcher, NRFIPrediction } from "@/lib/types"

export interface SearchResult {
  type: "game" | "pitcher"
  id: string
  title: string
  subtitle?: string
  data: Game | Pitcher
}

export function searchGames(
  query: string,
  games: Game[],
  predictions: NRFIPrediction[],
  pitchers: Map<string, Pitcher>
): SearchResult[] {
  if (!query.trim()) return []

  const q = query.toLowerCase()
  const results: SearchResult[] = []

  // Search games by team abbreviations and matchup
  games.forEach((game, index) => {
    const pred = predictions[index]
    const homePitcher = pitchers.get(game.homePitcherId)
    const awayPitcher = pitchers.get(game.awayPitcherId)

    const matchupStr = `${game.awayTeamId} vs ${game.homeTeamId}`.toLowerCase()
    const timeStr = game.time.toLowerCase()
    const venueStr = game.venue.toLowerCase()
    const homePitcherStr = homePitcher?.name.toLowerCase() ?? ""
    const awayPitcherStr = awayPitcher?.name.toLowerCase() ?? ""

    const matches =
      matchupStr.includes(q) ||
      timeStr.includes(q) ||
      venueStr.includes(q) ||
      homePitcherStr.includes(q) ||
      awayPitcherStr.includes(q)

    if (matches) {
      results.push({
        type: "game",
        id: game.id,
        title: `${game.awayTeamId} @ ${game.homeTeamId}`,
        subtitle: `${game.time} · ${game.venue}${pred ? ` · ${Math.round(pred.nrfiProbability * 100)}% NRFI` : ""}`,
        data: game,
      })
    }
  })

  return results
}

export function searchPitchers(query: string, pitchers: Pitcher[]): SearchResult[] {
  if (!query.trim()) return []

  const q = query.toLowerCase()
  const results: SearchResult[] = []

  pitchers.forEach((pitcher) => {
    const nameMatch = pitcher.name.toLowerCase().includes(q)
    const teamMatch = pitcher.teamId.toLowerCase().includes(q)

    if (nameMatch || teamMatch) {
      results.push({
        type: "pitcher",
        id: pitcher.id,
        title: pitcher.name,
        subtitle: `${pitcher.throws}HP · ${(pitcher.firstInning.nrfiRate * 100).toFixed(1)}% NRFI`,
        data: pitcher,
      })
    }
  })

  return results
}
