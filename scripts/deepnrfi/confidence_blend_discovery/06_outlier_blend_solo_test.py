"""
Holdout validation of the remaining, previously-untested combo categories from
the uploaded "Master Documentation": Outlier-Filtered Blends (median-of-8,
trim-2, std<=15 filter) and its top Solo pick (ZIP alone). Completes the
coverage started by 04_agreement_directional_test.py (Agreement/5vX) and
05_dig_deeper_c1_c2.py (redundancy/correction check on the Agreement result).

Pre-registered directly from the source document's own stated criteria (not
re-mined here), same discipline as 04:
  D1: Median-of-8 blend,        symmetric confidence >= 60%
  D2: Trim-2 blend (drop 2 highest/2 lowest of 8, average remaining 4),
                                 symmetric confidence >= 60%
  D3: Std<=15-filtered raw mean-of-8 (raw mean >= 60% confidence AND
                                 std of the 8 raw probabilities <= 15pp)
  D4: Solo ZIP,                 symmetric confidence >= 60%
      (the source doc's own consistently-cited top solo performer)

For each candidate: train (descriptive), holdout (confirmatory, exact
one-sided binomial test vs the 52.4% breakeven), and pooled (2023-2026,
descriptive) views, exactly mirroring 04/05's structure.

IMPORTANT CUMULATIVE-LOOK CAVEAT: this is now the THIRD distinct methodology
tested against the same 1,470-game 2026 holdout snapshot this session (after
01/02/03's bucket combos and 04/05's Agreement combos). Multiple-comparison
correction is applied WITHIN this 4-candidate family, but does not and cannot
account for the fact that the same holdout has now been looked at three
separate times by three different analyses -- each additional look further
erodes the holdout's purity as a genuinely untouched confirmatory set. This
is disclosed here rather than presented as a fully virgin test.

Usage:
    python 06_outlier_blend_solo_test.py --csv path/to/nrfi-data-all-<date>.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    from scipy.stats import binomtest
    from statsmodels.stats.proportion import proportion_confint
except ImportError as e:
    print(f"Missing dep: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e

ALL8_COLUMNS = [
    "poissonNrfi", "zipNrfi", "markovNrfi", "mapreNrfi",
    "logisticMetaNrfi", "nnInteractionNrfi", "hierarchicalBayesNrfi", "ensembleNrfi",
]
TRAIN_SEASONS = (2023, 2024, 2025)
HOLDOUT_SEASON = 2026
BREAKEVEN = 0.524
THRESHOLD = 0.60


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", required=True)
    return p.parse_args()


def load_8model_csv(csv_path: str) -> pd.DataFrame:
    raw = pd.read_csv(csv_path)
    df = pd.DataFrame()
    for col in ALL8_COLUMNS:
        df[col] = pd.to_numeric(raw[col], errors="coerce") / 100.0
    df["nrfi_is_nrfi"] = raw["nrfi"].astype(str).str.upper().eq("NRFI")
    df["season"] = pd.to_numeric(raw["season"], errors="coerce").astype("Int64")
    df["date"] = pd.to_datetime(raw["date"])
    return df


def wilson(wins: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    lo, hi = proportion_confint(wins, n, alpha=0.05, method="wilson")
    return float(lo), float(hi)


# ─── Candidate definitions ────────────────────────────────────────────────

def median_blend(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Returns (side_is_nrfi, confidence) per game."""
    vals = df[ALL8_COLUMNS].to_numpy()
    med = np.median(vals, axis=1)
    side_nrfi = med >= 0.5
    conf = np.where(side_nrfi, med, 1.0 - med)
    return side_nrfi, conf


