# NRFI/YRFI Engine — Audit V2: Training-Pipeline Parity & Evaluation Integrity

**Date:** 2026-07-17
**Scope:** Everything *after* the 2026-06 remediation ([AUDIT_REPORT.md](./AUDIT_REPORT.md) / [AUDIT_FIXES.md](./AUDIT_FIXES.md)) — the DeepNRFI training pipeline (`scripts/deepnrfi/`), the recalibration/backtest tooling, and residual engine-design risk.
**Method:** Line-by-line re-derivation, plus numerical experiments executed through the real engine (`vitest`) and the real builder functions (Python). Every number below was produced by code in this repo, not estimated.
**Verdict:** The June remediation held — the live engine is level-correct, monotone, and bounded (re-verified §4.1). The **new critical surface is the training pipeline**: five independent train/serve skews meant the LightGBM stacker was trained on features whose scale, spread, or sign differ from what the serving path emits — sufficient on its own to explain the manifest's walk-forward **Brier 0.24995 ≈ 0.2497 base rate** (`best_iter` 1–3 per fold: the model learns almost nothing, then what little it learns doesn't transfer). This PR fixes the skews at the source and hardens the evaluation tooling; retraining requires DB access and is the specified next step.

---

## 1. Answer first — what changed in this PR

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| V2-1 | **P0** | Builder shrank the pitcher NRFI rate toward the **game-level 0.516 with k = 1.14** while serving shrinks toward the **half-inning 0.718 with k = 30/80** — the original P0-1 scale bug, reintroduced in the training pipeline. Measured: training feature mean ≈ 0.687 vs serving ≈ 0.719, **2.24× the serving spread** (0.252 vs 0.113 over obs 0.55→0.85). | `transforms.serving_shrunk_nrfi` — exact port of the live chain (`estimateNrfiRateFromFirstInningRuns` → `applyDynamicShrinkage`), driven by season-to-date runs-per-1st |
| V2-2 | **P0** | Training `weather_wind_in_out` was `wind_mph × cos(compass FROM-bearing)` with park orientation hard-coded to 0 for all 30 stadiums and **the sign inverted** relative to the live convention (wind blowing FROM the CF bearing is "in", not "out"). Serving emits a ±1/0 token. The training column was noise on a ±30 scale. | `transforms.wind_in_out_token` — exact port of `mapWindDirection` (sector logic, 3-mph calm cutoff) + `CF_BEARING_DEG` table ported from `lib/constants/mlb-stadiums.ts` |
| V2-3 | **P1** | Training `ensemble7_nrfi` came from `ModelPrediction.ensembleNrfi` = the **final post-anchor, post-clamp** headline probability; serving passes the **pre-anchor** `calibrated7`. Affine compression by 0.76 around 0.516 — measured divergence up to **±0.056** over the realistic range, on the stacker's top-gain feature. | `transforms.invert_league_anchor` applied in the builder and `refresh_ensemble7_column.py`; `FINAL_BLEND_CONTRACT` exported from `lib/nrfi-engine.ts` and pinned by a cross-language contract test |
| V2-4 | **P1** | Distribution mismatch on most pitcher features: `start_count` 0–6 (30-day window) vs 0–33 (season) at serving; `k_rate/bb_rate/hr_per9/babip` were 30-day **all-innings** aggregates vs serving's **season first-inning** (sitCodes=i01) splits; velo/spin/stuff 30-day vs season pitch-mix; `recent_form` was the window rate, serving is the last-5 rate. | Builder restructured to **season-to-date slices** (strictly `< game_date`, same season): first-inning-only rate stats, season start counts, last-5 recent form, tail-based recency features |
| V2-5 | **P1** | `recalibrate.py` fit isotonic regression on the **final** stored probability, but its knots get pasted into `lib/calibration.ts`, which is applied to the **raw pre-anchor** ensemble — and the anchor blend runs *after* the spline, re-biasing the freshly calibrated output toward 0.516. A refit executed with the old script would have shipped a mis-calibrated engine while claiming the opposite. | Rewritten: inverts the anchor (exact under the current identity knots), fits on the raw scale, emits **anchor-compensated** knots; `--ensemble-blend 1.0` supports retiring the anchor when fitted knots ship |
| V2-6 | **P2** | `backtest_v2.py` capped simulated stakes at **0.25 of bankroll vs the production cap 0.05** (`CONFIG.kelly.maxBet`) — up to 5× overbet on high-edge rows — and its `|edge| ≥ 0.03` trigger classified p ∈ [0.446, 0.494] as YRFI bets although the YRFI-side edge there is below the production threshold. | Per-side edges (`nrfi_edge`, `yrfi_edge`) gated independently; cap aligned to 0.05 |
| V2-7 | **P2** | Spring-training/exhibition pitches polluted early-season Statcast windows (no `game_type` filter). | Filter to regular season + postseason |
| V2-8 | **P3** | Builder loop masked the full ~1.4M-row Statcast frame per game (~5k games). | One-time `groupby(...).indices` for pitcher/batter; per-game slices are O(player rows). Bonus of the parity restructure. |

