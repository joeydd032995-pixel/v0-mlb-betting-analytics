"use client"

import { games, teams, oddsData } from "@/lib/mock-data"
import { useProjections } from "@/lib/hooks/use-projections"
import { useBettingEdges } from "@/lib/hooks/use-betting-edges"
import { useOddsMonitor } from "@/lib/hooks/use-odds-monitor"
import { GameCard } from "@/components/game-card"
import { EdgeList } from "@/components/edge-list"
import { StatsOverview } from "@/components/stats-overview"
import { OddsMovements } from "@/components/odds-movements"
import { AlertsPanel } from "@/components/alerts-panel"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Wallet } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const { projections, loading: projectionsLoading } = useProjections(games)
  const { edges, topEdges, edgesByGame, loading: edgesLoading } = useBettingEdges(projections, oddsData)
  const { odds, movements, alerts, unreadAlerts, markAlertRead } = useOddsMonitor(oddsData, edges)

  const loading = projectionsLoading || edgesLoading

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId)

  const stats = {
    totalGames: games.length,
    totalEdges: edges.length,
    averageEdge: edges.length > 0 ? edges.reduce((sum, e) => sum + e.edgePercent, 0) / edges.length : 0,
    totalRecommendedUnits: edges.reduce((sum, e) => sum + e.recommendedUnits, 0),
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg">Analyzing games and calculating edges...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-balance">MLB Betting Analytics</h1>
            <p className="text-muted-foreground text-lg">Data-driven projections and betting edge analysis</p>
          </div>
          <Link href="/bankroll">
            <Button size="lg">
              <Wallet className="h-5 w-5 mr-2" />
              Bankroll
            </Button>
          </Link>
        </div>

        {/* Stats Overview */}
        <StatsOverview {...stats} />

        {/* Main Content */}
        <Tabs defaultValue="games" className="space-y-6">
          <TabsList>
            <TabsTrigger value="games">Games</TabsTrigger>
            <TabsTrigger value="edges">Top Edges</TabsTrigger>
            <TabsTrigger value="movements">
              Odds Movements
              {movements.filter((m) => m.significant).length > 0 && (
                <span className="ml-2 bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs">
                  {movements.filter((m) => m.significant).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="alerts">
              Alerts
              {unreadAlerts.length > 0 && (
                <span className="ml-2 bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs">
                  {unreadAlerts.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="games" className="space-y-4">
            {games.map((game) => {
              const homeTeam = getTeam(game.homeTeamId)
              const awayTeam = getTeam(game.awayTeamId)
              const projection = projections.get(game.id)
              const gameEdges = edgesByGame.get(game.id) || []
              const gameOdds = odds.find((o) => o.gameId === game.id)

              if (!homeTeam || !awayTeam) return null

              return (
                <GameCard
                  key={game.id}
                  game={game}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  projection={projection}
                  edges={gameEdges}
                  odds={gameOdds}
                />
              )
            })}
          </TabsContent>

          <TabsContent value="edges">
            <EdgeList edges={topEdges} games={games} teams={teams} />
          </TabsContent>

          <TabsContent value="movements">
            <OddsMovements movements={movements} games={games} teams={teams} />
          </TabsContent>

          <TabsContent value="alerts">
            <AlertsPanel
              alerts={alerts}
              unreadAlerts={unreadAlerts}
              games={games}
              teams={teams}
              onMarkRead={markAlertRead}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
