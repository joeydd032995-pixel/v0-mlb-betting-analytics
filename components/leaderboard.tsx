"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TrendingUp, Target, Zap, Users } from "lucide-react"

interface LeaderboardEntry {
  rank: number
  username: string
  avatar: string
  predictions: number
  accuracy: number
  roi: number
  winRate: number
  edge: number
}

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  {
    rank: 1,
    username: "StatMaster23",
    avatar: "SM",
    predictions: 487,
    accuracy: 62.4,
    roi: 18.7,
    winRate: 62.4,
    edge: 5.2,
  },
  {
    rank: 2,
    username: "PitcherWhisperer",
    avatar: "PW",
    predictions: 412,
    accuracy: 60.8,
    roi: 15.3,
    winRate: 60.8,
    edge: 4.1,
  },
  {
    rank: 3,
    username: "WeatherAnalyst",
    avatar: "WA",
    predictions: 356,
    accuracy: 59.2,
    roi: 12.9,
    winRate: 59.2,
    edge: 3.7,
  },
  {
    rank: 4,
    username: "ValueHunter",
    avatar: "VH",
    predictions: 298,
    accuracy: 57.6,
    roi: 9.4,
    winRate: 57.6,
    edge: 2.3,
  },
  {
    rank: 5,
    username: "ParkFactorPro",
    avatar: "PF",
    predictions: 267,
    accuracy: 56.9,
    roi: 8.1,
    winRate: 56.9,
    edge: 2.1,
  },
  {
    rank: 6,
    username: "DataDrivenBet",
    avatar: "DD",
    predictions: 234,
    accuracy: 55.3,
    roi: 5.8,
    winRate: 55.3,
    edge: 1.4,
  },
  {
    rank: 7,
    username: "EV_Calculator",
    avatar: "EC",
    predictions: 198,
    accuracy: 54.7,
    roi: 4.2,
    winRate: 54.7,
    edge: 0.9,
  },
  {
    rank: 8,
    username: "BettingBot",
    avatar: "BB",
    predictions: 156,
    accuracy: 53.1,
    roi: 2.1,
    winRate: 53.1,
    edge: 0.5,
  },
]

const COMMUNITY_STATS = {
  totalUsers: 2847,
  activePredictors: 1203,
  totalPredictions: 428921,
  communityAccuracy: 56.8,
}

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<"overall" | "roi" | "accuracy">("overall")

  const getSortedLeaderboard = () => {
    const sorted = [...MOCK_LEADERBOARD]
    if (activeTab === "roi") {
      return sorted.sort((a, b) => b.roi - a.roi)
    } else if (activeTab === "accuracy") {
      return sorted.sort((a, b) => b.accuracy - a.accuracy)
    }
    return sorted
  }

  const leaderboard = getSortedLeaderboard()

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-400" />
              Active Predictors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{COMMUNITY_STATS.activePredictors.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {((COMMUNITY_STATS.activePredictors / COMMUNITY_STATS.totalUsers) * 100).toFixed(0)}% of community
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              Total Predictions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{(COMMUNITY_STATS.totalPredictions / 1000).toFixed(0)}k</p>
            <p className="text-xs text-muted-foreground mt-1">This season</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-sky-400" />
              Community Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{COMMUNITY_STATS.communityAccuracy.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Across all predictions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Avg Community ROI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-400">+3.2%</p>
            <p className="text-xs text-muted-foreground mt-1">25% Kelly Criterion</p>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Top Predictors</CardTitle>
          <CardDescription>Based on prediction accuracy and value edge</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overall" | "roi" | "accuracy")}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overall">Overall</TabsTrigger>
              <TabsTrigger value="roi">ROI</TabsTrigger>
              <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-6">
              <div className="space-y-3">
                {leaderboard.map((entry, idx) => (
                  <div
                    key={entry.rank}
                    className={cn(
                      "rounded-lg border p-4 transition-colors hover:bg-card/70",
                      idx < 3 ? "border-border/50 bg-card/50" : "border-border/30 bg-card/30"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className="flex-shrink-0 w-12">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-lg font-bold text-sm",
                            idx === 0
                              ? "bg-yellow-500/20 text-yellow-400"
                              : idx === 1
                              ? "bg-gray-400/20 text-gray-300"
                              : idx === 2
                              ? "bg-orange-500/20 text-orange-400"
                              : "bg-border/30 text-muted-foreground"
                          )}
                        >
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                        </div>
                      </div>

                      {/* User Info */}
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-500/20 text-sm font-bold text-violet-400">
                          {entry.avatar}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{entry.username}</p>
                          <p className="text-xs text-muted-foreground">{entry.predictions} predictions</p>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="hidden sm:grid sm:grid-cols-3 gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Accuracy</p>
                          <p className="text-sm font-bold text-foreground">{entry.accuracy.toFixed(1)}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Win Rate</p>
                          <p className="text-sm font-bold text-foreground">{entry.winRate.toFixed(1)}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">ROI</p>
                          <p className={cn("text-sm font-bold", entry.roi > 0 ? "text-emerald-400" : "text-rose-400")}>
                            {entry.roi > 0 ? "+" : ""}{entry.roi.toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      {/* Edge Badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "flex-shrink-0",
                          entry.edge > 4 ? "border-emerald-500/50 text-emerald-400" : "border-border/30 text-muted-foreground"
                        )}
                      >
                        {entry.edge > 0 ? "+" : ""}{entry.edge.toFixed(1)}% edge
                      </Badge>
                    </div>

                    {/* Mobile Stats */}
                    <div className="sm:hidden mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <p className="text-muted-foreground">Accuracy</p>
                        <p className="font-bold text-foreground">{entry.accuracy.toFixed(1)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground">Win Rate</p>
                        <p className="font-bold text-foreground">{entry.winRate.toFixed(1)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground">ROI</p>
                        <p className={cn("font-bold", entry.roi > 0 ? "text-emerald-400" : "text-rose-400")}>
                          {entry.roi > 0 ? "+" : ""}{entry.roi.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Leaderboard Rankings Work</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-semibold text-foreground mb-1">Accuracy</p>
            <p className="text-muted-foreground">Percentage of predictions that matched actual outcomes</p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">ROI (Return on Investment)</p>
            <p className="text-muted-foreground">Profit/loss using 25% Kelly Criterion sizing on flat stakes</p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">Edge</p>
            <p className="text-muted-foreground">Average edge found per prediction (model prob - implied prob)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