**Documented, not fixed here (need DB/data, or are product decisions):** V2-9…V2-14 in §2.2.

Verification: **153/153 vitest** (146 baseline + 7 new regression guards), **type-check clean**, **31/31 `test_transforms.py` asserts** (each re-derived independently), **47/47 `verify_builder_features.py` asserts** (extended with serving-parity plumbing checks), `py_compile` + `make_row` smoke on all touched Python. Full evidence in §4.

---

## 2. Reasoning — the audit

### 2.1 Why the stacker failed its Brier gate (root-cause chain)

The manifest (`scripts/deepnrfi/artifacts/manifest.json`) records walk-forward Brier **0.24995** and log-loss **0.69305** over 6,600 rows with per-fold `best_iter` ∈ {1, 2, 3} — statistically indistinguishable from predicting the 0.516 base rate every time (Brier 0.2497). Three compounding causes, in order of importance:

1. **Train/serve skew (V2-1…V2-4).** LightGBM split thresholds are absolute values. A split learned at `shrunk_nrfi ≤ 0.65` on the training distribution (mean 0.687, spread 0.25) routes nearly *all* serving traffic (mean 0.719, spread 0.11) down one branch. The wind feature was worse: training values on ±30 mph-cosine scale, serving values in {−1, 0, +1} — every serving value falls in the training distribution's dead center. Even *in-fold* CV suffers, because several features (notably the noise-encoded wind) carry no real signal to begin with, encouraging early stopping at 1–3 trees.
2. **Degraded stacking feature (V2-9).** `ensemble7_nrfi` rows in `model_predictions` were computed by historical-sync with month-average temperatures, no odds, no lineups (`inputsPresence` records this), and — unless `recompute=true` was run after 2026-06-09 — with the *pre-remediation* engine whose center bias was −3 pts. The stacker's most important input was a blurred copy of the signal it was supposed to sharpen.
3. **Low ceiling, thin data.** First-inning run scoring is close to irreducibly noisy; realistic skill is Brier ≈ 0.244–0.248 vs the 0.2497 floor. 6,600 usable walk-forward rows leave ~±0.005 sampling noise on a fold Brier — the gate itself is barely resolvable at this n. Two full recomputed seasons (~4,800 games) plus 2026-to-date should be treated as the minimum retraining corpus.

Falsifier honored: if the skews were *not* load-bearing, fixing them would leave the retrain Brier unchanged — the promotion gate (§4.4) makes that outcome an explicit HOLD, not a failure of this PR, which is justified by correctness alone.

### 2.2 Findings documented but intentionally not fixed here

