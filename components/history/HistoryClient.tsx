"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { HistoryTable } from "@/components/history-table"
import { PnLChart } from "@/components/history/PnLChart"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { KpiCard } from "@/components/diamond/KpiCard"
import { MethodologyPanel } from "@/components/diamond/MethodologyPanel"
import { PeriodChips } from "@/components/diamond/PeriodChips"
import { filterByPeriod, periodRange, formatPeriodRange } from "@/lib/utils/date-et"
import { HISTORY_COPY } from "@/lib/content/card-copy"
import {
  loadTrackedPredictions,
  mergeTrackedPredictions,
  recordResult,
  deletePrediction,
  computeExtendedAccuracy,
  type TrackedPrediction,
} from "@/lib/prediction-store"
import { recordResultAction, deletePredictionAction } from "@/app/actions"

interface Props {
  /** Pre-fetched DB predictions (serialized from Server Component for cross-device sync) */
  dbPredictions: TrackedPrediction[]
  /** Rows matching the DB query before the row cap was applied. */
  dbTotalAvailable: number
  /** The row cap applied to the DB query. */
  dbCap: number
}

export function HistoryClient({ dbPredictions, dbTotalAvailable, dbCap }: Props) {
  const { isSignedIn } = useAuth()
  const [predictions, setPredictions] = useState<TrackedPrediction[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDays, setSelectedDays] = useState<number | null>(90)
  // Deleting only clears localStorage, but the server-rendered `dbPredictions`
  // prop still holds the row until the page is re-rendered. Without tracking
  // the deletion the merge would immediately hand it back.
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    setPredictions(mergeTrackedPredictions(dbPredictions, loadTrackedPredictions(), deletedIds))
    setLoading(false)
    // `deletedIds` is applied by the handlers below; re-running here on every
    // deletion would re-read localStorage needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbPredictions])

  // The selected window governs every figure on this page. Previously the
  // accuracy object was computed once over the unfiltered set, so the KPI row,
  // the P/L chart and the summary cards all reported all-time numbers while
  // the chips implied a 90-day view.
  const range  = useMemo(() => periodRange(selectedDays), [selectedDays])
  const scoped = useMemo(() => filterByPeriod(predictions, range), [predictions, range])
  const accuracy = useMemo(() => computeExtendedAccuracy(scoped), [scoped])

  const handleRecordResult = (id: string, homeRuns: number, awayRuns: number) => {
    // recordResult returns localStorage only; re-merge so the DB half of the
    // population isn't dropped from view until the next page load.
    setPredictions(
      mergeTrackedPredictions(dbPredictions, recordResult(id, homeRuns, awayRuns), deletedIds)
    )
    if (isSignedIn) recordResultAction(id, homeRuns, awayRuns).catch(console.error)
  }

  const handleDelete = (id: string) => {
    const nextDeleted = new Set(deletedIds).add(id)
    setDeletedIds(nextDeleted)
    setPredictions(mergeTrackedPredictions(dbPredictions, deletePrediction(id), nextDeleted))
    if (isSignedIn) deletePredictionAction(id).catch(console.error)
  }

  if (loading) {
    return (
      <div
        className="rounded-[14px] border border-ds-line p-8 text-center"
        style={{ background: "var(--ds-panel)" }}
      >
        <p className="font-jet text-[12px] text-ds-muted">Loading prediction history…</p>
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
          metric="Total Tracked"
          value={String(accuracy.totalTracked)}
          delta={`${accuracy.pendingCount} pending`}
          variant="cy"
          description={HISTORY_COPY.kpiTracked.description}
          info={HISTORY_COPY.kpiTracked.disclaimer}
        />
        <KpiCard
          metric="Correct"
          value={settled > 0 ? `${(accuracy.accuracy * 100).toFixed(1)}%` : "—"}
          delta={`${settled} settled`}
          variant="gr"
          description={HISTORY_COPY.kpiCorrect.description}
          info={HISTORY_COPY.kpiCorrect.disclaimer}
        />
        <KpiCard
          metric="High-Conf P/L"
          value={
            accuracy.highConfPricedCount > 0
              ? `${accuracy.highConfPnL >= 0 ? "+" : ""}${accuracy.highConfPnL.toFixed(1)}u`
              : "—"
          }
          deltaPositive={accuracy.highConfPricedCount > 0 ? accuracy.highConfPnL >= 0 : undefined}
          delta={`${accuracy.highConfPricedCount} priced of ${accuracy.highConfTotal}`}
          variant="bl"
          description={HISTORY_COPY.kpiHighConfPnl.description}
          info={HISTORY_COPY.kpiHighConfPnl.disclaimer}
        />
        <KpiCard
          metric="NRFI Pick Accuracy"
          value={
            accuracy.nrfiTotal > 0
              ? `${((accuracy.nrfiCorrect / accuracy.nrfiTotal) * 100).toFixed(1)}%`
              : "—"
          }
          delta={`${accuracy.nrfiTotal} NRFI picks`}
          variant="cy"
          description={HISTORY_COPY.kpiNrfi.description}
          info={HISTORY_COPY.kpiNrfi.disclaimer}
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
            value: `${formatPeriodRange(range)}. Every figure on this page respects this selection.`,
          },
          {
            label: "Accuracy",
            value: `${accuracy.correct} correct ÷ ${settled} settled. Pending predictions (${accuracy.pendingCount}) are excluded.`,
          },
          {
            label: "P/L",
            value: `Flat 1-unit stake. Calculated over the ${accuracy.pricedCount} settled prediction${accuracy.pricedCount === 1 ? "" : "s"} that carried an odds snapshot, out of ${settled} settled.`,
          },
          {
            label: "Backtested",
            value: accuracy.backtestedCount > 0
              ? `${accuracy.backtestedCount} of ${settled} settled predictions in this window were generated by replaying a past season.`
              : "None in this window.",
          },
        ]}
        caveats={[
          "Includes system-wide predictions generated by the nightly agent and the historical backfill, not just the ones you saved. They are not separated out of the accuracy figures.",
          "Backtested predictions use point-in-time pitcher and team stats but synthetic month-average weather and no odds, which pulls measured accuracy toward the raw league NRFI rate.",
          "Predictions without an odds snapshot contribute to accuracy but not to P/L, which is why the two denominators differ.",
          "Predictions stored on your account do not save an odds snapshot, so P/L comes almost entirely from picks captured live in this browser. Signed out, this page shows only what this browser saved.",
          "The backtested count only marks prior seasons. The nightly sync rebuilds the current season through the same degraded pipeline — month-average weather, no odds, no lineups — but those rows are not flagged as backtested.",
          ...(truncated
            ? [`Showing the ${dbCap.toLocaleString()} most recently created of ${dbTotalAvailable.toLocaleString()} stored predictions. Older ones are not counted in any figure on this page.`]
            : []),
        ]}
      />

      {/* P/L chart */}
      <SectionLabel index="02">Cumulative P/L</SectionLabel>
      <PnLChart predictions={scoped} />

      {/* History table */}
      <SectionLabel index="03">Bet Log</SectionLabel>
      <HistoryTable
        predictions={scoped}
        accuracy={accuracy}
        onRecordResult={handleRecordResult}
        onDelete={handleDelete}
        periodLabel={formatPeriodRange(range)}
        onExportCSV={() => {}}
      />
    </>
  )
}
