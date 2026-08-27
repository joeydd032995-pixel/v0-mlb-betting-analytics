# Calibration Spline — Walk-Forward Evaluation

**Verdict: HOLD.** No fold shows a detectable improvement from refitting, so
`lib/calibration.ts` stays the identity mapping.

Resolves the evaluation half of **AUDIT_REPORT.md P1-4** ("refit knots by isotonic
regression on a held-out season"). The refit was run. It does not earn promotion under
any reading of the data.

| | |
|---|---|
| Run date | 2026-08-27 |
| Script | `scripts/refit-calibration.ts` (diagnostic; never writes knots) |
| Headline command | `PRISMA_NEON_HTTP=true NODE_ENV=development npx tsx scripts/refit-calibration.ts --pool=verified --folds=engine-aware` |
| Data | 9,132 system-level scored predictions, `model_predictions ⋈ game_results`, 2023–2026 |
| Bootstrap | 2,000 paired resamples, seed 20260827 (verdict stable at seed 424242) |

---

## Inversion validity — which rows can be used at all

No raw pre-calibration probability is persisted (`EnsembleDiagnostic.rawEnsemble7` has no
writer), so raw must be recovered by inverting the deployed transform. **That inversion
depends on which engine wrote the row, and the archive contains two.**

Commit `09baf70` (2026-06-09T22:20:23Z, "Fix all findings from the prediction-engine
audit") reset the knots to the identity and moved `LEAGUE_ANCHOR` from 0.559 to 0.516.
Rows written before it went through non-identity knots and the 0.559 anchor:

```
PRE_FIX    final = 0.76·calOld(raw) + 0.24·0.559      (OLD_KNOTS, git show 09baf70^)
POST_FIX   final = 0.76·raw         + 0.24·0.516      (identity knots)
```

Inverting a PRE_FIX row with the POST_FIX formula does not return its raw ensemble. The
script now inverts each row with the pipeline that actually produced it, `OLD_KNOTS`
inverted analytically for the pre-fix case.

**Dating a row's content is subtle.** `updatedAt` is bumped by settlement writes that never
touch `nrfiProbability` — every row in the archive has `updatedAt ≥ 2026-07-19`, which
proves nothing about the probability. The only positive evidence of a recompute is
`inputsPresence.recomputedAt` (present on 3,448 rows, all stamped 2026-07-19, comfortably
post-fix). Content date is therefore `recomputedAt` when present, else `createdAt`.

| Provenance | n | Meaning |
|---|---|---|
| **V** — verified post-fix | **3,444** | Recompute stamp ≥ the audit commit. Inversion provably valid. |
| U — unverified post-fix | 384 | Written live after the commit; no stamp, so provenance is inferred. |
| P — pre-fix pipeline | 5,304 | Inverted through `OLD_KNOTS`/0.559. Arithmetically correct, but the same commit fixed the P0-1 shrinkage scale bug, so this engine's raw is not commensurable with today's. |

The headline result uses `--pool=verified` (V only). Folds touching U or P rows are printed
and marked **PROVISIONAL**.

Clamp check: 0 of 9,132 rows sit on the `[0.18, 0.85]` boundary, so no row lost information
to clamping. The script asserts this and aborts rather than fitting corrupted inputs.

---

## Headline result — the only inversion-valid fold

**Fold EA-2: V/2023 (n=2,430) → V/2026 (n=1,014).** Train and holdout are both verified
post-fix, strictly time-ordered.

Four readings of the isotonic fit are evaluated, so the verdict cannot be an artefact of
how the fit is read back: *interp* is linear between pooled-block centres (what sklearn's
`IsotonicRegression`, and therefore `scripts/deepnrfi/recalibrate.py`, produces); *PAV step*
is the exact pool-adjacent-violators step function.

| Variant | Brier | log-loss | ECE | AUC | intercept | slope |
|---|---|---|---|---|---|---|
| **identity (deployed)** | **0.24970** | **0.69255** | **0.04202** | 0.5422 | −0.1523 | 0.7798 |
| naive (interp) | 0.24987 | 0.69291 | 0.04260 | 0.5422 | −0.1642 | 0.9498 |
| compensated (interp) | 0.24995 | 0.69314 | 0.04292 | 0.5422 | −0.1526 | 0.7709 |
| naive (PAV step) | 0.25022 | 0.69361 | 0.04263 | 0.5422 | −0.1613 | 0.9039 |
| compensated (PAV step) | 0.25030 | 0.69386 | 0.04318 | 0.5422 | −0.1511 | 0.7443 |

Paired Brier deltas vs identity, 95% bootstrap CI:

| Variant | ΔBrier [95% CI] |
|---|---|
| naive (interp) | +0.00017 [−0.00153, +0.00184] |
| compensated (interp) | +0.00024 [−0.00129, +0.00186] |
| naive (PAV step) | +0.00052 [−0.00143, +0.00241] |
| compensated (PAV step) | +0.00059 [−0.00124, +0.00240] |

Benchmark: predicting the train base rate 0.4979 flat scores 0.24991, so the engine's
0.24970 beats it by 0.00021 — the entire quantity a recalibration could be fighting over.

**Statistically this is "no detectable improvement", not "measurable harm".** Every CI spans
zero. The point estimates are positive (worse) in all four variants and every fold, which is
enough to fail a gate requiring demonstrated improvement, but not enough to assert the refit
actively damages Brier.

---

## Provisional folds (`--pool=all`)

| Fold | n train | n hold | identity Brier | Δ compensated (interp) | Best |
|---|---|---|---|---|---|
| A: 2024 → 2025 *(PROV)* | 2,427 | 2,430 | 0.24949 | +0.00047 | identity |
| B: 2024+2025 → 2026 *(PROV)* | 4,857 | 1,845 | 0.24920 | +0.00193 | identity |
| **EA-2: V/2023 → V/2026** | 2,430 | 1,014 | **0.24970** | **+0.00024** | **identity** |
| EA-1: P/2024 → P/2025 *(PROV)* | 2,427 | 2,430 | 0.24949 | +0.00047 | identity |

Identity wins every fold, provisional or not. The provisional folds are consistent with the
valid one; they are not what the verdict rests on.

---

## Recalibration measurably costs discrimination

AUC is rank-based and invariant under a **strictly** increasing transform. An isotonic fit is
only *non-decreasing* — flat pooled blocks, clipping knots to [0,1], and the output clamp all
collapse distinct scores into ties. Measured per variant rather than assumed:

| Fold | identity AUC | naive (interp) | comp (interp) | naive (PAV step) | comp (PAV step) |
|---|---|---|---|---|---|
| A | 0.5344 | 0.5344 | 0.5344 | **0.5286** | **0.5286** |
| B | 0.5486 | 0.5456 | 0.5456 | **0.5441** | **0.5441** |
| EA-2 | 0.5422 | 0.5422 | 0.5422 | 0.5422 | 0.5422 |

The step-function refit destroys 0.0058 of AUC on Fold A and 0.0045 on Fold B — larger than
the Brier effect it was chasing. A refit is not a free calibration-only change.

---

## Why the refit fails — the mechanism, tested

An earlier draft of this report claimed that per-cohort bias flipping sign meant "no single
monotone curve can serve both cohorts". **That claim was wrong and has been removed.**
Opposite *aggregate* biases do not establish incompatibility: a monotone curve may cross the
identity line — shrinkage toward the league mean raises low probabilities and lowers high
ones — and cohorts with different prediction distributions can both be helped by one curve.

The claim is only testable by conditioning on matched raw values. Realized NRFI rate minus
mean raw, within shared raw-probability bins (verified cohorts):

| raw bin | V/2023 | V/2026 |
|---|---|---|
| [0.40, 0.45) | +0.063 (n=490) | −0.040 (n=100) |
| [0.45, 0.50) | +0.014 (n=728) | +0.005 (n=209) |
| [0.50, 0.55) | −0.011 (n=528) | −0.033 (n=286) |
| [0.55, 0.60) | −0.070 (n=235) | −0.103 (n=247) |

**Three of four bins agree in sign.** So the failed transfer is an empirical result, not a
structural impossibility — and the agreeing bins show a clear, consistent pattern: low raw
under-predicts, high raw over-predicts, in *both* cohorts. That is over-dispersion, exactly
what the calibration slope of 0.78 reports. It is a shrinkage problem.

Two concrete reasons isotonic fails to capture it:

1. **The knot grid is mostly extrapolation.** The V/2023 training raw values span
   0.2574–0.7402, but the deployed grid runs 0.05→0.95. Ten of nineteen knots sit outside the
   data. The isotonic clip pins them flat — the emitted table repeats `0.1803` for the first
   five knots — and the deployed curve then applies that to any holdout row in those regions.
2. **The signal is smaller than the fit's own noise.** With AUC ≈ 0.54 and the engine beating
   a flat base rate by 0.0002–0.0017 Brier, a 19-knot free-form fit on ~2,400 points has more
   variance than the effect it is estimating.

---

## Subgroup analysis

Not reported by park, pitcher tier, weather bucket, or handedness. With whole-sample effects
of ±0.0006 Brier and CIs of ±0.002, slices of 100–400 games have error bars an order of
magnitude wider than any effect being measured. The provenance and conditional-bin analyses
above are the subgroup work that carries signal.

**No ROI leg.** `nrfiOdds`/`yrfiOdds` are NULL on all 9,132 rows, so the repo's usual "ROI in
the ≥3% edge bucket" gate cannot be evaluated against real prices. `lib/synthetic-odds.ts`
states in its own header that its lines are fabricated, and an ROI whose edge is defined as
`λ·(modelProb − base)` would be partly circular. Omitted rather than dressed up.

---

## Pass / Fail / Improve

| Component | Verdict | Basis |
|---|---|---|
| Per-pipeline inversion | **Pass** | Each row inverted with the engine that wrote it; clamp non-binding asserted |
| Isotonic fit machinery | **Pass** | PAV correct; both step and interpolated readings evaluated |
| Compensated knots (either reading) | **Fail** | No detectable improvement in any fold; point estimates all positive |
| Naive knots | **Fail** | Same, and structurally wrong — the anchor blend re-biases the fitted output |
| Discrimination under refit | **Fail** | AUC drops up to 0.0058; recalibration is not cost-free here |
| Knot-grid coverage | **Fail** | 10 of 19 knots lie outside the training raw range and extrapolate flat |
| Identity baseline | **Pass** | Lowest Brier in every fold; beats a flat base-rate prediction in every fold |
| Raw-probability persistence | **Fail** | Nothing stored; every offline tool depends on a pipeline-specific inversion |

---

## Verdict

**HOLD.**

On the only fold whose inversion is provably valid (V/2023 → V/2026), all four refit variants
score worse than identity on Brier, log-loss and ECE, with every confidence interval spanning
zero — no detectable improvement, which fails a promotion gate requiring demonstrated gain.
The step-function refit additionally costs measurable AUC in two of three folds. Total
headroom is bounded by the engine beating a flat base rate by just 0.0002–0.0017 Brier.

The identity mapping is not a placeholder to be replaced at the first opportunity. On this
evidence it is the defensible choice, and the 2026-06 audit's "honest reset" holds up.

---

## Recommended Next Actions

1. **Keep both knot tables at identity.** The four tests pinning this
   (`__tests__/calibration.test.ts:19,38`, `__tests__/dashboard-accuracy-disclosure.test.ts:373`,
   `__tests__/audit-v2-regression.test.ts:32`) should stay. All 316 tests pass with this work.
2. **Attack over-dispersion with shrinkage, not isotonic.** Slope 0.74–0.78 and the
   conditional-bin table both say the outputs are too spread out, consistently across cohorts.
   The engine already has that knob — the `0.24` league-anchor weight — and
   `scripts/run-backtest.ts --anchor-sweep` sweeps it. Locked-zone (`ENSEMBLE_BLEND`), so it
   needs Tier-2 walk-forward CV (`scripts/deepnrfi/train.py`, `TimeSeriesSplit`) before
   promotion. This is a one-parameter fit, not nineteen, which is the right complexity for the
   amount of signal present.
3. **If isotonic is retried, restrict the knot grid to the observed raw range** and shrink the
   fit toward identity. Ten extrapolated knots are actively harmful.
4. **Persist the raw pre-calibration probability.** Add a `rawEnsemble7`/`calibrated7` column
   (or start writing `EnsembleDiagnostic`, which has the field and no writer). Every offline
   tool currently reconstructs raw by inverting a pipeline that has already changed once —
   this evaluation had to reverse-engineer two engines from git history to stay correct.
   Flagged at AUDIT_REPORT_V2.md:172.
5. **Homogenize the archive.** Re-run the historical recompute so 2024/2025 carry a
   `recomputedAt` stamp from the current engine. That would move 5,304 rows from provisional
   to usable and make a future refit a fair test.

### Known-stale, out of scope

`scripts/verify-backtest.ts` hardcodes the *pre-audit* knot table at `:47-53` and asserts
`calibrate(0.50) ≈ 0.542` (`:61`) and `LEAGUE_ANCHOR ≈ 0.559` (`:70`). Confirmed by running
it: the offline half exits 1 with seven failures — the two spline assertions, the anchor, the
three `weight[...] > 0` checks (all now 0), and the clamp-bound check keyed to the old anchor.
Pre-existing and unrelated to this evaluation; untouched here.
