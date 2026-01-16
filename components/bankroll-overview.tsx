"use client"

import type { BankrollStats } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { TrendingUp, TrendingDown, DollarSign, Percent, Target, Activity } from "lucide-react"

interface BankrollOverviewProps {
  stats: BankrollStats
}

export function BankrollOverview({ stats }: BankrollOverviewProps) {
  const profitColor = stats.totalProfit >= 0 ? "text-green-500" : "text-red-500"
  const roiColor = stats.roi >= 0 ? "text-green-500" : "text-red-500"

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card className="bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Current Bankroll</p>
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-3xl font-bold">${stats.totalBankroll.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-1">Starting: ${stats.startingBankroll.toFixed(2)}</p>
          </div>
        </div>
      </Card>

      <Card className="bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total Profit/Loss</p>
            {stats.totalProfit >= 0 ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
          </div>
          <div>
            <p className={`text-3xl font-bold ${profitColor}`}>
              {stats.totalProfit >= 0 ? "+" : ""}${stats.totalProfit.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Wagered: ${stats.totalWagered.toFixed(2)}</p>
          </div>
        </div>
      </Card>

      <Card className="bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">ROI</p>
            <Percent className={`h-5 w-5 ${roiColor}`} />
          </div>
          <div>
            <p className={`text-3xl font-bold ${roiColor}`}>
              {stats.roi >= 0 ? "+" : ""}
              {stats.roi.toFixed(2)}%
            </p>
            <p className="text-sm text-muted-foreground mt-1">Across {stats.totalBets} bets</p>
          </div>
        </div>
      </Card>

      <Card className="bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-3xl font-bold">{(stats.winRate * 100).toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground mt-1">{stats.totalBets} total bets</p>
          </div>
        </div>
      </Card>

      <Card className="bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Unit Size</p>
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-3xl font-bold">${stats.unitSize.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-1">1% of starting bankroll</p>
          </div>
        </div>
      </Card>

      <Card className="bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Avg Odds</p>
            <Activity className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-3xl font-bold">
              {stats.averageOdds > 0 ? "+" : ""}
              {Math.round(stats.averageOdds)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">American odds</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