def trim2_blend(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    vals = np.sort(df[ALL8_COLUMNS].to_numpy(), axis=1)
    trimmed = vals[:, 2:-2]  # drop 2 lowest, 2 highest -> remaining 4
    avg = trimmed.mean(axis=1)
    side_nrfi = avg >= 0.5
    conf = np.where(side_nrfi, avg, 1.0 - avg)
    return side_nrfi, conf


def std_filtered_mean_blend(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (side_is_nrfi, confidence, std_ok) -- std_ok is the extra filter mask."""
    vals = df[ALL8_COLUMNS].to_numpy()
    avg = vals.mean(axis=1)
    std_pp = vals.std(axis=1, ddof=1) * 100.0  # percentage points
    side_nrfi = avg >= 0.5
    conf = np.where(side_nrfi, avg, 1.0 - avg)
    std_ok = std_pp <= 15.0
    return side_nrfi, conf, std_ok


def solo_zip(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    z = df["zipNrfi"].to_numpy()
    side_nrfi = z >= 0.5
    conf = np.where(side_nrfi, z, 1.0 - z)
    return side_nrfi, conf


def evaluate(df: pd.DataFrame, cid: str) -> tuple[np.ndarray, np.ndarray]:
    """Returns (qualifies, is_win) for the given candidate id."""
    is_nrfi_actual = df["nrfi_is_nrfi"].to_numpy()
    if cid == "D1_median":
        side_nrfi, conf = median_blend(df)
        qualifies = conf >= THRESHOLD
    elif cid == "D2_trim2":
        side_nrfi, conf = trim2_blend(df)
        qualifies = conf >= THRESHOLD
    elif cid == "D3_std_filter":
        side_nrfi, conf, std_ok = std_filtered_mean_blend(df)
        qualifies = (conf >= THRESHOLD) & std_ok
    elif cid == "D4_solo_zip":
        side_nrfi, conf = solo_zip(df)
        qualifies = conf >= THRESHOLD
    else:
        raise ValueError(cid)
    is_win = side_nrfi == is_nrfi_actual
    return qualifies, is_win


def bonferroni(pvalues: list[float], alpha: float = 0.05) -> list[bool]:
    corrected = alpha / len(pvalues)
    return [p < corrected for p in pvalues]


def benjamini_hochberg(pvalues: list[float], alpha: float = 0.05) -> list[bool]:
    m = len(pvalues)
    order = sorted(range(m), key=lambda i: pvalues[i])
    reject = [False] * m
    max_k = -1
    for rank, idx in enumerate(order, start=1):
        if pvalues[idx] <= (rank / m) * alpha:
            max_k = rank
    for rank, idx in enumerate(order, start=1):
        if rank <= max_k:
            reject[idx] = True
    return reject


LABELS = {
    "D1_median": "Median-of-8 blend (>=60% symmetric confidence)",
    "D2_trim2": "Trim-2 blend: drop 2 highest/2 lowest of 8, avg remaining 4 (>=60%)",
    "D3_std_filter": "Std<=15-filtered raw mean-of-8 (>=60% AND std<=15pp)",
    "D4_solo_zip": "Solo ZIP (>=60% symmetric confidence)",
}


def analyze_view(df: pd.DataFrame, cid: str) -> dict:
    qualifies, is_win = evaluate(df, cid)
    n = int(qualifies.sum())
    wins = int(is_win[qualifies].sum())
    hit_rate = wins / n if n else None
    lo, hi = wilson(wins, n)
    p_breakeven = binomtest(wins, n, BREAKEVEN, alternative="greater").pvalue if n else None
    return {"n": n, "wins": wins, "hit_rate": hit_rate, "wilson_lower": lo, "wilson_upper": hi,
            "p_vs_breakeven": p_breakeven}


def print_view(name: str, r: dict, confirmatory: bool) -> None:
    tag = "[CONFIRMATORY]" if confirmatory else "[descriptive]"
    if r["n"]:
        print(f"    {name:8s} {tag}: n={r['n']:5d} wins={r['wins']:5d} hit_rate={r['hit_rate']:.4f} "
              f"wilson=({r['wilson_lower']:.4f},{r['wilson_upper']:.4f}) p(vs 52.4%)={r['p_vs_breakeven']:.4f}")
    else:
        print(f"    {name:8s} {tag}: n=0")


def main() -> int:
    args = parse_args()
    df = load_8model_csv(args.csv)
    train = df[df["season"].isin(TRAIN_SEASONS)]
    holdout = df[df["season"] == HOLDOUT_SEASON]
    pooled = df

    print("=== Outlier-Filtered Blend + Solo ZIP holdout validation ===")
    print(f"Train: n={len(train)}   Holdout: n={len(holdout)}   Pooled: n={len(pooled)}\n")
    print("CUMULATIVE-LOOK CAVEAT: this is the 3rd distinct methodology tested against this same")
    print("2026 holdout snapshot this session -- see module docstring.\n")

    holdout_pvals = []
    holdout_ids = []
    for cid, label in LABELS.items():
        print(f"--- {cid}: {label} ---")
        for view_name, view_df, confirmatory in (
            ("train", train, False), ("holdout", holdout, True), ("pooled", pooled, False),
        ):
            r = analyze_view(view_df, cid)
            print_view(view_name, r, confirmatory)
            if view_name == "holdout" and r["n"] > 0:
                holdout_pvals.append(r["p_vs_breakeven"])
                holdout_ids.append(cid)
        print()

    print("=== Multiple-comparison correction across the 4-candidate HOLDOUT family ===")
    bonf = bonferroni(holdout_pvals)
    bh = benjamini_hochberg(holdout_pvals)
    for cid, p, b, h in zip(holdout_ids, holdout_pvals, bonf, bh):
        print(f"  {cid}: raw p={p:.4f}  Bonferroni(4)={'SURVIVES' if b else 'fails'}  "
              f"BH(4)={'SURVIVES' if h else 'fails'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
