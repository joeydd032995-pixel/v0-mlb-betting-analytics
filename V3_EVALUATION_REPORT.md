# v3 Model Evaluation Report
**Date:** 2026-07-17  
**Evaluated by:** Claude Code (claude-haiku-4-5-20251001)  
**Status:** ❌ HOLD (Gate not passed)

---

## Executive Summary

v3 was trained as a meta-learner combining individual model outputs (Poisson, ZIP, Markov, Ensemble7) from the v1 ensemble. Evaluation on held-out 2026 data shows **degraded performance** relative to v1.

**Promotion Gate Result:** ❌ **FAILED**
- Required: `Brier(v3) < 0.2486` (v1_brier - 0.002)
- Actual: `Brier(v3) = 0.2594`
- Delta: `+0.0106` (worse)

---

## Metrics Comparison

### 2026 Hold-out Test Set (n=1445 games)
| Metric | v1 (Current) | v3 (Proposed) | Result |
|--------|---|---|---|
| Brier Score | **0.2488** | 0.2594 | v3 worse ✗ |
| Log Loss | 0.6949 | 0.7143 | v3 worse ✗ |
| Accuracy | 53.2% | 50.1% | v3 worse ✗ |

### Training Performance
| Metric | Value |
|--------|-------|
| Train Brier | 0.2229 |
| Test Brier | 0.2594 |
| Overfit Gap | 0.0365 |

The large gap between train and test Brier indicates **overfitting** — the meta-learner learned patterns specific to 2023-2025 that don't generalize to 2026.

---

## Feature Importance (v3)
What features mattered most to the meta-learner:

1. **ZIP NRFI** (1364) — ZIP model output
2. **Poisson NRFI** (1273) — Poisson model output
3. **Ensemble7 NRFI** (912) — Base ensemble output
4. **Markov NRFI** (892) — Markov model output
5. Confidence Score (485)
6. Model NRFI % (169)

**Insight:** The meta-learner mostly just re-weighted the base models without extracting new signal. This indicates the v1 ensemble is already optimal *given these features*.

---

## Root Cause Analysis

**Why v3 Failed:**

The meta-learner was trained on only **6 aggregate features** (individual model outputs + confidence). To improve the ensemble, v3 would need access to the **underlying game-level features** that the individual models consume:

- Pitcher stats: K-rate, BB-rate, HR/9, BABIP, velocity, spin, stuff+
- Batter stats: OPS, wRC+, K%, BB%, hand-split edges
- Weather: temperature, wind, humidity, pressure, dome
- Umpire: zone tightness, career NRFI rate
- Park: factor, elevation, first-inning run rate
- Context: rest days, travel miles, bullpen games

These features were attempted to be built via `scripts/deepnrfi/build_real_training_set.py`, but the script timed out while fetching boxscores from MLB Stats API (network + rate limiting on 2500+ boxscore requests).

---

## Recommendation

**Status:** ❌ **DO NOT PROMOTE v3**

### Action Items

1. **To improve ensemble in future:**
   - Run `build_real_training_set.py` on a local machine (no session timeouts)
   - Use full feature set (pitcher stats, batter stats, weather, umpire, park)
   - Target: reduce Brier from 0.2488 to **< 0.2468** (≥0.002 improvement)

2. **v1 remains active:** Keep current ensemble in production
   - Brier: 0.2488 on held-out 2026
   - Hit rate @ 3% edge: 53.8%
   - Stable performance across confidence tiers

3. **Future work:**
   - Implement caching layer for MLB Stats API boxscore fetches
   - Consider async/parallel fetching to speed up data pipeline
   - Explore feature engineering on Statcast aggregates directly

---

## Dataset Summary

- **Training data:** 7,287 games (2023-2025)
- **Test data (held-out):** 1,445 games (2026)
- **Total:** 8,732 games with full ground truth
- **Source:** Exported from production dashboard + cached Statcast pitch-by-pitch

**Train/Test Split:** Time-ordered (2023-2025 train, 2026 test)

---

## Artifacts Generated

- `scripts/deepnrfi/artifacts/model_v3.txt` — v3 LightGBM model (meta-learner)
- `scripts/deepnrfi/artifacts/manifest.json` — v3 metrics + promotion gate decision
- `scripts/deepnrfi/data/training.csv` — Combined training data (meta-features + labels)

---

**Gate Decision:** ❌ **HOLD** — v3 does not meet Brier improvement threshold.
**Recommendation:** Keep v1 active. Run full retraining locally when network/timeout constraints can be eliminated.
