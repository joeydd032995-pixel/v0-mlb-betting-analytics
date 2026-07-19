"""
Follow-up diagnostic on C1/C2's "encouraging" holdout result from
AGREEMENT_DIRECTIONAL_FINDINGS.md (both cleared the 52.4% breakeven Wilson
lower bound on real 2026 holdout data, unlike this repo's own from-scratch
bucket-combo search).

Digs into whether that result is real signal or an artifact of testing two
combos that largely fire on the same games, by checking:

  1. Overlap: how much do C1 and C2's holdout-qualifying game sets overlap?
     Both share "Ensemble+MAPRE" as one side, and C1's "Logistic Meta" is
     0.97-0.99 correlated with C2's Markov/NN Interaction/ZIP -- if the two
     combos mostly fire on the same games, "2 of 3 clear breakeven" is closer
     to 1 independent finding counted twice than 2 independent confirmations.
  2. Formal significance: an exact one-sample binomial test (not just "does
     the Wilson lower bound cross the line") of holdout hit rate vs. 0.524
     breakeven and vs. 0.50 coinflip, for all 3 pre-registered combos, with
     Bonferroni/BH correction applied across that 3-combo family (a
     correction AGREEMENT_DIRECTIONAL_FINDINGS.md's directional test needed
     but never got to apply, since sample size was insufficient there).
  3. Simplicity check: does the plain Ensemble+MAPRE Blend(2) alone -- no
     "other side must independently agree" requirement -- already capture
     the same edge on the same holdout? If so, the Agreement mechanism isn't
     earning its added complexity; the (putative) edge lives in Ensemble+MAPRE
     alone, which the source document itself separately flagged as "Best
     simple 2-model blend."
  4. Stability: C1/C2's holdout-qualifying games broken out by month, to see
     whether the edge is spread evenly across the 2026 season or concentrated
     in a hot stretch (mirroring the source document's own monthly-seasonality
     analysis, but computed on genuine out-of-sample holdout data).

Usage:
    python 05_dig_deeper_c1_c2.py --csv path/to/nrfi-data-all-<date>.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    from scipy.stats import binomtest
except ImportError as e:
    print(f"Missing dep: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common8 import (  # noqa: E402
    load_8model_csv, wilson, evaluate_combo as _evaluate_combo_sets,
    bonferroni, benjamini_hochberg,
)

HOLDOUT_SEASON = 2026
BREAKEVEN = 0.524

COMBOS = {
    "C1": {"label": "Logistic Meta+Poisson vs Ensemble+MAPRE",
           "setA": ["logisticMetaNrfi", "poissonNrfi"], "setB": ["ensembleNrfi", "mapreNrfi"], "threshold": 0.60},
    "C2": {"label": "Markov+Hierarchical Bayes+NN Interaction+Poisson+ZIP vs Ensemble+MAPRE",
           "setA": ["markovNrfi", "hierarchicalBayesNrfi", "nnInteractionNrfi", "poissonNrfi", "zipNrfi"],
           "setB": ["ensembleNrfi", "mapreNrfi"], "threshold": 0.60},
    "C3": {"label": "Poisson+MAPRE vs Hierarchical Bayes+Ensemble+NN Interaction",
           "setA": ["poissonNrfi", "mapreNrfi"], "setB": ["hierarchicalBayesNrfi", "ensembleNrfi", "nnInteractionNrfi"],
           "threshold": 0.60},
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", required=True)
    return p.parse_args()


def evaluate_combo(df: pd.DataFrame, combo: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    return _evaluate_combo_sets(df, combo["setA"], combo["setB"], combo["threshold"])


def safe_ratio_pct(num: int, den: int) -> str:
    """'{:.1%}'-style formatting that degrades gracefully instead of raising
    ZeroDivisionError when den == 0 -- this is a repeatable diagnostic meant to
    be rerun on future data pulls where a combo qualifying 0 games is plausible."""
    return f"{num/den:.1%}" if den else "n/a (den=0)"


def safe_fmt4(x: float | None) -> str:
    return f"{x:.4f}" if x is not None else "n/a (n=0)"


def main() -> int:
    args = parse_args()
    df = load_8model_csv(args.csv)
    holdout = df[df["season"] == HOLDOUT_SEASON].reset_index(drop=True)
    print(f"=== Digging into C1/C2 on the {len(holdout)}-game 2026 holdout ===\n")

    qualifies = {}
    wins_arr = {}
    for cid, combo in COMBOS.items():
        q, _, w = evaluate_combo(holdout, combo)
        qualifies[cid] = q
        wins_arr[cid] = w

    # ── 1. Overlap between C1 and C2's qualifying game sets ──────────────────
    print("--- 1. Overlap between C1 and C2 qualifying games (holdout) ---")
    q1, q2 = qualifies["C1"], qualifies["C2"]
    both = q1 & q2
    either = q1 | q2
    n1, n2, nboth, neither_or = int(q1.sum()), int(q2.sum()), int(both.sum()), int(either.sum())
    jaccard = nboth / neither_or if neither_or else float("nan")
    print(f"  C1 qualifying games: {n1}")
    print(f"  C2 qualifying games: {n2}")
    print(f"  Games qualifying for BOTH: {nboth}")
    print(f"  Games qualifying for EITHER: {neither_or}")
    print(f"  Jaccard overlap (both / either): {jaccard:.3f}")
    print(f"  Of C1's {n1} games, {nboth} ({safe_ratio_pct(nboth, n1)}) also qualify for C2")
    print(f"  Of C2's {n2} games, {nboth} ({safe_ratio_pct(nboth, n2)}) also qualify for C1")
    if nboth > 0:
        win_agree = int((wins_arr['C1'][both] == wins_arr['C2'][both]).sum())
        print(f"  On the {nboth} shared games, C1 and C2 give the identical win/loss outcome "
              f"{win_agree}/{nboth} times ({safe_ratio_pct(win_agree, nboth)}) -- expected if they're mostly "
              f"scoring the same underlying prediction on the same games.")
    print()

    # ── 2. Formal significance test vs breakeven and vs 50%, corrected ────────
    print("--- 2. Exact binomial test vs breakeven (52.4%) and vs 50%, corrected across C1/C2/C3 ---")
    results = {}
    for cid, combo in COMBOS.items():
        q = qualifies[cid]
        n = int(q.sum())
        wins = int(wins_arr[cid][q].sum())
        hit_rate = wins / n if n else None
        lo, hi = wilson(wins, n)
        p_vs_breakeven = binomtest(wins, n, BREAKEVEN, alternative="greater").pvalue if n else None
        p_vs_coinflip = binomtest(wins, n, 0.50, alternative="greater").pvalue if n else None
        results[cid] = {"n": n, "wins": wins, "hit_rate": hit_rate, "wilson": (lo, hi),
                         "p_vs_breakeven": p_vs_breakeven, "p_vs_coinflip": p_vs_coinflip}
        print(f"  {cid} ({combo['label']}): n={n} wins={wins} hit_rate={safe_fmt4(hit_rate)} "
              f"wilson=({lo:.4f},{hi:.4f})")
        print(f"      p(vs 52.4% breakeven, one-sided exact) = {safe_fmt4(p_vs_breakeven)}")
        print(f"      p(vs 50% coinflip, one-sided exact)    = {safe_fmt4(p_vs_coinflip)}")

    pvals_breakeven = [results[c]["p_vs_breakeven"] for c in ("C1", "C2", "C3")]
    if any(p is None for p in pvals_breakeven):
        print("\n  One or more combos qualified 0 holdout games -- skipping multiple-comparison correction.")
    else:
        bonf = bonferroni(pvals_breakeven)
        bh = benjamini_hochberg(pvals_breakeven)
        print(f"\n  Bonferroni-corrected alpha = {0.05/3:.4f}  (vs breakeven, family of 3)")
        for cid, p, b, h in zip(("C1", "C2", "C3"), pvals_breakeven, bonf, bh, strict=True):
            print(f"    {cid}: raw p={p:.4f}  Bonferroni={'SURVIVES' if b else 'fails'}  BH={'SURVIVES' if h else 'fails'}")
    print()

    # ── 3. Does plain Ensemble+MAPRE alone (no agreement) capture the same edge? ──
    print("--- 3. Simplicity check: Ensemble+MAPRE Blend(2) alone, no agreement requirement ---")
    avg = holdout[["ensembleNrfi", "mapreNrfi"]].mean(axis=1).to_numpy()
    side_nrfi = avg >= 0.5
    conf = np.where(side_nrfi, avg, 1.0 - avg)
    blend_qualifies = conf >= 0.60
    blend_win = side_nrfi == holdout["nrfi_is_nrfi"].to_numpy()
    n_b = int(blend_qualifies.sum())
    wins_b = int(blend_win[blend_qualifies].sum())
    hit_rate_b = wins_b / n_b if n_b else None
    lo_b, hi_b = wilson(wins_b, n_b)
    p_b = binomtest(wins_b, n_b, BREAKEVEN, alternative="greater").pvalue if n_b else None
    print(f"  Ensemble+MAPRE alone (>=60% symmetric confidence): n={n_b} wins={wins_b} "
          f"hit_rate={safe_fmt4(hit_rate_b)} wilson=({lo_b:.4f},{hi_b:.4f}) p(vs breakeven)={safe_fmt4(p_b)}")
    overlap_with_c1 = int((blend_qualifies & qualifies["C1"]).sum())
    overlap_with_c2 = int((blend_qualifies & qualifies["C2"]).sum())
    print(f"  Of Ensemble+MAPRE's {n_b} qualifying games, {overlap_with_c1} ({safe_ratio_pct(overlap_with_c1, n_b)}) "
          f"also qualify for C1, {overlap_with_c2} ({safe_ratio_pct(overlap_with_c2, n_b)}) also qualify for C2")
    print(f"  Of C1's {n1} qualifying games, {overlap_with_c1} ({safe_ratio_pct(overlap_with_c1, n1)}) also satisfy "
          f"Ensemble+MAPRE>=60% on their own")
    print(f"  Of C2's {n2} qualifying games, {overlap_with_c2} ({safe_ratio_pct(overlap_with_c2, n2)}) also satisfy "
          f"Ensemble+MAPRE>=60% on their own")
    print()

    # ── 4. Stability across the 2026 holdout by month ─────────────────────────
    print("--- 4. C1/C2 stability by month (2026 holdout) ---")
    holdout = holdout.assign(month=holdout["date"].dt.month)
    for cid in ("C1", "C2"):
        print(f"  {cid}:")
        q = qualifies[cid]
        sub = holdout.loc[q].copy()
        sub["win"] = wins_arr[cid][q]
        by_month = sub.groupby("month")["win"].agg(["count", "sum"])
        for month, row in by_month.iterrows():
            n_m, w_m = int(row["count"]), int(row["sum"])
            hr_m = w_m / n_m if n_m else float("nan")
            print(f"    month={month:2d}  n={n_m:3d}  win_rate={hr_m:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
