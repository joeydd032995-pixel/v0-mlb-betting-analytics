// lib/content/card-copy.ts
// Plain-language copy for the cards on /insights, /accuracy and /history.
//
// Every card gets two strings: what it IS showing (always visible under the
// title) and what it is NOT showing (behind the ⓘ). These make factual claims
// about how the numbers are scoped, so they live together in one reviewable
// file rather than scattered through JSX — if a data path changes, this is the
// file to re-check.
//
// Static strings only. Anything that has to quote a live count or date range
// belongs in the MethodologyPanel call sites, which already compute it.

import type { CardCopy } from "@/components/diamond/CardNote"

export type { CardCopy }

/**
 * Applies to every card in the "How It Works" tab: the walkthrough numbers are
 * hand-written teaching examples, even though the weights beside them are read
 * live from the engine.
 */
export const WORKED_EXAMPLE_DISCLAIMER =
  "Not a live number. The percentages in this card are a fixed worked example used to explain the maths — they are not today's slate, not a backtest, and not measured accuracy. Only the model weights and thresholds are read live from the engine."

// ---------------------------------------------------------------------------
// /insights
// ---------------------------------------------------------------------------

export const INSIGHTS_COPY = {
  featureImportance: {
    description:
      "Rough ranking of how much each input moves a first-inning prediction, in the style of a SHAP attribution plot.",
    disclaimer:
      "These weights are hand-authored illustrations of the engine's design, not SHAP values computed from real predictions. They do not update with the model, do not reflect any particular game, and should not be read as measured feature importance.",
  },

  ensembleArchitecture: {
    description:
      "The live wiring of the ensemble — which models vote, how heavily, and how their blended output is calibrated and clamped before you see it.",
    disclaimer:
      "Describes how a prediction is assembled, not how well it performs. Nothing here is a measure of accuracy — see the Performance tab for that.",
  },
  shrinkage: {
    description:
      "How a pitcher's raw first-inning rate is pulled toward the league average when the sample behind it is small.",
    disclaimer: WORKED_EXAMPLE_DISCLAIMER,
  },
  poisson: {
    description: "Treats first-inning runs as a Poisson count driven by expected run rate.",
    disclaimer: WORKED_EXAMPLE_DISCLAIMER,
  },
  zip: {
    description:
      "Poisson with an explicit 'no runs at all' mass, which fits the first inning better than a plain Poisson.",
    disclaimer: WORKED_EXAMPLE_DISCLAIMER,
  },
  markov: {
    description:
      "Walks the 24 base-out states of a half inning to derive the probability the inning ends scoreless.",
    disclaimer: WORKED_EXAMPLE_DISCLAIMER,
  },
  mapre: {
    description:
      "Run-expectancy model that layers park, weather, umpire and lineup adjustments onto a Poisson base.",
    disclaimer: WORKED_EXAMPLE_DISCLAIMER,
  },
  logisticMeta: {
    description: "Logistic stack that learns how to weigh the base models against each other.",
    disclaimer:
      "Carries 0% weight in the live blend today — it is computed and displayed for comparison only, so it does not influence the prediction you see. " +
      WORKED_EXAMPLE_DISCLAIMER,
  },
  nnInteraction: {
    description: "Small neural layer that captures interactions the linear models miss.",
    disclaimer:
      "Carries 0% weight in the live blend today — it is computed and displayed for comparison only, so it does not influence the prediction you see. " +
      WORKED_EXAMPLE_DISCLAIMER,
  },
  hierarchicalBayes: {
    description: "Pools pitcher and team effects hierarchically so thin samples borrow strength.",
    disclaimer:
      "Carries 0% weight in the live blend today — it is computed and displayed for comparison only, so it does not influence the prediction you see. " +
      WORKED_EXAMPLE_DISCLAIMER,
  },
  recentForm: {
    description: "Nudges the blended probability based on how the starters have thrown lately.",
    disclaimer: WORKED_EXAMPLE_DISCLAIMER,
  },
  combinedOutput: {
    description:
      "How each model's contribution adds up to the single NRFI probability shown on a game card.",
    disclaimer:
      "The per-model contributions in this table are a fixed worked example, not today's slate. The final blend percentages quoted here are written into the page and can drift from the live engine constants shown in the Ensemble Architecture card above — trust that card if the two disagree.",
  },
  confidenceScore: {
    description:
      "How a prediction earns its confidence tier, and what has to be true for it to be flagged as a value bet.",
    disclaimer:
      "Explains the scoring rule, not its track record — nothing here says how often high-confidence picks actually win. Tiers are stamped onto a prediction when it is written, so predictions made under earlier cutoffs keep their old tier.",
  },

  historicalSync: {
    description:
      "Pulls past seasons out of the MLB Stats API into the database so the accuracy figures below have something to score against.",
    disclaimer:
      "Syncs one month per request and only backfills what the MLB Stats API returns. Backfilled predictions are rebuilt from point-in-time stats but get month-average weather and no odds, so they can never contribute to profit or ROI anywhere in the app.",
  },
  nrfiRate: {
    description:
      "Share of synced games where neither team scored in the first inning — the base rate the models are trying to beat.",
    disclaimer:
      "Covers only the games actually synced into the database, not every MLB game played. A partially synced month tilts this number, and it is a property of baseball rather than a measure of the model.",
  },
  yrfiRate: {
    description:
      "Share of synced games where at least one run scored in the first inning — the mirror of the NRFI rate.",
    disclaimer:
      "Covers only the games actually synced into the database, not every MLB game played. A partially synced month tilts this number, and it is a property of baseball rather than a measure of the model.",
  },
  modelAccuracy: {
    description:
      "How often the engine's called side matched the actual first-inning result, across every scored prediction in the database.",
    disclaimer:
      "Pools backtested predictions with live ones. Backtests replay past seasons with synthetic weather and no odds, which pulls their accuracy toward the raw league rate — a corpus dominated by them understates genuine live skill. Unscored predictions are excluded entirely.",
  },
  highConfidence: {
    description: "Accuracy restricted to predictions the engine scored into its top confidence tier.",
    disclaimer:
      "Medium and low tiers are excluded, so this is not the app's overall hit rate. Tiers are frozen at the moment each prediction is written, so rows scored under an earlier cutoff sit in this bucket alongside current ones.",
  },
  accuracyByConfidence: {
    description:
      "Hit rate broken out by tier, which is the honest test of whether the confidence score means anything.",
    disclaimer:
      "Tier labels reflect today's cutoffs, but each prediction kept the tier it was assigned when written — older rows may have been tiered under different thresholds. Bars with tiny counts are shown at the same visual weight as ones with thousands.",
  },
  perModelAccuracy: {
    description:
      "How each individual model would have done on its own, re-scored at a flat 50% threshold.",
    disclaimer:
      "Each row is scored only over predictions where that model actually produced a value, so the sample sizes differ — the meta-models ran on far fewer games than the base four, and the rows are not strictly comparable. 'Ensemble' is the final post-blend probability that drives the headline accuracy above, not an independent model, so those two agree by construction. Rows are judged at a 0.5 threshold while the engine issues its call at 0.52. The DeepNRFI and Monte Carlo columns are not scored here at all.",
  },
  monthlyBreakdown: {
    description: "Month-by-month view of league NRFI rate, prediction volume and accuracy.",
    disclaimer:
      "'Games' counts every synced game that month and drives the NRFI/YRFI rates; 'Predictions' counts only the settled predictions the model made and drives Model Acc — so the two columns use different denominators, and these NRFI rates will not match the Historical NRFI Rate card above, which covers predicted games only. Only months with synced data appear, so a missing month is invisible rather than shown as a gap.",
  },

  modelFactors: {
    description:
      "The inputs that move a prediction most, with a sketch of how each one pushes the number up or down.",
    disclaimer:
      "The impact values are hand-authored design documentation, not measured coefficients or SHAP values fitted to real results. They do not change as the model learns.",
  },
  importantNotes: {
    description:
      "Standing caveats about what this engine is and how far its output should be trusted.",
    disclaimer:
      "These notes describe known limitations of the modelling approach. They are not a complete risk disclosure, and nothing on this site is betting advice.",
  },
} satisfies Record<string, CardCopy>