| # | Sev | Finding | Recommendation |
|---|-----|---------|----------------|
| V2-9 | **P0 (process)** | Training labels/features were built against `ensembleNrfi` rows computed with degraded inputs and (likely) the pre-fix engine. | Run `/api/historical-sync?recompute=true` for all training months, then `refresh_ensemble7_column.py` (now anchor-inverting), then rebuild + retrain. Never retrain on rows whose `recomputedAt` predates the current engine constants. |
| V2-10 | P1 (design) | Signal routing: the pitcher's *actual first-inning scoreless rate* reaches only ~22% of ensemble weight (Poisson 12% + MAPRE 10%); Markov (48%) reads only WHIP/K/BB/HR9. Measured: sweeping `nrfiRate` 0.45→0.92 alone moves the headline just **3.4 pts** (0.530→0.564). With realistically co-varying stats the engine spans 0.44→0.60 (§4.1), so this is a weight-refit consideration, not a live bug. | Fold into the walk-forward `ENSEMBLE_WEIGHTS` re-fit (locked zone — requires CV evidence per the repo's own policy). |
| V2-11 | P2 (dead code) | `careerFirstInnings` is declared in `lib/types.ts` but **never populated by any production path**, so `getDynamicPriorWeight`'s fallback `startCount × 3 ≤ 99 < 100` makes **k = 30 for every non-bullpen pitcher** — the k = 50 "full-time starter" tier is unreachable. `transforms.py` deliberately mirrors the *actual* behavior (test pins `dynamic_prior_weight(33) == 30`). | Either populate career first innings from MLB career stats or delete the k = 50 branch and its comment. Do not "fix" transforms.py to the nominal design — parity means matching production. |
| V2-12 | P2 | `weather_precip_prob`: binary 0/1 in training (precip occurred) vs {0, 0.6} or OWM pop [0,1] at serving. | Low priority; align when the weather adapter is next touched. |
| V2-13 | P2 | Day games sampled at hour-19 archive weather in the builder (`GAME_HOUR_LOCAL = 19`); the TS historical path already accepts first-pitch time (P2-14 fix) but the Python builder doesn't. | Thread `gameDate` UTC hour into `fetch_game_weather`; ~35% of slates are day games. |
| V2-14 | P3 | `MONTHLY_LAMBDA_FACTOR`, recent-form slope −0.30, MAPRE multiplier slopes, and the base-four `ENSEMBLE_WEIGHTS` remain design-intent constants, honestly labeled as such. | Only via the walk-forward harness; do not hand-tune. |

### 2.3 What was re-verified and found correct (no action)

- **Live engine levels** (post-remediation): league-average → base rate (pinned test), ZIP league anchor `0.7182` vs target `0.7183`, monotone in pitcher rate and park factor, no NaN and clamps hold under adversarial extremes (28°F/25 mph-in/rookie-0.92-in-1-start vs 105°F/30 mph-out/Coors, umpire ±0.5) — §4.1.
- **Environment routing**: each model sees park/weather/umpire exactly once (traced through `computeNRFIPrediction`; exact λ-scaling for Markov/MAPRE is algebraically valid: P(0)^m = e^(−mλ)).
- **Point-in-time integrity of the builder** (pre-existing): Statcast slices strictly `< game_date`; umpire map walks prior games only; travel/rest map built on the full date-sorted slate; boxscore lineups are the posted card. **No same-game or future leakage found** — the builder's problem was parity, never leakage. The season-to-date restructure preserves the strict `< game_date` bound (same predicate, wider window).
- **Kelly/odds math in the live path**: per-side edges vs vigged implied, quarter-Kelly inside a 5% cap, liquidity guard on overround ∈ [1.0, 1.15], no-vig fair probabilities sum to 1.
- **LightGBM text-format tree walker** (`lib/deepnrfi-model.ts`): split/leaf indexing, `default_left` NaN routing, missing-mode and categorical rejection — correct; the (unsupported) init-score is genuinely absent from binary text dumps because LightGBM folds `boost_from_average` into tree 0's leaves.

---

## 3. Phase 1 & 3 — improvement plan and efficiency

### 3.1 Model improvements (priority order, JSON plan)

