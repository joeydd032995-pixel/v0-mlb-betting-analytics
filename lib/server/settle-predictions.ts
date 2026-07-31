// lib/server/settle-predictions.ts
//
// Attaches results to pending predictions — and does nothing else.
//
// Why this exists: the only thing that scored a `ModelPrediction` before was
// `app/api/historical-sync/route.ts`, which settles a row as a side effect of
// *regenerating* it. That path overwrites `nrfiProbability`, `prediction`,
// `confidence` and every model column with a degraded recompute (month-average
// weather, no odds, no lineups) and nulls the odds snapshot. So the only way to
// learn whether a prediction was right destroyed the prediction.
//
// It also never reached most rows. The daily cron asks historical-sync for the
// current month only (plus the previous month on ET days 1-3), and historical-sync
// skips a whole date the moment one `GameResult` exists for it — so a suspended
// game, a doubleheader nightcap, or a West Coast game still Live at 09:00 UTC
// left its prediction pending forever, with no manual escape hatch for
// `userId: null` system rows.
//
// This pass writes `actualResult`, `correct` and `status` and touches nothing
// else. `GameResult.gamePk` is the same MLB gamePk as `ModelPrediction.id`, a
// join `app/api/backtest/route.ts` already relies on; this is the first thing to
// write it back.

import { prisma } from "@/lib/prisma"
import { fetchGamesByDate, fetchGameLinescore } from "@/lib/api/mlb-stats"

/** Chunk size for `IN (...)` lookups, to keep query parameter counts sane. */
const ID_CHUNK = 500

/**
 * Dates are only worth asking the MLB API about once. Cap how many we'll fetch
 * in a single pass so a large pending backlog can't blow the function's time
 * budget — the next run picks up where this one left off.
 */
const MAX_API_DATES_PER_RUN = 15

export interface SettleOptions {
  /**
   * Only consider pending predictions whose game date is within this many days
   * of today (ET). Omit to sweep the whole backlog.
   */
  lookbackDays?: number
  /** Compute everything, report what would change, write nothing. */
  dryRun?: boolean
}

export interface SettleReport {
  scanned: number
  settledFromDb: number
  settledFromApi: number
  gameResultsCreated: number
  /** Pending rows whose game date is still in the future — not a failure. */
  notDue: number
  /**
   * Rows on dates this run didn't reach because of `MAX_API_DATES_PER_RUN`.
   * The next run picks them up; also not a failure.
   */
  deferred: number
  /**
   * Rows whose `id` isn't a numeric gamePk, so there is nothing to join them to.
   * Held separately because they can never resolve — counting them as
   * `unresolved` would make that field grow forever and stop meaning anything.
   */
  invalidId: number
  /**
   * Rows we looked for and genuinely could not resolve — the game isn't final,
   * or the API returned nothing for it. This is the only count worth alerting on.
   */
  unresolved: number
  dryRun: boolean
}

/**
 * The whole scoring decision, isolated so it can be tested without a database.
 *
 * `nrfi` is ground truth: no runs scored by either side in the first inning.
 * `prediction` is the side the engine called, as stored on the row.
 */
export function resolveSettlement(
  prediction: string,
  nrfi: boolean
): { actualResult: "NRFI" | "YRFI"; correct: boolean } {
  const actualResult = nrfi ? "NRFI" : "YRFI"
  return { actualResult, correct: prediction === actualResult }
}

/**
 * `ModelPrediction.id` is a string but holds the MLB gamePk. Rows created by
 * some other route could in principle carry a non-numeric id, and those simply
 * have no ground truth to join to.
 */
function toGamePk(id: string): number | null {
  const n = Number(id)
  return Number.isInteger(n) && n > 0 ? n : null
}

function etToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Apply settlements in four grouped writes rather than one per row.
 *
 * There are only four distinct payloads — {NRFI,YRFI} × {correct,incorrect} —
 * so bucketing by payload turns an N-round-trip loop into a constant four.
 */
async function applySettlements(
  settlements: Array<{ id: string; actualResult: "NRFI" | "YRFI"; correct: boolean }>
): Promise<void> {
  const buckets = new Map<string, { actualResult: "NRFI" | "YRFI"; correct: boolean; ids: string[] }>()

  for (const s of settlements) {
    const key = `${s.actualResult}:${s.correct}`
    const bucket = buckets.get(key)
    if (bucket) bucket.ids.push(s.id)
    else buckets.set(key, { actualResult: s.actualResult, correct: s.correct, ids: [s.id] })
  }

  for (const { actualResult, correct, ids } of buckets.values()) {
    for (const idChunk of chunk(ids, ID_CHUNK)) {
      await prisma.modelPrediction.updateMany({
        where: { id: { in: idChunk } },
        // Only these three fields. Never a model column, odds field,
        // `backtested` flag or `inputsPresence` — the stored prediction is
        // evidence and must survive being scored.
        data: { actualResult, correct, status: "complete" },
      })
    }
  }
}

/**
 * Settle every pending prediction we can find a first-inning result for.
 *
 * Two sources, in order of preference:
 *   1. `GameResult` — already-synced ground truth, one cheap indexed lookup.
 *   2. The MLB Stats API, for pending rows whose date never produced a
 *      `GameResult`. Any result found this way is written back to `GameResult`,
 *      so historical-sync's date-level skip stops hiding the gap permanently.
 */
