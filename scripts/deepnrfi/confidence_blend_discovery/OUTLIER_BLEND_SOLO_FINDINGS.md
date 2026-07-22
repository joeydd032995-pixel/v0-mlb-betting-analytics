# Outlier-Filtered Blend + Solo Model Holdout Validation — Findings

**Status:** ✅ RUN COMPLETE (2026-07-19). Completes the coverage of the uploaded "Master
Documentation"'s combo categories, alongside `CONFIDENCE_BLEND_FINDINGS.md` (this repo's own
bucket-combo search) and `AGREEMENT_DIRECTIONAL_FINDINGS.md` (Agreement/5vX combos).

**Verdict:** ❌ All 4 pre-registered candidates fail. None clear even an uncorrected p<0.05
against the 52.4% breakeven on real 2026 holdout data; all fail Bonferroni and
Benjamini-Hochberg correction across the 4-candidate family.

**⚠️ Cumulative-look caveat:** this is the **third** distinct methodology tested against the
same 1,470-game 2026 holdout snapshot this session (after bucket combos, then Agreement combos).
Correction is applied *within* this 4-candidate family, but cannot account for the fact that the
same holdout has now been examined by three separate analyses — each additional look further
erodes its purity as a genuinely untouched confirmatory set. Disclosed here rather than presented
as a fully virgin test.

## Pre-registered candidates (verbatim from the source document's own stated criteria)

| ID | Candidate | Category |
|---|---|---|
| D1 | Median-of-8 blend, ≥60% symmetric confidence | Outlier-Filtered Blend |
| D2 | Trim-2 blend (drop 2 highest/2 lowest of 8, average remaining 4), ≥60% | Outlier-Filtered Blend |
| D3 | Std≤15-filtered raw mean-of-8 (≥60% AND std of the 8 raw outputs ≤15pp) | Outlier-Filtered Blend |
| D4 | Solo ZIP, ≥60% symmetric confidence | Solo |

## Holdout results

| ID | Holdout n | Wins | Hit rate | Wilson 95% lower | p (vs 52.4% breakeven) | Bonferroni(4) | BH(4) |
|---|---|---|---|---|---|---|---|
| D1 median | 165 | 96 | 58.18% | 50.55% | 0.0791 | fails | fails |
| D2 trim-2 | 155 | 91 | 58.71% | 50.84% | 0.0674 | fails | fails |
| D3 std-filter | 235 | 134 | 57.02% | 50.63% | 0.0878 | fails | fails |
| D4 solo ZIP | 24 | 17 | 70.83% | 50.83% | 0.0528 | fails | fails |

All 4 candidates' Wilson lower bounds fall just short of (or barely past, in raw-p terms) the
breakeven line, and none survive even before correction is applied. D4 (solo ZIP) has the
closest raw p-value (0.0528) but also by far the smallest holdout sample (n=24) — consistent with
the source document's own observation that solo models rarely sustain adequate volume at high
confidence thresholds.

## Combined picture across all three analyses this session

| Category | Best holdout result | Survives correction? |
|---|---|---|
| Bucket combos (this repo's own search) | Wilson lower 50.06% (best of 3) | No — clean negative |
| Agreement(2-set) / 5vX Agreement | Wilson lower 51.50% (best of 3), later shown redundant | No |
| Blend(2) (Ensemble+MAPRE alone) | p=0.040 uncorrected | No |
| Outlier-Filtered Blend (median/trim-2/std-filter) | p=0.067 uncorrected (trim-2, best of 3) | No |
| Solo (ZIP) | p=0.053 uncorrected | No |

Every combo category described in the source document — Solo, Blend, Outlier-Filtered Blend,
Agreement(2-set), and 5vX Agreement — was tested against real, held-out 2026 data this session,
either directly or via a representative candidate drawn from the source document's own stated
recommendations. None produced a result that survives a properly corrected significance test.
