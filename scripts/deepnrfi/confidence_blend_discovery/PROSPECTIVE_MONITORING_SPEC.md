# Prospective Monitoring — Pre-Registration (frozen 2026-07-19)

## Why this exists

Every analysis so far this session (bucket combos, Agreement combos, outlier blends/solo,
within-combo confidence tiers) has repeatedly examined the same 2023-2025 train period and the
same 1,470-game 2026-through-07-18 holdout. Each additional look — even a well-corrected one —
further erodes that holdout's validity as a genuinely untouched confirmatory set. The only way to
get a real, clean answer is to wait for data none of these analyses has ever seen, and to decide
**in advance**, before any of it exists, exactly what will be tested and what sample size will be
required. This document is that advance decision.

## Frozen cutoff

**As-of date: 2026-07-18** (the last date present in `ed1ef6d4-nrfidata20260719.csv`, the export
used by every analysis this session). Any game dated **2026-07-19 or later** has not been touched,
searched, selected on, or examined by anything in this repository. Re-running `08_prospective_monitor.py`
against a newer export will automatically restrict to only those genuinely new rows.

## Two-tier structure (mirrors the discipline used all session)

### Tier 1 — Broad watch list (exploratory, descriptive only, NEVER promotable)

The uploaded Master Documentation's own Top 50 ranked table (its `Top 50 NRFI Model Combinations,
250-750 game sample band`), all 50 combos, monitored prospectively for descriptive tracking only.
**No combo in this list may ever be reported as a validated finding**, regardless of how it
performs — it was selected by an uncorrected search over hundreds of alternatives in the first
place; tracking it prospectively is informative context, not a controlled test.

### Tier 2 — Formally pre-registered candidates (the actual confirmatory test)

Five candidates, chosen now, before any new data exists, for genuine diversity (not all
redundant restatements of the same signal, per the C1/C2 finding) and deliberately including one
hypothesis never tested this session:

| ID | Candidate | Rationale |
|---|---|---|
| F1 | `ensembleNrfi+mapreNrfi` Blend(2), ≥60% | The "core" signal this session's dig-deeper found underlying most Agreement combos — carried forward as the cleanest single representative of that cluster. |
| F2 | Solo `zipNrfi`, ≥60% | Most distinct single model per the correlation matrix (0.09-0.47 vs. all others) — carried forward from the Solo test. |
| F3 | `zipNrfi+hierarchicalBayesNrfi` vs `poissonNrfi+mapreNrfi`, Agreement(2-set), ≥60% each side | **New — never tested this session.** Pairs the two models least correlated with the rest (ZIP, Hierarchical Bayes) as one confirming side against the other two moderately-distinct models (Poisson, MAPRE) — the most genuinely "independent-groups" Agreement structure available, unlike the redundant Ensemble/Markov/Logistic-Meta/NN-Interaction cluster that dominated the source document's own Top 50. |
| F4 | Median-of-8 blend, ≥60% | Outlier-Filtered Blend representative — descriptive-only until now; never run against a genuinely fresh holdout. |
| F5 | `markovNrfi+hierarchicalBayesNrfi+nnInteractionNrfi+poissonNrfi+zipNrfi` vs `ensembleNrfi+mapreNrfi`, 5vX Agreement, ≥60% each side | The source document's own "maximum stability" pick (rank 29 in its Top 50) — carried forward for direct comparison against its prior (failed) holdout result. |

## Sample-size targets (set now, before any new data)

**Target: n ≥ 150 qualifying games**, matching this session's established floor throughout. This
target is set **independently per candidate** — they qualify at very different rates, so they will
not all reach the target at the same time:

| Candidate | Rate observed on the prior 1,470-game holdout | Rough games needed for n=150 |
|---|---|---|
| F1 (Ensemble+MAPRE) | 179/1470 = 12.2% | ~1,230 games (~1 season) |
| F2 (Solo ZIP) | 24/1470 = 1.6% | ~9,375 games (**several seasons** — flagged as likely impractical; report progress honestly rather than wait indefinitely) |
| F3 (ZIP+HB vs Poisson+MAPRE) | not yet observed — new candidate | unknown until first re-run |
| F4 (Median-of-8) | 165/1470 = 11.2% | ~1,340 games (~1 season) |
| F5 (5v2 Agreement) | 164/1470 = 11.2% | ~1,340 games (~1 season) |

## Revisit protocol

1. Pull a fresh CSV export via the app's `GET /api/export-data?model=all` button whenever you want
   to check progress (weekly, monthly, end of season — your choice).
2. Run `python 08_prospective_monitor.py --csv <new export>.csv`.
3. The script reports, for every Tier-1 watch-list combo: cumulative n/wins/hit rate on
   post-2026-07-18 games only (descriptive).
4. For the 5 Tier-2 candidates: current n vs. the n=150 target, and for any candidate that has
   reached the target, the exact one-sided binomial test vs. the 52.4% breakeven, with Bonferroni
   and Benjamini-Hochberg correction applied **across however many candidates have reached target
   at that revisit** (not all 5 by default, since they won't arrive simultaneously — this is
   disclosed explicitly in the script's output every run).

## Boundaries (same discipline as the rest of this session)

- **Always do**: report every Tier-2 candidate's progress honestly, including ones stuck at low n;
  never quietly drop a candidate that isn't looking good.
- **Ask first**: before treating any result as confirmed enough to change betting behavior or ship
  a pricing-page claim — a single corrected test clearing the bar once is still one data point.
- **Never do**: add a 6th candidate to Tier 2 after seeing how the first 5 are trending (that
  reintroduces exactly the multiple-comparisons problem this document exists to prevent); promote
  anything from the Tier-1 watch list to a validated finding, no matter how it performs; lower the
  n≥150 target because a candidate is taking too long.
