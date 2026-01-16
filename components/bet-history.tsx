"use client"

import type { Bet, Game, Team } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatOdds } from "@/lib/utils/odds"
import { Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react"

interface BetHistoryProps {
  bets: Bet[]
  games: Game[]
  teams: Team[]
}

export function BetHistory({ bets, games, teams }: BetHistoryProps) {
  const getGameInfo = (gameId: string) => {
    const game = games.find((g) => g.id === gameId)
    if (!game) return null

    const homeTeam = teams.find((t) => t.id === game.homeTeamId)
    const awayTeam = teams.find((t) => t.id === game.awayTeamId)

    return { game, homeTeam, awayTeam }
  }

  const sortedBets = [...bets].sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())

  return (
    <Card className="bg-card p-6">
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Bet History</h2>

        <div className="space-y-2">
          {sortedBets.map((bet) => {
            const info = getGameInfo(bet.gameId)
            if (!info) return null

            const { homeTeam, awayTeam } = info

            const resultIcon =
              bet.result === "win" ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : bet.result === "loss" ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : bet.result === "push" ? (
                <Minus className="h-4 w-4 text-yellow-500" />
              ) : null

            const resultColor =
              bet.result === "win" ? "text-green-500" : bet.result === "loss" ? "text-red-500" : "text-yellow-500"

            return (
              <div key={bet.id} className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {bet.betType}
                      </Badge>
                      <span className="font-medium">{bet.side}</span>
                      {bet.result && (
                        <Badge variant={bet.result === "win" ? "default" : "secondary"} className="text-xs">
                          {bet.result.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {awayTeam?.abbreviation} @ {homeTeam?.abbreviation}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{bet.placedAt.toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Odds</div>
                      <div className="font-mono font-semibold">{formatOdds(bet.odds)}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Stake</div>
                      <div className="font-semibold">${bet.stake.toFixed(2)}</div>
                    </div>

                    {bet.result && (
                      <div className="text-right min-w-24">
                        <div className="flex items-center gap-1 justify-end mb-1">
                          {resultIcon}
                          <span className="text-sm text-muted-foreground">P/L</span>
                        </div>
                        <div className={`font-bold ${resultColor}`}>
                          {bet.profit && bet.profit >= 0 ? "+" : ""}${(bet.profit || 0).toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {sortedBets.length === 0 && <div className="text-center py-8 text-muted-foreground">No bets placed yet.</div>}
        </div>
      </div>
    </Card>
  )
}