```json
[
  {
    "id": "IMP-1",
    "title": "Rebuild training set with the parity builder, retrain with monotone constraints",
    "commands": [
      "GET /api/historical-sync?recompute=true  (all training months, post-fix engine)",
      "python scripts/deepnrfi/build_real_training_set.py --from 2023-04-01 --to 2025-09-30",
      "python scripts/deepnrfi/validate_features.py",
      "python scripts/deepnrfi/train.py --version v3",
      "python scripts/deepnrfi/backtest_v2.py --season 2026"
    ],
    "notes": "Add LightGBM monotone_constraints: +1 on {home,away}_pitcher_shrunk_nrfi and ensemble7_nrfi, -1 on {home,away}_top4_ops and park_factor. Constraints are the cheapest defense against 8k-row overfitting.",
    "expected_impact": "Recover stacker trainability; gate: Brier < v1 by >= 0.002 out-of-sample, else HOLD (flags stay OFF).",
    "leakage_risk": "low — same point-in-time slices, wider window"
  },
  {
    "id": "IMP-2",
    "title": "Market-anchored feature: opening NRFI implied probability",
    "notes": "Capture open + close via the existing odds columns and a snapshot cron; add no_vig_open_implied as a feature (and the only sane baseline for CLV). The market is the strongest single predictor available; blending model-vs-market in logit space (fit one scalar b on held-out data) is the highest-certainty Brier win in this repo.",
    "expected_impact": "Brier -0.002 to -0.005 vs model-only; enables CLV reporting",
    "leakage_risk": "low if strictly pre-game snapshots; never use closing lines as features for bets placed earlier"
  },
  {
    "id": "IMP-3",
    "title": "Turn on real lineups + umpire profiles in production",
    "notes": "USE_REAL_LINEUPS exists and degrades gracefully; umpire-profiles table is generated and point-in-time in training. Both are dead in live predictions today.",
    "expected_impact": "small (+0.5-1 pt effective range on affected games), zero new infrastructure",
    "leakage_risk": "none"
  },
  {
    "id": "IMP-4",
    "title": "Walk-forward re-fit of ENSEMBLE_WEIGHTS (base four) and calibration knots",
    "notes": "Locked zone by repo policy — requires the recompute + a held-out season. Use scripts/deepnrfi/recalibrate.py (now anchor-aware); prefer --ensemble-blend 1.0 and retire the anchor once fitted knots ship (isotonic already shrinks toward the mean).",
    "expected_impact": "addresses V2-10; unblocks non-identity calibration",
    "leakage_risk": "medium — keep 2026 out of every fit"
  },
  {
    "id": "IMP-5",
    "title": "Retire or train the logistic stacker mode",
    "notes": "combine9Models' static 0.75/0.20/0.05 weights are design-intent. After IMP-1, fit the logistic stacker on out-of-fold predictions only.",
    "expected_impact": "small; cleanliness",
    "leakage_risk": "low with OOF discipline"
  }
]
```

### 3.2 Efficiency (measured / bounded)

- **Serving is not a bottleneck.** `computeNRFIPrediction` is sub-millisecond flags-off (Markov chain runs on two 24-slot `Float64Array`s; full 153-test suite: 145 ms of test time). A 15-game slate is ≪ 50 ms on Vercel Node. No optimization warranted.
- **Monte Carlo (flag-off by default):** 8,000 sims ≈ 30 ms/game. At its 5% stacker weight, halving to 2,000 sims moves the headline by σ ≈ 0.0006 — turn this knob (`MONTECARLO_SIMS`) before ever scaling hardware.
- **DeepNRFI inference:** booster eval is microseconds; the per-feature ablation in `computeContributions` is the hot spot (69 features × full booster re-eval ≈ 28k tree walks/game ≈ low ms) — fine at slate scale; make it lazy if it ever surfaces in traces.
- **Builder (fixed here, V2-8):** replacing per-game full-frame masks with one-time `groupby(...).indices` removes ~5k × O(1.4M) row scans; the loop's Statcast cost now scales with per-player row counts (~10³). Remaining wall-clock is dominated by the (cached, resumable) boxscore fetches — unchanged and already rate-limit-polite.
- **Cost:** the whole pipeline (build + train + backtest) fits a single 4-vCPU Hetzner box in < 1 h with warm caches; nothing here needs GPU or a bigger instance.

---

## 4. Phase 4 — verification

### 4.1 Engine re-derivation (executed through the real `computeNRFIPrediction`)

| Experiment | Result | Assessment |
|---|---|---|
| League-average fixture (June, neutral last-5) | pinned ≈ 0.516 by existing regression test | ✅ level holds |
| Correlated quality sweep q = 0→1 (both pitchers) | 0.4406 → 0.6034, strictly monotone | ✅ span 0.163; guarded at [0.12, 0.40] by new test |
| `nrfiRate`-only sweep 0.45→0.92 | 0.530 → 0.564 | ⚠️ V2-10 (routing), documented |
| Park factor sweep 0.85→1.20 | 0.582 → 0.508, strictly decreasing | ✅ |
| ZIP at league inputs | 0.7182 vs target 0.7183 | ✅ |
| Adversarial extremes (4 cases: heat/cold/wind/ump/rookie-vs-vet) | 0.396–0.637, all finite, clamps respected | ✅ |
| MAPRE monotone in λ; anchor-inversion round-trip | monotone; exact to 1e-12 inside clamp | ✅ |