// ---------------------------------------------------------------------------
// /accuracy
// ---------------------------------------------------------------------------

/**
 * Repeated across the tiles that all read from the same scoped population.
 *
 * The 2,000-row cap is applied server-side to DATABASE rows — which is your own
 * saved predictions and the system-wide slate together, since the query is
 * `OR: [{ userId }, { userId: null }]`. Predictions saved in this browser are
 * merged on top of that capped set and are not subject to it, so the wording
 * must not claim a flat 2,000-row ceiling on everything. The cap takes the most
 * recent 2,000 by GAME DATE — it used to be by insertion time, which let a
 * backfill evict recent games.
 */
const SCOPED_POPULATION =
  "Covers only the selected period. Of the predictions stored in the database — yours and the system-wide slate together — only the 2,000 most recent by game date are loaded, so even 'All Time' is a window rather than the full archive. Anything saved in this browser is merged on top and isn't subject to that limit."

const SYSTEM_ROWS =
  "Includes the system-wide slate written by the nightly agent and the historical backfill, not just predictions you saved yourself."

export const ACCURACY_COPY = {
  kpiOverall: {
    description: "How often the called side matched the first-inning result.",
    disclaimer: `Scored predictions only — pending ones are not in the denominator. ${SYSTEM_ROWS} Backtested rows are pooled in with live ones and are not separated out; because they run on neutral weather and no odds they score close to the league base rate, so they dilute this number rather than inflate it. ${SCOPED_POPULATION}`,
  },
  kpiNrfi: {
    description: "Hit rate on the predictions where the engine called NRFI.",
    disclaimer: `Counts predictions that called NRFI, not games that finished NRFI — the two are different. There is no matching YRFI tile in this row; that split is further down the page. ${SCOPED_POPULATION}`,
  },
  kpiHighConf: {
    description: "Hit rate on predictions the engine put in its top confidence tier.",
    disclaimer: `Medium and low tiers are excluded, so this is not the overall hit rate. Confidence tiers are stamped on at write time, so predictions scored under an earlier cutoff are pooled in with current ones. ${SCOPED_POPULATION}`,
  },
  kpiHighConfPnl: {
    description: "Hypothetical result of backing every top-tier pick at one flat unit.",
    disclaimer: `Not real money and not your bet history — see Bets and Bankroll for actual wagers. Only predictions that captured an odds snapshot count, and backfilled predictions never carry odds, so this covers far fewer picks than the accuracy tile beside it. Odds are the price at prediction time, not closing line, and no vig, stake sizing or bankroll growth is modelled. ${SCOPED_POPULATION}`,
  },

  perModelAccuracy: {
    description: "How each model would have scored on its own, judged at a flat 50% threshold.",
    disclaimer:
      "The bars do not share a denominator. Poisson, ZIP, Markov and the ensemble are scored over every settled prediction; MAPRE and the meta-models only over rows where that column was stored, which is a smaller and more recent set. The DeepNRFI and Monte Carlo columns are not charted. The axis starts at 40%, so a genuinely poor model renders as a stub rather than a short bar.",
  },
  calibrationCurve: {
    description:
      "Whether a stated probability means what it says — predictions grouped into bands, plotted against how often they actually landed.",
    // The clamp caveat stays in the visible footnote below the chart, where the
    // real clamp range can be interpolated rather than hard-coded here.
    disclaimer:
      "Bands holding fewer than five settled predictions are dropped rather than drawn, so sparse tails vanish silently. The end bands are empty mainly because the final step blends the model 76/24 with the league average, which pulls every probability toward the middle — the output clamp barely binds on top of that. Backtested predictions are pooled in with live ones and drag the curve further toward the base rate, diluting it rather than flattering it. This chart shows agreement between stated and observed rates only — Brier score and log loss are not plotted here.",
  },

  overviewOverall: {
    description: "Same headline hit rate as the tile at the top of the page.",
    disclaimer: `Scored predictions only. ${SYSTEM_ROWS} ${SCOPED_POPULATION}`,
  },
  overviewTracked: {
    description: "Every prediction in the current window, scored or not.",
    disclaimer: `This is the only figure on the page that counts pending predictions — none of the percentages use it as a denominator. ${SCOPED_POPULATION}`,
  },
  overviewSettled: {
    description: "Predictions with a recorded first-inning result — the denominator behind every percentage here.",
    disclaimer: `Predictions saved in this browser and predictions stored on your account are merged, so a different device can show a different count. ${SCOPED_POPULATION}`,
  },
  overviewPending: {
    description: "Predictions still waiting on a first-inning result.",
    disclaimer:
      "Pending means no result has been recorded yet. That can mean the game has not finished, or that it finished after the nightly sync last ran — this tile does not distinguish the two, so a pending count above zero is not by itself a sign anything is wrong.",
  },

  byPredictionType: {
    description: "Hit rate split by which side the engine called.",
    disclaimer:
      "Split by the side predicted, not by how games actually finished. An empty bucket shows 0.0% rather than a dash, so a side with no picks at all can look like a total failure.",
  },
  byConfidenceLevel: {
    description: "Hit rate at each confidence tier — the check on whether confidence is meaningful.",
    disclaimer:
      "The thresholds in the labels are today's. Each prediction kept the tier it was given when written, so rows scored under earlier cutoffs are mixed in. No minimum sample applies, so a tier holding a handful of picks is displayed as confidently as one holding thousands.",
  },
  financialPerformance: {
    description: "What a flat one-unit stake on every scored pick would have returned.",
    disclaimer:
      "Hypothetical, not your actual betting record. ROI is the average return per bet, not bankroll-weighted growth. Only predictions carrying an odds snapshot count, and since backfilled rows never have odds, these figures typically cover a much shorter and more recent stretch than the accuracy numbers above them.",
  },
  monthlyBreakdown: {
    description: "Accuracy and ROI broken out by calendar month.",
    disclaimer:
      "Months with no settled predictions are omitted rather than shown empty, so gaps in coverage are invisible. A month holding one pick is rendered the same size as one holding four hundred, and its ROI covers only that month's priced subset.",
  },

  byPitcher: {
    description: "Accuracy grouped by the starting pitchers involved.",
    disclaimer:
      "Top 50 pitchers by volume only; everyone below that is counted nowhere on this table. Starters listed as TBD are dropped. There is no minimum sample, so a pitcher with a single start can show 100%. Ranked by number of starts, which is a volume ranking rather than a skill ranking.",
  },
  byPark: {
    description: "Accuracy grouped by ballpark.",
    disclaimer:
      "Predictions stored on your account do not record a venue, so they are attributed to the home team's current ballpark. Neutral-site games, international series and any team that has relocated are therefore filed under the wrong park. Top 50 parks only, with no minimum sample.",
  },

  versionComparison: {
    description:
      "Head-to-head accuracy and Brier score for the legacy 7-model ensemble against the current 9-model one.",
    disclaimer:
      "This section reads a different population from the rest of the page: every prediction stored system-wide, ignoring your period selection and the 2,000-row limit — so its counts will not reconcile with the figures above. It is also not a controlled comparison: the two versions ran over different date ranges with different data available, so part of any gap is the sample rather than the model. Predictions written before versioning existed are all counted as v1.",
  },
  versionCardV1: {
    description: "The 7-model ensemble that ran before Ensemble++, with Brier score — lower is better.",
    disclaimer:
      "Every prediction written before version stamping existed is counted here, so this bucket reaches further back than v2 and leans heavily on backfilled seasons. Backfills carry synthetic weather and no odds, which flatters or punishes the score for reasons unrelated to the model.",
  },
  versionCardV2: {
    description: "The current 9-model ensemble, with Brier score — lower is better.",
    disclaimer:
      "Only predictions written since this version shipped, so the sample is smaller and made up mostly of live slates rather than backfilled ones. That difference in data quality, not just the model change, is part of any gap you see against v1.",
  },
  byConviction: {
    description:
      "Accuracy grouped by how far the model's probability sat from a coin flip, as a proxy for conviction.",
    disclaimer:
      "No odds are involved, so this measures distance from 50/50, not edge against a bookmaker's price — a confident model can still be on the wrong side of the market. Uses the same global, period-ignoring population as the version cards above.",
  },
} satisfies Record<string, CardCopy>

