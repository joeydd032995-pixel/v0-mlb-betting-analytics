"use client"

import type { Game, Team, Projection, BettingEdge, OddsData } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatOdds } from "@/lib/utils/odds"
import { TrendingUp, Clock, Wind, Thermometer } from "lucide-react"

interface GameCardProps {
  game: Game
  homeTeam: Team
  awayTeam: Team
  projection?: Projection
  edges?: BettingEdge[]
  odds?: OddsData
}

export function GameCard({ game, homeTeam, awayTeam, projection, edges, odds }: GameCardProps) {
  const gameTime = new Date(game.date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  const bestEdge = edges && edges.length > 0 ? edges[0] : null

  return (
    <Card className="bg-card p-4 hover:bg-card/80 transition-colors">
      <div className="space-y-4">
        {/* Game Time and Venue */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{gameTime}</span>
          </div>
          <span className="text-muted-foreground">{game.venue}</span>
        </div>

        {/* Teams and Projections */}
        <div className="space-y-3">
          {/* Away Team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-16 text-left">
                <div className="font-bold">{awayTeam.abbreviation}</div>
                <div className="text-xs text-muted-foreground">{awayTeam.name}</div>
              </div>
              {projection && <div className="text-sm text-muted-foreground">Proj: {projection.projectedAwayScore}</div>}
            </div>
            <div className="flex items-center gap-3">
              {odds && (
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold">{formatOdds(odds.moneylineAway)}</div>
                  <div className="text-xs text-muted-foreground">ML</div>
                </div>
              )}
              {projection && (
                <div className="text-right min-w-16">
                  <div className="font-semibold">{(projection.awayWinProb * 100).toFixed(0)}%</div>
                  <div className="text-xs text-muted-foreground">Win Prob</div>
                </div>
              )}
            </div>
          </div>

          {/* Home Team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-16 text-left">
                <div className="font-bold">{homeTeam.abbreviation}</div>
                <div className="text-xs text-muted-foreground">{homeTeam.name}</div>
              </div>
              {projection && <div className="text-sm text-muted-foreground">Proj: {projection.projectedHomeScore}</div>}
            </div>
            <div className="flex items-center gap-3">
              {odds && (
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold">{formatOdds(odds.moneylineHome)}</div>
                  <div className="text-xs text-muted-foreground">ML</div>
                </div>
              )}
              {projection && (
                <div className="text-right min-w-16">
                  <div className="font-semibold">{(projection.homeWinProb * 100).toFixed(0)}%</div>
                  <div className="text-xs text-muted-foreground">Win Prob</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Total Line */}
        {odds && projection && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-sm text-muted-foreground">Total: O/U {odds.totalOver}</div>
            <div className="text-sm">
              Projected: <span className="font-semibold">{projection.projectedTotal}</span>
            </div>
          </div>
        )}

        {/* Weather */}
        {game.weather && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Thermometer className="h-3 w-3" />
              <span>{game.weather.temp}°F</span>
            </div>
            <div className="flex items-center gap-1">
              <Wind className="h-3 w-3" />
              <span>
                {game.weather.windSpeed}mph {game.weather.windDirection}
              </span>
            </div>
            <span>{game.weather.conditions}</span>
          </div>
        )}

        {/* Best Betting Edge */}
        {bestEdge && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium">Best Edge:</span>
                <Badge variant="secondary" className="text-xs">
                  {bestEdge.betType}
                </Badge>
                <span className="text-sm">{bestEdge.side}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-bold text-accent">+{bestEdge.edgePercent.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">{bestEdge.recommendedUnits}u</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confidence Bar */}
        {projection && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Model Confidence</span>
              <span>{(projection.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${projection.confidence * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
