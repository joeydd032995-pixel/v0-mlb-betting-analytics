/**
 * ET-anchored date helpers for period filtering.
 *
 * Every date the app stores on a prediction or game result is an ET calendar
 * day formatted as "YYYY-MM-DD" (see CLAUDE.md — never `toISOString()`, which
 * is UTC).  Period filtering therefore has to happen in the same calendar
 * space.
 *
 * The previous implementation compared `new Date("2026-07-26")` — which the
 * spec parses as UTC midnight — against `Date.now() - days * 86400000`, a
 * local wall-clock instant.  West of UTC that pulled an extra day into range;
 * east of UTC it dropped one.  Comparing the "YYYY-MM-DD" strings directly is
 * both correct and timezone-independent, because ISO calendar dates sort
 * lexicographically.
 */

const ET_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
})

/** Today's ET calendar date as "YYYY-MM-DD". */
export function todayET(now: Date = new Date()): string {
  return ET_FORMATTER.format(now)
}

/**
 * The ET calendar date `days` days before today, as "YYYY-MM-DD".
 *
 * Counts back in *calendar days* from today's ET date rather than subtracting a
 * fixed 24-hour duration.  Duration arithmetic breaks across the spring-forward
 * transition: from 2026-03-09T04:15Z (00:15 ET) subtracting 24h lands on
 * 2026-03-08T04:15Z, which is still 23:15 ET on 2026-03-07 — a day early, which
 * would pull an extra day into every window spanning the transition.
 *
 * Anchoring the ET date at UTC midnight makes the subtraction exact, because
 * UTC has no offset changes for the arithmetic to trip over.
 */
export function etDaysAgo(days: number, now: Date = new Date()): string {
  const [y, m, d] = todayET(now).split("-").map(Number)
  const anchor = new Date(Date.UTC(y, m - 1, d))
  anchor.setUTCDate(anchor.getUTCDate() - days)
  return anchor.toISOString().slice(0, 10)
}

/** Inclusive ET date window. `null` means "all time". */
export interface PeriodRange {
  from: string // "YYYY-MM-DD"
  to: string   // "YYYY-MM-DD"
}

/**
 * Build the inclusive ET window covering the last `days` days (today
 * included).  Returns `null` for `days === null`, meaning no filtering.
 */
export function periodRange(days: number | null, now: Date = new Date()): PeriodRange | null {
  if (days === null) return null
  return { from: etDaysAgo(days, now), to: todayET(now) }
}

/**
 * Filter rows to an inclusive ET date window.  A `null` range is a no-op, so
 * callers can pass the "All Time" selection straight through.
 */
export function filterByPeriod<T extends { date: string }>(
  rows: T[],
  range: PeriodRange | null
): T[] {
  if (!range) return rows
  return rows.filter((r) => r.date >= range.from && r.date <= range.to)
}

/** Human-readable window label, e.g. "Mar 1 – Jul 26, 2026 (ET)". */
export function formatPeriodRange(range: PeriodRange | null): string {
  if (!range) return "All time"
  return `${formatETDate(range.from)} – ${formatETDate(range.to)} (ET)`
}

/**
 * Format a "YYYY-MM-DD" ET date for display without re-entering timezone
 * conversion — the string is parsed as UTC noon purely so `toLocaleDateString`
 * can name the month, and the calendar day can't slip either way.
 */
export function formatETDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
