"use client"

import { useEffect, useMemo, useState } from "react"
import { AccuracyDashboard } from "@/components/accuracy-dashboard"
import { AccuracyCharts } from "@/components/accuracy/AccuracyCharts"
import { KpiCard } from "@/components/diamond/KpiCard"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { MethodologyPanel } from "@/components/diamond/MethodologyPanel"
import { PeriodChips } from "@/components/diamond/PeriodChips"
import { filterByPeriod, periodRange, formatPeriodRange } from "@/lib/utils/date-et"
import { ACCURACY_COPY } from "@/lib/content/card-copy"
import {
  loadTrackedPredictions,
  mergeTrackedPredictions,
  computeExtendedAccuracy,
  type TrackedPrediction,
} from "@/lib/prediction-store"

interface Props {
  /** Pre-fetched DB predictions (serialized from Server Component) */
  dbPredictions: TrackedPrediction[]
  /** Rows matching the DB query before the row cap was applied. */
  dbTotalAvailable: number
  /** The row cap applied to the DB query. */
  dbCap: number
  /** Engine output clamp, forwarded to the calibration chart. */
  clampRange: [number, number]
  /** League NRFI baseline, forwarded to the per-model chart. */
  leagueBaseline: number
}

export function AccuracyClient({ dbPredictions, dbTotalAvailable, dbCap, clampRange, leagueBaseline }: Props) {
  const [predictions, setPredictions] = useState<TrackedPrediction[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedDays, setSelectedDays] = useState<number | null>(null)

  useEffect(() => {
    setPredictions(mergeTrackedPredictions(dbPredictions, loadTrackedPredictions()))
    setLoaded(true)
  }, [dbPredictions])

  const range    = useMemo(() => periodRange(selectedDays), [selectedDays])
  const scoped   = useMemo(() => filterByPeriod(predictions, range), [predictions, range])
  const accuracy = useMemo(() => computeExtendedAccuracy(scoped), [scoped])

  if (!loaded) {
    return (
      <div
        className="rounded-[14px] border border-ds-line p-8 text-center"
        style={{ background: "var(--ds-panel)" }}
      >
        <p className="font-jet text-[12px] text-ds-muted">Loading accuracy data…</p>
      </div>
    )
  }

  const settled   = accuracy.totalPredictions
  const truncated = dbTotalAvailable > dbCap

  return (
    <>
      {/* Period selector — governs every number below it */}
      <PeriodChips
        selectedDays={selectedDays}
        onChange={setSelectedDays}
        range={range}
        count={scoped.length}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          metric="Overall Accuracy"
          value={settled > 0 ? `${(accuracy.accuracy * 100).toFixed(1)}%` : "—"}
          // The percentage is over settled predictions, so the count beside it
          // has to be the settled count — it used to show every tracked row,
          // pending ones included, which is not this figure's denominator.
          delta={`${accuracy.correct} of ${settled} settled`}
          variant="cy"
          description={ACCURACY_COPY.kpiOverall.description}
          info={ACCURACY_COPY.kpiOverall.disclaimer}
        />
        <KpiCard
          metric="NRFI Pick Accuracy"
          value={accuracy.nrfiTotal > 0 ? `${((accuracy.nrfiCorrect / accuracy.nrfiTotal) * 100).toFixed(1)}%` : "—"}
          delta={`${accuracy.nrfiTotal} NRFI picks`}
          variant="gr"
          description={ACCURACY_COPY.kpiNrfi.description}
          info={ACCURACY_COPY.kpiNrfi.disclaimer}
        />
        <KpiCard
          metric="High-Conf Accuracy"
          value={accuracy.highConfTotal > 0 ? `${((accuracy.highConfCorrect / accuracy.highConfTotal) * 100).toFixed(1)}%` : "—"}
          delta={`${accuracy.highConfTotal} predictions`}
          variant="bl"
          description={ACCURACY_COPY.kpiHighConf.description}
          info={ACCURACY_COPY.kpiHighConf.disclaimer}
        />
        <KpiCard
          metric="High-Conf P/L"
          value={
            accuracy.highConfPricedCount > 0
              ? `${accuracy.highConfPnL >= 0 ? "+" : ""}${accuracy.highConfPnL.toFixed(2)}u`
              : "—"
          }
          delta={`${accuracy.highConfPricedCount} priced of ${accuracy.highConfTotal}`}
          deltaPositive={accuracy.highConfPricedCount > 0 ? accuracy.highConfPnL >= 0 : undefined}
          variant="cy"
          description={ACCURACY_COPY.kpiHighConfPnl.description}
          info={ACCURACY_COPY.kpiHighConfPnl.disclaimer}
        />
      </div>

      <MethodologyPanel
        summary={`${formatPeriodRange(range)} · ${settled.toLocaleString()} settled`}
        rows={[
          {
            label: "Source",
            value: "Predictions saved in this browser, merged with predictions stored on your account. Includes the system-wide slate, not only picks you saved yourself.",
          },
          {
            label: "Period",
            value: `${formatPeriodRange(range)}${
              accuracy.dateSpan
                ? ` — settled predictions run ${accuracy.dateSpan.from} to ${accuracy.dateSpan.to}`
                : ""
            }. Every figure on this page respects this selection.`,
          },
          {
            label: "Accuracy",
            value: `${accuracy.correct} correct ÷ ${settled} settled. The ${accuracy.pendingCount} pending prediction${accuracy.pendingCount === 1 ? "" : "s"} are excluded.`,
          },
          {
            label: "P/L and ROI",
            value: `Flat 1-unit stake over the ${accuracy.pricedCount} settled prediction${accuracy.pricedCount === 1 ? "" : "s"} that carried an odds snapshot, out of ${settled} settled.`,
          },
          {
            label: "Backtested",
            value: accuracy.backtestedCount > 0
              ? `${accuracy.backtestedCount} of ${settled} settled predictions (${((accuracy.backtestedCount / Math.max(settled, 1)) * 100).toFixed(0)}%) were generated by replaying a past season.`
              : "None in this window.",
          },
        ]}
        caveats={[
          "Includes system-wide predictions generated by the nightly agent and the historical backfill, not just the ones you saved. They are not separated out of the accuracy figures.",
          "Backtested predictions use point-in-time pitcher and team stats but synthetic month-average weather and no odds. That pushes their accuracy toward the raw league NRFI rate, so a corpus dominated by them dilutes rather than inflates the figures above — it understates genuine live prediction skill.",
          "Predictions without an odds snapshot contribute to accuracy but not to P/L or ROI, which is why those denominators are smaller.",
          "Confidence tiers are frozen at the time each prediction was written. Rows scored under an earlier threshold are pooled with current ones.",
          "Predictions saved in this browser are stored per-device, so opening this page in another browser can give different totals.",
          "The ensemble version comparison further down reads every prediction stored system-wide and ignores the period selection above, so its counts will not reconcile with the rest of this page.",
          ...(truncated
            ? [`Showing the ${dbCap.toLocaleString()} most recent by game date of ${dbTotalAvailable.toLocaleString()} predictions stored in the database. Older database rows are not counted in any figure on this page; predictions saved in this browser are unaffected.`]
            : []),
        ]}
      />

      {/* Charts */}
      <SectionLabel index="02">Model Analytics</SectionLabel>
      <AccuracyCharts accuracy={accuracy} clampRange={clampRange} leagueBaseline={leagueBaseline} />

      {/* Detailed breakdown */}
      <SectionLabel index="03">Detailed Breakdown</SectionLabel>
      <AccuracyDashboard accuracy={accuracy} />
    </>
  )
}
