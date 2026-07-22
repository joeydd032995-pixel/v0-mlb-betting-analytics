"""
Shared utilities for the 8-model external-document validation scripts
(04-08), as distinct from common.py's 7-model canonical bucket-combo
pipeline (01-03). Ensemble is included here as an 8th peer model to match
the uploaded Master Documentation's own methodology -- common.py
deliberately excludes it there, since in this repo Ensemble is the blend
output itself, not an independent model.
"""

from __future__ import annotations

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


def load_8model_csv(csv_path: str) -> pd.DataFrame:
    raw = pd.read_csv(csv_path)
    required = {"date", "season", "nrfi", *ALL8_COLUMNS}
    missing = required - set(raw.columns)
    if missing:
        raise ValueError(f"CSV missing expected columns: {sorted(missing)}")

    df = pd.DataFrame()
    for col in ALL8_COLUMNS:
        df[col] = pd.to_numeric(raw[col], errors="coerce") / 100.0
    n_null = int(df[ALL8_COLUMNS].isna().any(axis=1).sum())
    if n_null:
        print(f"WARNING: {n_null} rows have a null model column; Set averages for those rows "
              f"silently drop the null model(s) rather than excluding the row -- "
              f"this deviates from a strict 'average of all N models' definition.", file=sys.stderr)
    df["nrfi_is_nrfi"] = raw["nrfi"].astype(str).str.upper().eq("NRFI")
    df["season"] = pd.to_numeric(raw["season"], errors="coerce").astype("Int64")
    df["date"] = pd.to_datetime(raw["date"])
    return df


def wilson(wins: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    lo, hi = proportion_confint(wins, n, alpha=0.05, method="wilson")
    return float(lo), float(hi)


def evaluate_combo(df: "pd.DataFrame", setA: list[str], setB: list[str],
                    threshold: float = 0.60) -> tuple["np.ndarray", "np.ndarray", "np.ndarray"]:
    """Agreement(2-set)/5vX evaluation: returns (qualifies, predicted_is_nrfi, is_win)."""
    avgA = df[setA].mean(axis=1).to_numpy()
    avgB = df[setB].mean(axis=1).to_numpy()
    side_a_nrfi = avgA >= 0.5
    conf_a = np.where(side_a_nrfi, avgA, 1.0 - avgA)
    side_b_nrfi = avgB >= 0.5
    conf_b = np.where(side_b_nrfi, avgB, 1.0 - avgB)
    qualifies = (conf_a >= threshold) & (conf_b >= threshold) & (side_a_nrfi == side_b_nrfi)
    predicted_is_nrfi = side_a_nrfi
    is_win = predicted_is_nrfi == df["nrfi_is_nrfi"].to_numpy()
    return qualifies, predicted_is_nrfi, is_win


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
