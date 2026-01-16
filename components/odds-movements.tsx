"use client"

import type { OddsMovement, Game, Team } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatOdds } from "@/lib/utils/odds"
import { TrendingUp, TrendingDown, Activity } from "lucide-react"

interface OddsMovementsProps {
  movements: OddsMovement[]
  games: Game[]
  teams: Team[]
}

export function OddsMovements({ movements, games, teams }: OddsMovementsProps) {
  const getGameInfo = (gameId: string) => {
    const game = games.find((g) => g.id === gameId)
    if (!game) return null

    const homeTeam = teams.find((t) => t.id === game.homeTeamId)
    const awayTeam = teams.find((t) => t.id === game.awayTeamId)

    return { game, homeTeam, awayTeam }
  }

  const sortedMovements = [...movements].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 20)

  return (
    <Card className="bg-card p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Live Odds Movements</h2>
          <Badge variant="secondary" className="ml-auto">
            {movements.length} total
          </Badge>
        </div>

        <div className="space-y-2">
          {sortedMovements.map((movement, index) => {
            const info = getGameInfo(movement.gameId)
            if (!info) return null

            const { homeTeam, awayTeam } = info

            const isPositive = movement.movement > 0
            const movementColor = movement.significant
              ? isPositive
                ? "text-green-500"
                : "text-red-500"
              : "text-muted-foreground"

            return (
              <div
                key={`${movement.gameId}-${movement.timestamp.getTime()}-${index}`}
                className={`p-3 rounded-lg border ${movement.significant ? "bg-accent/10 border-accent" : "bg-secondary/30 border-border"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {movement.betType}
                      </Badge>
                      <span className="text-sm font-medium">{movement.side}</span>
                      {movement.significant && (
                        <Badge variant="default" className="text-xs">
                          SIGNIFICANT
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {awayTeam?.abbreviation} @ {homeTeam?.abbreviation}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">From</div>
                      <div className="font-mono text-sm">{formatOdds(movement.oldOdds)}</div>
                    </div>

                    <div className="flex items-center">
                      {isPositive ? (
                        <TrendingUp className={`h-5 w-5 ${movementColor}`} />
                      ) : (
                        <TrendingDown className={`h-5 w-5 ${movementColor}`} />
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">To</div>
                      <div className="font-mono text-sm font-bold">{formatOdds(movement.newOdds)}</div>
                    </div>

                    <div className="text-right min-w-16">
                      <div className={`font-bold ${movementColor}`}>
                        {isPositive ? "+" : ""}
                        {movement.movement}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(movement.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {sortedMovements.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No odds movements detected yet.</div>
          )}
        </div>
      </div>
    </Card>
  )
}
