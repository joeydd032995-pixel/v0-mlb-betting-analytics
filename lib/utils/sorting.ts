// lib/utils/sorting.ts
// useSortableRows() — client-side hook that zips parallel predictions/games/
// teams/pitchers arrays into row objects, applies the grid view's confidence/
// recommendation filters, and sorts. Memoized on its inputs.

import { useMemo } from "react"
import type { Game, NRFIPrediction, Team, Pitcher, FilterOptions } from "@/lib/types"

export interface SortableItem {
  pred: NRFIPrediction
  game: Game
  homeTeam: Team
  awayTeam: Team
  homePitcher: Pitcher
  awayPitcher: Pitcher
}

export function useSortableRows(
  predictions: NRFIPrediction[],
  todayGames: Game[],
  teamMap: Map<string, Team>,
  pitcherMap: Map<string, Pitcher>,
  filters: FilterOptions
): SortableItem[] {
  return useMemo(() => {
    let items: SortableItem[] = predictions
      .map((pred, i) => ({
        pred,
        game: todayGames[i],
        homeTeam: teamMap.get(todayGames[i]?.homeTeamId ?? "")!,
        awayTeam: teamMap.get(todayGames[i]?.awayTeamId ?? "")!,
        homePitcher: pitcherMap.get(todayGames[i]?.homePitcherId ?? "")!,
        awayPitcher: pitcherMap.get(todayGames[i]?.awayPitcherId ?? "")!,
      }))
      .filter((x) => x.game && x.homeTeam && x.awayTeam && x.homePitcher && x.awayPitcher)

    // Apply confidence filter
    if (filters.confidenceLevel !== "all") {
      items = items.filter((x) => x.pred.confidence === filters.confidenceLevel)
    }

    // Apply recommendation filter
    if (filters.recommendation !== "all") {
      items = items.filter((x) => {
        if (filters.recommendation === "NRFI") {
          return x.pred.recommendation === "STRONG_NRFI" || x.pred.recommendation === "LEAN_NRFI"
        }
        if (filters.recommendation === "YRFI") {
          return x.pred.recommendation === "STRONG_YRFI" || x.pred.recommendation === "LEAN_YRFI"
        }
        return x.pred.recommendation === "TOSS_UP"
      })
    }

    // Apply league filter
    if (filters.league !== "all") {
      items = items.filter(
        (x) => x.homeTeam.league === filters.league || x.awayTeam.league === filters.league
      )
    }

    // Apply value-only filter
    if (filters.showValueOnly) {
      items = items.filter(
        // Simulated analyses are excluded: a "value bet" against a price we
        // reconstructed ourselves is not a value bet.
        (x) => x.pred.valueAnalysis && !x.pred.valueAnalysis.simulated &&
               x.pred.valueAnalysis.recommendedBet !== "NO_BET"
      )
    }

    // Apply sorting
    switch (filters.sortBy) {
      case "probability":
        items.sort((a, b) => Math.abs(b.pred.nrfiProbability - 0.5) - Math.abs(a.pred.nrfiProbability - 0.5))
        break
      case "confidence":
        // Conviction, matching what the confidence tier now means. The
        // reliability score this used to sort by has ~zero correlation with
        // being correct, so it ordered the board by nothing in particular.
        items.sort((a, b) =>
          Math.abs(b.pred.nrfiProbability - 0.5) - Math.abs(a.pred.nrfiProbability - 0.5))
        break
      case "edge":
        items.sort((a, b) => {
          // Simulated edges sort as 0 — ranking by them would just re-sort the
          // board by distance from the league base rate under a "value" label.
          const edgeOf = (va: typeof a.pred.valueAnalysis) =>
            va && !va.simulated ? Math.max(Math.abs(va.nrfiEdge), Math.abs(va.yrfiEdge)) : 0
          const eA = edgeOf(a.pred.valueAnalysis)
          const eB = edgeOf(b.pred.valueAnalysis)
          return eB - eA
        })
        break
      default:
        // time — already in game order
        break
    }

    return items
  }, [predictions, todayGames, teamMap, pitcherMap, filters])
}
