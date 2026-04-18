"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Target, Zap, AlertCircle } from "lucide-react"

interface DayPerformance {
  date: string
  day: string
  games: number
  accuracy: number
  roi: number
  predictions: number
}

interface TopPerformer {
  name: string
  confidence: string
  accuracy: number
  edge: number
  predictions: number
}

const WEEK_DATA: DayPerformance[] = [
  { date: "Mon 4/14", day: "Monday", games: 14, accuracy: 55.2, roi: -1.2, predictions: 14 },
  { date: "Tue 4/15", day: "Tuesday", games: 14, accuracy: 58.6, roi: 4.3, predictions: 14 },
  { date: "Wed 4/16", day: "Wednesday", games: 14, accuracy: 59.1, roi: 6.2, predictions: 14 },
  { date: "Thu 4/17", day: "Thursday", games: 13, accuracy: 57.9, roi: 3.8, predictions: 13 },
  { date: "Fri 4/18", day: "Friday", games: 15, accuracy: 60.2, roi: 8.1, predictions: 15 },
]

const TOP_PERFORMERS: TopPerformer[] = [
  { name: "High Confidence", confidence: "≥68", accuracy: 64.3, edge: 5.2, predictions: 28 },
  { name: "Medium Confidence", confidence: "45-67", accuracy: 57.1, edge: 2.8, predictions: 42 },
  { name: "Low Confidence", confidence: "<45", accuracy: 51.9, edge: 0.4, predictions: 14 },
]

const WEEK_STATS = {
  totalGames: 70,
  predictions: 70,
  accuracy: 58.2,
  roi: 4.2,
  winRate: 58.2,
  topGame: "Fri NYY @ BAL: 73% NRFI",
  topEdge: "Thu LAD @ PHI: 6.2% edge",
}

export function WeeklyRecap() {
  const avgAccuracy = (WEEK_DATA.reduce((sum, d) => sum + d.accuracy, 0) / WEEK_DATA.length).toFixed(1)
  const avgRoi = (WEEK_DATA.reduce((sum, d) => sum + d.roi, 0) / WEEK_DATA.length).toFixed(1)

  return (
    <div className="space-y-6">
      {/* Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-sky-400" />
              Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{WEEK_STATS.accuracy.toFixed(1)}%</p>
            <p className="text-xs text-emerald-400 mt-1">↑ 1.4pp from season</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Weekly ROI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-400">+{WEEK_STATS.roi.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">25% Kelly sizing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              Games Analyzed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{WEEK_STATS.totalGames}</p>
            <p className="text-xs text-muted-foreground mt-1">All predictions made</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-violet-400" />
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{WEEK_STATS.winRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Correct predictions</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Performance</CardTitle>
          <CardDescription>Accuracy and ROI for each day of the week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {WEEK_DATA.map((day) => (
              <div key={day.date} className="rounded-lg border border-border/30 bg-card/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-foreground">{day.date}</p>
                    <p className="text-xs text-muted-foreground">{day.predictions} predictions</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Accuracy</p>
                      <p className="text-sm font-bold text-foreground">{day.accuracy.toFixed(1)}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">ROI</p>
                      <p className={cn("text-sm font-bold", day.roi > 0 ? "text-emerald-400" : "text-rose-400")}>
                        {day.roi > 0 ? "+" : ""}{day.roi.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Progress bars */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground w-16">Accuracy</p>
                    <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500" style={{ width: `${day.accuracy}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground w-16">ROI</p>
                    <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
                      <div
                        className={day.roi > 0 ? "bg-emerald-500" : "bg-rose-500"}
                        style={{ width: `${Math.min(100, Math.abs(day.roi) * 10)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Performance by Confidence */}
      <Card>
        <CardHeader>
          <CardTitle>Performance by Confidence Level</CardTitle>
          <CardDescription>How well the model performs at each confidence tier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {TOP_PERFORMERS.map((level) => (
              <div key={level.name} className="rounded-lg border border-border/30 bg-card/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-foreground">{level.name}</p>
                    <Badge variant="outline" className="mt-1">{level.confidence}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Accuracy</p>
                      <p className="text-sm font-bold text-foreground">{level.accuracy.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Edge</p>
                      <p className={cn("text-sm font-bold", level.edge > 0 ? "text-emerald-400" : "text-muted-foreground")}>
                        {level.edge > 0 ? "+" : ""}{level.edge.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Count</p>
                      <p className="text-sm font-bold text-foreground">{level.predictions}</p>
                    </div>
                  </div>
                </div>

                <div className="h-1.5 bg-border/30 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500" style={{ width: `${level.accuracy}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Highlights & Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Top Predictions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-xs font-semibold text-emerald-400 mb-1">Best Game</p>
              <p className="text-sm text-foreground">{WEEK_STATS.topGame}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-400 mb-1">Biggest Edge</p>
              <p className="text-sm text-foreground">{WEEK_STATS.topEdge}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>• Friday showed strongest performance (60.2% accuracy, +8.1% ROI)</p>
            <p>• High-confidence predictions (≥68) hit 64.3% — well above baseline</p>
            <p>• Tailwind/warm weather games trended YRFI correctly 5 of 7 times</p>
          </CardContent>
        </Card>
      </div>

      {/* Next Week Preview */}
      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardHeader>
          <CardTitle className="text-sm">Next Week Preview</CardTitle>
          <CardDescription>What to expect week of April 21–27</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>📅 <strong>71 games scheduled</strong> — heavy slate with doubleheaders Mon/Wed</p>
          <p>🌡️ <strong>Spring weather variance</strong> — expect 10-15° swings across regions</p>
          <p>⛅ <strong>Dome games advantage</strong> — 12 games indoors (better for model predictability)</p>
          <p>👀 <strong>Focus area:</strong> First-time starters (limited historical data)</p>
        </CardContent>
      </Card>
    </div>
  )
}
