"use client"

import type { Alert as AlertType, Game, Team } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bell, BellOff, TrendingUp, Activity, Target, X } from "lucide-react"
import { useState } from "react"

interface AlertsPanelProps {
  alerts: AlertType[]
  unreadAlerts: AlertType[]
  games: Game[]
  teams: Team[]
  onMarkRead: (alertId: string) => void
}

export function AlertsPanel({ alerts, unreadAlerts, games, teams, onMarkRead }: AlertsPanelProps) {
  const [showAll, setShowAll] = useState(false)

  const getGameInfo = (gameId: string) => {
    const game = games.find((g) => g.id === gameId)
    if (!game) return null

    const homeTeam = teams.find((t) => t.id === game.homeTeamId)
    const awayTeam = teams.find((t) => t.id === game.awayTeamId)

    return { game, homeTeam, awayTeam }
  }

  const displayAlerts = showAll ? alerts : unreadAlerts
  const sortedAlerts = [...displayAlerts].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "edge":
        return <TrendingUp className="h-4 w-4" />
      case "movement":
        return <Activity className="h-4 w-4" />
      case "threshold":
        return <Target className="h-4 w-4" />
      default:
        return <Bell className="h-4 w-4" />
    }
  }

  return (
    <Card className="bg-card p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent" />
            <h2 className="text-xl font-bold">Alerts</h2>
            {unreadAlerts.length > 0 && (
              <Badge variant="default" className="ml-2">
                {unreadAlerts.length} new
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? <BellOff className="h-4 w-4 mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
            {showAll ? "Show Unread" : "Show All"}
          </Button>
        </div>

        <div className="space-y-2">
          {sortedAlerts.map((alert) => {
            const info = getGameInfo(alert.gameId)
            if (!info) return null

            const { homeTeam, awayTeam } = info

            return (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border transition-colors ${alert.read ? "bg-secondary/30 border-border" : "bg-accent/10 border-accent"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`mt-1 ${alert.read ? "text-muted-foreground" : "text-accent"}`}>
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {alert.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {awayTeam?.abbreviation} @ {homeTeam?.abbreviation}
                        </span>
                      </div>
                      <p className={`text-sm ${alert.read ? "text-muted-foreground" : "font-medium"}`}>
                        {alert.message}
                      </p>
                      <p className="text-xs text-muted-foreground">{alert.timestamp.toLocaleString()}</p>
                    </div>
                  </div>
                  {!alert.read && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMarkRead(alert.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}

          {sortedAlerts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {showAll ? "No alerts yet." : "No unread alerts."}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
