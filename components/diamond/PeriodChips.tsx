"use client"

import { formatPeriodRange, type PeriodRange } from "@/lib/utils/date-et"

/** Selectable windows, in days back from today (ET). `null` = all time. */
export const PERIOD_OPTIONS = [
  { label: "All Time",  days: null },
  { label: "Last 30D",  days: 30 },
  { label: "Last 90D",  days: 90 },
  { label: "Last Year", days: 365 },
] as const

interface PeriodChipsProps {
  selectedDays: number | null
  onChange: (days: number | null) => void
  /** Resolved window, echoed back so the active period is never ambiguous. */
  range: PeriodRange | null
  /** Count of rows inside the window, shown alongside the dates. */
  count?: number
}

/**
 * Period selector for the accuracy/history surfaces.
 *
 * The selected window governs every statistic on the page, so the resolved ET
 * date range is printed next to the chips — previously the chips filtered only
 * a table while the surrounding KPIs stayed all-time, with nothing on screen
 * to reveal the discrepancy.
 */
export function PeriodChips({ selectedDays, onChange, range, count }: PeriodChipsProps) {
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <span className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">
        Period:
      </span>
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.label}
          type="button"
          aria-pressed={selectedDays === opt.days}
          onClick={() => onChange(opt.days)}
          className={`ds-chip ${selectedDays === opt.days ? "ds-chip-active" : ""}`}
        >
          {opt.label}
        </button>
      ))}
      <span className="font-jet text-[9px] text-ds-muted/80">
        {formatPeriodRange(range)}
        {count !== undefined && ` · ${count.toLocaleString()} predictions`}
      </span>
    </div>
  )
}