// ---------------------------------------------------------------------------
// /history
// ---------------------------------------------------------------------------

const HISTORY_SCOPE =
  "Covers the selected period, which defaults to the last 90 days — switch to All Time to widen it. Of the predictions stored in the database — yours and the system-wide slate together — only the 2,000 most recent by game date are loaded, with anything saved in this browser merged on top and not subject to that limit. Signed out, you see only what this browser saved locally."

export const HISTORY_COPY = {
  kpiTracked: {
    description: "Every prediction in the current window, settled and pending together.",
    disclaimer: `${SYSTEM_ROWS} This is the only tile that counts pending predictions, so it will not match any of the percentages. ${HISTORY_SCOPE}`,
  },
  kpiCorrect: {
    description: "How often the called side matched the first-inning result.",
    disclaimer: `Settled predictions only. Backtested rows are pooled with live ones — backtests use point-in-time stats but synthetic weather and no odds, which pulls accuracy toward the league base rate. The effect is dilution, not inflation: a corpus dominated by backtests understates genuine live skill. ${HISTORY_SCOPE}`,
  },
  kpiHighConfPnl: {
    description: "Hypothetical return from backing every top-tier pick at one flat unit.",
    disclaimer: `Not real money and not the Bets ledger. Only predictions with a stored odds snapshot count, and predictions saved to your account never carry odds — so this figure comes almost entirely from picks captured live in this browser. No vig, stake sizing or closing-line movement is modelled. ${HISTORY_SCOPE}`,
  },
  kpiNrfi: {
    description: "Hit rate on the predictions where the engine called NRFI.",
    disclaimer: `Counts predictions that called NRFI, not games that finished NRFI. The YRFI side is shown further down the page, not here. ${HISTORY_SCOPE}`,
  },

  pnlChart: {
    description: "Running total of a flat one-unit stake on every priced pick, in the order they settled.",
    disclaimer:
      "Every settled prediction without an odds snapshot is simply absent from this line, which is most of the archive — so the curve is far shorter than your prediction count and skewed toward recent live picks. The horizontal axis is bet number, not date, so flat stretches are not quiet periods. All confidence tiers are included, and vig is not modelled.",
  },

  summaryOverall: {
    description: "Share of settled predictions where the called side was right.",
    disclaimer: `Pending predictions are excluded from the denominator. ${SYSTEM_ROWS} ${HISTORY_SCOPE}`,
  },
  summaryNrfi: {
    description: "Hit rate when the engine called NRFI.",
    disclaimer: `Measured over predictions that called NRFI, not over games that finished NRFI. ${HISTORY_SCOPE}`,
  },
  summaryYrfi: {
    description: "Hit rate when the engine called YRFI.",
    disclaimer: `Measured over predictions that called YRFI, not over games that finished YRFI. ${HISTORY_SCOPE}`,
  },
  summaryHighConf: {
    description: "Hit rate on top-tier picks only.",
    disclaimer: `Medium and low tiers are excluded. Tiers were stamped on when each prediction was written, so older rows may have been tiered under a different cutoff. ${HISTORY_SCOPE}`,
  },

  perModelAccuracy: {
    description: "How each model would have scored alone, re-judged at a flat 50% threshold.",
    disclaimer:
      "The models are not measured over the same predictions — MAPRE and the meta-models only score rows that stored their column, which is a smaller, more recent set than Poisson, ZIP and Markov cover. The ensemble row here uses the pre-blend ensemble figure, while the headline probability elsewhere on the page is the calibrated and clamped one, so the two can disagree.",
  },
  monthlyAccuracy: {
    description: "Accuracy and hypothetical ROI for each month in the current window.",
    disclaimer:
      "Months are calendar months of the game date, labelled in UTC. Only months containing settled predictions appear, so gaps are invisible — and with the default 90-day window you are seeing three or four months, never a full season. ROI covers only that month's priced picks, which is why most months read 'No odds'.",
  },
  pendingResults: {
    description: "Predictions still waiting on a first-inning result.",
    disclaimer:
      "These do not settle themselves from this page. The nightly sync attaches results to every prediction whose game has finished, whatever its date, so these should clear on their own once the games are final. Results for predictions saved in this browser are also filled in when you visit the dashboard. Record Result writes to predictions saved on your own account; on a system-wide prediction it updates this device only.",
  },
  completedPredictions: {
    description: "Every settled prediction in the window, with the call, the result and the price.",
    disclaimer:
      "First-inning runs, odds and P/L show as '—' for predictions stored on your account, because those columns are not saved — only picks captured live in this browser carry them. In the expanded model breakdown, ZIP and Bayesian weights read 0% when the stored breakdown did not include them, which means missing rather than zero.",
  },
} satisfies Record<string, CardCopy>
