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
2. **A "combo rule"** = a named list of `(model, min%, max%)` constraints, e.g.
   `[(Poisson,60,69), (LogisticStack,60,69), (ZIP,60,69), (NNInteraction,70,79)]`.
3. **Per-game evaluation of a combo rule**: for a given historical game, a model "qualifies"
   if its own probability falls in its assigned bucket. A combo rule only produces a prediction
   for games where **at least one** listed model qualifies; the prediction is the simple average
   of the qualifying models' probabilities. Games where zero listed models qualify are excluded
   from that combo's applicable set (not counted as wins or losses).
4. **"Proven edge"** = the combo's hit rate on a **holdout set never used to select or tune the
   combo**, with a sample size and confidence interval, not a single point estimate from the
   same data used to find it.

**These are working defaults for Phase 1 — flag now if any of the four should be different.**

## Statistical Bar (confirmed: strict)
A combo may only be surfaced as a marketing stat if **all** of the following hold on a reserved
out-of-sample holdout (2026 season, ~1,445 games, already carved out as the test split in every
prior evaluation in this repo — reuse that same split for consistency):
1. **Minimum sample size**: ≥150 qualifying games in the holdout period.
2. **Out-of-sample only**: the combo's model list and bucket ranges are chosen using 2023-2025
   data only; the published hit-rate is computed exclusively on 2026 data the selection process
   never saw.
3. **Confidence-interval floor**: the Wilson 95% lower bound of the holdout hit-rate must clear
   the standard -110 breakeven rate (52.4%), not just the point estimate.
4. **Multiple-comparison awareness**: report how many candidate combos were tried, since testing
   dozens of (model × bucket) cells and picking the best one is exactly the scenario the CI-floor
   requirement (#3) exists to guard against.

If nothing clears this bar, the deliverable is the negative finding + the searched-combo table,
not a forced stat.

## Tech Stack / Commands
Python analysis (matches the existing `scripts/deepnrfi/` and this session's
`/tmp/.../scratchpad/v3_retrain/` conventions): pandas, numpy, scipy for the search;
`statsmodels.stats.proportion.proportion_confint` (Wilson method) for the CI floor. No new
runtime dependency in the Next.js app for Phase 1 — this is offline analysis.

If a combo clears the bar, Phase 2 adds exactly one small piece of app surface:
- `GET /api/stats/proven-edge` (new, or extend `app/api/performance/route.ts`) — computes the
  combo's live-updating hit rate from `GameResult`/`ModelPrediction` the same way
  `perModel`/`byConfidence` already do, so the number **stays current** rather than going stale
  like a hardcoded claim would.
- One new stat-card component on `components/pricing-client.tsx`, styled like the existing
  homepage `StatCard` pattern (`app/page.tsx:582-621`), sourced from the new endpoint.

## Project Structure
```
scripts/deepnrfi/confidence_blend_discovery/     → new, Phase 1 analysis scripts
  01_bucket_backtest.py                          → per-(model, bucket) cell hit rates, 2023-2025
  02_combo_search.py                             → small (2-4 model) combo search, train-only
  03_holdout_validate.py                         → apply surviving combos to 2026 holdout, apply the 4-part bar
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
- [ ] Per-(model, bucket) hit-rate table exists for all 7 models × ~10 buckets, 2023-2025.
- [ ] Combo search restricted to cells with ≥150 train-period games survives to holdout testing.
- [ ] Holdout validation applies all 4 statistical-bar checks and reports pass/fail per combo.
- [ ] `CONFIDENCE_BLEND_FINDINGS.md` states a clear final verdict: either a specific combo +
      its stat-card copy, or "no combo cleared the bar" with the searched table as evidence.
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
