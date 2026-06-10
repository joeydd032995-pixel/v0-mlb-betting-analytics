# Audit Remediation — Status of Every Finding in AUDIT_REPORT.md

**Date:** 2026-06-09 (same branch/PR as the audit).
All fixes verified by `pnpm test` (126 tests, including the new
`__tests__/audit-regression.test.ts` guards) plus an end-to-end scenario trace
through the real engine.

## Measured before → after (real pipeline, synthetic matchups)

| Scenario | Before | After | Reference |
|---|---|---|---|
| League-average everything | P(NRFI) **0.4853** (−3.1 pts vs base rate) | **0.5172** (+0.1 pt) | base rate 0.516 |
| Twin aces (Petco, 55°F, wind in) | 0.6047 | **0.6910** (STRONG_NRFI) | market ≈ 0.65–0.70 |
| Bad pitchers (Coors, 90°F, wind out) | 0.3324 | **0.2932** | environment now reaches headline |
| Markov half-inning P(0), league inputs | 0.610 | **0.718** | empirical ≈ 0.72 |
| Per-PA HR probability, league inputs | 0.0754 | **0.0324** | league ≈ 0.031 |
| Implied per-PA OBP, league inputs | 0.380 | **0.314** | league .314 |
| Backtest quarter-Kelly stake, p=0.58 @ −110 | 0.0495 | **0.0295** | (b·p−q)/b × 0.25 |
| MAPRE jump across λ_total 0.79→0.81 | +0.079 | **continuous** | monotone, no step |

## P0 — Critical

| ID | Status | Fix |
|---|---|---|
| **P0-1** Scale mismatch: half-inning rate shrunk toward game-level 0.516 | ✅ Fixed | New `LEAGUE_HALF_NRFI = √0.516 ≈ 0.718` (`lib/nrfi-models.ts`); both shrinkage paths target it. `estimateNrfiRate` recalibrated so `estimate(league ERA) === LEAGUE_HALF_NRFI` exactly (coefficient derived at module load, absorbs Poisson-P(0) underestimate + unearned runs + fresh-arm advantage). Regression test pins `engine(league-average) ≈ 0.516 ± 0.03`. |
| **P0-2** "First-inning" stats were season proxies; `barrelDev ≡ 0`, `babip ≡ 0.3` | ✅ Fixed (live path) | New `fetchPitcherFirstInningSplits` (MLB API `sitCodes=i01`, verified live) supplies REAL first-inning ERA/WHIP/K%/BB%/HR9/BABIP/runs/games; `nrfiRate` now derives from actual first-inning runs (`estimateNrfiRateFromFirstInningRuns`). `firstInning.era` ≠ `overall.era` → `computeBarrelDev` and `M_BAbip` are live inputs. Season-ERA proxy retained ONLY for the point-in-time backfill (the aggregate split would leak future games) and as the no-split fallback. |
| **P0-3** Backtester `Math.abs(americanOdds)` Kelly bug (+68% stake at −110) | ✅ Fixed | Signed odds preserved end-to-end in `lib/backtest-metrics.ts`; regression test pins the −110 payout. **Stored `BacktestRun` rows predate the fix — re-run backtests.** |

## P1 — High

| ID | Status | Fix |
|---|---|---|
| P1-1 PA unit errors (`hrPer9/9`, `WHIP/3.5`) | ✅ Fixed | `hrPer9/38.7` and `WHIP/4.25` (`nrfi-models.ts:computePAOutcomes`); stale `LEAGUE_HR_RATE` 0.034 → 0.030. Regression tests pin HR/PA, OBP, and Markov half-P(0) to league scale. |
| P1-2 Park/weather only reached the 10.9%-weight Poisson | ✅ Fixed | Environment routed once per model: ZIP gets `park × wind/humidity × form` through its log-linear λ (monthly excluded — ZIP uses real temp, fixing P2-9 double-count); Markov & MAPRE get the full λ multiplier via exact λ-scaling `P(0)^m`. Regression test: Coors-vs-Petco headline spread > 4 pts. |
| P1-3 YRFI bets priced at NRFI line, edge vs complement of vigged NRFI prob | ✅ Fixed | `BacktestRow.yrfiOdds` added; each side's edge and payout use its own line; `nrfiOdds`/`yrfiOdds` columns added to `ModelPrediction` and written by historical-sync; backtest route passes them through. |
| P1-4 Calibration knots unverifiable / failed to correct bias; v2 hand-nudged | ✅ Fixed (honest reset) | Both knot tables reset to the **identity** — the old knots were fitted to the pre-fix engine's distribution and would have ADDED a +0.04 NRFI bias after these fixes. The fixed engine is anchored at the league mean by construction (pinned by test). Refit only via `scripts/deepnrfi/recalibrate.py` on a held-out season. `LEAGUE_ANCHOR` is now exactly 0.516. |
| P1-5 MAPRE NegBin discontinuity + inverted correlation sign | ✅ Fixed | `combineMAPREHalves` rewritten: per-half Poisson product (clumping is absorbed upstream in the rate calibration) + continuous ρ ramp; positive correlation now RAISES P(0,0): `p_h·p_a + ρ√(p_h(1−p_h)p_a(1−p_a))`. Continuity + monotonicity tests added. MAPRE λ floor 0.35 → 0.10 (old floor bound every league-average matchup on the new scale). |
| P1-6 Meta-models: not probabilities / double-shrunk / no information | ✅ Fixed | Blend weights set to 0 (display-only; restore only with walk-forward CV evidence). Values fixed to correct scales for the UI: logisticMeta = base-4 weighted average (unvalidated σ squash removed); nnInteraction normalised by `LEAGUE_HALF_NRFI` (now a real probability, game level = product); hierarchicalBayes = the shrunk rate itself (double regression removed). |
| P1-7 In-sample evaluation, no real odds, no CLV | 🔶 Partial | Odds plumbing now exists end-to-end (schema → sync → backtest). Markov structural bias correction (`MARKOV_CALIBRATION_EXPONENT ≈ 1.285`, derivation in code) also applied to the Monte Carlo output (same chain). **Deferred (requires data/infra, not code):** capturing closing lines for CLV, and a true held-out-season evaluation — run `scripts/deepnrfi/backtest_v2.py` on 2026 after a recompute, keeping 2026 out of any refit. |

