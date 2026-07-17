# v3 Model Evaluation Report
**Date:** 2026-07-17  
**Evaluated by:** Claude Code (claude-haiku-4-5-20251001)  
**Status:** ❌ HOLD (Gate not passed)  
**Latest Update:** v3_enhanced model trained with Statcast aggregates

---

## Executive Summary

Two v3 iterations were evaluated as meta-learners trained on individual model outputs from the v1 ensemble:

1. **v3 (meta-features only):** Trained on 6 aggregate features (Poisson, ZIP, Markov, Ensemble7 outputs + confidence + model NRFI %)
2. **v3_enhanced:** Enhanced with Statcast-derived pitcher statistics (K-rate, BB-rate, velocity)

Both variants evaluated on held-out 2026 data show **marginal degradation** vs v1, though v3_enhanced is much closer to the promotion gate.

**Promotion Gate Result:** ❌ **FAILED (both)**
- Required: `Brier(v3) < 0.2468` (v1_brier - 0.002)
- v3 result: `0.2594` (Delta: +0.0106, failed by wide margin)
- v3_enhanced result: `0.2497` (Delta: +0.0009, missed gate by 0.0029)

---

## Metrics Comparison

### 2026 Hold-out Test Set (n=1,445 games)

| Metric | v1 (Baseline) | v3 (Meta-features) | v3_enhanced (+ Statcast) | Gate? |
|--------|---|---|---|---|
| Test Brier | **0.2488** | 0.2594 | **0.2497** | < 0.2468 needed |
| Log Loss | 0.6949 | 0.7143 | 0.6926 | — |
| Delta vs v1 | — | +0.0106 ❌ | +0.0009 ❌ | — |
| Status | ✅ | ❌ Failed | ❌ Missed by 0.0029 | — |

### v3 Training Performance (meta-features only)

| Metric | Value |
|--------|-------|
| Train Brier | 0.2229 |
| Test Brier | 0.2594 |
| Overfit Gap | 0.0365 |

### v3_enhanced Training Performance (with Statcast aggregates)

| Metric | Value |
|--------|-------|
| Train Brier | 0.2489 |
| Test Brier | 0.2497 |
| Overfit Gap | 0.0008 |

**Key Finding:** v3_enhanced shows dramatically reduced overfitting (0.0008 vs 0.0365 gap), indicating the added features improved generalization. However, both variants marginally underperform v1 on the test set.

---

## Feature Importance

### v3 (Meta-features only)
1. **ZIP NRFI** (1364) — ZIP model output
2. **Poisson NRFI** (1273) — Poisson model output
3. **Ensemble7 NRFI** (912) — Base ensemble output
4. **Markov NRFI** (892) — Markov model output
5. Confidence Score (485)
6. Model NRFI % (169)

### v3_enhanced (with Statcast aggregates, top 5)
1. **Confidence Probability** (42.0) — Ensemble confidence tier
2. **Poisson Probability** (40.4) — Poisson model output
3. **Markov Probability** (25.8) — Markov model output
4. **ZIP Probability** (21.3) — ZIP model output
5. **Ensemble7 Probability** (15.2) — Base ensemble output

**Insight:** Even with added pitcher quality features (K-rate, BB-rate, velocity), the meta-learner weights ensemble outputs 94% of the time. This indicates:
1. v1 ensemble already captures most predictive signal at the model level
2. Individual pitcher stats (when used as league averages due to missing pitcher ID mapping) add minimal incremental value
3. Improvement requires more granular pitcher-game matching and batter statistics

---

## Root Cause Analysis

**Why v3 Failed (and v3_enhanced Marginally):**

Both meta-learner variants marginally underperformed v1 because:

1. **Limited Feature Granularity:** 
   - v3 used only 6 aggregate features (individual model outputs + confidence)
   - v3_enhanced added pitcher quality features, but only as league-wide averages (no pitcher ID mapping from results CSV to Statcast)
   
2. **Insufficient Signal in Features Explored:**
   - Ensemble outputs are already well-calibrated via `lib/calibration.ts` (league anchor blending)
   - Additional league-average pitcher stats provided minimal incremental gain (94% of weights still go to ensemble outputs)
   
3. **Missing Underlying Game-Level Features:**
   To truly improve the ensemble, a meta-learner would need:
   - **Pitcher stats (game-specific):** Individual K-rate, BB-rate, HR/9, BABIP, velocity, spin, stuff+
   - **Batter stats:** OPS, wRC+, K%, BB%, hand splits, BABIP
   - **Weather:** Temperature, wind (velocity + direction), humidity, pressure, dome indicator
   - **Umpire:** Zone tightness, career NRFI rate
   - **Park:** Factor, elevation, first-inning run rate
   - **Context:** Rest days, travel miles, bullpen games

**Data Engineering Challenge:**
The primary blocker to full feature engineering is matching pitcher/batter IDs from the results export to Statcast records. Attempted approaches:
- MLB Stats API boxscore fetches → **timed out** (2500+ requests × ~100ms each on session network)
- Statcast aggregation by pitcher ID → **successful for aggregate stats** but requires name-to-ID mapping for individual pitcher stats

---

## Data Sources Available for Future Work

The following public MLB datasets are available for building complete game-level features:

### Primary Sources (Statcast Pitch-by-Pitch)
- **MLB Statcast:** Cached parquet files in `scripts/deepnrfi/data/`
  - `statcast_2023-03-01_2025-09-30.parquet` (306 MB, 2.3M pitches)
  - Fields: `pitcher`, `batter`, `game_date`, `inning`, `release_speed`, `spin_rate_deprecated`, `pitch_type`, `events`
  - Already loaded and ready for vectorized aggregation

