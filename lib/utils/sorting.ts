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
        (x) => x.pred.valueAnalysis && x.pred.valueAnalysis.recommendedBet !== "NO_BET"
      )
    }

    // Apply sorting
    switch (filters.sortBy) {
      case "probability":
        items.sort((a, b) => Math.abs(b.pred.nrfiProbability - 0.5) - Math.abs(a.pred.nrfiProbability - 0.5))
        break
      case "confidence":
        items.sort((a, b) => b.pred.confidenceScore - a.pred.confidenceScore)
        break
      case "edge":
        items.sort((a, b) => {
          const eA = a.pred.valueAnalysis
            ? Math.max(Math.abs(a.pred.valueAnalysis.nrfiEdge), Math.abs(a.pred.valueAnalysis.yrfiEdge))
            : 0
          const eB = b.pred.valueAnalysis
            ? Math.max(Math.abs(b.pred.valueAnalysis.nrfiEdge), Math.abs(b.pred.valueAnalysis.yrfiEdge))
            : 0
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
