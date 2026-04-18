"use client"

import { useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ExtendedModelAccuracy } from "@/lib/prediction-store"
import { BarChart3, TrendingUp, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"

interface AccuracyDashboardProps {
  accuracy: ExtendedModelAccuracy
}

function pct(n: number, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`
}

function AccuracyCard({
  label,
  value,
  subtext,
  variant = "default",
}: {
  label: string
  value: string | number
  subtext?: string
  variant?: "default" | "positive" | "negative"
}) {
  const variantClass =
    variant === "positive"
      ? "bg-emerald-500/10 border-emerald-500/20"
      : variant === "negative"
        ? "bg-rose-500/10 border-rose-500/20"
        : "bg-muted/20 border-border/30"

  return (
    <div className={cn("rounded-lg border p-4", variantClass)}>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  )
}

function SeasonTab({ accuracy }: { accuracy: ExtendedModelAccuracy }) {
  return (
    <div className="space-y-6">
      {/* Overall stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <AccuracyCard label="Overall Accuracy" value={pct(accuracy.accuracy)} />
        <AccuracyCard label="Total Predictions" value={accuracy.totalTracked} />
        <AccuracyCard label="Completed" value={accuracy.totalPredictions} />
        <AccuracyCard label="Pending" value={accuracy.pendingCount} />
      </div>

      {/* NRFI vs YRFI */}
      <div className="rounded-lg border border-border/30 bg-card/50 p-4">
        <h3 className="text-sm font-semibold mb-4">By Prediction Type</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">NRFI Accuracy</p>
            <p className="text-xl font-bold text-emerald-400">
              {pct(accuracy.nrfiAccuracy)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {accuracy.nrfiCorrect}/{accuracy.nrfiTotal} correct
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">YRFI Accuracy</p>
            <p className="text-xl font-bold text-rose-400">
              {pct(accuracy.yrfiAccuracy)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {accuracy.yrfiCorrect}/{accuracy.yrfiTotal} correct
            </p>
          </div>
        </div>
      </div>

      {/* Confidence breakdown */}
      <div className="rounded-lg border border-border/30 bg-card/50 p-4">
        <h3 className="text-sm font-semibold mb-4">By Confidence Level</h3>
        <div className="grid grid-cols-2 gap-4">
          <AccuracyCard
            label="High Confidence"
            value={pct(accuracy.highConfAccuracy)}
            variant="positive"
          />
          <AccuracyCard
            label="Medium Confidence"
            value={pct(accuracy.medConfAccuracy)}
            variant="default"
          />
        </div>
      </div>

      {/* ROI & P/L */}
      <div className="rounded-lg border border-border/30 bg-card/50 p-4">
        <h3 className="text-sm font-semibold mb-4">Financial Performance</h3>
        <div className="grid grid-cols-2 gap-4">
          <AccuracyCard
            label="ROI (All Bets)"
            value={`${(accuracy.roi * 100).toFixed(2)}%`}
            variant={accuracy.roi > 0 ? "positive" : accuracy.roi < 0 ? "negative" : "default"}
          />
          <AccuracyCard
            label="High Conf P/L"
            value={`${accuracy.highConfPnL > 0 ? "+" : ""}${accuracy.highConfPnL.toFixed(2)}u`}
            variant={accuracy.highConfPnL > 0 ? "positive" : accuracy.highConfPnL < 0 ? "negative" : "default"}
          />
        </div>
      </div>

      {/* Monthly trend */}
      {accuracy.monthlyData.length > 0 && (
        <div className="rounded-lg border border-border/30 bg-card/50 p-4">
          <h3 className="text-sm font-semibold mb-3">Monthly Breakdown</h3>
          <div className="space-y-2">
            {accuracy.monthlyData.map((m) => (
              <div key={m.month} className="flex items-center justify-between text-xs">
                <div className="flex-1">
                  <p className="text-foreground font-medium">{m.month}</p>
                  <p className="text-muted-foreground">{m.predictions} predictions</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-foreground font-semibold">{pct(m.accuracy)}</p>
                    <p className="text-muted-foreground text-[10px]">
                      {m.roi > 0 ? "+" : ""}{(m.roi * 100).toFixed(1)}% ROI
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ByPitcherTab({ accuracy }: { accuracy: ExtendedModelAccuracy }) {
  return (
    <div className="rounded-lg border border-border/30 bg-card/50 p-6 text-center">
      <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">
        Per-pitcher accuracy breakdown coming soon.
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Will show NRFI accuracy and metrics for each pitcher in your tracked predictions.
      </p>
    </div>
  )
}

function SituationalTab({ accuracy }: { accuracy: ExtendedModelAccuracy }) {
  return (
    <div className="rounded-lg border border-border/30 bg-card/50 p-6 text-center">
      <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">
        Situational accuracy by park coming soon.
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Will show accuracy breakdown by stadium and weather conditions.
      </p>
    </div>
  )
}

export function AccuracyDashboard({ accuracy }: AccuracyDashboardProps) {
  if (!accuracy || accuracy.totalPredictions === 0) {
    return (
      <div className="rounded-lg border border-border/30 bg-card/50 p-8 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          No completed predictions yet.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Complete some predictions to see accuracy metrics.
        </p>
      </div>
    )
  }

  return (
    <Tabs defaultValue="season" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="season" className="gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Season</span>
        </TabsTrigger>
        <TabsTrigger value="pitcher" className="gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Pitchers</span>
        </TabsTrigger>
        <TabsTrigger value="situational" className="gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Parks</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="season" className="mt-6">
        <SeasonTab accuracy={accuracy} />
      </TabsContent>

      <TabsContent value="pitcher" className="mt-6">
        <ByPitcherTab accuracy={accuracy} />
      </TabsContent>

      <TabsContent value="situational" className="mt-6">
        <SituationalTab accuracy={accuracy} />
      </TabsContent>
    </Tabs>
  )
}