export async function settlePendingPredictions(
  options: SettleOptions = {}
): Promise<SettleReport> {
  const { lookbackDays, dryRun = false } = options

  const where: { status: string; date?: { gte: string } } = { status: "pending" }
  if (lookbackDays != null) {
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - lookbackDays)
    where.date = {
      gte: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(cutoff),
    }
  }

  const pending = await prisma.modelPrediction.findMany({
    where,
    select: { id: true, prediction: true, date: true },
  })

  const report: SettleReport = {
    scanned: pending.length,
    settledFromDb: 0,
    settledFromApi: 0,
    gameResultsCreated: 0,
    notDue: 0,
    deferred: 0,
    invalidId: 0,
    unresolved: 0,
    dryRun,
  }
  if (pending.length === 0) return report

  // A game that has not finished yet is not unresolved, it is simply not due.
  const today = etToday()
  const due = pending.filter((p) => p.date <= today)
  report.notDue = pending.length - due.length

  // ── Source 1: GameResult ──────────────────────────────────────────────────
  const gamePkById = new Map<string, number>()
  for (const p of due) {
    const pk = toGamePk(p.id)
    if (pk != null) gamePkById.set(p.id, pk)
  }

  const knownNrfi = new Map<number, boolean>()
  for (const pkChunk of chunk([...new Set(gamePkById.values())], ID_CHUNK)) {
    const results = await prisma.gameResult.findMany({
      where: { gamePk: { in: pkChunk } },
      select: { gamePk: true, nrfi: true },
    })
    for (const r of results) knownNrfi.set(r.gamePk, r.nrfi)
  }

  const fromDb: Array<{ id: string; actualResult: "NRFI" | "YRFI"; correct: boolean }> = []
  const stillPending: typeof due = []

  for (const p of due) {
    const pk = gamePkById.get(p.id)
    if (pk == null) {
      // No gamePk to join on, and the id will never become numeric. Drop it here
      // rather than letting it fall through to the API stage, where it would
      // cost a wasted date fetch and inflate `unresolved` on every future run.
      report.invalidId++
      continue
    }
    const nrfi = knownNrfi.get(pk)
    if (nrfi === undefined) stillPending.push(p)
    else fromDb.push({ id: p.id, ...resolveSettlement(p.prediction, nrfi) })
  }

  if (fromDb.length > 0 && !dryRun) await applySettlements(fromDb)
  report.settledFromDb = fromDb.length

  // ── Source 2: MLB Stats API, for dates that never produced a GameResult ───
  // Newest dates first: those are the ones a user is most likely looking at.
  const allDatesNeedingApi = [...new Set(stillPending.map((p) => p.date))].sort().reverse()
  const datesNeedingApi = allDatesNeedingApi.slice(0, MAX_API_DATES_PER_RUN)
  const deferredDates = new Set(allDatesNeedingApi.slice(MAX_API_DATES_PER_RUN))

  const apiNrfi = new Map<number, boolean>()
  const gameResultRows: Array<{
    gamePk: number; date: string; season: number
    homeTeam: string; awayTeam: string
    homeRuns: number; awayRuns: number; nrfi: boolean
  }> = []

  for (const date of datesNeedingApi) {
    const games = await fetchGamesByDate(date)
    // Conservative on purpose: only a genuinely final game has a settled first
    // inning. This matches the filter historical-sync applies.
    const finalGames = games.filter((g) => g.status.abstractGameState.toLowerCase() === "final")
    if (finalGames.length === 0) continue

    const linescores = await Promise.all(finalGames.map((g) => fetchGameLinescore(g.gamePk)))

    for (let i = 0; i < finalGames.length; i++) {
      const game = finalGames[i]
      const firstInning = linescores[i]?.innings.find((inn) => inn.num === 1)
      if (!firstInning) continue

      const homeRuns = firstInning.home.runs ?? 0
      const awayRuns = firstInning.away.runs ?? 0
      const nrfi = homeRuns === 0 && awayRuns === 0

      apiNrfi.set(game.gamePk, nrfi)
      gameResultRows.push({
        gamePk: game.gamePk,
        date,
        season: Number(date.slice(0, 4)),
        homeTeam: game.teams.home.team.name,
        awayTeam: game.teams.away.team.name,
        homeRuns, awayRuns, nrfi,
      })
    }
  }

  // Backfill the missing ground truth so the next run resolves from source 1,
  // and so historical-sync's date-level skip no longer hides these games.
  if (gameResultRows.length > 0 && !dryRun) {
    const created = await prisma.gameResult.createMany({
      data: gameResultRows,
      skipDuplicates: true,
    })
    report.gameResultsCreated = created.count
  } else if (dryRun) {
    report.gameResultsCreated = gameResultRows.length
  }

  const fromApi: Array<{ id: string; actualResult: "NRFI" | "YRFI"; correct: boolean }> = []
  for (const p of stillPending) {
    // Every row here came through the guard above, so the gamePk is present.
    const nrfi = apiNrfi.get(gamePkById.get(p.id)!)
    if (nrfi !== undefined) {
      fromApi.push({ id: p.id, ...resolveSettlement(p.prediction, nrfi) })
    } else if (deferredDates.has(p.date)) {
      // We never asked about this date — don't report it as a failure.
      report.deferred++
    } else {
      report.unresolved++
    }
  }

  if (fromApi.length > 0 && !dryRun) await applySettlements(fromApi)
  report.settledFromApi = fromApi.length

  return report
}
