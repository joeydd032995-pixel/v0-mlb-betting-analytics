# Directional Agreement-Combo Validation — Findings

**Status:** ✅ RUN COMPLETE (2026-07-19). Validates 3 specific combos from an externally-uploaded
"Master Documentation" report against real 2023-2026 data. **This is not part of this repo's
own canonical `confidence_blend_discovery` search space** (see `CONFIDENCE_BLEND_DISCOVERY_SPEC.md`,
`CONFIDENCE_BLEND_FINDINGS.md`) — those search this repo's 7-model bucket-cell space. This
document instead tests an external analysis's own combos, on its own terms (including treating
`ensembleNrfi` as an 8th peer model, which this repo's own pipeline deliberately does not do),
because the request was to validate that document's specific claims, not to re-derive a new one.

**Dataset:** same real export as the canonical pipeline (`ed1ef6d4-nrfidata20260719.csv`).
Train = 7,287 games (2023-2025). Holdout = 1,470 games (2026). Pooled = 8,757 games (no split).

## Pre-registered candidates

Drawn verbatim from the source document's own "Consolidated Recommendations" section — not
re-mined here, since re-searching would add another uncorrected layer on top of the (already
uncorrected) search that produced that document's rankings.

| ID | Combo | Category | Pre-registered directional hypothesis |
|---|---|---|---|
| C1 | Logistic Meta+Poisson vs Ensemble+MAPRE | Agreement(2-set) | Two-sided: NRFI-only rate ≠ YRFI-only rate |
| C2 | Markov+Hierarchical Bayes+NN Interaction+Poisson+ZIP vs Ensemble+MAPRE | 5vX Agreement | Two-sided |
| C3 | Poisson+MAPRE vs Hierarchical Bayes+Ensemble+NN Interaction | Agreement(2-set) | One-sided: YRFI-only rate > NRFI-only rate (the source doc's own claimed direction) |

**Minimum sample floor:** N≥100 per direction, pre-registered before any view was computed.

## Verdict: directional hypotheses — none testable on the confirmatory holdout

| Combo | Holdout NRFI n | Holdout YRFI n | Directional test |
|---|---|---|---|
| C1 | 105 | **15** | SKIPPED — below N≥100 floor |
| C2 | 145 | **19** | SKIPPED — below N≥100 floor |
| C3 | 99 | **2** | SKIPPED — below N≥100 floor (both sides) |

Splitting a 1,470-game holdout by predicted direction leaves too few games per side to run any
of the three pre-registered tests. The multiple-comparison correction step (Bonferroni,
Benjamini-Hochberg) has nothing to correct, since no p-value was produced.

## Train-period result (descriptive only, not confirmatory)

Where sample size was adequate (C1, C2), the two-sided z-test comparing NRFI-only vs YRFI-only
hit rate found **no significant difference**:

| Combo | NRFI hit rate (n) | YRFI hit rate (n) | z | p-value |
|---|---|---|---|---|
| C1 | 62.18% (193) | 63.28% (177) | -0.219 | 0.827 |
| C2 | 62.56% (219) | 59.66% (233) | 0.632 | 0.527 |
| C3 | 57.89% (247) | 75.00% (52) | — | SKIPPED — YRFI n=52 below floor |

The source document's "directional asymmetry" narrative does not survive a basic significance
test even on the same data it claims to observe it in. C3's own headline YRFI-only sample (52
games, 75% hit rate) is itself below the N≥100 floor the pre-registration requires — the
"genuinely actionable" framing in the source document was never adequately powered.

## Undirected combo-level result on real holdout (separate from the directional question)

Setting the NRFI/YRFI split aside, the combo's overall (undirected) hit rate on the real 2026
holdout:

| Combo | Holdout n | Holdout hit rate | Wilson 95% lower bound | Clears 52.4% breakeven? |
|---|---|---|---|---|
| C1 | 120 | 60.00% | 51.06% | ✅ Yes |
| C2 | 164 | 59.15% | 51.50% | ✅ Yes |
| C3 | 101 | 55.45% | 45.73% | ❌ No |

**Caveat:** these 3 candidates were selected from the source document's own uncorrected search
over 600+ combos. Clearing breakeven here is a genuinely more encouraging signal than this
session's own from-scratch bucket-combo search (which found a clean negative on all 3
pre-registered candidates), but it does not carry the same statistical confidence as a fully
pre-registered single-hypothesis test — the underlying selection process that produced C1/C2/C3
was never itself corrected for multiple comparisons.

## Split vs. pooled comparison (as requested)

Pooling 2023-2026 systematically shows *higher* hit rates than the holdout-only view, because
pooling re-mixes in the same train-period games the combo was implicitly built to fit:

| Combo | Train hit rate | Holdout-only hit rate | Pooled (2023-2026) hit rate |
|---|---|---|---|
| C1 | 62.70% | 60.00% | 62.04% |
| C2 | 61.06% | 59.15% | 60.55% |
| C3 | 60.87% | 55.45% | 59.50% |

This is the mechanism flagged before building this script: pooling produces a number closer to
the (inflated) train-period figure than to the honest fresh-data figure, because most of the
pooled sample is still the train-period games.

## Methodology notes

- **Ensemble treated as an 8th model**, exactly matching the source document's own definitions —
  this repo's own `common.py` deliberately excludes it (it's the blend output, not an
  independent model), but that choice was set aside here to test the source document's claims on
  its own terms.
- **Two-proportion z-test** (`statsmodels.stats.proportion.proportions_ztest`) compares the
  NRFI-only and YRFI-only subsets directly, as two disjoint independent samples — not
  subset-vs-pooled-superset, which would not be a valid independent comparison since the subset
  is nested inside the pooled sample.
- **N≥100 per-side floor** was pre-registered before computing any view, per this session's own
  request.
