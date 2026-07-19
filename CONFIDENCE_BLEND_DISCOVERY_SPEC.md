# Spec: Per-Model Confidence-Bucket Blend Discovery

## Status
**Phase 1 (Specify) — awaiting review.** Do not proceed to Phase 2 (Plan) until this is approved.

## Scope Decision (confirmed with user, 2026-07-19)
This is an **internal discovery/backtesting tool**, not a live end-user feature.
- No new end-user UI for picking models/confidence ranges.
- No change to what `/api/predictions` computes or serves today.
- The only user-facing surface, if a combo clears the statistical bar below, is **one new
  pricing-page stat card** sourced from a real backend endpoint (not hardcoded copy).

## Objective
Determine whether restricting specific ensemble models to specific ranges of their *own*
predicted probability ("confidence buckets") — either individually or in small combinations —
produces a **historically real, out-of-sample-validated** accuracy edge worth promoting on the
pricing page, without repeating the overfitting failure mode already documented in this
codebase (`ENSEMBLE_BLEND`/`ENSEMBLE_WEIGHTS` comments in `lib/nrfi-engine.ts` /
`lib/nrfi-models.ts` explicitly warn these must only change with walk-forward CV evidence — the
2026-07-19 weight-optimization analysis confirmed naive re-optimization overfits and
underperforms current weights on true holdout).

**User**: internal (me, product owner). **Success looks like**: either (a) a specific,
narrowly-defined model+bucket combo with a documented, statistically defensible edge and a
concrete stat-card spec, or (b) a clear negative result — "no combo clears the bar" — which is
also a valid, useful outcome and must be reported honestly rather than forced.

## Definitions (ASSUMPTIONS — confirm before Phase 2)

1. **Per-model confidence bucket** = the model's own raw predicted probability, bucketed
   symmetrically around 50%: `[50,60) [60,70) [70,80) [80,90) [90,100]` on whichever side
   (NRFI-leaning ≥50 or YRFI-leaning <50, mirrored) the model's own output falls. "Poisson at
   60-69" means Poisson's own `poissonNrfi` (or its YRFI-mirror `100 - poissonNrfi` when
   Poisson leans YRFI) lands in `[60,70)`. This reuses the exact bucketing convention already
   validated in `V3_EVALUATION_REPORT.md`'s conviction analysis, just per-model instead of
   ensemble-level.
2. **A "combo rule"** = a named list of `(model, side, min%, max%)` constraints, where `side` is
   `NRFI` or `YRFI` — e.g. `[(Poisson,NRFI,60,69), (LogisticStack,NRFI,60,69), (ZIP,NRFI,60,69),
   (NNInteraction,NRFI,70,79)]`. The side is mandatory on every constraint (see #3 — this is the
   fix for the direction bug CodeRabbit caught in review).
3. **Per-game evaluation of a combo rule**: for a given historical game, a model "qualifies" if
   its own probability *on the constraint's specified side* falls in the assigned bucket (e.g. a
   `(Poisson,NRFI,60,69)` constraint checks Poisson's raw `poissonNrfi`; a `(Poisson,YRFI,60,69)`
   constraint checks `100 - poissonNrfi`). A combo rule only produces a prediction for games
   where **at least one** listed model qualifies **and every qualifying model in that game
   qualified on the same side** — mixed-side qualification (e.g. Poisson qualifies NRFI-side
   while ZIP qualifies YRFI-side in the same game) makes the game **ambiguous for this combo**
   and it is excluded from the applicable set, logged separately as an "ambiguous" count distinct
   from "zero models qualified." When all qualifying models share a side, the prediction is the
   simple average of their same-side probabilities, and the predicted direction is that shared
   side. Games where zero listed models qualify are excluded from the applicable set (not counted
   as wins, losses, or ambiguous).
4. **"Proven edge"** = the combo's hit rate on a **holdout set never used to select or tune the
   combo**, with a sample size and confidence interval, not a single point estimate from the
   same data used to find it.

**These are working defaults for Phase 1 — flag now if any of the four should be different.**

## Statistical Bar (confirmed: strict)
A combo may only be surfaced as a marketing stat if **all** of the following hold on a reserved
out-of-sample holdout:
1. **Minimum sample size**: ≥150 qualifying games in the holdout period.
2. **Out-of-sample only**: the combo's model list and bucket ranges are chosen using 2023-2025
   data only; the published hit-rate is computed exclusively on holdout data the selection
   process never saw.
3. **Confidence-interval floor**: the Wilson 95% lower bound of the holdout hit-rate must clear
   the standard -110 breakeven rate (52.4%), not just the point estimate.
