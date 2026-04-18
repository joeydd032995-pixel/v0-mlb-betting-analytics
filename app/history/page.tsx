"use client"

import { useState } from "react"
import { HistoryTable } from "@/components/history-table"
import {
  loadTrackedPredictions,
  computeExtendedAccuracy,
  type TrackedPrediction,
  type ExtendedModelAccuracy,
} from "@/lib/prediction-store"
import { Calendar } from "lucide-react"

function defaultDateRange() {
  const today = new Date()
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
  return { from: ninetyDaysAgo, to: today }
}

export default function HistoryPage() {
  const [predictions] = useState<TrackedPrediction[]>(loadTrackedPredictions)
  const [accuracy] = useState<ExtendedModelAccuracy>(() =>
    computeExtendedAccuracy(loadTrackedPredictions())
  )
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | null>(defaultDateRange)

  const handleDateRangeChange = (days: number | null) => {
    if (days === null) {
      setDateRange(null)
      return
    }

    const today = new Date()
    const fromDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
    setDateRange({
      from: fromDate,
      to: today,
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Prediction History</h1>
              <p className="text-sm text-muted-foreground">
                View all your tracked NRFI/YRFI predictions with results and performance metrics.
              </p>
            </div>
          </div>
        </div>

        {/* Date range filter */}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">Filter:</p>
          <div className="flex gap-2">
            {[
              { label: "All Time", days: null },
              { label: "Last 30 Days", days: 30 },
              { label: "Last 90 Days", days: 90 },
              { label: "Last Year", days: 365 },
            ].map((option) => (
              <button
                key={option.label}
                onClick={() => handleDateRangeChange(option.days)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  dateRange === null && option.days === null
                    ? "bg-primary text-primary-foreground"
                    : dateRange && option.days &&
                      dateRange.from.getTime() === new Date(new Date().getTime() - option.days * 24 * 60 * 60 * 1000).getTime()
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/30 text-muted-foreground hover:bg-muted/30"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* History table */}
        <HistoryTable
          predictions={predictions}
          accuracy={accuracy}
          onRecordResult={(id, homeRuns, awayRuns) => {
            console.log(`Record result for ${id}: ${homeRuns}-${awayRuns}`)
          }}
          onDelete={(id) => {
            console.log(`Delete prediction ${id}`)
          }}
          dateRange={dateRange || undefined}
          onExportCSV={() => {}}
        />
      </main>
    </div>
  )
}
