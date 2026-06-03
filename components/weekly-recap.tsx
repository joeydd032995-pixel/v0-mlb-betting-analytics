"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TrendingUp, Target, Zap, AlertCircle, CalendarOff } from "lucide-react"

interface DayPerformance {
  date: string
  dayLabel: string
  dateLabel: string
  predictions: number
  accuracy: number
  roi: number
}

interface ConfTier {
  accuracy: number
  count: number
}

interface WeeklyRecapData {
  hasData: true
  weekStart: string
  weekEnd: string
  weekLabel: string
  totals: {
    games: number
    predictions: number
    accuracy: number
    roiFlat: number
    winRate: number
    highConfAccuracy: number | null
  }
  daily: DayPerformance[]
  byConfidence: {
    High: ConfTier | null
    Medium: ConfTier | null
    Low: ConfTier | null
  }
  highlights: {
    bestDay: { dayLabel: string; accuracy: number; roi: number } | null
    topGame: { matchup: string; nrfiProbability: number } | null
    topConviction: { matchup: string; prediction: string; probability: number } | null
  }
  insights: {
    nrfiActual: number
    yrfiActual: number
    nrfiRate: number
  }
}

type ApiResponse = WeeklyRecapData | { hasData: false } | { error: string }

/** Format a 0–1 fraction as a one-decimal percentage, e.g. 0.582 → "58.2%". */
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
/** Like {@link pct} but prefixes a "+" for non-negative values, e.g. 0.04 → "+4.0%". */
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`

const CONF_TIERS: { key: keyof WeeklyRecapData["byConfidence"]; label: string; range: string }[] = [
  { key: "High", label: "High Confidence", range: "≥68" },
  { key: "Medium", label: "Medium Confidence", range: "45–67" },
  { key: "Low", label: "Low Confidence", range: "<45" },
]

/**
 * Weekly Recap panel: fetches the latest DB-backed week from /api/weekly-recap
 * and renders loading, error, empty, and ready states. The displayed week
 * auto-advances as new completed predictions are synced.
 */
export function WeeklyRecap() {
  const [data, setData] = useState<WeeklyRecapData | null>(null)
  const [state, setState] = useState<"loading" | "empty" | "error" | "ready">("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/weekly-recap")
        const json: ApiResponse = await res.json()
        if (cancelled) return
        if (!res.ok || "error" in json) {
          setError("error" in json ? json.error : `Request failed (${res.status})`)
          setState("error")
        } else if (!json.hasData) {
          setState("empty")
        } else {
          setData(json)
          setState("ready")
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load weekly recap")
        setState("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state === "loading") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="py-8">
                <div className="h-8 w-24 animate-pulse rounded bg-border/40" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="h-40 animate-pulse rounded bg-border/30" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state === "error") {
    return (
      <Card className="border-rose-500/30 bg-rose-500/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400" />
            Couldn’t load weekly recap
          </CardTitle>
          <CardDescription>{error ?? "Please try again later."}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (state === "empty" || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-muted-foreground" />
            No completed predictions yet
          </CardTitle>
          <CardDescription>
            Once games finish and results sync, this week’s performance breakdown will appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const { totals, daily, byConfidence, highlights, insights, weekLabel } = data
  const daysWithGames = daily.filter((d) => d.predictions > 0)

  return (
    <div className="space-y-6">
      {/* Week label */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Week of {weekLabel}</span>
        <span>·</span>
        <span>{totals.games} games analyzed</span>
      </div>

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
            <p className="text-3xl font-bold text-foreground">{pct(totals.accuracy)}</p>
            <p className="text-xs text-muted-foreground mt-1">Correct first-inning calls</p>
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
            <p
              className={cn(
                "text-3xl font-bold",
                totals.roiFlat >= 0 ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {signedPct(totals.roiFlat)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Flat 1u @ -110</p>
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
            <p className="text-3xl font-bold text-foreground">{totals.games}</p>
            <p className="text-xs text-muted-foreground mt-1">Predictions with results</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-violet-400" />
              High-Conf Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {totals.highConfAccuracy !== null ? pct(totals.highConfAccuracy) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">≥68 confidence tier</p>
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
          {daysWithGames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed games this week.</p>
          ) : (
            <div className="space-y-3">
              {daysWithGames.map((day) => (
                <div key={day.date} className="rounded-lg border border-border/30 bg-card/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {day.dayLabel} {day.dateLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">{day.predictions} predictions</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Accuracy</p>
                        <p className="text-sm font-bold text-foreground">{pct(day.accuracy)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">ROI</p>
                        <p
                          className={cn(
                            "text-sm font-bold",
                            day.roi >= 0 ? "text-emerald-400" : "text-rose-400",
                          )}
                        >
                          {signedPct(day.roi)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Progress bars */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground w-16">Accuracy</p>
                      <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500" style={{ width: `${day.accuracy * 100}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground w-16">ROI</p>
                      <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
                        <div
                          className={day.roi >= 0 ? "bg-emerald-500" : "bg-rose-500"}
                          style={{ width: `${Math.min(100, Math.abs(day.roi) * 1000)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
            {CONF_TIERS.map((tier) => {
              const stats = byConfidence[tier.key]
              return (
                <div key={tier.key} className="rounded-lg border border-border/30 bg-card/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-foreground">{tier.label}</p>
                      <Badge variant="outline" className="mt-1">
                        {tier.range}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-6 text-right">
                      <div>
                        <p className="text-xs text-muted-foreground">Accuracy</p>
                        <p className="text-sm font-bold text-foreground">
                          {stats ? pct(stats.accuracy) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Count</p>
                        <p className="text-sm font-bold text-foreground">{stats?.count ?? 0}</p>
                      </div>
                    </div>
                  </div>

                  <div className="h-1.5 bg-border/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500"
                      style={{ width: `${(stats?.accuracy ?? 0) * 100}%` }}
                    />
                  </div>
                </div>
              )
            })}
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
              <p className="text-xs font-semibold text-emerald-400 mb-1">Best NRFI Call</p>
              <p className="text-sm text-foreground">
                {highlights.topGame
                  ? `${highlights.topGame.matchup}: ${pct(highlights.topGame.nrfiProbability)} NRFI`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-400 mb-1">Highest-Conviction Hit</p>
              <p className="text-sm text-foreground">
                {highlights.topConviction
                  ? `${highlights.topConviction.matchup}: ${highlights.topConviction.prediction} (${pct(
                      highlights.topConviction.probability,
                    )})`
                  : "—"}
              </p>
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
            {highlights.bestDay && (
              <p>
                • Strongest day was {highlights.bestDay.dayLabel} ({pct(highlights.bestDay.accuracy)}{" "}
                accuracy, {signedPct(highlights.bestDay.roi)} ROI)
              </p>
            )}
            {byConfidence.High && (
              <p>
                • High-confidence picks (≥68) hit {pct(byConfidence.High.accuracy)} across{" "}
                {byConfidence.High.count} calls
              </p>
            )}
            <p>
              • Actual first-inning outcomes this week ran {pct(insights.nrfiRate)} NRFI (
              {insights.nrfiActual} NRFI / {insights.yrfiActual} YRFI)
            </p>
            <p>
              • Overall ROI of {signedPct(totals.roiFlat)} at flat 1u -110 over {totals.games} games
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
