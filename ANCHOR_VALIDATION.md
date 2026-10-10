# League-anchor recalibration: end-to-end validation

Re-validation of the `LEAGUE_AVG_NRFI` 0.516 → 0.5056 change (PR #156) after an
automated review correctly rejected the original gate's method.

Reproduce with `scripts/validation/anchor-ab-harness.ts` +
`anchor-ab-compare.py` (header comments carry the exact commands). No DB and no
API keys needed — only the free MLB Stats API.

## 1. What was wrong with the original gate

The commit claimed:

> AUC is unchanged by construction: re-centring is strictly monotone and cannot
> reorder predictions.

Both halves of that are false.

The change is **not** a re-centring of the output. `LEAGUE_AVG_NRFI` is upstream
of four things that move independently:

| Moves | Where | Effect on a prediction |
|---|---|---|
| `LEAGUE_HALF_NRFI` as the shrinkage prior **target** | `applyDynamicShrinkage` | each pitcher moves by an amount depending on his sample size `n` and prior weight `k` ∈ {30, 50, 80} |
| `ERA_COEF`, `RUNS_COEF` | `lib/api/shared-helpers.ts` | rescales the exponent mapping ERA / runs-per-first → P(scoreless half) |
| `MARKOV_CALIBRATION_EXPONENT` | `lib/nrfi-models.ts` | 1.285 → 1.3249, changing the Markov component's level and so its weight in the blend |
| `ZIP_LAMBDA_AT_LEAGUE_AVG` | `lib/nrfi-models.ts` | 0.435 → 0.4488, same for ZIP |

Because the ensemble is a weighted sum of components each rescaled by a
different amount, ordering is not preserved. And the gate was computed by
applying a constant shift to **stored** predictions, which measures the
assumption rather than testing it.

## 2. Method

Both arms run the real deployed path — `fetchGamesByDate` → `buildAsOfSlate` →
`computeAllPredictions` → `fetchGameLinescore` — in separate checkouts
differing only in the constant. `globalThis.fetch` is patched to a shared
on-disk cache, so **both arms consume byte-identical raw MLB API responses**;
both the `old` and `wf` arms reported `hits=22208 misses=0`, which is the check
that the difference is attributable to the code alone.

The cache is restricted to `statsapi.mlb.com` and refuses to persist an
implausibly large body. Both guards came out of a CodeQL finding
(`js/http-to-file-access`) on the harness, and the host allowlist matters for
the result as well as for the write: patching *global* `fetch` would otherwise
cache any request an imported module made — `lib/api/live-data.ts` and
`weather.ts` can reach OpenWeatherMap and open-meteo — so "identical bytes"
would have been claimed of a wider surface than stated. Re-running the guarded
harness reports `passthrough=0`, confirming retrospectively that only MLB Stats
API responses ever entered the cache, and it reproduces the original
predictions to within 1e-12.

Ground truth is first-inning runs from the linescore. Full 2026 regular season,
**n = 2,428 scored games**. Paired bootstrap, 2,000 resamples.

Three arms:

| Arm | `LEAGUE_AVG_NRFI` | Provenance |
|---|---|---|
| `old` | 0.516 | pre-PR; fitted to a 2024–2025 window containing the 2024 outlier |
| `wf` | 0.50943 | mean of 2023–2025 — **uses no 2026 data**, so 2026 is a true holdout |
| `new` | 0.5056 | deployed value, all four complete seasons (2026 in-sample) |

## 3. Results

### The honest out-of-sample gate — `wf` (0.50943) vs `old` (0.516)

```
Brier      0.249313 → 0.249071   Δ −0.000241  95% CI [−0.000487, +0.000007]  P(improve) 0.972
LogLoss    0.691776 → 0.691285   Δ −0.000490  95% CI [−0.000986, +0.000010]  P(improve) 0.972
AUC        0.539319 → 0.539325   Δ +0.000006  95% CI [−0.000029, +0.000041]
Accuracy   51.936%  → 52.348%    Δ +0.412 pts
Kendall τ-a 0.999732 — 393 of 2,946,378 pairs invert (0.013%)
```

### The deployed value — `new` (0.5056) vs `old` (0.516)

```
Brier      0.249313 → 0.248969   Δ −0.000344  95% CI [−0.000733, +0.000049]  P(improve) 0.958
LogLoss    0.691776 → 0.691077   Δ −0.000699  95% CI [−0.001485, +0.000094]  P(improve) 0.958
AUC        0.539319 → 0.539326   Δ +0.000007  95% CI [−0.000035, +0.000049]
Accuracy   51.936%  → 52.306%    Δ +0.371 pts
Kendall τ-a 0.999576 — 623 of 2,946,378 pairs invert (0.021%)
```

### Not an affine shift

```
delta mean        −0.010235
delta sd           0.000499      (0 would mean a pure constant shift)
best-fit affine   p_new = 1.007905·p_old − 0.014318
residual RMS       0.00029746    max |residual| 0.00364124
```

A nonzero residual is the formal refutation of "by construction": an affine map
has zero residual and provably preserves order.

### Why the reordering is nonetheless immaterial

```
adjacent-gap median 0.000054, 10th pct 0.000007, min 0.000000
de-meaned delta: sd 0.000499, max |·| 0.002591, range 0.003243
gaps smaller than the de-meaned delta range: 2,415 / 2,427
```

Almost every adjacent gap is smaller than the perturbation, so inversions are
*possible* nearly everywhere — yet only 623 pairs actually invert, and the
inverted pairs are near-ties whose contribution to AUC is ~zero. Measured
ΔAUC is +0.000007 against the **0.0058 AUC** the isotonic refit rejected in
`CALIBRATION_WALK_FORWARD_REPORT.md` destroyed — roughly 800× larger.

## 4. Verdict

**Adopt** — but on different reasoning than the original commit gave.

1. **The ranking claim survives, now measured rather than asserted.** ΔAUC
   +0.000006 OOS, CI within ±0.00005. The reordering the review correctly
   identified exists and is negligible.

2. **The Brier claim does not survive as stated.** The commit reported
   `Δ −0.000307, 95% CI [−0.000546, −0.000183], excludes zero, P = 100%`. The
   correct OOS figure is `Δ −0.000241, 95% CI [−0.000487, +0.000007]`,
   P = 0.972 — the interval **includes zero**. The point estimate is close; the
   original CI was too narrow because shifting stored predictions by a constant
   suppresses the per-game variation the real recomputation has.

3. **So the Brier delta is a safety check, not the justification.** The
   justification is that 0.516 was a mis-estimate of the quantity it names:
   across 9,717 games of `GameResult` ground truth the four-season rate is
   50.56%, and 0.516 sat 1.04 pts high (z = 2.05, outside the 95% interval);
   against 2026 alone, 2.20 pts high. Preferring a correctly estimated constant
   to a demonstrably wrong one does not require a significant Brier gain — it
   requires evidence the correction does not cost ranking, which §3 supplies.

## 5. Risk and limits

- **Known.** The season rates (populations, not samples), the three arms'
  metrics above, the non-affine residual, the inverted-pair counts, and that
  both arms read identical raw bytes.
- **Assumed.** That the reconstructed slate is a fair stand-in for what the live
  path saw. It is not identical: it uses month-average weather and no odds (by
  design — `/api/backfill`'s leakage fix). It is self-consistent across arms,
  which is what a paired comparison requires, but absolute levels here are not
  the production dashboard's.
- **Unknown.** Whether the Brier gain is real. One season cannot resolve a
  −0.00024 effect. Resolving observation: the same comparison after 2027.
- **Flip condition.** If the next season's rate returns to ~51.5%, 0.5056
  becomes the mis-estimate. Year-to-year SD across these four seasons is
  ≈1.8 pts, so re-estimate every off-season; `lib/anchor-eras.ts` exists so
  that each re-estimation is recorded instead of silently rewriting history.
- **Unchanged by this work.** The engine still has almost no edge: 2026 AUC
  0.5393, accuracy 52.3% against a 52.381% break-even at −110. This
  recalibration is worth more than the model's entire measured edge, which is a
  statement about how small that edge is.
