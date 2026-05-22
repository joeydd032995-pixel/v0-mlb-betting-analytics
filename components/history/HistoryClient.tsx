"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { HistoryTable } from "@/components/history-table"
import { PnLChart } from "@/components/history/PnLChart"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { KpiCard } from "@/components/diamond/KpiCard"
import {
  loadTrackedPredictions,
  recordResult,
  deletePrediction,
  computeExtendedAccuracy,
  type TrackedPrediction,
  type ExtendedModelAccuracy,
} from "@/lib/prediction-store"
import { recordResultAction, deletePredictionAction } from "@/app/actions"

interface Props {
  /** Pre-fetched DB predictions (serialized from Server Component for cross-device sync) */
  dbPredictions: TrackedPrediction[]
}

const FILTER_OPTIONS = [
  { label: "All Time", days: null },
  { label: "Last 30D", days: 30 },
  { label: "Last 90D", days: 90 },
  { label: "Last Year", days: 365 },
] as const

export function HistoryClient({ dbPredictions }: Props) {
  const { isSignedIn } = useAuth()
  const [predictions, setPredictions] = useState<TrackedPrediction[]>([])
  const [accuracy, setAccuracy] = useState<ExtendedModelAccuracy | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | null>(null)
  const [selectedDays, setSelectedDays] = useState<number | null>(90)

  useEffect(() => {
    const local = loadTrackedPredictions()

    // Merge: DB rows are the baseline for cross-device sync;
    // localStorage wins on conflict, but DB's settled results fill in locally-pending rows.
    const localById = new Map(local.map((p) => [p.id, p]))
    const dbById    = new Map(dbPredictions.map((p) => [p.id, p]))
    const merged    = new Map<string, TrackedPrediction>()

    for (const [id, dbRow] of dbById) merged.set(id, dbRow)
    for (const [id, localRow] of localById) {
      const dbRow = dbById.get(id)
      if (dbRow && dbRow.status === "complete" && localRow.status === "pending") {
        merged.set(id, dbRow)
      } else {
        merged.set(id, localRow)
      }
    }

    const all = [...merged.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt)
    )
    setPredictions(all)
    setAccuracy(computeExtendedAccuracy(all))

    const today = new Date()
    setDateRange({ from: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000), to: today })
    setLoading(false)
  }, [dbPredictions])

  const handleDateRangeChange = (days: number | null) => {
    setSelectedDays(days)
    if (days === null) {
      setDateRange(null)
      return
    }
    const today = new Date()
    setDateRange({ from: new Date(today.getTime() - days * 24 * 60 * 60 * 1000), to: today })
  }

  const handleRecordResult = (id: string, homeRuns: number, awayRuns: number) => {
    const updated = recordResult(id, homeRuns, awayRuns)
    setPredictions(updated)
    setAccuracy(computeExtendedAccuracy(updated))
    if (isSignedIn) recordResultAction(id, homeRuns, awayRuns).catch(console.error)
  }

  const handleDelete = (id: string) => {
    const updated = deletePrediction(id)
    setPredictions(updated)
    setAccuracy(computeExtendedAccuracy(updated))
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

  if (!accuracy) return null

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          metric="Total Tracked"
          value={String(accuracy.totalTracked)}
          delta={`${accuracy.pendingCount} pending`}
          variant="cy"
        />
        <KpiCard
          metric="Correct"
          value={`${(accuracy.accuracy * 100).toFixed(1)}%`}
          delta={`${accuracy.totalTracked - accuracy.pendingCount} settled`}
          variant="gr"
        />
        <KpiCard
          metric="High-Conf P/L"
          value={`${accuracy.highConfPnL >= 0 ? "+" : ""}${accuracy.highConfPnL.toFixed(1)}u`}
          deltaPositive={accuracy.highConfPnL >= 0}
          delta={`${accuracy.highConfTotal} bets`}
          variant="bl"
        />
        <KpiCard
          metric="NRFI Win Rate"
          value={
            accuracy.nrfiTotal > 0
              ? `${((accuracy.nrfiCorrect / accuracy.nrfiTotal) * 100).toFixed(1)}%`
              : "—"
          }
          delta={`${accuracy.nrfiTotal} NRFI bets`}
          variant="cy"
        />
      </div>

      {/* P/L chart */}
      <SectionLabel index="02">Cumulative P/L</SectionLabel>
      <PnLChart predictions={predictions} />

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">
          Period:
        </span>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => handleDateRangeChange(opt.days)}
            className={`ds-chip ${selectedDays === opt.days ? "ds-chip-active" : ""}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* History table */}
      <SectionLabel index="03">Bet Log</SectionLabel>
      <HistoryTable
        predictions={predictions}
        accuracy={accuracy}
        onRecordResult={handleRecordResult}
        onDelete={handleDelete}
        dateRange={dateRange || undefined}
        onExportCSV={() => {}}
      />
    </>
  )
}
