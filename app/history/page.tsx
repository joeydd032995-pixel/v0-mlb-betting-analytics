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

export default function HistoryPage() {
  const { isSignedIn } = useAuth()
  const [predictions, setPredictions] = useState<TrackedPrediction[]>([])
  const [accuracy, setAccuracy] = useState<ExtendedModelAccuracy | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | null>(null)
  const [selectedDays, setSelectedDays] = useState<number | null>(90)

  useEffect(() => {
    const loaded = loadTrackedPredictions()
    setPredictions(loaded)
    setAccuracy(computeExtendedAccuracy(loaded))

    const today = new Date()
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
    setDateRange({ from: ninetyDaysAgo, to: today })
    setLoading(false)
  }, [])

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
    // Update localStorage immediately (fast, works offline)
    const updated = recordResult(id, homeRuns, awayRuns)
    setPredictions(updated)
    setAccuracy(computeExtendedAccuracy(updated))

    // Write-through to DB when authenticated (fire-and-forget)
    if (isSignedIn) {
      recordResultAction(id, homeRuns, awayRuns).catch(console.error)
    }
  }

  const handleDelete = (id: string) => {
    // Remove from localStorage immediately
    const updated = deletePrediction(id)
    setPredictions(updated)
    setAccuracy(computeExtendedAccuracy(updated))

    // Remove from DB when authenticated (fire-and-forget; row kept as audit trail if absent)
    if (isSignedIn) {
      deletePredictionAction(id).catch(console.error)
    }
  }

  const FILTER_OPTIONS = [
    { label: "All Time", days: null },
    { label: "Last 30D", days: 30 },
    { label: "Last 90D", days: 90 },
    { label: "Last Year", days: 365 },
  ]

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Prediction History</SectionLabel>

        {loading ? (
          <div
            className="rounded-[14px] border border-ds-line p-8 text-center"
            style={{ background: "var(--ds-panel)" }}
          >
            <p className="font-jet text-[12px] text-ds-muted">Loading prediction history…</p>
          </div>
        ) : accuracy ? (
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
              onExportCSV={() => {
                // exportToCSV is handled internally by HistoryTable when this callback is provided
              }}
            />
          </>
        ) : null}
      </main>
    </div>
  )
}