## P2 — Medium

| ID | Status | Fix |
|---|---|---|
| P2-1 No vig stripping | ✅ | `ValueAnalysis.fairNrfiProb/fairYrfiProb` (multiplicative de-vig; sums to 1) + `noVigProbabilities` helper. Edges intentionally remain vs vigged lines (conservative), documented. |
| P2-2 Humidity sign inverted | ✅ | `lib/weather.ts`: humid air is less dense → more carry; magnitude corrected to the physical ±0.8%. |
| P2-3 Three divergent Kelly configs | ✅ | `CONFIG.kelly` (scaling 0.25, minEdge 0.03, maxBet 0.05) is the single source; engine + backtester import it; `utils/odds.ts` default 0.5 → 0.25. Engine stake cap is now 5% of bankroll (was a nominal 25%). |
| P2-4 ZIP doc target 0.62 contradiction | ✅ | ZIP λ₀ 0.42 → 0.435, derived so league-average inputs land exactly on `LEAGUE_HALF_NRFI`; comments updated. |
| P2-5 SIERA formula invented (positive K coefficient) | ✅ | Replaced with the published FanGraphs/Swartz 2011 formula; degrades to its K/BB core without batted-ball data. |
| P2-6 xFIP circular (FB back-estimated from HR) | ✅ | Estimate removed; `calculateXFIP` returns FIP explicitly when no fly-ball data exists (documented fallback). |
| P2-7 `woba = obp × 0.88` mis-scaled | ✅ | → `obp × 0.993` (wOBA is OBP-scaled by definition). |
| P2-8 Fabricated `firstBatterOBP` presented as observed | ✅ | UI factor copy now says "WHIP-based estimate"; derivation documented at the source. |
| P2-9 Monthly factor + ZIP temp double-count | ✅ | Monthly factor excluded from ZIP's environment input (ZIP uses the real game temperature); still applies to Poisson/Markov/MAPRE. |
| P2-10 Recent-form on 3–5 game samples, unshrunk | ✅ | Deviation shrunk by `n/(n+5)` before the ±15% clamp. |
| P2-11 First-bookmaker odds | ✅ | `extractNrfiOdds` line-shops the best price per side across all books (bookmaker label records both when they differ). |
| P2-12 Invented team splits (±0.02 yrfi, ×1.05 vs LHP) | ✅ | Removed — fields now carry the base rate until real split data exists. |
| P2-13 Phantom default pitchers indistinguishable | ✅ | `Pitcher.statsSource: "live" \| "default"` set by `mapPitcher`. |
| P2-14 Historical weather hardcoded to 7 PM local | ✅ | `fetchHistoricalWeather` accepts the game's UTC first-pitch time (from `gameDate`) and samples that hour; historical-sync passes it. |

## P3 — Low

| ID | Status | Fix |
|---|---|---|
| Stale CLAUDE.md ("no automated tests", P-spline naming, anchor value) | ✅ | Updated. |
| Stale historical-sync docstring (pre-AsOf description) | ✅ | Updated; matching UI copy in model-insights fixed. |
| `impliedToAmerican` division by zero at p ∈ {0,1} | ✅ | Input clamped to [0.0001, 0.9999]. |
| Deprecated unused `MODEL_CONFIG` export | ✅ | Removed (no consumers). |
| `combine9Models` all-NaN → silent 0 | ✅ | Returns NaN explicitly; engine falls back to the v1 calibrated ensemble. |
| No retry on external API calls | ✅ | `mlbFetch` retries once (5xx/network only, 400 ms backoff). |
| Caret ranges on framework deps | ⏸️ Deferred | `pnpm-lock.yaml` is committed (builds reproducible); repinning majors is a separate operational decision. |
| Model-insights educational page stale formulas | ✅ | All formula cards updated to the fixed engine (shrinkage prior, weights, ZIP λ₀, MAPRE combination, meta-model descriptions, anchor, Kelly cap, confidence copy). |

## Deferred items (need data/infrastructure, not code)

1. **Out-of-sample calibration refit** — knots are identity by design until
   `scripts/deepnrfi/recalibrate.py` is run on a held-out season of the
   *post-fix* engine (recompute historical predictions first via
   `/api/historical-sync?recompute=true`).
2. **CLV** — requires snapshotting closing lines near first pitch (cron + the
   new odds columns); no closing-line data exists yet.
3. **Ensemble weights / ENSEMBLE_BLEND CV validation** — `backtest_v2.py
   --free-weights` per the existing TODO; weights remain design-intent.
4. **Stored `BacktestRun` rows** — computed with the P0-3 bug; delete or re-run.
5. **First-inning splits for backfill** — the i01 split is season-aggregate
   (look-ahead for historical dates); the backfill correctly keeps the as-of
   ERA proxy. Per-date first-inning aggregation from game logs would close this.
