# NRFI/YRFI Prediction Engine

> **Four-model ensemble for MLB first-inning run probability — audited, tested, and odds-aware.**

Predicts whether a game's first inning will produce zero runs (NRFI) or at least one run (YRFI) using a calibrated ensemble of four statistical models: standard Poisson, Zero-Inflated Poisson (ZIP), a 24-state Markov Chain, and MAPRE (Multi-Factor Adjusted Poisson Run Expectancy). Three additional meta-models (logistic stack, neural-network interaction term, hierarchical Bayes) are computed for the UI diagnostics but carry **zero blend weight** pending walk-forward cross-validation. Dynamic Bayesian shrinkage, handedness-adjusted lineup splits, vector wind modeling, real MLB first-inning splits, and umpire bias are all integrated. Includes value-bet identification via no-vig fair pricing and quarter-Kelly sizing.

A full quantitative audit of the engine (June 2026) and its remediation are documented in [`AUDIT_REPORT.md`](AUDIT_REPORT.md) and [`AUDIT_FIXES.md`](AUDIT_FIXES.md). Regression tests guarding the audited properties live in [`__tests__/audit-regression.test.ts`](__tests__/audit-regression.test.ts).

---

## Table of Contents

1. [What is NRFI/YRFI](#what-is-nrfiyrfi)
2. [How the Model Works](#how-the-model-works)
3. [Ensemble++ (Optional v2.9 Pipeline)](#ensemble-optional-v29-pipeline)
4. [Features](#features)
5. [Quick Start](#quick-start)
6. [Testing & Backtesting](#testing--backtesting)
7. [API Integrations](#api-integrations)
8. [Environment Variables](#environment-variables)
9. [Architecture](#architecture)
10. [Project Structure](#project-structure)
11. [Configuration](#configuration)
12. [Live Data Architecture](#live-data-architecture)
13. [Tech Stack](#tech-stack)
14. [Deployment](#deployment)
15. [License](#license)

---

## What is NRFI/YRFI

**NRFI** (No Run First Inning) and **YRFI** (Yes Run First Inning) are MLB betting markets that resolve entirely on whether any run is scored in the first inning of a game — by either team.

| Outcome | Condition |
|---|---|
| **NRFI** | Neither team scores in the 1st inning |
| **YRFI** | At least one team scores in the 1st inning |

These markets are popular because:
- They resolve in under 30 minutes regardless of game length
- They are heavily dependent on starting pitcher quality (top of the batting order, fresh arms)
- Bookmakers frequently misprice them relative to underlying pitcher stats

Historically, **~51.6% of MLB first innings produce zero runs** (2024–2025 recalibrated), making NRFI a near coin-flip in average matchups — but the range varies dramatically based on pitcher, ballpark, lineup, and weather.

---

## How the Model Works

The engine runs the model ensemble **per half-inning**, then combines both halves into a final game probability. Every pitcher's NRFI rate is first Bayesian-shrunk toward the league mean before entering any model.

### ⚠️ The Two-Scale Convention

The single most important invariant in this codebase (root cause of the pre-audit YRFI bias, `AUDIT_REPORT.md` P0-1):

```text
LEAGUE_AVG_NRFI  = 0.516          // GAME level: P(neither team scores in the 1st)
LEAGUE_HALF_NRFI = √0.516 ≈ 0.718 // HALF-INNING level: P(one team's half is scoreless)
```

Every per-pitcher `nrfiRate` is a **half-inning** quantity. All shrinkage priors target `LEAGUE_HALF_NRFI`, never the game-level constant. Both are exported from `lib/nrfi-models.ts`.

### 8 Optimizations Applied

| # | Optimization | Where |
|---|---|---|
| 1 | Updated blend constants (76 % ensemble / 24 % anchor) | `nrfi-engine.ts` |
| 2 | Handedness × lineup splits (`vsLHP` / `vsRHP`) | `nrfi-models.ts → getLineupVsHand` |
| 3 | Vector wind + humidity (`computeVectorWeatherMultiplier`) | `lib/weather.ts` |
| 4 | Umpire bias factor (optional per-game field) | `nrfi-engine.ts` |
| 5 | Dynamic Bayesian shrinkage (k=30/50/80 by pitcher type) | `nrfi-models.ts → getDynamicPriorWeight / applyDynamicShrinkage` |
| 6 | Monotonic piecewise-linear calibration (19 knots; **currently the identity mapping** pending an honest out-of-sample refit) | `lib/calibration.ts` |
| 7 | Output clamped to `[0.18, 0.85]` | `nrfi-engine.ts` |
| 8 | Three meta-models computed for diagnostics (blend weight 0) | `nrfi-models.ts → compute7ModelEnsemble` |

### Final Output Formula

```text
raw      = blend7Models(homeHalf, awayHalf)      // weighted sum of per-model game probs
cal      = calibrateWithMonotonicSpline(raw)     // identity until knots are refit
anchor   = calibrateWithMonotonicSpline(0.516)   // = 0.516 under the identity calibration
P(NRFI)  = clamp(0.76 × cal + 0.24 × anchor, 0.18, 0.85)
P(YRFI)  = 1 − P(NRFI)   // exact symmetry

// Active blend weights (raw 0.12 / 0.30 / 0.48 / 0.10, normalised — they sum to 1.0):
//   Poisson 12%, ZIP 30%, Markov 48%, MAPRE 10%
//   logisticMeta / nnInteraction / hierarchicalBayes: 0% (display-only)
```

Game-level combination (`blend7Models` in `nrfi-engine.ts`): every model value is a half-inning probability, so the game level is the independence product `home × away` for **all** models. MAPRE alone overrides this with a cross-half correlation correction (see Step 4).

### Step 0 — Dynamic Bayesian Shrinkage (Opt #5, Pre-processing)

Shrinks every pitcher's observed half-inning scoreless rate toward `LEAGUE_HALF_NRFI ≈ 0.718` using a **pitcher-type-specific k** (prior weight):

```text
k = 30   // < 100 career first innings (low data, but trust what exists more)
k = 50   // established starter (default)
k = 80   // bullpen game / opener (heavy shrinkage)

θ̂ = (n × NRFI_observed + k × 0.718) / (n + k)    // clamped to [0.35, 0.92]
w = n / (n + k)                                    // displayed data weight, capped at 0.97
```

| Starts (n) | data weight (k=30) | data weight (k=50) | data weight (k=80) |
|---|---|---|---|
| 2 | ≈ 6% | ≈ 4% | ≈ 2% |
| 5 | ≈ 14% | ≈ 9% | ≈ 6% |
| 18 | ≈ 38% | ≈ 26% | ≈ 18% |
| 50 | ≈ 63% | ≈ 50% | ≈ 38% |
| 100 | ≈ 77% | ≈ 67% | ≈ 56% |
| 250 | ≈ 89% | ≈ 83% | ≈ 76% |

`getDynamicPriorWeight(pitcher)` selects k; `applyDynamicShrinkage(pitcher, k)` returns the shrunk rate. The legacy `bayesianShrinkage(starts, rate, k)` helper is retained for the UI breakdown.

### Step 1 — Poisson (12% weight)

Standard run-expectancy model. Acts as the numerical anchor.

```text
λ = −ln(θ̂) × lineupVsHand × parkFactor
       × vectorWeatherMult × recentFormMult × monthlyFactor
       × (1 − umpireFactor)
P(NRFI_half) = e^(−λ)
```

- `lineupVsHand` (Opt #2): opposing team's `vsLHP`/`vsRHP` split (or the actual lineup card when available), falling back to `offenseFactor`.
- `vectorWeatherMult` (Opt #3): `clamp(1 + windSpeed × cos(θ_wind) × 0.012 × humidityEffect, 0.82, 1.22)` — see [Configuration](#configuration).
- `monthlyFactor`: seasonal run-environment cycle (March 0.88 → August 1.06).
- `umpireFactor` (Opt #4): positive value = tighter zone = fewer runs (clamped ±0.5).

```text
recentFormMult = clamp(1.0 − 0.30 × avgDeviation, 0.85, 1.15)
deviation = (last-5 NRFI rate − season NRFI rate) × n/(n+5)
            // small-sample shrink: n=5 keeps 50%, n=3 keeps 37.5%
```

### Step 2 — Zero-Inflated Poisson / ZIP (30% weight)

Separates "lockdown" innings from "active" innings. Standard Poisson underestimates clean 1-2-3 frames.

```text
logit(ω) = −1.38 + 4.0 × (kRate − 0.225) + (72 − temp) × 0.008 + umpire × 0.18
log(λ)   = ln(0.435) + 0.90 × ln(offenseFactor) + 0.60 × ln(parkFactor) + (temp − 72) × 0.004

P(NRFI_half) = ω + (1 − ω) × e^(−λ)

ω clamped [8%, 60%]   λ floor 0.05
```

`ω` is the probability of a certain-zero "lockdown" inning. `λ` is the Poisson scoring rate of the "active" regime. The `ln(0.435)` intercept is derived so a fully league-average half-inning lands exactly on `LEAGUE_HALF_NRFI`: with ω = σ(−1.38) ≈ 0.201, solving `ω + (1−ω)e^(−λ) = 0.7183` gives λ ≈ 0.435. Park/weather/form enter once via `zipEnvFactor` (temperature is modelled explicitly inside ZIP, so the monthly factor is excluded to avoid double-counting).

### Step 3 — Markov Chain (48% weight)

Simulates the inning plate-by-plate across all 24 base-out states (outs ∈ {0,1,2} × 8 runner configurations) using Bill James Log-5 matchup probabilities.

```text
P(event | batter vs pitcher) = (b·p/l) / [ (b·p/l) + (1−b)(1−p)/(1−l) ]

P(NRFI_half) = Σ P(reach 3 outs with 0 runs scored)
             then raised to MARKOV_CALIBRATION_EXPONENT = 1.285
```

PA outcomes (out, walk, single, double, triple, HR) are derived from pitcher WHIP, K%, BB%, and HR/9 — converted to per-PA rates with **HR/9 ÷ 38.7** (9 innings × ~4.3 PA per inning) and **PA/inning from WHIP ÷ 4.25** — combined with top-of-order batter rates scaled by `offenseFactor`. Any branch where a run scores is immediately eliminated from the NRFI probability mass.

The `1.285` exponent corrects the chain's documented structural simplifications (no runner advance on outs; singles advance exactly one base), which otherwise bias P(0 runs) high. The chain runs twice per half (clean-inning + traffic start states blended by the engine).

### Step 4 — MAPRE (10% weight)

Multi-Factor Adjusted Poisson Run Expectancy. Injects hidden 1st-inning factors on top of the raw base λ:

```text
λ_adj = λ_base × M_sOPS × M_BABIP × M_HR × M_pitchMix + Δ_HFA + Δ_rest

M_sOPS     = 1 + 0.0015 × (sOPS+ − 100)        // batting team 1st-inning sOPS+
M_BABIP    = 1 + 1.8    × (BABIP − 0.295)        // pitcher 1st-inning BABIP
M_HR       = 1 + 9      × (HR/PA − 0.030)        // vs league HR/PA (LEAGUE_HR_RATE)
M_pitchMix = 1 + 0.12   × barrelDev              // ERA-ratio barrel-deviation proxy
Δ_HFA      = −0.030  if home pitcher             // home-field advantage
Δ_rest     = +0.032  if away team fatigued        // short rest / travel

// multipliers capped [0.70, 1.50]; deltas clamped [−0.10, +0.15]; λ floor 0.10
// λ_base = −ln(θ̂) × envLambdaMult (park/weather/form/monthly/umpire applied once here)
```

**Game-level combination** (`combineMAPREHalves`) uses a *continuous* cross-half correlation — a shared run environment (park, weather, umpire) makes the two halves positively correlated, which **raises** P(both zero) relative to independence:

```text
p_h = e^(−λ_home)        p_a = e^(−λ_away)
ρ   = 0.06 × ramp(λ_home) × ramp(λ_away)      // ramp: 0→1 as λ goes 0.35→0.60

P(NRFI) = p_h × p_a + ρ × √(p_h(1−p_h) × p_a(1−p_a))
```

The league-average half-inning λ ≈ 0.33 sits below the ramp, so average matchups get no adjustment; clearly high-run matchups get the full ρ. (The pre-audit hard Negative-Binomial switch at λ > 0.8 created a discontinuity and double-counted clumping — removed in the audit remediation, P1-5.)

### Meta-Models (Opt #8 — display-only, 0% blend weight)

Three meta-model values are computed per half-inning for the UI breakdown. They are deterministic transforms of the base four and carry no independent information, so their blend weights are **0** pending walk-forward CV evidence:

```text
logisticMeta      = 0.12×poisson + 0.30×zip + 0.48×markov + 0.10×mapre
                    // the weighted base-4 average itself (placeholder for a trained stacker)

nnInteraction     = clamp(poisson × markov / 0.718, 0.02, 0.98)
                    // product normalised by LEAGUE_HALF_NRFI so it stays a
                    // half-inning probability (league avg in → league avg out)

hierarchicalBayes = clamp(θ̂, 0.35, 0.92)
                    // the dynamically-shrunk scoreless rate itself
```

At game level all three combine as `home × away`, the same as the base models.

### Calibration (Opt #6)

`calibrateWithMonotonicSpline` interpolates a monotone 19-knot table over raw ∈ [0.05, 0.95]. The pre-audit knots were fit against the engine's own biased output, so they have been **reset to the identity mapping**; the infrastructure is retained and the table should be refit on out-of-sample data once the corrected engine accumulates a season of predictions. See `lib/calibration.ts` (and `lib/calibration-v2.ts` for the v2.9 pipeline equivalent).

### Confidence Score

```text
score = 50
      + sampleBonus                 // +12 if ≥18 starts, +6 if ≥10, −8 if ≤9, −14 if ≤3
      − formVariance × 15           // high variance across last-5 results = penalty
      + (modelConsensus − 0.5) × 16 // all models agree = bonus
      ± MC adjustment               // when Monte Carlo is enabled: −8 / −4 high variance, +3 low
      clamped to [10, 98]
```

`modelConsensus` measures agreement across the base-model outputs per half-inning.

Confidence measures **reliability** (sample size, model agreement, form stability) — not prediction boldness. Boldness is captured separately as **conviction**:

```text
conviction = |P(NRFI) − 0.50| × 2    // 0.0 = coin-flip, 1.0 = maximum certainty
```

| Score | Level |
|---|---|
| ≥ 62 | High |
| 45–61 | Medium |
| < 45 | Low |

### Recommendation Tiers

| P(NRFI) | Call |
|---|---|
| ≥ 0.62 | STRONG NRFI |
| ≥ 0.52 | LEAN NRFI |
| 0.38–0.52 | TOSS-UP |
| 0.28–0.38 | LEAN YRFI |
| < 0.28 | STRONG YRFI |

### Value Bet Identification

```text
impliedNRFI, impliedYRFI = impliedProbability(odds)        // vigged book probabilities
fairNRFI  = impliedNRFI / (impliedNRFI + impliedYRFI)      // no-vig fair probability
edge      = P(model) − impliedProbability(bookOdds)         // ≥3% required (CONFIG.kelly.minEdge)

kellyStake = ((b × p − q) / b) × 0.25                       // quarter Kelly, capped at 5% bankroll
where  b = net profit per unit (decimal odds − 1),  p = model prob,  q = 1 − p
```

Edges are deliberately measured against the **vigged** implied probability (conservative — a bet must clear the bookmaker margin before it shows positive edge); the no-vig fair probabilities are computed and exposed alongside (`fairNrfiProb` / `fairYrfiProb`). Each side is priced at its own best available line across bookmakers. Kelly parameters live in `lib/config.ts → CONFIG.kelly`.

---

## Ensemble++ (Optional v2.9 Pipeline)

Behind feature flags (default **off**), the engine extends to a 9-model stack:

| Flag | Effect |
|---|---|
| `ENABLE_DEEPNRFI=true` | LightGBM scoring layer (`lib/deepnrfi-model.ts`; requires an artifact under `scripts/deepnrfi/artifacts/`) |
| `ENABLE_MONTECARLO=true` | Play-by-play first-inning Monte Carlo (`lib/monte-carlo.ts`, 8,000 sims/game, seeded per game; override with `MONTECARLO_SIMS`) |
| `ENSEMBLE_VERSION=v2.9models` | Trained stacker over 7-model + DeepNRFI + Monte Carlo (`lib/ensemble-plus.ts`, `lib/calibration-v2.ts`) |

The default production path is `v1.7models` (the ensemble described above). Per-game diagnostics are written to the `EnsembleDiagnostic` table when `ENABLE_DIAGNOSTICS=true`.

---

## Features

### Game Predictions
- Per-game NRFI probability with full model breakdown
- Expected runs (λ) for each team's half-inning
- Probability of each team scoring zero
- Recommendation tier: STRONG NRFI / LEAN NRFI / TOSS-UP / LEAN YRFI / STRONG YRFI
- Expandable factor list explaining each model input

### Value Analysis
- Bookmaker odds (best line per side) vs. model probability
- Vigged edge and no-vig fair probabilities
- Quarter-Kelly bet sizing with 3% minimum edge and 5% bankroll cap
- Expected value (EV) calculation

### Pitcher Analysis
- Real first-inning splits from the MLB Stats API (`sitCodes=i01`) — NRFI rate, ERA, WHIP, K%, BB%, HR/9, first-batter OBP
- Last-5-start form (NRFI / YRFI dots)
- Bayesian shrinkage transparency (data weight vs. league prior)

### Team Analysis
- Season YRFI rate (how often each team scores in the 1st)
- First-inning OPS and wOBA
- Last-10-game YRFI trend with directional arrow

### Tracking & Validation
- Prediction log with actual results, P/L, monthly accuracy and ROI
- Historical DB backfill (`/api/historical-sync`) with stored odds snapshots
- Walk-forward backtests with Brier score, calibration bins, Kelly/flat ROI, max drawdown (`/api/backtest`)
- CSV export of full history (`/api/export-data`)

### Account Features
- Clerk authentication; bet tracker, bankroll ledger, and watchlist per user
- Stripe-backed subscription tiers (FREE / PRO / ELITE) gating premium endpoints

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended for local dev; CI uses `npm ci`)

### Installation

```bash
git clone https://github.com/joeydd032995-pixel/v0-mlb-betting-analytics.git
cd v0-mlb-betting-analytics

pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
pnpm build       # runs db-push + prisma generate + next build
pnpm start
pnpm build:prod  # full gate: type-check + lint + build
```

### Environment Setup

```bash
cp .env.example .env.local
# Fill in your API keys — see API Integrations section below
```

---

## Testing & Backtesting

```bash
pnpm test        # vitest suites in __tests__/
pnpm type-check  # TypeScript (no emit)
pnpm lint        # ESLint
```

Key suites:

| Suite | Guards |
|---|---|
| `__tests__/audit-regression.test.ts` | Audited invariants: league-average inputs → ≈0.516 output, per-PA scales, environment routing, Kelly payout signs, no-vig integrity |
| `__tests__/nrfi-models.test.ts` | Shrinkage, ZIP, Markov, MAPRE, ensemble weights |
| `__tests__/nrfi-engine.test.ts` | Null safety, recommendation tiers, output bounds |
| `__tests__/calibration.test.ts` | Monotonicity, identity knots, anchor consistency |
| `__tests__/backtest-metrics.test.ts` | Brier, accuracy, calibration bins, drawdown |

CI (`.github/workflows/ci.yml`) runs type-check + lint + build + unit tests. Husky runs `eslint --fix` on staged files pre-commit.

Walk-forward backtesting uses point-in-time stats (no look-ahead) and prices each side at its stored line (`nrfiOdds`/`yrfiOdds` on `ModelPrediction`), falling back to −110 when no odds were captured. Results persist to the `BacktestRun` table.

---

## API Integrations

The app ships with **realistic mock data** that powers the full UI. To enable live predictions, connect the following APIs:
- **Required:** The Odds API + OpenWeatherMap
- **Built-in (no auth):** MLB Stats API
- **Optional:** SportsBlaze

---

### 1. The Odds API

Provides NRFI/YRFI odds from DraftKings, FanDuel, BetMGM, Caesars, and 40+ bookmakers. The implementation (`lib/api/odds.ts`) scans **all** bookmakers and keeps the best price independently per side (best-line shopping).

**Website:** [the-odds-api.com](https://the-odds-api.com)
**Docs:** [the-odds-api.com/liveapi/guides/v4/](https://the-odds-api.com/liveapi/guides/v4/)
**Free tier:** 500 requests/month
**Env variable:** `THE_ODDS_API_KEY` (optionally `THE_ODDS_API_BOOKMAKERS` to restrict books)

**Key Endpoints:**

| Endpoint | Purpose |
|---|---|
| `GET /v4/sports/baseball_mlb/events` | Today's MLB event IDs |
| `GET /v4/sports/baseball_mlb/odds?markets=batter_first_inning_scored` | NRFI/YRFI odds for all games |
| `GET /v4/sports/baseball_mlb/events/{eventId}/odds` | Odds for a specific game |

> **Market key:** `batter_first_inning_scored` is the NRFI/YRFI prop market.

---

### 2. OpenWeatherMap API

Provides current weather at each MLB stadium's GPS coordinates. The implementation (`lib/api/weather.ts → fetchVenueWeather`) calls `GET /data/2.5/weather` per outdoor venue (deduped), maps wind degrees to a park-relative direction using each stadium's center-field bearing, and returns dome defaults for roofed or unknown venues. Historical game-time weather for backfills comes from the free **Open-Meteo archive** (`fetchHistoricalWeather`), sampled at the actual first-pitch UTC hour.

**Website:** [openweathermap.org/api](https://openweathermap.org/api)
**Free tier:** 1,000 calls/day
**Env variable:** `OPENWEATHER_API_KEY`

**Stadium data (pre-configured):** `lib/constants/mlb-stadiums.ts` provides `STADIUM_COORDS` (GPS), `STADIUM_IS_DOME`, `STADIUM_CF_BEARING` (for the vector wind model), and park factors for all 30 venues.

---

### 3. MLB Stats API

**Official free API from MLB.com** — provides game schedules, starting pitchers, pitcher stats, real first-inning splits, and team statistics. No authentication or API key required.

**Website:** [statsapi.mlb.com](https://statsapi.mlb.com)
**Docs:** [github.com/toddrob99/MLB-StatsAPI](https://github.com/toddrob99/MLB-StatsAPI)
**Auth:** None — completely free
**Env variable:** None required ✓

**Key Endpoints (as used in `lib/api/mlb-stats.ts`):**

| Endpoint | Purpose |
|---|---|
| `GET /schedule?sportId=1&date=YYYY-MM-DD` | Today's MLB game slate with probable starters |
| `GET /people/{id}/stats?stats=statSplits&group=pitching&sitCodes=i01&season=YYYY` | **Real first-inning splits** (the `i01` situation code) |
| `GET /people/{pitcherId}?hydrate=stats(group=[pitching])` | Pitcher season stats (ERA, WHIP, K, BB) |
| `GET /teams/{teamId}?hydrate=stats` | Team season stats (AVG, OBP, SLG, OPS) |
| `GET /game/{gamePk}/linescore` | First-inning runs for results/backfill |

`fetchPitcherFirstInningSplits` requires an exact `i01` split in the response — if MLB returns no first-inning split, it returns `null` and the engine falls back to an ERA-based estimate (`lib/api/shared-helpers.ts → estimateNrfiRate`, calibrated so a league-average ERA maps to the league half-inning rate). Transient 5xx responses are retried once.

---

### 4. SportsBlaze API (Optional — Enhanced Analytics)

Advanced MLB batting splits, pitcher xStats, and matchup-level analytics.

**Website:** [sportsblaze.com](https://sportsblaze.com)
**Docs:** [docs.sportsblaze.com](https://docs.sportsblaze.com)
**Auth:** `Authorization: Bearer YOUR_KEY` header
**Env variable:** `SPORTSBLAZE_API_KEY`

> If `SPORTSBLAZE_API_KEY` is not set, the splits helpers in `lib/api/sportsblaze.ts` return `null` and lineup splits fall back to the team's `offenseFactor`.

---

### API Call Budget (Daily Estimates)

| API | Calls/Day | Free Tier Limit | Notes |
|---|---|---|---|
| The Odds API | ~30 | ~16/day (500/mo) | NRFI/YRFI odds per game |
| OpenWeatherMap | ~20 | 1,000/day | 1 call per outdoor stadium (venue-deduped) |
| **MLB Stats API** | **~70** | **Unlimited** | **Schedule + season stats + i01 splits (no auth)** |
| SportsBlaze | ~15 | varies | Optional enhanced splits |

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✓ Yes | Clerk auth — publishable key |
| `CLERK_SECRET_KEY` | ✓ Yes | Clerk auth — secret key |
| `DATABASE_URL` | ✓ Yes | Neon PostgreSQL connection string (pooled) |
| `THE_ODDS_API_KEY` | ✓ Yes | NRFI/YRFI odds from 40+ bookmakers |
| `OPENWEATHER_API_KEY` | ✓ Yes | Stadium weather at game time |
| `SPORTSBLAZE_API_KEY` | Optional | Enhanced batting splits and xStats |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Optional | Subscription billing (plus `NEXT_PUBLIC_STRIPE_*_PRICE_ID`) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Optional | API rate limiting |
| `CRON_SECRET` | Optional | Protects `/api/cron` endpoints |
| `ENABLE_DEEPNRFI` / `ENABLE_MONTECARLO` / `ENSEMBLE_VERSION` | Optional | Ensemble++ feature flags (default off) |
| `NEXT_PUBLIC_APP_URL` | Optional | Full URL for metadata/OG images |

**Note:** No API key is needed for MLB game data — the app uses the free, official MLB Stats API (`statsapi.mlb.com`) which requires no authentication.

See `.env.example` for the complete list with descriptions.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     app/  (Next.js App Router)                   │
│   Dashboard │ Grid View │ Accuracy │ History │ Insights          │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────▼────────────────────────────────────┐
         │           lib/nrfi-engine.ts                            │
         │         computeAllPredictions()                         │
         │                                                         │
         │  Step 0: Dynamic Bayesian shrinkage (Opt #5)            │
         │    k=30/50/80 by pitcher type                           │
         │    θ̂ = (n·NRFI_obs + k·0.718)/(n+k)   ← half-inning    │
         │    Opts #2,#3,#4 + monthly factor applied to λ          │
         │                                                         │
         │  Per half-inning (×2) — lib/nrfi-models.ts             │
         │   compute7ModelEnsemble(λ, pitcher, team, side, …)      │
         │  ┌──────────────────────────────────────────────────┐  │
         │  │ Poisson 12% │ ZIP 30% │ Markov 48% │ MAPRE 10%  │  │
         │  │ logMeta 0%  │ nnInteract 0% │ hierBayes 0%      │  │
         │  │              (meta-models: display-only)          │  │
         │  └──────────────────────────────────────────────────┘  │
         │                                                         │
         │  blend7Models(): home × away product per model          │
         │    (MAPRE override: continuous cross-half correlation)  │
         │                                                         │
         │  calibrateWithMonotonicSpline(raw)  ← identity for now  │
         │  Final: clamp(0.76×cal + 0.24×0.516, 0.18, 0.85)       │
         │                                                         │
         │  [flags] DeepNRFI · Monte Carlo · v2.9 stacker          │
         └───────────────────┬────────────────────────────────────┘
                             │
   ┌─────────────────────────▼────────────────────────────────────┐
   │                    Live API Layer  (lib/api/)                  │
   │  ┌─────────────┐ ┌──────────┐ ┌─────────────┐ ┌───────────┐  │
   │  │ MLB Stats   │ │ The Odds │ │ OpenWeather │ │SportsBlaze│  │
   │  │ + i01 splits│ │ best-line│ │ + Open-Meteo│ │ (optional)│  │
   │  └─────────────┘ └──────────┘ └─────────────┘ └───────────┘  │
   └───────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
v0-mlb-betting-analytics/
├── app/
│   ├── layout.tsx               # Root layout (no Google Fonts — uses CSS vars)
│   ├── page.tsx                 # Landing page
│   ├── globals.css              # Tailwind base + dark-mode CSS variables
│   ├── dashboard/ bets/ bankroll/ watchlist/ history/ accuracy/ insights/
│   │                            # Protected pages (Clerk middleware)
│   └── api/
│       ├── predictions/         # GET — today's live predictions (force-dynamic, tier-gated)
│       ├── results/             # GET — first-inning results by date
│       ├── games/               # GET — game list
│       ├── backtest/            # Walk-forward backtests → BacktestRun
│       ├── historical-sync/     # DB backfill (GameResult + ModelPrediction + odds)
│       ├── backfill/            # localStorage backfill (max 30 days, no DB writes)
│       ├── performance/         # GET — model accuracy stats
│       ├── bets/ bankroll/ watchlist/   # Per-user records (CRUD)
│       ├── export-data/         # CSV export (GameResult ⋈ ModelPrediction)
│       ├── stripe/ subscription/        # Billing + tier management
│       ├── webhooks/clerk/      # Clerk user sync (svix-verified)
│       ├── cron/ weekly-recap/  # Scheduled jobs (CRON_SECRET-protected)
│       ├── monte-carlo/ feature-importance/  # Diagnostics for Ensemble++
│       ├── db-status/ debug/    # Deployment diagnostics
│       └── contact/             # Enterprise inquiry stub
│
├── components/
│   ├── ui/                      # shadcn/ui base components (Radix UI)
│   ├── game-prediction-card.tsx # Per-game NRFI card + value analysis + form dots
│   ├── model-insights.tsx       # Educational walkthrough of the ensemble math
│   ├── prediction-header.tsx    # 5-stat summary bar
│   ├── pitcher-stats.tsx        # Pitcher rankings with 1st-inning stats
│   ├── team-stats.tsx           # Team YRFI rate rankings
│   └── history-table.tsx        # Historical prediction log
│
├── lib/
│   ├── types.ts                 # All TypeScript interfaces — source of truth
│   ├── nrfi-engine.ts           # Ensemble orchestration, blend, confidence, tiers
│   ├── nrfi-models.ts           # Model implementations + shrinkage + ENSEMBLE_WEIGHTS
│   ├── calibration.ts           # Monotone 19-knot calibration (identity until refit)
│   ├── calibration-v2.ts        # v2.9 pipeline calibration (identity until refit)
│   ├── weather.ts               # Vector wind + humidity multiplier (Opt #3)
│   ├── backtest-metrics.ts      # Brier, calibration bins, Kelly/flat ROI, drawdown
│   ├── monte-carlo.ts           # Seeded first-inning play-by-play simulation
│   ├── deepnrfi-model.ts        # LightGBM scoring layer (flag-gated)
│   ├── ensemble-plus.ts         # 9-model v2.9 stacker (flag-gated)
│   ├── advanced-stats.ts        # FIP / xFIP / SIERA (canonical formulas)
│   ├── config.ts                # Central constants — Kelly, league averages, FLAGS
│   ├── prediction-store.ts      # buildTrackedPrediction() — NRFIPrediction → DB
│   ├── stripe.ts subscription.ts rate-limit.ts
│   ├── mock-data.ts             # Fallback mock data when API keys are absent
│   ├── prisma.ts                # Prisma client singleton — always import from here
│   ├── api/
│   │   ├── live-data.ts         # getLiveGameSlate() — MLB + odds + weather + splits
│   │   ├── mlb-stats.ts         # MLB Stats API wrappers (incl. i01 splits, retry)
│   │   ├── odds.ts              # The Odds API — best-line shopping per side
│   │   ├── weather.ts           # OpenWeatherMap + Open-Meteo historical archive
│   │   ├── shared-helpers.ts    # estimateNrfiRate (league-anchored), scale constants
│   │   └── sportsblaze.ts statcast.ts lineups.ts people.ts
│   ├── features/                # air-density, umpire-zone, extended park factors
│   ├── utils/odds.ts            # American↔decimal, implied prob, Kelly, no-vig
│   └── constants/
│       ├── mlb-teams.ts         # Static team registry with apiId (MLB numeric ID)
│       └── mlb-stadiums.ts      # Park factors, GPS coords, dome flags, CF bearings
│
├── __tests__/                   # vitest suites (engine, models, calibration,
│                                #   backtest metrics, audit regression guards)
├── prisma/schema.prisma         # Neon PostgreSQL schema (User, Bet, Bankroll,
│                                #   GameResult, ModelPrediction, BacktestRun, …)
├── scripts/                     # deepnrfi training, statcast refresh, verifiers
├── middleware.ts                # Clerk auth — protects /dashboard /bets /watchlist …
├── AUDIT_REPORT.md              # June 2026 quantitative audit (pre-fix snapshot)
├── AUDIT_FIXES.md               # Per-finding remediation status
└── .env.example                 # All environment variables documented
```

---

## Configuration

### Model Config (`lib/nrfi-models.ts`)

Raw design-intent weights, normalised to sum to 1.0 at definition time. The base-four split (12 : 30 : 48 : 10) is design intent, **not** CV-optimized; meta-model weights are 0 pending walk-forward CV:

```typescript
// lib/nrfi-models.ts
const RAW_ENSEMBLE_WEIGHTS = {
  poisson:           0.12,  // Poisson base model
  zip:               0.30,  // Zero-Inflated Poisson (lockdown + active split)
  markov:            0.48,  // 24-state Markov chain
  mapre:             0.10,  // Multi-Factor Adjusted Poisson Run Expectancy
  logisticMeta:      0,     // display-only (deterministic transform of base 4)
  nnInteraction:     0,     // display-only
  hierarchicalBayes: 0,     // display-only
}

export const LEAGUE_AVG_NRFI  = 0.516              // game level, 2024–2025
export const LEAGUE_HALF_NRFI = Math.sqrt(0.516)   // half-inning level ≈ 0.718
export const MARKOV_CALIBRATION_EXPONENT = 1.285   // structural-bias correction
```

### Ensemble Blend (`lib/nrfi-engine.ts`)

```typescript
const ENSEMBLE_BLEND      = 0.76
const LEAGUE_ANCHOR       = calibrateWithMonotonicSpline(0.516)  // = 0.516 under identity
const CLAMP_MIN           = 0.18
const CLAMP_MAX           = 0.85
const NRFI_CALL_THRESHOLD = 0.52
```

### Kelly Settings (`lib/config.ts`)

```typescript
CONFIG.kelly = {
  scaling: 0.25,  // quarter Kelly
  minEdge: 0.03,  // 3% minimum edge before a bet is recommended
  maxBet:  0.05,  // 5% of bankroll cap on the fractional-Kelly stake
}
```

### Vector Weather Tuning (`lib/weather.ts`)

```typescript
// Opt #3: vector projection — wind × cos(direction angle) × humidity adjustment
windEffect     = windSpeed × cos((windDeg − parkOrientation) × π/180)
humidityEffect = 1 + ((humidity − 50) / 100) × 0.016
                 // humid air is LESS dense → slightly more carry (≈ ±1.6% per 100% RH)
multiplier     = clamp(1 + windEffect × 0.012 × humidityEffect, 0.82, 1.22)

// Direction mapping (park-relative):
//   "out"       → 0°   (cos = +1.0, max carry boost)
//   "crosswind" → 90°  (cos =  0.0, no net effect)
//   "in"        → 180° (cos = −1.0, suppresses scoring)
```

### Recommendation Tiers & Confidence

```typescript
// getRecommendation() — lib/nrfi-engine.ts
nrfiProbability >= 0.62  → "STRONG_NRFI"
nrfiProbability >= 0.52  → "LEAN_NRFI"   // NRFI_CALL_THRESHOLD
nrfiProbability >= 0.38  → "TOSS_UP"
nrfiProbability >= 0.28  → "LEAN_YRFI"
nrfiProbability <  0.28  → "STRONG_YRFI"

// computeConfidence() — lib/nrfi-engine.ts
score >= 62  → "High"
score 45–61  → "Medium"
score < 45   → "Low"
```

---

## Live Data Architecture

The live data pipeline is fully implemented. Here is how the pieces connect:

### Data Flow

```
app/api/predictions/route.ts   (GET, force-dynamic — responses are tier-gated per user)
  └── getLiveGameSlate(date)   lib/api/live-data.ts
        ├── fetchGamesByDate()              → MLB Stats API (schedule + probable starters)
        ├── fetchPitcherStats()             → MLB Stats API (season ERA, WHIP, K%, BB%)
        ├── fetchPitcherFirstInningSplits() → MLB Stats API (real i01 splits)
        ├── fetchTeamStats()                → MLB Stats API (OPS, OBP, SLG)
        ├── extractNrfiOdds()               → The Odds API  (best line per side)
        ├── fetchVenueWeather()             → OpenWeatherMap (deduped by venue)
        └── fetchTeamSplits()               → SportsBlaze    (optional)
  └── computeAllPredictions(games, pitchers, teams)   lib/nrfi-engine.ts
```

All dates resolved in ET timezone:

```typescript
new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
// → "YYYY-MM-DD" in Eastern time — never use new Date().toISOString().split("T")[0]
```

### Fallback Behaviour

When API keys are absent the engine degrades gracefully — it never crashes:
- **No Odds API key** → odds field is `undefined`; value-bet section hidden in UI
- **No OpenWeatherMap key** → dome-default weather (neutral multipliers)
- **No i01 split returned** → ERA-anchored estimate via `estimateNrfiRate` (pitcher tagged `statsSource: "default"` vs `"live"`)
- **No probable pitcher** → placeholder ID `tbd-home-{gamePk}`; default stats (ERA 4.0, WHIP 1.28, K% 22.5)
- **No SportsBlaze key** → lineup splits fall back to `offenseFactor`

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | ^16.2 |
| UI Library | React | 19.2 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | v4.1 |
| Components | shadcn/ui + Radix UI | — |
| Auth | Clerk | — |
| ORM / DB | Prisma v5 / Neon PostgreSQL | — |
| Billing | Stripe | — |
| Charts | Recharts | — |
| Testing | Vitest | — |
| Icons | Lucide React | 0.454 |
| Analytics | Vercel Analytics | 1.3 |
| Package Manager | pnpm | — |

---

## Deployment

### Vercel (Recommended)

```bash
pnpm build:prod  # Verify type-check + lint + build pass locally
```

Then connect the repo to [vercel.com](https://vercel.com) and add environment variables in the Vercel dashboard.

### Environment Variables in Vercel

Go to **Project Settings → Environment Variables** and add:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` ✓ Required
- `DATABASE_URL` ✓ Required
- `THE_ODDS_API_KEY` ✓ Required
- `OPENWEATHER_API_KEY` ✓ Required
- `SPORTSBLAZE_API_KEY`, Stripe keys, Upstash keys, `CRON_SECRET` (optional)
- `NEXT_PUBLIC_APP_URL` → your deployed URL

No API key needed for MLB game data (uses free MLB Stats API).

---

## Disclaimer

This tool is intended for informational and educational purposes. NRFI/YRFI probabilities are statistical estimates and do not guarantee outcomes. Sports betting involves risk; never wager more than you can afford to lose. Verify that sports betting is legal in your jurisdiction before participating.

---

## License

MIT © 2026
