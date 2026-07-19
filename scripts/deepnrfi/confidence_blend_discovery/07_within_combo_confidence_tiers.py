"""
Within-combo confidence-tier breakdown: for each combo/blend already tested
in 04/06 against the 2026 holdout, does restricting to a STRICTER confidence
tier WITHIN its already-qualifying game set produce a cleaner signal than the
whole qualifying population (which used a flat >=60% threshold)?

This is different from everything tested before -- 04/06 asked "does this
combo fire produce an edge," this asks "among games where it already fires,
is the higher-confidence subset better than the lower-confidence subset."

IMPORTANT: this is EXPLORATORY ONLY, not confirmatory. It is the FOURTH
distinct examination of the same 1,470-game 2026 holdout this session (after
bucket combos, Agreement combos, and outlier-blend/solo), and slicing an
already-tested combo's own qualifying set into finer confidence bins after
the fact is itself a further, un-pre-registered look -- no correction
framework meaningfully applies at this depth of post-hoc slicing. Reported
plainly as a diagnostic to answer a direct question, not as a new candidate
for the eligibility bar.

Usage:
    python 07_within_combo_confidence_tiers.py --csv path/to/nrfi-data-all-<date>.csv
"""

from __future__ import annotations

import argparse
import sys

try:
    import numpy as np
    import pandas as pd
    from statsmodels.stats.proportion import proportion_confint
except ImportError as e:
    print(f"Missing dep: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e

ALL8_COLUMNS = [
    "poissonNrfi", "zipNrfi", "markovNrfi", "mapreNrfi",
    "logisticMetaNrfi", "nnInteractionNrfi", "hierarchicalBayesNrfi", "ensembleNrfi",
]
HOLDOUT_SEASON = 2026
TIER_EDGES = [0.60, 0.65, 0.70, 0.75, 0.80, 1.01]  # last tier is 80%+ (closed)
TIER_LABELS = ["[60,65)", "[65,70)", "[70,75)", "[75,80)", "[80,100]"]


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
    return df


def wilson(wins: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    lo, hi = proportion_confint(wins, n, alpha=0.05, method="wilson")
    return float(lo), float(hi)


# ─── Candidate confidence/side computation (mirrors 04/06's own definitions) ──

def agreement_conf(df: pd.DataFrame, setA: list[str], setB: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    avgA = df[setA].mean(axis=1).to_numpy()
    avgB = df[setB].mean(axis=1).to_numpy()
    side_a_nrfi = avgA >= 0.5
    conf_a = np.where(side_a_nrfi, avgA, 1.0 - avgA)
    side_b_nrfi = avgB >= 0.5
    conf_b = np.where(side_b_nrfi, avgB, 1.0 - avgB)
    qualifies = (conf_a >= 0.60) & (conf_b >= 0.60) & (side_a_nrfi == side_b_nrfi)
    # combo-level confidence: mean of the two sets' own confidences
    combo_conf = (conf_a + conf_b) / 2.0
    side_nrfi = side_a_nrfi
    return qualifies, side_nrfi, combo_conf


def blend_conf(df: pd.DataFrame, cols: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    avg = df[cols].mean(axis=1).to_numpy()
    side_nrfi = avg >= 0.5
    conf = np.where(side_nrfi, avg, 1.0 - avg)
    qualifies = conf >= 0.60
    return qualifies, side_nrfi, conf


def median_conf(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    vals = df[ALL8_COLUMNS].to_numpy()
    med = np.median(vals, axis=1)
    side_nrfi = med >= 0.5
    conf = np.where(side_nrfi, med, 1.0 - med)
    qualifies = conf >= 0.60
    return qualifies, side_nrfi, conf


CANDIDATES = {
    "C1_LogMeta+Poisson_vs_Ensemble+MAPRE": lambda df: agreement_conf(
        df, ["logisticMetaNrfi", "poissonNrfi"], ["ensembleNrfi", "mapreNrfi"]),
    "C2_5v2_vs_Ensemble+MAPRE": lambda df: agreement_conf(
        df, ["markovNrfi", "hierarchicalBayesNrfi", "nnInteractionNrfi", "poissonNrfi", "zipNrfi"],
        ["ensembleNrfi", "mapreNrfi"]),
    "C3_Poisson+MAPRE_vs_HB+Ensemble+NNI": lambda df: agreement_conf(
        df, ["poissonNrfi", "mapreNrfi"], ["hierarchicalBayesNrfi", "ensembleNrfi", "nnInteractionNrfi"]),
    "D_Ensemble+MAPRE_alone": lambda df: blend_conf(df, ["ensembleNrfi", "mapreNrfi"]),
    "D1_median_of_8": lambda df: median_conf(df),
}


def main() -> int:
    args = parse_args()
    df = load_8model_csv(args.csv)
    holdout = df[df["season"] == HOLDOUT_SEASON].reset_index(drop=True)
    is_nrfi_actual = holdout["nrfi_is_nrfi"].to_numpy()

    print(f"=== Within-combo confidence-tier breakdown (2026 holdout, n={len(holdout)}) ===")
    print("EXPLORATORY ONLY -- 4th look at this holdout, not pre-registered, no correction applies.\n")

    for name, fn in CANDIDATES.items():
        qualifies, side_nrfi, conf = fn(holdout)
        is_win = side_nrfi == is_nrfi_actual
        n_total = int(qualifies.sum())
        print(f"--- {name} (whole qualifying set: n={n_total}) ---")

        sub_conf = conf[qualifies]
        sub_win = is_win[qualifies]

        rows = []
        for lo, hi, label in zip(TIER_EDGES[:-1], TIER_EDGES[1:], TIER_LABELS):
            mask = (sub_conf >= lo) & (sub_conf < hi)
            n_t = int(mask.sum())
            w_t = int(sub_win[mask].sum())
            hr_t = w_t / n_t if n_t else None
            lo_ci, hi_ci = wilson(w_t, n_t)
            rows.append((label, n_t, w_t, hr_t, lo_ci, hi_ci))
            if n_t:
                print(f"    {label:10s} n={n_t:4d} wins={w_t:4d} hit_rate={hr_t:.4f} wilson=({lo_ci:.4f},{hi_ci:.4f})")
            else:
                print(f"    {label:10s} n=0")

        # simple monotonicity check: is hit rate trending up with tier?
        valid = [(i, r[3]) for i, r in enumerate(rows) if r[3] is not None and r[1] >= 10]
        if len(valid) >= 2:
            xs = [i for i, _ in valid]
            ys = [hr for _, hr in valid]
            slope = np.polyfit(xs, ys, 1)[0]
            direction = "increasing" if slope > 0.01 else ("decreasing" if slope < -0.01 else "flat/noisy")
            print(f"    trend across tiers (n>=10 only): {direction} (slope={slope:+.4f} per tier)")
        else:
            print(f"    trend across tiers: insufficient tiers with n>=10 to assess")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