### 4.2 Train/serve skew — before vs after (measured)

| Feature | Before (training) | After (training) | Serving |
|---|---|---|---|
| `shrunk_nrfi` (obs 0.72) | 0.646–0.687 (n = 2–6) | 0.716–0.722 | 0.7185–0.7190 |
| `shrunk_nrfi` spread (obs 0.55→0.85) | 0.252 | ≈ serving (same formula, same n scale) | 0.113 |
| `wind_in_out` | ±30 continuous, sign inverted, no park orientation | {−1, 0, +1}, exact `mapWindDirection` port | {−1, 0, +1} |
| `ensemble7_nrfi` (cal = 0.75) | 0.694 (post-anchor) | 0.75 (inverted) | 0.75 (pre-anchor) |
| `start_count` | 0–6 | 0–33 (season-to-date) | 0–33 |
| `k_rate` etc. | 30-day all-innings | season first-inning events | season i01 split |

### 4.3 Test evidence

- `pnpm test`: **153/153** (10 files) — includes new `__tests__/audit-v2-regression.test.ts`: final-blend contract pin, anchor round-trip, wind-token domain, shrinkage-chain equality, pre-anchor pass-through, season-scale start_count, dynamic-range guard.
- `pnpm type-check`: clean. `eslint` on touched files: no new findings.
- `python3 scripts/deepnrfi/test_transforms.py`: **31/31**, every expectation re-derived independently of the function under test.
- `python3 scripts/deepnrfi/verify_builder_features.py`: **47/47** including new serving-parity plumbing checks.
- `py_compile` on all six touched Python files + `make_row` smoke (wind token at Wrigley both directions, anchor inversion, defaults, exact column set).

**Failing case found and resolved during work:** the initial single-feature sensitivity sweep suggested catastrophic output compression (3.4 pts); the correlated-archetype sweep falsified that interpretation (16.3 pts) — recorded as V2-10 instead of a defect, and the dynamic-range guard now prevents silent regression in either direction.

### 4.4 Production-readiness checklist

- [x] All flags default OFF; v1 path bit-identical (verified by unchanged baseline tests)
- [x] Training pipeline emits serving-scale features (V2-1…V2-4)
- [x] Evaluation tooling cannot ship a mis-scaled calibration (V2-5) or non-production staking (V2-6)
- [x] Cross-language constants pinned by tests on both sides
- [ ] Historical recompute (`recompute=true`) executed for all training months — **required before retrain** (V2-9)
- [ ] Retrain v3 + `backtest_v2.py` on held-out 2026; promotion gate: **Brier(v3) < Brier(v1) − 0.002 AND ROI@≥3%-edge(v3) ≥ ROI(v1)**, else HOLD
- [ ] Closing-line capture cron → CLV (the only trustworthy long-run edge metric; ROI at −110 synthetic odds is a simulation, not evidence)
- [ ] Non-identity calibration refit on a held-out season (after recompute), preferably with `--ensemble-blend 1.0`

## 5. Risks / next

1. **Retraining may still HOLD.** Parity is necessary, not sufficient — at ~8k rows against a 0.2497 floor, real NRFI skill is a 0.002–0.005 Brier edge; the gate must be respected even if it means the stacker never ships.
2. **Inversion validity window.** `invert_league_anchor` is exact only while the calibration knots are identity. The moment fitted knots ship, add a `calibrated7` column to `ModelPrediction` and stop inverting (noted in code at every call site).
3. **Bearing-table drift.** `CF_BEARING_DEG` (Python) mirrors `STADIUM_CF_BEARING` (TS) by hand; a new stadium updates two files. The contract test covers the blend constants but not the bearing table — acceptable at 30 rows, flagged here.
4. **Do not evaluate on tuned seasons.** 2024–25 shaped multiple constants; 2026 is the only clean holdout and every month of it spent on fitting is a month lost for evaluation.
