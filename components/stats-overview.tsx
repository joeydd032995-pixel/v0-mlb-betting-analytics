"use client"

import { Card } from "@/components/ui/card"
import { TrendingUp, DollarSign, Target, Activity } from "lucide-react"

interface StatsOverviewProps {
  totalGames: number
  totalEdges: number
  averageEdge: number
  totalRecommendedUnits: number
}

export function StatsOverview({ totalGames, totalEdges, averageEdge, totalRecommendedUnits }: StatsOverviewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="bg-card p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Games Analyzed</p>
            <p className="text-3xl font-bold">{totalGames}</p>
          </div>
          <Activity className="h-8 w-8 text-primary" />
        </div>
      </Card>

      <Card className="bg-card p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Edges Found</p>
            <p className="text-3xl font-bold">{totalEdges}</p>
          </div>
          <TrendingUp className="h-8 w-8 text-accent" />
        </div>
      </Card>

      <Card className="bg-card p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Avg Edge</p>
            <p className="text-3xl font-bold">+{averageEdge.toFixed(1)}%</p>
          </div>
          <Target className="h-8 w-8 text-primary" />
        </div>
      </Card>

      <Card className="bg-card p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Total Units</p>
            <p className="text-3xl font-bold">{totalRecommendedUnits.toFixed(1)}u</p>
          </div>
          <DollarSign className="h-8 w-8 text-accent" />
        </div>
      </Card>
    </div>
  )
}
