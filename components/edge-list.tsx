"use client"

import type { BettingEdge, Game, Team } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatOdds } from "@/lib/utils/odds"
import { TrendingUp, Target } from "lucide-react"

interface EdgeListProps {
  edges: BettingEdge[]
  games: Game[]
  teams: Team[]
}

export function EdgeList({ edges, games, teams }: EdgeListProps) {
  const getGameInfo = (gameId: string) => {
    const game = games.find((g) => g.id === gameId)
    if (!game) return null

    const homeTeam = teams.find((t) => t.id === game.homeTeamId)
    const awayTeam = teams.find((t) => t.id === game.awayTeamId)

    return { game, homeTeam, awayTeam }
  }

  return (
    <Card className="bg-card p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-accent" />
          <h2 className="text-xl font-bold">Top Betting Edges</h2>
          <Badge variant="secondary" className="ml-auto">
            {edges.length} found
          </Badge>
        </div>

        <div className="space-y-2">
          {edges.map((edge, index) => {
            const info = getGameInfo(edge.gameId)
            if (!info) return null

            const { homeTeam, awayTeam } = info

            return (
              <div
                key={`${edge.gameId}-${edge.betType}-${edge.side}`}
                className="p-4 bg-secondary/50 rounded-lg border border-border hover:bg-secondary transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                      <Badge variant="outline" className="text-xs">
                        {edge.betType}
                      </Badge>
                      <span className="font-medium">{edge.side}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {awayTeam?.abbreviation} @ {homeTeam?.abbreviation}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Market</div>
                      <div className="font-mono font-semibold">{formatOdds(edge.marketOdds)}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Fair</div>
                      <div className="font-mono font-semibold">{formatOdds(edge.fairOdds)}</div>
                    </div>

                    <div className="text-right min-w-20">
                      <div className="text-lg font-bold text-accent">+{edge.edgePercent.toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground">{edge.recommendedUnits}u recommended</div>
                    </div>

                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Target className="h-4 w-4" />
                      <span className="text-sm">{(edge.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {edges.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No betting edges found that meet the minimum criteria.
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
