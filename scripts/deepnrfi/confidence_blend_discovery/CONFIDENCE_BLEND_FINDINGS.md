# Confidence-Bucket Blend Discovery — Findings

**Status:** ✅ RUN COMPLETE (2026-07-19) — first real pass against a frozen holdout snapshot.
See `search_manifest.json` for the full machine-readable record this report summarizes.

**Verdict:** ❌ **NO PRE-REGISTERED CANDIDATE CLEARED THE BAR (clean negative).** No stat-card
copy, no Phase 2 addendum. Per the spec's Boundaries, a clean negative is reported as
prominently as a positive result would have been — this is a real, useful finding, not a
gap to fill in later.

**Dataset:** `ed1ef6d4-nrfidata20260719.csv` (sha256 `5741bd74...c19ea33`, full hash in
`search_manifest.json`), exported via the app's `/api/export-data?model=all` on 2026-07-19.
As-of timestamp for the holdout run: `2026-07-19T06:25:11Z`. Train: 7,287 games (2023-2025).
Holdout: 1,470 games (2026 season, as of the export date — a moving target mid-season per the
spec's Holdout Provenance section; this run's snapshot is now frozen and any later "2026" pull
is a separately-dated snapshot, not an update to this result).

---

## How this report is produced

1. `python 01_bucket_backtest.py --csv <export>.csv` — per-(model, side, bucket) hit rates,
   2023-2025 only, all 70 cells, null-filtered per model.
2. `python 02_combo_search.py --csv <export>.csv` — enumerates 2-4-distinct-model, same-side
   combos from cells with train n >= 150; scores every combo under both AND and OR
   qualification rules; prints ranked tables.
3. Human review of the printed rankings, then:
   `python 02_combo_search.py --freeze-preregistration --candidates <id>:<rule>,... --rationale "..."`
   — freezes at most 3 primary candidates **before the holdout is touched**. This is a
   researcher decision (diversity of picks, face validity, sample-size trade-offs), not a pure
   top-N cutoff.
4. `python 03_holdout_validate.py --csv <export>.csv` — evaluates the frozen candidates against
   2026 rows only, applies the 4-part statistical bar, records holdout provenance.
5. This file is then filled in by hand from the resulting `search_manifest.json`.

## Executive Summary

Stage 1 screened all 70 (model, side, bucket) cells on the 7,287-game 2023-2025 train set; 31
cells had n ≥ 150. Stage 2 enumerated 2,216 distinct same-side combos (2-4 models) from those
cells and scored all 4,432 combo/rule rows (AND and OR both computed for each). Three primary
candidates were pre-registered before the holdout was touched — one from each of AND/NRFI,
OR/NRFI, and OR/YRFI, chosen for a mix of rule/side diversity and to avoid a degenerate pattern
found among high-train-hit-rate AND combos (several padded in a near-universal
`hierarchicalBayesNrfi [50,60)` constraint — true for 6,003 of 7,287 games — that inflated the
appearance of "multi-model agreement" without adding real restriction). **None of the 3
candidates cleared the statistical bar against the 1,470-game 2026 holdout.** The best-performing
candidate on train (OR: NN Interaction[70-80) or Poisson[60-70), NRFI, n=470, 57.45%) held up
reasonably on holdout (56.52%, n=230) but its Wilson 95% lower bound (0.5006) still fell short of
the 0.524 breakeven floor. The other two candidates had far smaller holdout samples (n=37 and
n=61) despite looking strong on train — a textbook illustration of why the n≥150 floor and the
CI-floor bar (not the point estimate) are the actual gates, not the headline hit rate.

## Pre-registered candidates — holdout results

| combo_id | rule | side | constraints | train hit-rate (n) | holdout n | holdout wins | holdout hit-rate | Wilson 95% lower | Wilson 95% upper | Bar: n≥150 | Bar: CI floor (>0.524) | Bar: multiple-comparison | **Eligible** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `7948492e148a223b` | OR | NRFI | nnInteractionNrfi[70,80) or poissonNrfi[60,70) | 57.45% (470) | 230 | 130 | 56.52% | 0.5006 | 0.6277 | ✅ | ❌ | ✅ | **❌** |
| `706db650668572d8` | AND | NRFI | markovNrfi[60,70) and poissonNrfi[60,70) | 60.62% (160) | 37 | 25 | 67.57% | 0.5146 | 0.8037 | ❌ | ❌ | ✅ | **❌** |
| `9fee341a186946c4` | OR | YRFI | mapreNrfi[60,70) or markovNrfi[70,80) | 56.60% (477) | 61 | 39 | 63.93% | 0.5139 | 0.7483 | ❌ | ❌ | ✅ | **❌** |

**Bar reminder:** all four of (1) n ≥ 150 holdout games, (2) out-of-sample (structural), (3)
Wilson 95% lower bound > 0.524, (4) multiple-comparison control (≤3 pre-registered candidates,
no re-registration against the same holdout) must hold for a candidate to be eligible. Per the
spec, a new candidate list may not be re-registered against this same holdout snapshot — a
genuinely new (later) holdout period would be required to test different candidates.

