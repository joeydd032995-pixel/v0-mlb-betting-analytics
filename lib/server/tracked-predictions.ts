// lib/server/tracked-predictions.ts
// Shared query layer for the accuracy/history dashboards: pulls ModelPrediction
// rows through a narrow column select (TRACKED_SELECT — only what
// toTrackedPrediction reads) and caps the result at TRACKED_PREDICTION_CAP,
// ordered by game date (not createdAt, which is backfill-insertion time and
// would evict recent live predictions from the window).

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { computeProfitLoss, type TrackedPrediction } from "@/lib/prediction-store"

/**
 * Hard cap on rows pulled into the accuracy/history surfaces.
 *
 * Rows are taken by most recent GAME DATE, so once the table grows past this the
 * pages are looking at a window rather than the whole corpus.  `totalAvailable`
 * is returned alongside so the UI can say so out loud instead of silently
 * presenting a truncated population as complete.
 *
 * Ordering by game date rather than `createdAt` matters: `createdAt` is
 * insertion wall-clock, so a historical backfill run stamps thousands of
 * old-season rows with today's timestamp and used to evict every recent live
 * prediction from this window — while the client then filters by game date, so
 * the selected period could come back arbitrarily sparse.  `date` is also
 * indexed, which `createdAt` is not.
 */
export const TRACKED_PREDICTION_CAP = 2000

/**
 * Exactly the columns `toTrackedPrediction` reads.
 *
 * Without this the query pulled every column — including the `deepNrfiTopFeatures`,
 * `monteCarloDistribution` and `inputsPresence` JSON blobs, none of which are
 * mapped — and the whole set is serialized into the page's RSC payload.
 * `modelBreakdown` has to stay: it still carries the ZIP/Bayesian diagnostics
 * and `modelInputs`.
 */
const TRACKED_SELECT = {
  id: true, date: true,
  homeTeam: true, awayTeam: true,
  homePitcher: true, awayPitcher: true,
  nrfiProbability: true, prediction: true,
  confidence: true, confidenceScore: true,
  nrfiOdds: true, yrfiOdds: true,
  poissonNrfi: true, zipNrfi: true, markovNrfi: true,
  mapreNrfi: true, ensembleNrfi: true, modelConsensus: true,
  logisticMetaNrfi: true, nnInteractionNrfi: true, hierarchicalBayesNrfi: true,
  modelBreakdown: true,
  status: true, createdAt: true, backtested: true,
  actualResult: true, correct: true,
} satisfies Prisma.ModelPredictionSelect

export interface LoadedTrackedPredictions {
  rows: TrackedPrediction[]
  /** Rows matching the query before the cap was applied. */
  totalAvailable: number
  /** The cap that was applied — `rows.length < totalAvailable` means truncated. */
  cap: number
}

const EMPTY_MODEL_INPUTS: TrackedPrediction["modelInputs"] = {
  homePitcherNrfiRate: 0, awayPitcherNrfiRate: 0,
  homeOffenseFactor: 1,   awayOffenseFactor: 1,
  parkFactor: 1,          weatherMultiplier: 1,
  recentFormMultiplier: 1,
  homePitcherStarts: 0,   awayPitcherStarts: 0,
  temperatureF: 72,       windSpeed: 5,
  windDirection: "unknown", conditions: "clear",
}

/**
 * Load this user's tracked predictions from the database.
 *
 * The population deliberately includes `userId: null` rows — those are the
 * system-wide slate written by the nightly prediction agent and the historical
 * backfill, and they are what makes the page useful before a user has saved
 * anything of their own.  Callers are expected to disclose that mix; the
 * `backtested` flag is mapped through so they can quantify it.
 */
