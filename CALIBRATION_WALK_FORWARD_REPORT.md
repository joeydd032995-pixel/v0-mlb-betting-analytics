# Calibration Spline — Walk-Forward Evaluation

**Verdict: HOLD.** Do not ship fitted knots. `lib/calibration.ts` stays the identity mapping.

Resolves the evaluation half of **AUDIT_REPORT.md P1-4** ("refit knots by isotonic
regression on a held-out season"). The refit was run. It does not generalize, and the
reason is structural rather than a tuning problem.

| | |
|---|---|
| Run date | 2026-08-27 |
| Script | `scripts/refit-calibration.ts` (diagnostic; never writes knots) |
| Command | `PRISMA_NEON_HTTP=true NODE_ENV=development npx tsx scripts/refit-calibration.ts --folds=both` |
| Data | 9,132 system-level scored predictions, `model_predictions ⋈ game_results`, seasons 2023–2026 |
| Bootstrap | 2,000 paired resamples, seed 20260827 (verdict re-confirmed at seed 424242) |

---

## Evaluation Summary

Seasons 2023–2026, `userId IS NULL`, `status = 'complete'`, `correct IS NOT NULL`, joined to
`GameResult` on `gamePk`. Well above the 500-game floor in every fold.

**Inversion validity.** No raw pre-calibration probability is persisted
(`EnsembleDiagnostic.rawEnsemble7` has no writer), so raw is reconstructed as
`(final − 0.24·0.516) / 0.76`. That is exact only where the `[0.18, 0.85]` clamp did not
bind. Measured: **0 of 9,132 rows** sit on either boundary (observed range 0.3165–0.6927).
The script now asserts this and aborts rather than fitting on corrupted inputs.

---

## The archive is not one engine

This is the finding that governs everything below. Rows split into three generations by
`inputsPresence.recomputedAt` and `createdAt`:

| Cohort | n | date range | mean pred | actual NRFI | bias |
|---|---|---|---|---|---|
| A/2024 — pre-audit bulk backfill | 2,427 | 2024-03-20 → 2024-09-29 | 0.4939 | 0.5328 | **−0.0388** |
| A/2025 — pre-audit bulk backfill | 2,430 | 2025-03-18 → 2025-09-28 | 0.4965 | 0.4979 | −0.0015 |
| A/2026 — pre-audit bulk backfill | 459 | 2026-03-25 → 2026-04-29 | 0.5420 | 0.5142 | +0.0278 |
| B/2023 — recomputed (post-fix) | 2,430 | 2023-03-30 → 2023-10-01 | 0.4827 | 0.4979 | −0.0153 |
| B/2026 — recomputed (post-fix) | 1,014 | 2026-04-30 → 2026-07-18 | 0.5193 | 0.4773 | **+0.0420** |
| C/2026 — post-audit live cron | 372 | 2026-06-25 → 2026-08-26 | 0.5097 | 0.5108 | −0.0010 |

**The bias flips sign, across an 8.1-percentage-point span.** A/2024 needs probabilities
pushed *up* by ~3.9pp; B/2026 needs them pushed *down* by ~4.2pp. A single monotone curve
cannot do both. This alone caps what any recalibration can achieve, and it is invisible if
you fold by season — which is why the committed Fold B (`2024+2025 → 2026`) trains on one
engine generation and scores on a mixture of three.

---

## Metric Comparison

Two knot variants per fold: **naive** (isotonic sampled at the 19-knot grid) and
**anchor-compensated** (`(isotonic − 0.24·0.516) / 0.76`, so the deployed output equals the
isotonic estimate after the anchor blend). Deltas are paired — both series scored on
identical games — with 95% bootstrap CIs.

| Fold | n train | n hold | AUC | Brier: identity | flat base-rate | Δ naive [95% CI] | Δ compensated [95% CI] | Best |
|---|---|---|---|---|---|---|---|---|
| A: 2024 → 2025 | 2,427 | 2,430 | 0.5344 | **0.24949** | 0.25121 | +0.00017 [−0.00163, +0.00194] | +0.00037 [−0.00140, +0.00209] | identity |
| B: 2024+2025 → 2026 | 4,857 | 1,845 | 0.5486 | **0.24920** | 0.25044 | +0.00039 [−0.00126, +0.00194] | +0.00038 [−0.00096, +0.00168] | identity |
| EA-1: A/2024 → A/2025 | 2,427 | 2,430 | 0.5344 | **0.24949** | 0.25121 | +0.00017 [−0.00163, +0.00194] | +0.00037 [−0.00140, +0.00209] | identity |
| EA-2: B/2023 → B/2026 | 2,430 | 1,014 | 0.5422 | **0.24970** | 0.24991 | +0.00017 [−0.00153, +0.00184] | +0.00024 [−0.00129, +0.00186] | identity |

Positive = refit is worse. **Identity wins every fold on Brier**, and every CI spans zero —
so the honest reading is "no detectable improvement," with the point estimate consistently
in the wrong direction.

Log-loss and ECE agree, and ECE agrees more emphatically:

| Fold | log-loss: identity → naive / comp | ECE: identity → naive / comp |
|---|---|---|
| A | 0.69213 → 0.69238 / 0.69278 | 0.01572 → 0.03053 / **0.03452** |
| B | 0.69159 → 0.69230 / 0.69230 | 0.02981 → 0.03459 / **0.03812** |
| EA-2 | 0.69255 → 0.69291 / 0.69314 | 0.04202 → 0.04260 / 0.04292 |

The refit roughly **doubles** expected calibration error on Fold A. Fitting a calibration
map made calibration worse.

### Calibration intercept / slope (identity path)

| Holdout | intercept | slope |
|---|---|---|
| 2025 | +0.0003 | 0.5842 |
| 2026 (all) | −0.0965 | 0.7416 |
| B/2026 | −0.1523 | 0.7798 |

Perfect is `(0, 1)`. Slope is **well below 1 in every window** — the predictions are spread
wider than their real discrimination supports, i.e. systematically over-confident. See
Recommended Next Actions: that is a shrinkage problem, and isotonic recalibration is the
wrong instrument for it.

---

## Walk-Forward CV Summary

Four folds, all strictly time-ordered, no shuffling. EA-1 is numerically identical to Fold A
because the 2024 and 2025 seasons are wholly generation A — the committed Fold A was already
engine-homogeneous by luck. **Only Fold B mixes generations**, and it is the one the repo
would otherwise have trusted for a 2026 holdout.

### Cross-generation transfer

Holdout Brier delta vs identity when a fold's compensated curve is applied to a cohort it was
not fit on. Positive = worse than shipping nothing. `*` = in-sample, not evidence.

| Fitted on | A/2024 | A/2025 | A/2026 | B/2023 | B/2026 | C/2026 |
|---|---|---|---|---|---|---|
| Fold A (2024 → 2025) | −0.00261* | +0.00037 | +0.00140 | −0.00040 | **+0.00288** | +0.00044 |
| Fold B (24+25 → 2026) | −0.00209* | −0.00054* | +0.00012 | −0.00091 | +0.00082 | −0.00049 |
| Fold EA-1 (A/24 → A/25) | −0.00261* | +0.00037 | +0.00140 | −0.00040 | **+0.00288** | +0.00044 |
| Fold EA-2 (B/23 → B/26) | −0.00092 | −0.00008 | **+0.00397** | −0.00092* | +0.00024 | **+0.00624** |

Every large negative number is in-sample. Out of sample the damage tracks the bias gap
exactly: the Fold A curve (fit where the engine under-predicted by 3.9pp) does its worst
damage on B/2026 (where it over-predicts by 4.2pp), and the EA-2 curve (fit on a −1.5pp
cohort) does its worst damage on the two cohorts that need no correction at all — A/2026
(+0.00397) and C/2026 (+0.00624). This is the sign-flip made quantitative.

---

## Subgroup Analysis

Deliberately not reported by park, pitcher tier, weather bucket, or handedness. With a
whole-sample effect of ±0.0004 Brier and CIs ±0.002, subgroup slices of 100–400 games have
error bars an order of magnitude wider than any effect being measured; every "finding" would
be noise. The cohort split above is the subgroup analysis that actually carries signal, and
it is reported in full.

**No ROI leg.** `nrfiOdds` / `yrfiOdds` are NULL on all 9,132 rows, so the repo's usual
"ROI in the ≥3% edge bucket" gate cannot be evaluated against real prices.
`lib/synthetic-odds.ts` states in its own header that its lines are fabricated, and an ROI
computed from an edge defined as `λ·(modelProb − base)` would be partly circular. Omitted
rather than dressed up.

---

## Pass / Fail / Improve

| Component | Verdict | Basis |
|---|---|---|
| Isotonic fit machinery | **Pass** | PAV fit is monotone; anchor compensation verified — deployed output reproduces the isotonic estimate |
| Anchor-compensated knots | **Fail** | Worse than identity on Brier, log-loss and ECE in all four folds |
| Naive knots | **Fail** | Same, and structurally wrong — the anchor blend re-biases the fitted output |
| Cross-generation stability | **Fail** | Curves transfer negatively; up to +0.00624 Brier on an unseen cohort |
| Identity baseline | **Pass** | Lowest Brier in every fold; beats a flat base-rate prediction in every fold |
| Engine discrimination | **Improve** | AUC 0.5344–0.5486 — real but weak; this, not calibration, is the binding constraint |
| Raw-probability persistence | **Fail** | No stored pre-calibration value; every offline tool depends on an inversion that a non-identity refit would silently break |

---

## Verdict

**HOLD.**

A refit is not merely unhelpful, it is measurably harmful: identity has the lowest holdout
Brier in all four folds, expected calibration error roughly doubles on Fold A, and fitted
curves transfer negatively across engine generations by up to +0.00624 Brier. The cause is
that per-cohort bias flips sign across an 8.1pp span, so no single monotone curve can serve
the archive. Separately, with AUC at 0.534–0.549 the engine beats a flat base-rate
prediction by only 0.0002–0.0017 Brier — the total headroom any recalibration could capture
is smaller than the noise in these estimates.

The identity mapping is not a placeholder to be replaced at the first opportunity. On this
evidence it is the correct choice, and the 2026-06 audit's "honest reset" is vindicated.

---

## Recommended Next Actions

1. **Keep `lib/calibration.ts` and `lib/calibration-v2.ts` at identity.** The four tests that
   pin this (`__tests__/calibration.test.ts:19,38`,
   `__tests__/dashboard-accuracy-disclosure.test.ts:373`,
   `__tests__/audit-v2-regression.test.ts:32`) should stay as they are. All 316 tests pass
   unchanged with this work in place.
2. **Fix the over-confidence with shrinkage, not isotonic.** Slope 0.58–0.78 says the outputs
   are too spread out. The engine already has the right knob — the `0.24` league-anchor
   weight. `scripts/run-backtest.ts --anchor-sweep` sweeps it. This is a locked-zone change
   to `ENSEMBLE_BLEND`, so it needs Tier-2 walk-forward CV (`scripts/deepnrfi/train.py`,
   `TimeSeriesSplit`) before promotion — but it is the intervention the diagnostics actually
   point at.
3. **Persist the raw pre-calibration probability before any future refit.** Add a
   `calibrated7` / `rawEnsemble7` column on `ModelPrediction` (or start writing
   `EnsembleDiagnostic`, which already has the field and no writer). Today every offline tool
   reconstructs raw by inverting the anchor blend, which is exact *only* while calibration is
   identity — so shipping fitted knots would break the very tooling used to validate them.
   Already flagged at AUDIT_REPORT_V2.md:172.
4. **Homogenize the archive.** Re-run the historical recompute so 2024/2025 reflect the
   post-fix engine. Until then, cross-season fits are comparing different models, and the
   committed Fold B in particular should not be read as a clean 2026 holdout.
5. **Re-run this evaluation after (3) and (4).** With raw stored and one engine generation
   across seasons, a refit becomes a fair test. It is not one today.

### Known-stale, out of scope

`scripts/verify-backtest.ts` hardcodes the *pre-audit* knot table at `:47-53` and asserts
`calibrate(0.50) ≈ 0.542` (`:61`) and `LEAGUE_ANCHOR ≈ 0.559` (`:70`). Against today's
identity table those return 0.50 and 0.516. Confirmed by running it: the offline half exits
1 with seven failures — the two spline assertions, the anchor, the three
`weight[logisticMeta|nnInteraction|hierarchicalBayes] > 0` checks (all now 0), and the
clamp-bound check that depends on the old anchor. Pre-existing and unrelated to this
evaluation; untouched here.