## If a candidate clears the bar: stat-card fields

Not applicable — no candidate cleared the bar in this run. (Section retained for the template's
future use if a later, separately-dated holdout run produces an eligible candidate.)

```json
{
  "qualifyingGames": null,
  "wins": null,
  "hitRate": null,
  "wilsonLowerBound": null,
  "wilsonUpperBound": null,
  "breakevenThreshold": 0.524,
  "datasetAsOf": null,
  "eligible": null
}
```

No application code is written from this section without separate "ask first" approval per
`CONFIDENCE_BLEND_DISCOVERY_SPEC.md`'s Boundaries — this is a spec for that future addendum, not
an authorization to build it.

## Exploratory appendix (non-promotable)

Everything in `search_manifest.json`'s `stage1_bucket_cells` (70 cells) and `stage2_combos` (4,432
combo/rule rows) that was **not** pre-registered is exploratory. Per the spec's
multiple-comparison control, these may never be promoted as a marketing stat regardless of how
well they would have scored on the holdout — looking further after the fact defeats the
pre-registration control. These were never checked against the holdout at all.

**Stage 1 (train, 2023-2025):** 31 of 70 cells cleared n ≥ 150. Top cell:
`mapreNrfi` YRFI `[60,70)`, n=190, hit rate 60.00%. All 7 models were fully populated (0 nulls
out of 7,287 rows each) — this real export is cleaner than the smoke-test fixture used during
development, which had no null gaps either.

**Stage 2 (train, 2023-2025), top exploratory OR-rule combos (not pre-registered, non-promotable):**

| combo_id | side | constraints | n | hit rate |
|---|---|---|---|---|
| `672f8df4bd26a059` | NRFI | logisticMetaNrfi[60,70) or nnInteractionNrfi[70,80) | 436 | 57.11% |
| `98744e497e3c68f9` | NRFI | logisticMetaNrfi[60,70) or nnInteractionNrfi[70,80) or poissonNrfi[60,70) | 518 | 56.56% |
| `c58d5665b2db25aa` | NRFI | logisticMetaNrfi[60,70) or poissonNrfi[60,70) | 453 | 56.07% |

**Stage 2 (train), AND-rule combos:** every top-ranked-by-hit-rate AND combo had n=1 (100%
hit rate on a single game — pure noise). The largest-sample AND combos (n > 2,000) all sit in
the near-universal `[50,60)` bucket for one or more models and hover at 51-52% hit rate, barely
above coinflip. This is itself informative: under strict simultaneous-qualification (AND)
semantics, this 7-model/5-bucket search space simply does not produce large-sample, high-hit-rate
candidates — the two are in tension by construction (requiring several models to jointly land in
a narrow, informative bucket is a rare event).

## Methodology caveats

- **Null filtering:** each model's bucket hit rates are computed only over that model's own
  non-null rows; `mapreNrfi`/`logisticMetaNrfi`/`nnInteractionNrfi`/`hierarchicalBayesNrfi` are
  nullable in `ModelPrediction` (absent on rows predating PR #109 or from degraded no-lineup
  historical recompute) — the usable sample count per model is reported alongside `n_null`.
- **CSV vs. DB provenance:** the `/api/export-data?model=all` CSV has no `gamePk`,
  `ensembleVersion`, or `createdAt` column, so CSV-mode runs inherit leakage-freeness from the
  app's documented point-in-time guarantees (`app/api/historical-sync/route.ts`) rather than
  independently re-verifying it per row. DB-mode runs (`--db-url`) additionally capture an
  `ensembleVersion` set and a `createdAt` watermark.
- **Same-side combo construction:** combos only mix constraints that target one shared side
  (NRFI or YRFI) — see the spec's Open Question #5 for why a mixed-side combo would be
  degenerate under both qualification rules.
- **AND vs. OR:** both qualification semantics are always searched and reported side by side
  (spec Open Question #4) — this report should show both wherever a combo's rule matters.

## Not in this phase

If a candidate clears the bar, a Phase 2 (application-code) addendum would need to additionally:
- **Pin the validated `ensembleVersion`** — a live-updating endpoint over `ModelPrediction` must
  not silently mix predictions from a different, later-changed ensemble formula into the same
  live stat.
- **Never mix train and holdout rows** in the live-updating aggregate — the existing
  `/api/performance` pattern aggregates all `ModelPrediction` rows with no season/date filter,
  which would reintroduce the training data into a stat that's supposed to stay out-of-sample.
- **Use a public route pattern**, not the Clerk-gated `/api/performance` pattern — `/pricing` is
  a public page and needs a public, unauthenticated data source (model this on `/api/games` or
  `/api/results`, which are public-but-rate-limited, not on `/api/performance`, which 401s without
  a session).

These are explicitly out of scope here and gated behind separate "ask first" approval per the
spec's Boundaries section — nothing in this repository authorizes writing that endpoint or UI
card yet.
