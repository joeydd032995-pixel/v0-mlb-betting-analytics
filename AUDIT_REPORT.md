# MLB NRFI/YRFI Prediction Engine — Deep Quantitative Audit

**Date:** 2026-06-09
**Scope:** Full prediction pipeline — data ingestion → 7/9-model ensemble → calibration → odds/edge/Kelly → backtesting → reporting.
**Method:** Line-by-line formula extraction and cross-verification against canonical sources, plus numerical cross-validation by executing the real pipeline (`vitest`) on synthetic league-average / elite / bad-pitcher matchups. All numbers quoted below were produced by the actual code in this repo, not estimated.

---

## Executive Summary

The codebase is well-engineered software (clean separation, 110 passing tests, seeded RNG, point-in-time backfill, graceful degradation), but as a *quantitative* system it has a broken foundation: **the "first-inning pitcher stats" that drive every model are season-level proxies, the central pitcher rate is an ERA-derived estimate shrunk toward a constant on the wrong scale, and the result is a measurable systematic YRFI bias of ~3 points at the center of the distribution** (a league-average matchup outputs P(NRFI) = 0.485 against the engine's own league base rate of 0.516). Several published-formula deviations (Kelly sign bug in the backtester, HR-per-PA unit error in the Markov chain, park-blind ZIP/Markov models) compound this. The calibration layer that is supposed to fix aggregate bias is near-identity in the mid-range and demonstrably does not.

**Overall Prediction Engine Confidence Score: 4 / 10** (justification in §8.6).

---

## Phase 1 — Codebase Inventory

### 1.1 Prediction-engine files

| Layer | Files |
|---|---|
| Orchestration / entry | `lib/nrfi-engine.ts` (741 LOC — `computeNRFIPrediction`, `computeAllPredictions`) |
| Base models | `lib/nrfi-models.ts` (879 LOC — Poisson, ZIP, Markov-24, MAPRE, 3 meta-models, shrinkage, Log-5) |
| Extensions (flag-gated, default OFF) | `lib/deepnrfi-model.ts` (LightGBM inference), `lib/monte-carlo.ts`, `lib/monte-carlo-bridge.ts`, `lib/ensemble-plus.ts` (9-model stacker), `lib/calibration-v2.ts` |
| Calibration | `lib/calibration.ts` (19 linear-interpolation knots), `lib/calibration-v2.ts` |
| Environment | `lib/weather.ts` (vector wind), `lib/features/air-density.ts`, `lib/features/park-factors-extended.ts`, `lib/features/umpire-zone.ts` (empty stub), `lib/constants/mlb-stadiums.ts` |
| Odds / staking | `lib/utils/odds.ts`, `kellyFraction`/`expectedValue` in `lib/nrfi-engine.ts:125-136` |
| Data pipeline | `lib/api/mlb-stats.ts`, `lib/api/live-data.ts`, `lib/api/odds.ts`, `lib/api/weather.ts`, `lib/api/shared-helpers.ts`, `lib/api/sportsblaze.ts`, `lib/api/statcast.ts`, `lib/api/lineups.ts` |
| Feature engineering | `lib/features/feature-vector.ts` (69 features, FEATURE_ORDER) |
| Stats library | `lib/advanced-stats.ts` (FIP/xFIP/SIERA/wOBA/wRC+), `lib/config.ts` (constants) |
| Backtesting / evaluation | `lib/backtest-metrics.ts`, `app/api/backtest/route.ts`, `app/api/historical-sync/route.ts`, `app/api/performance/route.ts`, `scripts/deepnrfi/backtest_v2.py` |
| Persistence | `lib/prediction-store.ts`, `prisma/schema.prisma` |

### 1.2 Primary prediction loop

`app/api/predictions/route.ts` → `getLiveGameSlate(date)` (`lib/api/live-data.ts:330`) → `computeAllPredictions` → per game `computeNRFIPrediction` (`lib/nrfi-engine.ts:447`):

1. `precomputePitcherContext` — dynamic Bayesian shrinkage of pitcher NRFI rate (`nrfi-models.ts:645`)
2. λ per half-inning = `−ln(shrunkRate) × offenseVsHand × parkFactor × (weather × recentForm × monthlyFactor) × umpireMult` (`nrfi-engine.ts:499-505`)
3. `compute7ModelEnsemble` per half (`nrfi-models.ts:735`) → `blend7Models` (`nrfi-engine.ts:186`)
4. `calibrateWithMonotonicSpline` → blend `0.76 × calibrated + 0.24 × LEAGUE_ANCHOR(≈0.559)` → clamp [0.18, 0.85]
5. `computeValueAnalysis` → edge vs implied odds → quarter-Kelly stake → `NRFI / YRFI / NO_BET`

### 1.3 External data sources & risk

| Source | Risk |
|---|---|
| MLB Stats API (free, no key) | **BF, K%, BB% estimated** from IP×4.3 (`live-data.ts:221`); ER back-estimated from ERA; fly balls back-estimated from HR (`live-data.ts:42`) — several "advanced" stats are synthetic round-trips. `parseBaseballInnings` correctly handles ".1/.2" thirds (`mlb-stats.ts:119`). |
| The Odds API | **First bookmaker wins** (`lib/api/odds.ts:47-62`) — no line shopping, no consensus, no vig stripping. Team matching by last word of name (`live-data.ts:72-99`, Sox-collision mitigated). |
| OpenWeatherMap (current weather only) | Game-time weather is *fetch-time* weather; a 1 PM fetch for a 7 PM game is stale. Falls back to dome defaults silently. |
| Open-Meteo archive (historical recompute) | Hardcoded 7 PM local hour (`weather.ts:105`) — wrong for day games. |
| SportsBlaze (optional splits) | Absent in most deployments → vsLHP/vsRHP undefined → handedness opt silently inert. |
| Static park factors | Two divergent tables (`mlb-stadiums.ts` vs `park-factors-extended.ts`), hand-entered, no refresh process for the main one. |
| Umpire profiles | `UMPIRE_PROFILES = {}` (`umpire-zone.ts:31`) — the umpire feature is permanently neutral; Opt #4 umpire factor requires `game.umpire` which **no production code path ever sets** (only the sensitivity-analysis UI). Dead in live predictions. |

---

## Phase 2 — Formula Audit

### 2.1 Verified-correct canonical formulas

| Formula | Location | Verdict |
|---|---|---|
| American → implied prob: `100/(o+100)`, `|o|/(|o|+100)` | `lib/utils/odds.ts:17-22` | ✅ canonical |
| American ↔ decimal | `lib/utils/odds.ts:3-15` | ✅ canonical |
| EV = p·b − q (b = decimal−1) | `utils/odds.ts:24-27`, `nrfi-engine.ts:133-136` | ✅ equivalent to p·decimal − 1 (verified: EV(0.55, −110) = 0.0500) |
| Kelly f\* = (bp − q)/b | `nrfi-engine.ts:125-131`, `utils/odds.ts:29-35` | ✅ formula correct (the variable named `decimalOdds` at engine:127 is actually b = profit-per-unit — misleading name, right math). Negative Kelly floored at 0 ✅ |
| ZIP P(Y=0) = ω + (1−ω)e^(−λ) | `nrfi-models.ts:405` | ✅ canonical zero-inflated Poisson |
| Log-5 (Bill James) | `nrfi-models.ts:112-118` | ✅ canonical, with league-boundary and denominator guards |
| Markov 24-state base-out machine | `nrfi-models.ts:196-347` | ✅ runner-advance bit logic verified for walk/single/double/triple/HR; mass conservation holds because PA outcomes are normalized to 1 (`:174-184`). Simplifications (no advance on outs; single advances exactly 1 base) are documented and conservative. |
| FIP = (13·HR + 3·(BB+HBP) − 2·K)/IP + C | `advanced-stats.ts:326-330` | ✅ canonical; C = 3.17 (2024) reasonable |
| wOBA weights (0.69/0.72/0.89/1.27/1.62/2.10, scale 1.24) | `config.ts:77-85` | ✅ matches 2024 FanGraphs linear weights |
| OBP / SLG / ISO / BABIP / AVG | `advanced-stats.ts:76-199` | ✅ canonical incl. BABIP `(H−HR)/(AB−K−HR+SF)` |
| Brier, accuracy, per-bet Sharpe, max drawdown, ROI = P&L/wagered | `backtest-metrics.ts:60-156` | ✅ |
| Moist-air density (Tetens + partial pressures) | `features/air-density.ts` | ✅ physically correct |
| Monte Carlo: mulberry32 PRNG seeded by FNV-1a(gameId), histogram convolution, additive variance | `monte-carlo.ts`, `utils/hash.ts` | ✅ reproducible and correct under stated independence |
| Calibration interpolation code (monotone knots, boundary clamps) | `calibration.ts:42-56` | ✅ code correct (knot *values* are a separate issue, §5c) |
| NRFI/YRFI complementarity `yrfi = 1 − nrfi` | `nrfi-engine.ts:585` | ✅ exact |

### 2.2 Formula deviations and errors

**F1. HR-per-PA unit error in the Markov chain's PA model — `nrfi-models.ts:143`**
```ts
const pitcherHR = Math.min(0.07, pitcher.firstInning.hrPer9 / 9)
```
`hrPer9 / 9` is **HR per inning**, not HR per PA (an inning ≈ 4.3 PA). Correct conversion is `hrPer9 / 38.7` — which the *same file* uses for MAPRE at `:771`. League-average input (HR/9 = 1.1) yields 0.122 → capped at 0.07, still **2.2× the true ~0.031 HR/PA**. Measured output: the engine's per-PA HR probability for a league-average pitcher is **0.0754** (should be ≈ 0.031–0.034).

**F2. PA/inning constant inconsistent — `nrfi-models.ts:146-147`**
`H/PA ≈ WHIP/3.5 − BB/PA` uses 3.5 PA/inning; actual is ≈ 4.25 (the codebase itself uses BF = IP × 4.3 everywhere else). Inflates hit probability ~20%. Combined with F1, the Markov model's implied OBP is **0.380 vs league 0.314**, and its half-inning scoreless probability is **0.610 vs the empirical ~0.72**. Markov carries the **largest ensemble weight (43.6%)**.

**F3. Backtester Kelly sign bug — `lib/backtest-metrics.ts:105`**
```ts
const betSize = kellyBetSize(betModelProb, Math.abs(americanOdds))
```
`Math.abs(−110) = 110` is then interpreted by `kellyBetSize` (`:52-54`) as *positive* odds → b = 1.10 instead of 100/110 = 0.909. Measured: at p = 0.58, −110, quarter-Kelly stake = **0.0495 instead of 0.0295 (+68% overbet)**. Every negative-odds bet in every `BacktestRun` row (ROI-Kelly, Sharpe, max drawdown) is computed with inflated stakes.

**F4. Backtester prices YRFI bets at NRFI odds — `backtest-metrics.ts:92-116`**
Edge for the YRFI side is taken as the *complement of the vigged NRFI implied probability*, and a YRFI win pays `profitPerUnit` derived from the NRFI line. At a real market of NRFI −130 / YRFI +105, a winning YRFI bet is paid 0.769/unit instead of 1.05/unit and the edge threshold is measured against the wrong number. (Today the route never stores odds so everything defaults to a symmetric −110, where the two errors cancel — but the function is wrong the moment real odds are stored.)

**F5. MAPRE Negative-Binomial switch is discontinuous and directionally inverted — `nrfi-models.ts:557-559`**
```ts
const pNrfi = lambdaAdj > 0.8 ? Math.pow(1.3/(1.3+lambdaAdj), 1.3) : Math.exp(-lambdaAdj)
```
NegBin P(0) = (r/(r+λ))^r is the canonical form ✅, but switching abruptly at λ = 0.8 creates a jump: measured `combineMAPREHalves(0.395, 0.395) = 0.454` vs `(0.405, 0.405) = 0.533` — **+0.079 P(NRFI) for an ε-change in inputs**, and the "high-run-game" branch *raises* P(NRFI), the opposite of the comment's "underestimates tail risk" rationale. A correct treatment blends or uses NegBin everywhere.

**F6. SIERA formula is not SIERA — `advanced-stats.ts:342-359`**
The published SIERA has a strongly *negative* K% coefficient (≈ −16.99·(SO/PA)); this implementation uses **+6.3·K%**. Additionally `groundBalls` is always 0 from the live pipeline, so SIERA evaluates to ≈ 6.0 for every pitcher. Display-only today, but anyone consuming it would be misled.

**F7. xFIP is circular — `live-data.ts:42` + `advanced-stats.ts:333-339`**
Fly balls are estimated as `HR / 0.128` and xFIP then computes `expectedHR = FB × 0.125 ≈ HR × 0.977` — xFIP ≈ FIP by construction. The xFIP column carries no information beyond FIP.

**F8. Team wOBA approximation is mis-scaled — `live-data.ts:294`**
`woba = obp × 0.88` gives ≈ 0.276 for a league-average OBP of .314; actual league wOBA ≈ 0.312 (wOBA is *scaled to* OBP, not 12% below it). Not consumed by the ensemble math (display/feature only), but wrong as labeled.

**F9. Humidity physics inverted — `lib/weather.ts:25,56`**
`humidityEffect = 1 − (humidity/100) × 0.08` with the comment "humid air is denser and reduces carry." Humid air is **less** dense (H₂O molar mass 18 vs ~29 for dry air) — the repo's own `air-density.ts` implements this correctly. Magnitude is small (≤8% of the wind term) but the sign is backwards and the two modules contradict each other.

### 2.3 Unit and scale checks

- **Probabilities:** consistently [0,1] in the engine; K%/BB% are [0,100] in `advanced-stats.ts`/`config.ts` and [0,1] in `nrfi-models.ts` — two conventions coexist but no caller currently mixes them (the regressed K% from advanced-stats is never fed into the NRFI models). Fragile but not currently wrong.
- **Division-by-zero:** systematically guarded (`IP > 0`, `BF ≥ 1`, `total > 0`, `Math.max(1, …)`, `Math.max(0.01, …)` before `ln`). Exceptions: `impliedToAmerican` (`nrfi-engine.ts:120-123`) divides by zero at p ∈ {0, 1} (UI-only); `combine9Models` produces 0 when all inputs are non-finite (silently becomes calibrated-0.068).
- **ERA vs runs:** `estimateNrfiRate` uses **earned** runs only; NRFI is settled on all runs (R/9 ≈ ERA × ~1.08). Adds ~1 pt of additional NRFI overstatement at the source — though it is swamped by the larger scale problem (P0-1).

### 2.4 Coefficient validation (hardcoded constants)

| Constant | Location | Provenance | Assessment |
|---|---|---|---|
| `LEAGUE_AVG_NRFI = 0.516` | `nrfi-models.ts:19` | "2024–2025 recalibrated" | Plausible for game-level NRFI; **misused as a target for half-inning-scale quantities** (P0-1) |
| ZIP: γ₀ = −1.38, γ₁ = 4.0, temp 0.008/°F, ump 0.18; λ₀ = 0.42, β₁ = 0.90, β₂ = 0.60, temp 0.004/°F | `nrfi-models.ts:386-400` | "Calibration" comments | Unverifiable; internal comment claims combined target 0.62 while actual output is 0.527 — the documentation contradicts both the code and `LEAGUE_AVG_NRFI` |
| MAPRE multiplier slopes (0.0015, 1.8, 9, 0.12), deltas (−0.030, +0.032), floor 0.35, ρ = 0.06, r = 1.3 | `nrfi-models.ts:513-559` | Asserted ("hidden 2024–2025 factors") | No validation artifacts; several inputs are constants in production (babip = 0.3, barrelDev = 0) so most multipliers are frozen at ~1.0 |
| `RAW_ENSEMBLE_WEIGHTS` (sum = 1.10, normalized to 10.9/27.3/43.6/9.1/4.5/2.7/1.8%) | `nrfi-models.ts:582-594` | TODO at `:579-581` admits **not CV-optimized** | Unvalidated; honest TODO |
| logisticMeta α = −2.3, β = 4.1 | `nrfi-models.ts:787` | Asserted | Unvalidated; it's a fixed monotone squash of the weighted base average — adds no information, only distortion |
| `ENSEMBLE_BLEND = 0.76`, clamp [0.18, 0.85] | `nrfi-engine.ts:76-93` | "revise only via walk-forward CV" | No CV artifact in repo |
| `MONTHLY_LAMBDA_FACTOR` (0.88–1.06) | `nrfi-engine.ts:102-111` | "derived from 2018–2024 rates" | Plausible magnitudes; partially double-counts temperature with ZIP's own temp term in the live path |
| Quarter-Kelly 0.25, MIN_KELLY_EDGE 0.03 | `nrfi-engine.ts:57-58` | Industry-conventional | Reasonable; **conflicts with `config.ts:103-107`** (kelly.scaling 0.25 but minEdge 0.02, maxBet 0.05 — config is never consumed by the engine) and with `utils/odds.ts:29` default 0.5 (half-Kelly) |
| Calibration knots (19) | `calibration.ts:15-35` | "backtest regression Apr 2025" | **Near-identity in midrange; demonstrably does not correct the engine's measured −0.03 center bias (§5c).** v2 knots are explicitly hand-nudged guesses (`calibration-v2.ts:13-19`) |
| Confidence scoring constants (+12/+6/−14/−8, ×15, ×16, MC thresholds) | `nrfi-engine.ts:336-373` | Heuristic | Documented as heuristic; acceptable for a label, but see §6b |

---

## Phase 3 — Probability & Odds Output Validation

### 3a. Probability integrity — PASS
- Final output clamped to [0.18, 0.85]; `yrfiProbability = 1 − nrfiProbability` exactly (`nrfi-engine.ts:582-585`). Verified numerically (0.4853 / 0.5147).
- PA-outcome distributions normalized to exactly 1.0 (`nrfi-models.ts:174-184`) ✅.
- Logistic transforms correctly inverted (ZIP omega `1/(1+e^−x)`, logisticMeta, LightGBM binary objective `deepnrfi-model.ts:223`) ✅.
- **Exception:** `nnInteraction` (`nrfi-models.ts:796-798`) = `poisson × markov / 0.516` is a *ratio*, not a probability — it exceeds 1 routinely (hits the 0.98 clamp for elite matchups; measured 0.98 in the aces trace, 0.6896 for league-average where every real model says ~0.58–0.73) yet is averaged into the probability blend with 2.7% weight. Similarly `hierarchicalBayes` per-half (~0.52–0.57 by construction, see P1-6) is producted across halves to ~0.29 at league average — a different scale from every other game-level component.

### 3b. Implied odds conversion — PASS with caveat
- Both American-odds branches canonical (`utils/odds.ts:17-22`); decimal conversion canonical.
- **No vig removal anywhere.** Measured: implied(−130) + implied(+105) = 1.053. Model edge is therefore measured against vigged probabilities (conservative on the bet side, but it means a "0 edge" line actually has ≈ −2.6% true edge and the displayed "implied probability" overstates the market's fair probability). No additive/multiplicative/Shin/power method present.

### 3c. Edge / value / Kelly — PASS in the live engine, FAIL in the backtester
- Live: `nrfiEdge = p − implied(nrfiOdds)`, `yrfiEdge = (1−p) − implied(yrfiOdds)` — each side correctly uses its own odds (`nrfi-engine.ts:399-414`) ✅. EV formula canonical ✅. Quarter-Kelly with cap 0.25 and explicit NO_BET below 3% edge; negative Kelly floored ✅. The 0.25 fraction is stated in `config.ts` but the justification ("Quarter Kelly") is conventional, not derived.
- Backtester: **F3 (+68% stake on negative odds) and F4 (YRFI priced at NRFI line)** — see §2.2.

---

## Phase 4 — Statistical Model Soundness

### 4a. Feature engineering
Inputs to the ensemble: pitcher {ERA, WHIP, K%, BB%, HR/9, starts, last-5 first-inning results} (all **season-level**, see P0-2), team {season OPS → offenseFactor, optional vs-hand splits}, park factor, weather (temp, wind token, humidity), month, optional umpire/lineup (both effectively absent in production).
- **No same-game leakage** in the live path ✅. DeepNRFI's `ensemble7_nrfi` stacking feature is fine *if* trained walk-forward (training scripts exist; artifacts absent, so the path is inert).
- **Multicollinearity:** the 3 meta-models are deterministic functions of the 4 base models (logisticMeta is literally a squashed copy of the base weighted average) — the "7-model ensemble" is effectively a re-weighted 4-model ensemble with extra distortion, not 7 information sources.
- **Constant features:** `babip` (hardcoded 0.3 → M_BAbip ≡ 1.009), `barrelDev` (≡ 0 because `firstInning.era` and `overall.era` are the same value — `live-data.ts:242-258` vs `nrfi-models.ts:50-56`), `awayShortRestOrTravel` (≡ false), umpire (≡ neutral). Dead inputs presented as model factors.

### 4b. Sample size & regression to the mean
- Dynamic empirical-Bayes shrinkage `(n·obs + k·league)/(n+k)` with k = 30/50/80 (`nrfi-models.ts:609-629`) is structurally sound and the rookie trace confirms small samples collapse to league average (2 starts → dataWeight 0.063, output 0.532) ✅.
- **But:** the "observed" rate is not an observed binomial rate — it's `estimateNrfiRate(ERA)`, a deterministic transform of a season-stable stat. Treating it as an n-start binomial observation and shrinking it toward 0.516 with k = 50 (a 30-start veteran keeps only 37.5% of his own signal) is double regression with no statistical basis, and the prior is on the wrong scale (P0-1).
- FIP/xFIP are computed but **never used by the prediction engine** — predictions run off raw ERA (via estimateNrfiRate). The early-season stability argument for FIP is unaddressed where it matters (partially mitigated by the prior-season blending in `computePitcherStatsAsOf` for the *backfill* path only; the live path uses raw current-season ERA).

### 4c. Recency weighting
- `computeRecentFormMultiplier` (`nrfi-engine.ts:140-151`): last-5 first-inning NRFI rate vs season rate, slope −0.30, clamp [0.85, 1.15]. 3–5 game binomial samples with no shrinkage — a 5-game noise swing of ±0.4 moves λ ±12%. Bounded, but it's a hot-hand heuristic on tiny samples. Lookback window (5) hardcoded.
- Prior-season blending in the as-of path uses k = 1.14 (`mlb-stats.ts:109-112`) while the live shrinkage uses k = 30–80 — two inconsistent priors for the same concept.

### 4d. Park factor & environment
- Park factor applied **multiplicatively to λ** ✅ correct for run-based stats (`nrfi-engine.ts:155-163`).
- **But it only reaches the Poisson model (10.9% weight).** ZIP receives `parkFactor = 1.0` with the incorrect justification "already baked into lambda" (`nrfi-models.ts:748-755`) — ZIP never reads λ; it builds its own from offense and (neutralized) park. Markov uses only PA outcomes (no park, no weather, no umpire). MAPRE deliberately uses the pre-park `rawBaseLambda`. Net effect measured: moving park factor 1.0 → 1.15 changes the headline by only ~⅓ of what it changes the Poisson component. **≈ 89% of ensemble weight is park-blind, and everything except ZIP's temperature term is weather-blind.**
- Wind is directional (cosine projection of in/out/cross tokens, `weather.ts:47-59`) ✅ — but the token has already quantized direction to 3 buckets, so the vector math adds nothing over the old scalar; humidity sign error (F9).
- Home/away pitcher splits: fields exist (`homeNrfiRate`/`awayNrfiRate`) but are **set equal to the overall rate** (`live-data.ts:255-256`) — home/away first-inning splits are not actually modeled. MAPRE's Δ_HFA (−0.030 λ for the home pitcher) is the only home/away term.

---

## Phase 5 — NRFI/YRFI-Specific Audit

### 5a. First-inning probability model — **the central P0 finding**

The model claims to use "the pitcher's first-inning NRFI rate." It does not. The chain is:

1. `estimateNrfiRate(era) = clamp(e^(−0.95·ERA/9), 0.45, 0.90)` (`shared-helpers.ts:31-33`) — a Poisson estimate of the pitcher's **half-inning scoreless probability** from **season ERA**. For ERA 4.12 → **0.647**. The *empirical* MLB half-inning scoreless rate is ≈ 0.72–0.73 (run scoring is clumped; Poisson materially underestimates P(0)), so the source estimate is ~7 pts low before anything else happens.
2. That half-inning-scale number is then shrunk toward `LEAGUE_AVG_NRFI = 0.516` — a **game-level** (both halves) base rate (`nrfi-models.ts:624-629`). A scale mismatch: the correct prior for a half-inning scoreless rate is ≈ √0.516 ≈ 0.72. For a 20-start league-average pitcher: shrunk = (0.647·20 + 0.516·50)/70 = **0.553** as his "probability of a scoreless half" — versus reality ≈ 0.72.
3. λ = −ln(0.553) = 0.592 per half → Poisson game-level P(NRFI) = 0.34 where the truth is ≈ 0.52.

The genuinely available first-inning data (the pipeline already fetches per-start first-inning linescores in `fetchPitcherLast5FirstInnings`, `mlb-stats.ts:224-271`) is used only for the ±15% recent-form multiplier and UI factors — never as the primary rate.

Opponent 1st-inning OBP: not used (team factor is season OPS / 0.720). Team 1st-inning scoring rate: synthetic (`runsPerGame = offenseFactor × 0.48`, `live-data.ts:291`). Home/away splits: not populated (§4d). Park factor: only via the Poisson component (§4d). The per-team vs combined-game distinction is structurally present (per-half components multiplied) ✅.

### 5b. Combined probability — PASS with notes
`P(NRFI) = P(home half 0) × P(away half 0)` for the probability models (`nrfi-engine.ts:186-206`); independence is **documented** in code comments ✅ but never tested. MAPRE's ρ = 0.06 correlation correction (`nrfi-models.ts:550-561`) is the only attempt, and it moves P(NRFI) the *wrong direction*: positive cross-half correlation (shared park/weather/umpire) mathematically **raises** P(0,0) relative to independence; the implementation inflates total λ and lowers it — double-counting an environment effect that is already in both λs (plus the F5 discontinuity).

### 5c. Historical calibration — FAIL (measured)

Executed trace, league-average everything (ERA 4.12, OPS 0.720, park 1.0, 72°F, calm, June):

| Stage | Value |
|---|---|
| Per-model home half: Poisson / ZIP / Markov / MAPRE / logMeta / nnInt / hier | 0.583 / 0.726 / 0.610 / 0.600 / 0.581 / 0.690 / 0.537 |
| Raw 7-model game-level ensemble | ≈ 0.425 |
| After calibration spline | ≈ 0.462 |
| After 0.76/0.24 league-anchor blend | **0.4853** |

A perfectly average matchup must produce ≈ the base rate (0.516 by the repo's own constant; ~0.53–0.55 by market consensus). The engine outputs **0.485 — a ~3–5 point systematic YRFI bias at the center of the distribution**, and the calibration spline (0.45 → 0.489, 0.50 → 0.542 — near identity) does not repair it. If the knots had genuinely been regressed on this engine's outputs vs outcomes, raw 0.425 would map to ≈ 0.516. The half-inning models also disagree with each other by construction (ZIP 0.726 vs Poisson 0.583 vs hier 0.537 for identical inputs) because each is calibrated to a different implicit league rate — the ensemble averages three different scales and lets the spline absorb the residual, which it doesn't.

Corroborating evidence inside the repo itself: `historical-sync/route.ts:44-46` admits the *"model accuracy = league NRFI rate" artifact caused by always predicting NRFI's complement*, and `performance/route.ts` ships a `backtestedFraction` flag specifically to excuse those months.

---

## Phase 6 — Backtesting & Output Credibility

### 6a. Methodology
- **Point-in-time inputs: genuinely good.** `fetchPitcherStatsAsOf`/`fetchTeamStatsAsOf` (`mlb-stats.ts:429-554, 773-850`) aggregate game logs strictly `date < beforeDate` and blend with the prior season — no pitcher/team-stat look-ahead. (The route's docstring at `historical-sync/route.ts:9-12` is stale — it claims current-season-proxy stats; the code is better than its docs.)
- **Residual look-ahead/in-sample risk:** calibration knots ("Apr 2025 backtest regression"), ensemble weights, blend constant, and the monthly λ table were all tuned on 2024–25, and `POST /api/backtest` evaluates on those same seasons — the headline backtest is partially **in-sample for every fitted hyperparameter**. Walk-forward at the *data* level, not at the *model-selection* level.
- Backtested rows use month-average temperatures, calm wind, no odds, no lineups — flagged in `inputsPresence` ✅, but ROI is then simulated at a uniform synthetic −110 (`backtest-metrics.ts:14`; the route at `backtest/route.ts:109-113` never passes odds), with the F3 Kelly bug on top. **No CLV computation exists anywhere** (no closing-line storage).
- ROI = P&L/wagered ✅, win rate ✅, Brier ✅, Sharpe per-bet ✅, drawdown ✅ (formulas correct; inputs compromised per above).

### 6b. Confidence claims
`computeConfidence` (`nrfi-engine.ts:336-381`) is a heuristic point system (sample size, last-5 variance, model consensus, MC variance) — commendably *separated* from conviction (|p − 0.5|·2) and not presented as a probability ✅. But: the consensus input uses the dispersion of four models that are **systematically on different scales** (ZIP always ≈ 0.10 above Poisson at the center), so "Low consensus" partially measures the engine's internal miscalibration, not matchup uncertainty; `outlierNote`'s 0.08 threshold flags ZIP on nearly every average game. Tier labels (STRONG/LEAN/TOSS_UP, `:385-391`) are fixed probability cuts — reasonable — but `STRONG_NRFI ≥ 0.62` sits in a region the biased engine rarely reaches (max realistic output ≈ 0.69 measured for twin aces), so tier frequencies are skewed YRFI-ward.

### 6c. Result cross-validation (executed, not estimated)
Four synthetic matchups were run through the real `computeNRFIPrediction`:

| Scenario | Engine P(NRFI) | Expected (hand-computed from market/base rates) | Discrepancy |
|---|---|---|---|
| League-average (4.12 ERA both, OPS .720, neutral) | **0.4853** | ≈ 0.516–0.54 | **−0.03 to −0.06** — center bias (root cause §5a) |
| Twin aces (2.2/2.5 ERA, Petco, 55°F, wind in, weak offenses) | 0.6047 | ≈ 0.65–0.70 (market prices comparable matchups −185 to −220) | −0.05 to −0.10 — compressed top end |
| Bad pitchers (6.0/5.5 ERA, Coors, 90°F, wind out, strong offenses) | 0.3324 | ≈ 0.30–0.35 | ✅ in range |
| Rookie phenom (2 starts, 0.90 raw rate) vs average | 0.5319 | ≈ 0.52–0.56 | ✅ shrinkage working |
| `combineMAPREHalves` at λ = 0.79 vs 0.81 | 0.454 → 0.533 | continuous | **+0.079 jump** (F5) |
| Backtest quarter-Kelly, p = 0.58 at −110 | 0.0495 | 0.0295 | **+68%** (F3) |

The engine is directionally sane (ordering preserved, extremes bounded) but **level-biased downward**, most severely exactly where bets are decided (the 0.45–0.65 band).

---

## Phase 7 — Code Quality & Reliability

### 7a. Error handling — generally good
- Division guards near-universal (§2.3). API calls: timeouts (8s) + null fallbacks everywhere; **no retry/backoff** on any external call (one transient MLB 500 silently degrades a pitcher to a 4.00-ERA default and the prediction is produced anyway, indistinguishable from a real one except via `inputsPresence` on backfill rows only — the *live* path records no presence flags).
- Silent-failure hotspots: weather → dome defaults on any error (`weather.ts:46-87`); pitcher → league-average synthetic record (`mlb-stats.ts:367-382`) — a 0-start phantom that still gets a full prediction; odds mismatch → simply no value analysis.

### 7b. Reproducibility — good
- Monte Carlo seeded from `hashGameId` (FNV-1a) ✅ deterministic across runs.
- Model parameters are source-controlled constants ✅; DeepNRFI artifacts versioned via `manifest.json` ✅ (no artifacts shipped — DeepNRFI/MC/v2 are inert in production; flags default OFF ✅).
- Drift risk: `calibration.ts` vs `calibration-v2.ts` vs DeepNRFI's own knots = three calibration tables maintained by hand; `KELLY_FRACTION`/`MIN_KELLY_EDGE` duplicated in `backtest-metrics.ts:12-13` with a comment instead of an import; `config.ts:kelly` is a third, *disagreeing* copy.

### 7c. Dependencies
- TS stats are hand-rolled (no math libs) — appropriate. Radix/UI pinned exactly; **framework deps use caret ranges** (`next ^16.2.6`, `@prisma/client ^5.22.0`, `@clerk/nextjs ^6.0.0`) — builds are not fully reproducible without a committed lockfile (pnpm-lock.yaml is present ✅, which mitigates).
- Python side (`scripts/deepnrfi/requirements.txt`): `lightgbm>=4.0`, `pandas>=2.0`, `scikit-learn>=1.3` — floor-pinned only; all actively maintained; no deprecated packages.
- **CLAUDE.md is wrong**: it states "There are no automated tests" — there are 6 vitest suites, 110 tests, all passing.

---

## Phase 8 — Final Report

### 8.1 Critical (P0) — invalidates prediction levels

| # | Location | Issue | Impact | Fix |
|---|---|---|---|---|
| **P0-1** | `shared-helpers.ts:31-33`, `nrfi-models.ts:19,624-629`, `live-data.ts:227,249` | Pitcher "NRFI rate" = Poisson-from-season-ERA half-inning estimate (≈ 0.647 at league avg vs empirical ≈ 0.72), then shrunk toward the **game-level** constant 0.516. Scale mismatch + Poisson-P(0) underestimate. | Measured ~3–5 pt systematic YRFI bias at the distribution center (league-avg matchup → 0.485); compressed NRFI top end (twin aces → 0.605 vs market ~0.65–0.70). Every downstream edge/Kelly/recommendation inherits it. | Define the half-inning scoreless prior `LEAGUE_HALF_NRFI = Math.sqrt(LEAGUE_AVG_NRFI) ≈ 0.718` and shrink toward it: `shrunk = (obs·n + 0.718·k)/(n+k)`. Better: replace `estimateNrfiRate(era)` with the pitcher's *actual* first-inning scoreless rate (the linescore fetcher already exists), empirically regressed, with ERA only as a prior. Then refit the calibration knots. |
| **P0-2** | `live-data.ts:242-258`, `nrfi-models.ts:50-56,511,516` | All `firstInning.*` pitcher fields are season-level copies; `firstInning.era === overall.era` ⇒ `computeBarrelDev ≡ 0`; `babip ≡ 0.3` ⇒ `M_BAbip ≡ 1.009`. MAPRE's "eight hidden factors" are mostly frozen constants; the model's documented premises don't hold in production. | MAPRE degrades to `rawBaseLambda × M_sOPS × 1.009 × M_HR − 0.03·home` — advertised factors contribute nothing; UI factor cards display fabricated "first-inning" stats. | Populate real first-inning splits (MLB Stats API exposes inning-1 splits via `statSplits`/game logs) or rename the fields and delete the dead branches. At minimum stop shipping `barrelDev`/`babip` as live model inputs. |
| **P0-3** | `backtest-metrics.ts:105` | `kellyBetSize(p, Math.abs(americanOdds))` converts every negative line to positive ⇒ b = 1.10 instead of 0.909 at −110. | All persisted `BacktestRun` ROI-Kelly/Sharpe/maxDrawdown overstate stakes by +68% at −110; risk metrics unusable. | `kellyBetSize(betModelProb, americanOdds)` with the sign intact (the function already branches on sign). Re-run stored backtests. |

### 8.2 High priority (P1)

| # | Location | Issue | Impact | Fix |
|---|---|---|---|---|
| P1-1 | `nrfi-models.ts:143,147` | HR/PA = `hrPer9/9` (HR per *inning*; 4.3× overstated, cap leaves 2.4×); PA/inning = 3.5 (should be ≈ 4.25). | Markov (43.6% weight) implied OBP 0.380 vs 0.314, half-inning P(0) 0.610 vs ≈ 0.72 — major contributor to P0-1's bias. | `pitcherHR = min(0.07, hrPer9/38.7)`; `pitcherHit = max(0.06, whip/4.25 − pitcherBB)`. |
| P1-2 | `nrfi-models.ts:748-755,761-764,767-777` | ZIP given `parkFactor = 1.0` on the false premise it's "in lambda" (ZIP ignores λ); Markov gets no park/weather/umpire at all; MAPRE uses pre-park λ. | ≈ 89% of ensemble weight is park-blind; weather affects only ZIP's temp term + the 10.9% Poisson. Coors vs Petco moves the headline ~⅓ of intended. | Pass the real park factor to ZIP; scale Markov PA hit/HR probabilities by park (or post-multiply its λ-equivalent); document which model owns which environmental signal so each is counted exactly once. |
| P1-3 | `backtest-metrics.ts:92-116` | YRFI bets sized/paid off the NRFI line; YRFI edge = complement of vigged NRFI implied prob. | Backtest P&L wrong whenever real (asymmetric) odds are stored; YRFI edges overstated by ~the vig. | Store both sides' odds on `ModelPrediction`; compute YRFI edge vs `implied(yrfiOdds)` and pay at YRFI profit-per-unit. |
| P1-4 | `calibration.ts:15-35`, `calibration-v2.ts:13-19`, `nrfi-engine.ts:77-86` | Calibration knots near-identity in midrange — measurably fail to correct the −0.03 center bias; v2 knots are admitted hand-nudges; `LEAGUE_ANCHOR` passes the league rate through the (mis-fit) spline, moving the anchor to 0.559. | The one layer designed to fix aggregate bias doesn't; the anchor then pulls outputs toward an inflated 0.559, partially (and accidentally) offsetting P0-1 — two wrongs in tension. | Refit knots by isotonic regression of raw ensemble vs outcomes on a held-out season; assert `calibrate(raw_league_mean) ≈ realized NRFI rate` in a test. |
| P1-5 | `nrfi-models.ts:550-561` | MAPRE ρ-adjustment lowers P(NRFI) for positive cross-half correlation (sign inverted vs probability theory) + F5 NegBin discontinuity (+0.079 jump at λ=0.8). | Step-function in headline output (~0.7 pt via 9.1% weight); double-counts shared environment. | Use NegBin for all λ (continuous), and if modeling positive correlation, *raise* P(0,0): `P = pₕp_a + ρ√(pₕ(1−pₕ)p_a(1−p_a))`. |
| P1-6 | `nrfi-models.ts:786-808` | logisticMeta is a fixed squash of the base average (no new information); nnInteraction is a >1-capable ratio averaged as a probability; hierarchicalBayes re-shrinks the already-shrunk rate toward the game-level constant then gets producted to ≈ 0.29. | The "7-model" framing overstates diversity; 4.5+2.7+1.8% of weight is noise/bias by construction. | Drop the three meta-models or replace with a genuinely trained stacker (the v2 scaffolding already exists); at minimum stop counting them as independent models in consensus/UI. |
| P1-7 | `app/api/backtest/route.ts` + fitted constants | Backtest evaluates 2024–25 with weights/knots/blend tuned on 2024–25; no odds, seasonal-average weather; no CLV anywhere. | Reported Brier/ROI are optimistic in-sample estimates; "walk-forward" holds for data, not model selection. | Hold out 2026 entirely for evaluation; store opening + closing odds to enable real ROI and CLV = (closing implied − bet implied). |

### 8.3 Medium priority (P2)

| # | Location | Issue |
|---|---|---|
| P2-1 | engine-wide | No vig stripping (measured overround 5.3%); add multiplicative or Shin de-vig before edge display, or document that edges are vs vigged lines. |
| P2-2 | `weather.ts:56` vs `features/air-density.ts` | Humidity sign inverted in the multiplier (humid air is *less* dense); two modules contradict. Unify on `computeAirDensity`. |
| P2-3 | `utils/odds.ts:29` (half-Kelly default, no cap) vs `nrfi-engine.ts:125-131` (quarter, capped) vs `config.ts:103-107` (minEdge 0.02, unused) | Three Kelly/edge configurations; consolidate into `config.ts` and import everywhere (backtest-metrics duplicates constants by comment). |
| P2-4 | `nrfi-models.ts:371-373` | ZIP doc claims combined target 0.62; actual output 0.527; contradicts LEAGUE_AVG_NRFI. Fix the comment or the γ₀/λ₀ calibration. |
| P2-5 | `advanced-stats.ts:342-359` | SIERA: +6.3·K% sign error vs published −16.99·(SO/PA); GB always 0 ⇒ SIERA ≈ 6.0 for everyone. Remove or fix; it's display-only today. |
| P2-6 | `live-data.ts:42` | xFIP circular (FB estimated from HR). Either fetch real batted-ball data or drop the xFIP column. |
| P2-7 | `live-data.ts:294` | `woba = obp × 0.88` mis-scaled (≈ 0.276 vs league 0.312); wOBA ≈ OBP in scale by definition. |
| P2-8 | `live-data.ts:228`, `nrfi-engine.ts:322-329` | `firstBatterOBP = whip/(1+whip) × 0.85` is fabricated, then surfaced in UI as "retires the leadoff hitter X% of the time." Label as estimate or compute from real data. |
| P2-9 | `nrfi-engine.ts:102-111` + ZIP temp term | Monthly λ factor and ZIP's per-game temperature partially double-count the seasonal cycle in the live path (July: ×1.04 *and* +temp λ adj). |
| P2-10 | `nrfi-engine.ts:140-151` | Recent-form multiplier from 3–5 game samples, no shrinkage (bounded ±15%, slope −0.30 unvalidated). |
| P2-11 | `lib/api/odds.ts:47-62` | First bookmaker taken; no best-line/consensus; bookmaker identity not validated against display claims. |
| P2-12 | `live-data.ts:312-313`, `:317` | `homeYrfiRate = yrfi ± 0.02`, `avgRunsVsLHP = rpg × 1.05` — invented splits presented as data. |
| P2-13 | live path | No `inputsPresence` recorded for live predictions — a defaults-built phantom pitcher (API failure) is indistinguishable from a real one in `ModelPrediction`. |
| P2-14 | `weather.ts:105-111` | Historical weather hardcoded to the 7 PM hour — wrong for day games (~35% of slates). |

### 8.4 Low priority (P3)

- `CLAUDE.md` claims "no automated tests" (110 exist) and describes a 7-model engine (9-model scaffolding + v2 path exist); `historical-sync` docstring describes pre-AsOf behavior. Update docs.
- "Monotonic P-spline" is piecewise-linear interpolation — rename to avoid overclaiming.
- `impliedToAmerican` (`nrfi-engine.ts:120-123`) divides by zero at p ∈ {0,1}.
- `MODEL_CONFIG` (`nrfi-models.ts:27-32`) deprecated but exported; `RAW_ENSEMBLE_WEIGHTS` sum to 1.10 by design (normalized correctly, but the raw numbers in comments mislead).
- `combine9Models` with all-NaN inputs yields 0 → calibrates to 0.068 silently; return null instead.
- No retry/backoff on any external API call (timeouts only).
- Caret ranges on framework deps (mitigated by committed pnpm-lock.yaml).

### 8.5 Verified correct (summary)

Odds conversions (both directions), EV, live Kelly (formula, flooring, fractional cap, NO_BET gating, per-side odds usage), NRFI/YRFI complementarity and bounds, PA-outcome normalization, Log-5, ZIP functional form, the entire 24-state Markov transition logic, FIP and wOBA weights (2024-accurate), OBP/SLG/ISO/BABIP, Brier/ROI/Sharpe/drawdown formulas, baseball-innings string parsing (".1/.2" thirds — a classic bug, correctly avoided), point-in-time as-of stat aggregation for backfill, moist-air density physics, seeded reproducible Monte Carlo with correct convolution, calibration interpolation *code*, ensemble weight normalization, and the strict separation of confidence (reliability) from conviction (distance from 0.5).

### 8.6 Overall Prediction Engine Confidence Score: **4 / 10**

**What earns points (≈ +4):** genuinely sound software architecture; correct staking/odds math in the live path; real point-in-time backfill; honest internal TODOs about unvalidated weights; bounded outputs with exact complementarity; reproducible stochastic components; heavy small-sample shrinkage that prevents the classic 2-start-rookie blowup; directionally correct ordering across matchup quality in the executed traces.

**What caps it at 4:** the foundational input (pitcher first-inning rate) is a season-ERA proxy shrunk toward a constant on the wrong probability scale, producing a measured ~3–5 pt YRFI bias exactly in the actionable 0.45–0.65 band; the Markov model (largest weight) runs on PA probabilities with a 2.4× HR unit error; ~89% of ensemble weight ignores park factor; the calibration layer demonstrably fails to correct the aggregate bias and its knots are unverifiable; the backtester has a +68% Kelly sizing bug and prices YRFI at NRFI odds, so historical ROI/Sharpe claims cannot be trusted; and evaluation is in-sample with respect to every fitted hyperparameter. Until P0-1/P0-2/P1-1/P1-4 are fixed and the knots are refit out-of-sample, edges reported against real betting lines are dominated by model bias, not market inefficiency — **the system should not be used to size real bets in its current state.**

### Suggested fix order
1. P0-3 (one-line Kelly fix) + P1-3 → restore trust in backtest metrics.
2. P1-1 (PA unit fixes) + P0-1 (shrinkage target √0.516 or real first-inning rates) → remove the center bias at the source.
3. P1-4 refit calibration knots out-of-sample; add a regression test pinning `engine(league-average inputs) ≈ realized league NRFI rate`.
4. P1-2 (park/weather routing), P1-5 (continuous NegBin), P1-6 (retire meta-models).
5. Store real odds (both sides, open + close) → enable true ROI/CLV (P1-7).