4. **Real multiple-comparison control, not just disclosure** — candidate-count reporting alone
   does not control the false-positive rate from testing many combos against one holdout.
   Concretely:
   - Stage 1 (2023-2025 only): screen all `(model, side, bucket)` cells and small combos
     (`02_combo_search.py`), ranked by train-period hit rate.
   - **Pre-registration**: before the holdout is ever touched, select at most **3 primary
     candidates** from that ranking based on 2023-2025 evidence alone, and record them (with
     their exact definitions) in the findings doc's manifest — this list is then frozen.
   - Only those pre-registered candidates get evaluated against the holdout under bar
     items 1-3. Any other combo examined during Stage 1 is reported as **exploratory** in
     `CONFIDENCE_BLEND_FINDINGS.md` and explicitly may **not** be promoted as a marketing stat,
     regardless of how it would have scored on the holdout — looking further after the fact
     defeats the pre-registration control.
   - If none of the ≤3 pre-registered candidates clear bar items 1-3, the result is a clean
     negative — re-running Stage 1 with a new candidate list against the *same* holdout is not
     permitted (that re-introduces the multiple-comparisons problem one level up); a genuinely
     new holdout period would be needed first.

If nothing clears this bar, the deliverable is the negative finding + the searched-combo table
(including the exploratory, non-promotable results), not a forced stat.