export async function loadDbTrackedPredictions(
  userId: string
): Promise<LoadedTrackedPredictions> {
  const where = { OR: [{ userId }, { userId: null }] }

  const [rows, totalAvailable] = await Promise.all([
    prisma.modelPrediction.findMany({
      where,
      select: TRACKED_SELECT,
      // Game date, not insertion time — see TRACKED_PREDICTION_CAP above.
      // `date` is not unique, so `id` breaks ties: without it, which rows
      // survive a cap boundary that lands mid-date is undefined, and the page
      // could shift between requests with no underlying data change.
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: TRACKED_PREDICTION_CAP,
    }),
    prisma.modelPrediction.count({ where }),
  ])

  return {
    rows: rows.map(toTrackedPrediction),
    totalAvailable,
    cap: TRACKED_PREDICTION_CAP,
  }
}

type ModelPredictionRow = Prisma.ModelPredictionGetPayload<{ select: typeof TRACKED_SELECT }>

function toTrackedPrediction(r: ModelPredictionRow): TrackedPrediction {
  const breakdown = r.modelBreakdown as Record<string, number> | null
  const status: TrackedPrediction["status"] = r.status === "complete" ? "complete" : "pending"

  const base: TrackedPrediction = {
    id:             r.id,
    date:           r.date,
    homeTeam:       r.homeTeam,
    awayTeam:       r.awayTeam,
    homeTeamId:     "",
    awayTeamId:     "",
    homePitcher:    r.homePitcher,
    awayPitcher:    r.awayPitcher,
    venue:          "",
    nrfiProbability: r.nrfiProbability,
    yrfiProbability: 1 - r.nrfiProbability,
    prediction:     r.prediction as "NRFI" | "YRFI",
    confidence:     r.confidence as TrackedPrediction["confidence"],
    confidenceScore: r.confidenceScore,
    // Odds snapshot taken at prediction time.  Null on historical backfills,
    // which is precisely why P/L and ROI report their own smaller denominator.
    nrfiOdds:       r.nrfiOdds ?? undefined,
    yrfiOdds:       r.yrfiOdds ?? undefined,
    poissonNrfi:    r.poissonNrfi,
    zipNrfi:        r.zipNrfi,
    markovNrfi:     r.markovNrfi,
    mapreNrfi:      r.mapreNrfi ?? undefined,
    ensembleNrfi:   r.ensembleNrfi,
    modelConsensus: r.modelConsensus,
    // ZIP / Bayesian diagnostics still come from the modelBreakdown blob (no flat
    // columns for these yet; may be absent for older rows).
    homeZipOmega:       breakdown?.homeZipOmega ?? 0,
    awayZipOmega:       breakdown?.awayZipOmega ?? 0,
    homeBayesianWeight: breakdown?.homeBayesianWeight ?? 0,
    awayBayesianWeight: breakdown?.awayBayesianWeight ?? 0,
    // Read from the flat columns, not modelBreakdown — that blob's shape varies
    // by write path (historical-sync never sets it; the prediction agent stores
    // nrfi-engine's raw nested homeHalfInning/awayHalfInning shape, not these
    // flat keys), so the flat columns are the only reliable source here.
    logisticMetaNrfi:      r.logisticMetaNrfi      ?? undefined,
    nnInteractionNrfi:     r.nnInteractionNrfi     ?? undefined,
    hierarchicalBayesNrfi: r.hierarchicalBayesNrfi ?? undefined,
    modelInputs: (r.modelBreakdown as { modelInputs?: TrackedPrediction["modelInputs"] } | null)
      ?.modelInputs ?? EMPTY_MODEL_INPUTS,
    status,
    savedAt:      r.createdAt.toISOString(),
    backtested:   r.backtested,
    actualResult: r.actualResult as "NRFI" | "YRFI" | undefined,
    correct:      r.correct ?? undefined,
  }

  // P/L is derived, not stored: recompute it here so DB-sourced rows can feed
  // the P/L chart and ROI on a device whose localStorage is empty.  Returns
  // undefined when the row has no odds, which keeps it out of those figures.
  if (status === "complete" && r.correct != null) {
    base.profitLoss = computeProfitLoss(base, r.correct)
  }

  return base
}
