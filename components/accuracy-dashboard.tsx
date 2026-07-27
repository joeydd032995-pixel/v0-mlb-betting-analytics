"use client"

import { useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ExtendedModelAccuracy } from "@/lib/prediction-store"
import { BarChart3, TrendingUp, MapPin, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { EnsembleVersionBreakdown } from "@/components/ensemble-version-breakdown"

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

function OverviewTab({ accuracy }: { accuracy: ExtendedModelAccuracy }) {
  return (
    <div className="space-y-6">
      {/* Overall stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <AccuracyCard
          label="Overall Accuracy"
          value={accuracy.totalPredictions > 0 ? pct(accuracy.accuracy) : "—"}
          subtext={`over ${accuracy.totalPredictions} settled`}
        />
        <AccuracyCard label="Tracked" value={accuracy.totalTracked} subtext="settled + pending" />
        <AccuracyCard label="Settled" value={accuracy.totalPredictions} subtext="scored above" />
        <AccuracyCard label="Pending" value={accuracy.pendingCount} subtext="not yet scored" />
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
        <div className="grid grid-cols-3 gap-4">
          <AccuracyCard
            label="High (≥62)"
            value={accuracy.highConfTotal > 0 ? pct(accuracy.highConfAccuracy) : "—"}
            subtext={`${accuracy.highConfCorrect}/${accuracy.highConfTotal} correct`}
            variant="positive"
          />
          <AccuracyCard
            label="Medium (45–61)"
            value={accuracy.medConfTotal > 0 ? pct(accuracy.medConfAccuracy) : "—"}
            subtext={`${accuracy.medConfCorrect}/${accuracy.medConfTotal} correct`}
            variant="default"
          />
          {/* The Low tier was previously computed but never rendered, hiding the
              worst-performing bucket from the breakdown entirely. */}
          <AccuracyCard
            label="Low (<45)"
            value={accuracy.lowConfTotal > 0 ? pct(accuracy.lowConfCorrect / accuracy.lowConfTotal) : "—"}
            subtext={`${accuracy.lowConfCorrect}/${accuracy.lowConfTotal} correct`}
            variant="default"
          />
        </div>
      </div>

      {/* ROI & P/L */}
      <div className="rounded-lg border border-border/30 bg-card/50 p-4">
        <h3 className="text-sm font-semibold mb-4">Financial Performance</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Both figures cover only predictions that stored odds. Rendering a
              confident 0.00% when nothing is priced would imply a break-even
              result rather than an absent sample. */}
          <AccuracyCard
            label="ROI (priced bets)"
            value={accuracy.pricedCount > 0 ? `${(accuracy.roi * 100).toFixed(2)}%` : "—"}
            subtext={
              accuracy.pricedCount > 0
                ? `${accuracy.pricedCount} of ${accuracy.totalPredictions} settled had odds`
                : "No settled predictions carried odds"
            }
            variant={accuracy.roi > 0 ? "positive" : accuracy.roi < 0 ? "negative" : "default"}
          />
          <AccuracyCard
            label="High Conf P/L"
            value={
              accuracy.highConfPricedCount > 0
                ? `${accuracy.highConfPnL > 0 ? "+" : ""}${accuracy.highConfPnL.toFixed(2)}u`
                : "—"
            }
            subtext={`${accuracy.highConfPricedCount} of ${accuracy.highConfTotal} high-conf had odds`}
            variant={accuracy.highConfPnL > 0 ? "positive" : accuracy.highConfPnL < 0 ? "negative" : "default"}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Flat 1-unit stake. Backfilled predictions store no odds, so they are excluded from
          both figures — accuracy above is measured over a larger sample than these are.
        </p>
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
                      {m.priced > 0
                        ? `${m.roi > 0 ? "+" : ""}${(m.roi * 100).toFixed(1)}% ROI (${m.priced} priced)`
                        : "No odds stored"}
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

const MAX_BREAKDOWN_ROWS = 50

function EmptyBreakdown({ icon: Icon, message }: { icon: typeof TrendingUp; message: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-card/50 p-6 text-center">
      <Icon className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function ByPitcherTab({ accuracy }: { accuracy: ExtendedModelAccuracy }) {
  if (accuracy.byPitcher.length === 0) {
    return (
      <EmptyBreakdown
        icon={TrendingUp}
        message="No pitcher data in this range yet. Widen the period or track more predictions to see per-pitcher accuracy."
      />
    )
  }

  const rows = accuracy.byPitcher.slice(0, MAX_BREAKDOWN_ROWS)
  const hiddenCount = accuracy.byPitcher.length - rows.length

  return (
    <div className="rounded-md border border-border/30 bg-card/50 p-3">
      <p className="mb-2 text-xs font-semibold">Accuracy by starting pitcher</p>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left font-normal pb-1.5">Pitcher</th>
            <th className="text-right font-normal pb-1.5">Starts</th>
            <th className="text-right font-normal pb-1.5">Record</th>
            <th className="text-right font-normal pb-1.5">Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pitcher} className="border-t border-border/20">
              <td className="py-1.5">{r.pitcher}</td>
              <td className="py-1.5 text-right tabular-nums">{r.starts}</td>
              <td className="py-1.5 text-right tabular-nums">{r.correct}/{r.starts}</td>
              <td className="py-1.5 text-right tabular-nums">{pct(r.accuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hiddenCount > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">+{hiddenCount} more pitchers not shown</p>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Each start counts toward that pitcher&apos;s bucket regardless of home/away — the NRFI/YRFI
        outcome depends on both starters jointly.
      </p>
    </div>
  )
}

function SituationalTab({ accuracy }: { accuracy: ExtendedModelAccuracy }) {
  if (accuracy.byPark.length === 0) {
    return (
      <EmptyBreakdown
        icon={MapPin}
        message="No park data in this range yet. Widen the period or track more predictions to see per-park accuracy."
      />
    )
  }

  const rows = accuracy.byPark.slice(0, MAX_BREAKDOWN_ROWS)
  const hiddenCount = accuracy.byPark.length - rows.length

  return (
    <div className="rounded-md border border-border/30 bg-card/50 p-3">
      <p className="mb-2 text-xs font-semibold">Accuracy by park</p>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left font-normal pb-1.5">Park</th>
            <th className="text-right font-normal pb-1.5">Games</th>
            <th className="text-right font-normal pb-1.5">Record</th>
            <th className="text-right font-normal pb-1.5">Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.venue} className="border-t border-border/20">
              <td className="py-1.5">{r.venue}</td>
              <td className="py-1.5 text-right tabular-nums">{r.total}</td>
              <td className="py-1.5 text-right tabular-nums">{r.correct}/{r.total}</td>
              <td className="py-1.5 text-right tabular-nums">{pct(r.accuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hiddenCount > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">+{hiddenCount} more parks not shown</p>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Park is inferred from the home team, not the recorded game venue — approximate for
        franchises that changed ballparks (e.g. the Athletics) and doesn&apos;t detect neutral-site games.
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
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        {/* Labelled "Season" until this audit, though it applies no season
            filter — the population spans every season that has been synced. */}
        <TabsTrigger value="overview" className="gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger value="pitcher" className="gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Pitchers</span>
        </TabsTrigger>
        <TabsTrigger value="situational" className="gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Parks</span>
        </TabsTrigger>
        <TabsTrigger value="ensemble-plus" className="gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">v1 vs v2</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <OverviewTab accuracy={accuracy} />
      </TabsContent>

      <TabsContent value="pitcher" className="mt-6">
        <ByPitcherTab accuracy={accuracy} />
      </TabsContent>

      <TabsContent value="situational" className="mt-6">
        <SituationalTab accuracy={accuracy} />
      </TabsContent>

      <TabsContent value="ensemble-plus" className="mt-6">
        <EnsembleVersionBreakdown />
      </TabsContent>
    </Tabs>
  )
}