### Holdout Provenance (frozen snapshot required)
"The 2026 season" is a moving target as of this writing (2026-07-19, mid-season) — new games and
backfilled results land continuously (see this session's own historical-sync backfill work).
`03_holdout_validate.py` must therefore record, alongside its results:
- The exact **as-of timestamp** the holdout query/export was taken.
- The **dataset snapshot identifier** — either the specific CSV export filenames used (as this
  session's other analyses did) or, if querying the DB directly, the exact row count and a
  `MAX(date)`/`MAX(createdAt)` watermark for the games included.
- The **prediction-generation cutoff** — confirmation that every included game's prediction was
  generated before its actual result was known (no leakage), consistent with the point-in-time
  guarantees already documented in `app/api/historical-sync/route.ts`.
Any later re-validation against a newer pull of "2026" data is a **new, separately-dated
snapshot** — it does not silently update or replace the original frozen result, and does not
count as a second look at the same holdout (see the pre-registration rule above).

## Tech Stack / Commands
Python analysis (matches the existing `scripts/deepnrfi/` and this session's
`/tmp/.../scratchpad/v3_retrain/` conventions): pandas, numpy, scipy for the search;
`statsmodels.stats.proportion.proportion_confint` (Wilson method) for the CI floor. No new
runtime dependency in the Next.js app for Phase 1 — this is offline analysis.

If a combo clears the bar, Phase 2 adds exactly one small piece of app surface:
- `GET /api/stats/proven-edge` (new, or extend `app/api/performance/route.ts`) — computes the
  combo's live-updating stats from `GameResult`/`ModelPrediction` the same way
  `perModel`/`byConfidence` already do, so the number **stays current** rather than going stale
  like a hardcoded claim would. The response must include, not just the headline hit rate:
  `qualifyingGames`, `wins`, `hitRate`, `wilsonLowerBound`, `wilsonUpperBound`,
  `breakevenThreshold` (0.524), `datasetAsOf` (the frozen-snapshot cutoff, re-evaluated live on
  each request against current data), and `eligible` (boolean — `wilsonLowerBound > breakevenThreshold
  && qualifyingGames >= 150`, recomputed live).
- One new stat-card component on `components/pricing-client.tsx`, styled like the existing
  homepage `StatCard` pattern (`app/page.tsx:582-621`), sourced from the new endpoint. The card
  must **hide or replace its claim** (fall back to generic copy, not a stale number) whenever
  `eligible` is `false` on a given request — the live-updating requirement only holds up if the
  card actually reacts when the underlying stat stops clearing the bar.

## Project Structure
```text
scripts/deepnrfi/confidence_blend_discovery/     → new, Phase 1 analysis scripts
  01_bucket_backtest.py                          → per-(model, bucket) cell hit rates, 2023-2025
  02_combo_search.py                             → small (2-4 model) combo search, train-only
  03_holdout_validate.py                         → apply pre-registered candidates to the frozen holdout, apply the 4-part bar
  search_manifest.json                           → persisted, reproducible record of every candidate cell/combo tested (see Success Criteria)
  CONFIDENCE_BLEND_FINDINGS.md                    → the report (mirrors V3_EVALUATION_REPORT.md's format)
app/api/stats/proven-edge/route.ts               → Phase 2 only, if a combo clears the bar
components/pricing-client.tsx                    → Phase 2 only, new stat card section
```

## Code Style
Match `V3_EVALUATION_REPORT.md` and this session's evaluation report conventions: numbered
findings with the actual metric first, methodology caveats stated plainly, no rounding away
inconvenient results. Python scripts follow the existing `scripts/deepnrfi/` numbered-file
pattern already used earlier this session (`01_merge.py`, `02_evaluate.py`, ...).

## Testing Strategy
This is a data-analysis deliverable, not application code — "testing" means:
- Sanity-check the bucket/qualification logic on a handful of hand-traced example games before
  running the full search (verify a known Poisson=64% row actually lands in the 60-69 bucket).
- Cross-check total qualifying-game counts per combo sum sensibly (can't exceed the dataset size,
  should roughly match the sum of per-model bucket populations minus overlaps).
- If Phase 2 ships an API route, it follows the existing `app/api/performance/route.ts` pattern
  and should get the same kind of assertion coverage as `__tests__/backtest-metrics.test.ts`.

## Boundaries
- **Always do**: report negative/null results as prominently as positive ones; show sample size
  and CI alongside any published hit-rate; reuse the existing 2023-2025/2026 train/holdout split
  rather than inventing a new one.
- **Ask first**: before Phase 2 (any app code change) even if a combo clears the bar — the
  pricing-page copy and exact stat framing is a product/legal call, not a purely technical one.
- **Never do**: publish a hit-rate computed on the same data used to select the combo; silently
  lower the statistical bar if the first search comes up empty; let this analysis influence the
  actual production `ENSEMBLE_WEIGHTS`/`ENSEMBLE_BLEND` constants (explicitly out of scope —
  those are governed by the existing walk-forward-CV-only policy already in the code comments).

## Success Criteria

**Canonical search space (must match exactly — this is what makes the search reproducible):**
- **The 7 models and their source columns** (from `merged_full_enriched.csv` built earlier this
  session, or the equivalent live DB columns added in PR #109): `poissonNrfi`, `zipNrfi`,
  `markovNrfi`, `mapreNrfi`, `logisticMetaNrfi`, `nnInteractionNrfi`, `hierarchicalBayesNrfi`.
- **Bucket cells**: 5 ranges (`[50,60) [60,70) [70,80) [80,90) [90,100]`) × 2 sides (NRFI/YRFI,
  per Definition #1's mirroring) = **10 cells per model, 70 cells total** across 7 models.
- **Side-counting rule**: a model's NRFI-side value is its raw column; its YRFI-side value is
  `100 - column`. A single game can only make a given model qualify on one side (a probability
  is either ≥50 or <50, never both), so there is no double-counting within a model.
- **Combo enumeration**: combos are 2-4 constraints drawn from **distinct models** (no model
  repeated within one combo); constraint order within a combo is not significant (canonicalize
  by sorting constraints alphabetically by model name before dedup); two combos with the same
  constraint set in different orders are the same candidate and counted once.
- [ ] Per-(model, bucket-cell) hit-rate table exists for all 70 cells, 2023-2025, persisted in
      `search_manifest.json` alongside every combo candidate actually tested (not just the ones
      that survived) so the search is independently reproducible.
- [ ] Combo search restricted to cells with ≥150 train-period games survives to Stage 2.
- [ ] At most 3 primary candidates are pre-registered from Stage 2 (frozen before the holdout is
      touched) and evaluated against the frozen holdout, applying all 4 statistical-bar checks.
- [ ] `CONFIDENCE_BLEND_FINDINGS.md` states a clear final verdict: either one of the ≤3
      pre-registered candidates clears the bar (with its stat-card copy and evidence fields), or
      "no pre-registered candidate cleared the bar" — with the full manifest, including
      exploratory (non-promotable) results, as evidence.
- [ ] If a combo clears the bar, a Phase 2 spec addendum describes the API route + UI card
      before any code is written for it.

## Open Questions
1. Is the "simple average of qualifying models" combination rule (Definition #3) the right
   default, or should qualifying models be weighted (e.g., by their existing
   `ENSEMBLE_WEIGHTS`) rather than averaged equally?
2. Should the bucket edges (50/60/70/80/90) be treated as fixed, or is a small amount of edge
   tuning in scope for Phase 1 (which would need its own train/holdout discipline to avoid
   becoming another overfitting vector)?
3. Confirm the reused 2023-2025 train / 2026 holdout split is acceptable for this analysis too
   (same split used throughout `V3_EVALUATION_REPORT.md` and the ensemble weight-optimization
   report), rather than a fresh split.