### Secondary Sources (Player & Season Stats)
- **Lahman Database (Kaggle):**
  - Pitcher: `Pitching.csv` (career year-season stats), `Appearances.csv` (game logs)
  - Batter: `Batting.csv` (season stats), `PitchingPost.csv` (postseason)
  - Download: `https://www.kaggle.com/datasets/seanlahman/the-baseball-databank`

- **pybaseball (blocked by FanGraphs 403):**
  - Advanced stats: wRC+, BABIP, HR/9, Stuff+, Pitching+
  - Status: FanGraphs access restricted (would need workaround)

- **baseball.computer:**
  - Play-by-play simulation data (xwOBA, xBA, etc.)
  - Requires authentication; can be queried directly if API credentials available

- **Retrosheet:**
  - Play-by-play and game logs (historical, pre-Statcast era)
  - Download: `https://www.retrosheet.org/`

- **baseballr (R package, not directly Python-accessible):**
  - SABR leaderboards, advanced splits
  - Would require R → Python data export

- **Kaggle Datasets:**
  - "MLB Stats and Salary Data" — seasonal aggregates
  - "MLB Pitch Data" — alternative Statcast source
  - Search: `https://www.kaggle.com/search?q=baseball`

### Stadium & External Context
- **MLB Stats API** (`statsapi.mlb.com/api/v1`):
  - Parks info: elevation, location
  - Game info: home/away teams, venue
  - Status: Free, no auth required

---

## Recommendation

**Status:** ❌ **DO NOT PROMOTE v3 or v3_enhanced**

### Action Items

1. **To improve ensemble in future:**
   - [ ] Source individual pitcher-game stats from Lahman or Statcast aggregation (NOT league averages)
   - [ ] Build pitcher ID → name mapping from Statcast header data
   - [ ] Extract game-level pitcher K-rate, BB-rate, velocity (season-to-date at game time)
   - [ ] Add batter stats (OPS, wRC+, K%) if dataset available (Kaggle, Lahman)
   - [ ] Add weather & umpire context (Statcast includes `umpire` field + weather is in Stadium API)
   - [ ] Run full retraining locally with complete feature set
   - [ ] Target: reduce Brier from 0.2488 to **< 0.2468** (≥0.002 improvement)

2. **v1 remains active:** Keep current ensemble in production
   - Brier: 0.2488 on held-out 2026
   - Hit rate @ 3% edge: 53.8%
   - Stable performance across confidence tiers
   - Current production model: `scripts/deepnrfi/artifacts/model_v1.txt`

3. **Session constraints workaround:**
   - v3_enhanced training completed in <180s (optimized vectorized approach)
   - Bottleneck: individual pitcher ID mapping → still requires ~2-5 min for full dataset
   - Recommend: Run locally on machine without session timeouts, or chunk processing by season

---

## Dataset Summary

- **Training data:** 7,287 games (2023-2025)
- **Test data (held-out):** 1,445 games (2026)
- **Total:** 8,732 games with full ground truth
- **Source:** Exported from production dashboard + cached Statcast pitch-by-pitch

**Train/Test Split:** Time-ordered (2023-2025 train, 2026 test)

---

## Artifacts Generated

### Models
- `scripts/deepnrfi/artifacts/model_v3.txt` — v3 LightGBM (6 meta-features only, Brier 0.2594)
- `scripts/deepnrfi/artifacts/model_v3_enhanced.txt` — v3_enhanced (+ Statcast aggregates, Brier 0.2497)
- `scripts/deepnrfi/artifacts/model_v1.txt` — v1 baseline (currently active, Brier 0.2488)

### Training Data & Results
- `scripts/deepnrfi/data/training.csv` — 8,732 games with ensemble outputs + labels
- `scripts/deepnrfi/data/training_v3_enhanced.csv` — Enhanced version with Statcast pitcher aggregates
- `scripts/deepnrfi/artifacts/v3_enhanced_results.json` — Detailed metrics from v3_enhanced training
- `scripts/deepnrfi/data/statcast_2023-03-01_2025-09-30.parquet` — Full Statcast (2.3M pitches)

### Evaluation Reports
- This document (`V3_EVALUATION_REPORT.md`)
- Previous evaluation: See `scripts/deepnrfi/artifacts/manifest.json` for v3 meta-learner metrics

---

## Summary

| Aspect | Finding |
|--------|---------|
| **v3 (meta-features)** | ❌ Brier 0.2594 (gate failed by 0.0106) |
| **v3_enhanced** | ❌ Brier 0.2497 (gate failed by 0.0029, but much closer) |
| **v1 baseline** | ✅ Brier 0.2488 (current production) |
| **Feature signal** | Ensemble outputs + confidence already near-optimal for meta-learning |
| **Path forward** | Requires individual pitcher-game stats, not league averages |
| **Data available** | Statcast (✅), Lahman (✅), Retrosheet (✅), others (mostly ✅) |

---

**Gate Decision:** ❌ **HOLD** — Neither v3 nor v3_enhanced meet Brier improvement threshold.  
**Production Status:** v1 ensemble remains active and stable.  
**Recommendation:** Full retraining with individual pitcher-game features should be attempted on local machine to eliminate session timeouts. Contact data source maintainers if pitcher-to-ID mapping issues arise.
