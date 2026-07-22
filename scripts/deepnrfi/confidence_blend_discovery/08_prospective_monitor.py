"""
Prospective monitor: tracks the Master Documentation's Top 50 combos (Tier 1,
descriptive-only watch list) plus 5 formally pre-registered candidates
(Tier 2, the actual confirmatory test), computed ONLY on games dated after
the frozen cutoff (2026-07-18) -- i.e. genuinely new data that no analysis
this session has ever seen, searched over, or selected on.

See PROSPECTIVE_MONITORING_SPEC.md for the full pre-registration this script
implements. Do not add candidates to TIER2_CANDIDATES after the fact -- that
defeats the purpose of pre-registering them now, before any new data exists.

Usage:
    python 08_prospective_monitor.py --csv path/to/a/FRESH/export.csv

Re-run this against a new export any time (weekly, monthly, end of season)
to check progress. Each Tier-2 candidate has its own independent n=150
target and will reach it at a different time -- see the spec for expected
timelines per candidate.
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
    ALL8_COLUMNS, load_8model_csv, wilson, evaluate_combo as _evaluate_agreement_sets,
    bonferroni, benjamini_hochberg,
)

FROZEN_CUTOFF = pd.Timestamp("2026-07-18")
TARGET_N = 150
BREAKEVEN = 0.524

NAME_TO_COL = {
    "Markov": "markovNrfi", "Logistic Meta": "logisticMetaNrfi",
    "Hierarchical Bayes": "hierarchicalBayesNrfi", "Ensemble": "ensembleNrfi",
    "NN Interaction": "nnInteractionNrfi", "Poisson": "poissonNrfi",
    "MAPRE": "mapreNrfi", "ZIP": "zipNrfi",
}
assert sorted(NAME_TO_COL.values()) == sorted(ALL8_COLUMNS), "NAME_TO_COL must cover exactly the 8 canonical columns"

# ─── Tier 1: the source document's own Top 50 (descriptive-only, never promotable) ──
TOP50_RAW = [
    "Logistic Meta+Poisson vs Ensemble+MAPRE",
    "Ensemble+MAPRE vs Hierarchical Bayes+NN Interaction+Poisson+ZIP",
    "Markov+Logistic Meta+ZIP vs Ensemble+Poisson+MAPRE",
    "MAPRE vs Logistic Meta+Ensemble",
    "Logistic Meta vs Ensemble+Poisson+MAPRE",
    "Markov+Ensemble vs Logistic Meta+MAPRE+ZIP",
    "Markov+Ensemble+Poisson vs Logistic Meta+MAPRE+ZIP",
    "MAPRE vs Markov+Ensemble+ZIP",
    "MAPRE vs Markov+Logistic Meta+Ensemble+ZIP",
    "Logistic Meta+MAPRE+ZIP vs Hierarchical Bayes+Ensemble+NN Interaction",
    "Poisson+MAPRE vs Markov+Logistic Meta+Ensemble",
    "MAPRE vs Logistic Meta+Poisson",
    "Markov+Ensemble vs Poisson+MAPRE",
    "Logistic Meta+Hierarchical Bayes+Ensemble+NN Interaction+ZIP vs MAPRE",
    "Hierarchical Bayes+NN Interaction+Poisson+MAPRE+ZIP vs Logistic Meta+Ensemble",
    "MAPRE vs Logistic Meta+Ensemble+Poisson",
    "Markov+Logistic Meta+Ensemble+Poisson+ZIP vs MAPRE",
    "Hierarchical Bayes+NN Interaction+ZIP vs Ensemble+Poisson+MAPRE",
    "Logistic Meta+MAPRE+ZIP vs Hierarchical Bayes+Ensemble+NN Interaction+Poisson",
    "Ensemble+Poisson+MAPRE vs Logistic Meta+Hierarchical Bayes+NN Interaction+ZIP",
    "Markov vs Ensemble+Poisson+MAPRE",
    "Logistic Meta+MAPRE+ZIP vs Markov+Hierarchical Bayes+Ensemble+NN Interaction",
    "MAPRE vs Markov+Logistic Meta+Poisson+ZIP",
    "Markov+Logistic Meta vs Ensemble+Poisson+MAPRE",
    "MAPRE vs Markov+Poisson+ZIP",
    "Markov+Logistic Meta+Hierarchical Bayes+NN Interaction+ZIP vs Ensemble+Poisson+MAPRE",
    "Hierarchical Bayes+NN Interaction vs Logistic Meta+MAPRE+ZIP",
    "Ensemble+Poisson+MAPRE vs Markov+Logistic Meta+Hierarchical Bayes+NN Interaction",
    "Markov+Hierarchical Bayes+NN Interaction+Poisson+ZIP vs Ensemble+MAPRE",
    "Markov vs Logistic Meta+MAPRE+ZIP",
    "MAPRE vs Hierarchical Bayes+Ensemble+NN Interaction+ZIP",
    "MAPRE vs Hierarchical Bayes+NN Interaction+ZIP",
    "Markov+Hierarchical Bayes+NN Interaction+Poisson+ZIP vs MAPRE",
    "Markov+Logistic Meta vs Poisson+MAPRE",
    "Markov+Ensemble+NN Interaction vs Logistic Meta+MAPRE+ZIP",
    "NN Interaction+Poisson vs Logistic Meta+MAPRE+ZIP",
    "Markov+Hierarchical Bayes+Ensemble+NN Interaction+ZIP vs Poisson+MAPRE",
    "MAPRE vs Markov+ZIP",
    "MAPRE vs Markov+Logistic Meta+Hierarchical Bayes+Ensemble",
    "Ensemble+MAPRE vs Logistic Meta+Hierarchical Bayes+NN Interaction+Poisson",
    "Logistic Meta+MAPRE+ZIP vs Markov+Ensemble+NN Interaction+Poisson",
    "Poisson+MAPRE vs Hierarchical Bayes+Ensemble+NN Interaction",
    "MAPRE vs Markov+Ensemble+Poisson+ZIP",
    "Logistic Meta vs Poisson+MAPRE",
    "Markov+Logistic Meta+Hierarchical Bayes+NN Interaction+ZIP vs Poisson+MAPRE",
    "Logistic Meta+Hierarchical Bayes+NN Interaction+Poisson+ZIP vs Ensemble+MAPRE",
    "Markov+Poisson vs Logistic Meta+MAPRE+ZIP",
    "Markov+NN Interaction vs Logistic Meta+MAPRE+ZIP",
    "Markov+Ensemble+ZIP vs Logistic Meta+Poisson+MAPRE",
    "Ensemble+Poisson+MAPRE vs Markov+Hierarchical Bayes+NN Interaction+ZIP",
]
assert len(TOP50_RAW) == 50, f"expected 50, got {len(TOP50_RAW)}"


def parse_combo(raw: str) -> tuple[list[str], list[str]]:
    left, right = raw.split(" vs ")
    setA = [NAME_TO_COL[n.strip()] for n in left.split("+")]
    setB = [NAME_TO_COL[n.strip()] for n in right.split("+")]
    return setA, setB


TOP50 = [(f"T{i+1}", raw, parse_combo(raw)) for i, raw in enumerate(TOP50_RAW)]

# ─── Tier 2: formally pre-registered candidates (frozen, see spec) ──────────
TIER2 = {
    "F1_EnsembleMAPRE_blend": {"kind": "blend", "cols": ["ensembleNrfi", "mapreNrfi"]},
    "F2_solo_ZIP": {"kind": "solo", "col": "zipNrfi"},
    "F3_ZIP+HB_vs_Poisson+MAPRE": {"kind": "agreement", "setA": ["zipNrfi", "hierarchicalBayesNrfi"],
                                    "setB": ["poissonNrfi", "mapreNrfi"]},
    "F4_median_of_8": {"kind": "median"},
    "F5_5v2_vs_EnsembleMAPRE": {"kind": "agreement",
                                "setA": ["markovNrfi", "hierarchicalBayesNrfi", "nnInteractionNrfi",
                                         "poissonNrfi", "zipNrfi"],
                                "setB": ["ensembleNrfi", "mapreNrfi"]},
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", required=True, help="A FRESH export -- ideally pulled after 2026-07-18")
    return p.parse_args()


def evaluate_agreement(df: pd.DataFrame, setA: list[str], setB: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Thin wrapper: this module only ever needs (qualifies, is_win), not the
    predicted-side array common8.evaluate_combo also returns."""
    qualifies, _predicted_is_nrfi, is_win = _evaluate_agreement_sets(df, setA, setB, threshold=0.60)
    return qualifies, is_win


def evaluate_blend(df: pd.DataFrame, cols: list[str]) -> tuple[np.ndarray, np.ndarray]:
    avg = df[cols].mean(axis=1).to_numpy()
    side_nrfi = avg >= 0.5
    conf = np.where(side_nrfi, avg, 1.0 - avg)
    qualifies = conf >= 0.60
    is_win = side_nrfi == df["nrfi_is_nrfi"].to_numpy()
    return qualifies, is_win


def evaluate_solo(df: pd.DataFrame, col: str) -> tuple[np.ndarray, np.ndarray]:
    v = df[col].to_numpy()
    side_nrfi = v >= 0.5
    conf = np.where(side_nrfi, v, 1.0 - v)
    qualifies = conf >= 0.60
    is_win = side_nrfi == df["nrfi_is_nrfi"].to_numpy()
    return qualifies, is_win


def evaluate_median(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    vals = df[ALL8_COLUMNS].to_numpy()
    med = np.median(vals, axis=1)
    side_nrfi = med >= 0.5
    conf = np.where(side_nrfi, med, 1.0 - med)
    qualifies = conf >= 0.60
    is_win = side_nrfi == df["nrfi_is_nrfi"].to_numpy()
    return qualifies, is_win


def evaluate_tier2(df: pd.DataFrame, spec: dict) -> tuple[np.ndarray, np.ndarray]:
    if spec["kind"] == "blend":
        return evaluate_blend(df, spec["cols"])
    if spec["kind"] == "solo":
        return evaluate_solo(df, spec["col"])
    if spec["kind"] == "agreement":
        return evaluate_agreement(df, spec["setA"], spec["setB"])
    if spec["kind"] == "median":
        return evaluate_median(df)
    raise ValueError(spec["kind"])


def main() -> int:
    args = parse_args()
    df = load_8model_csv(args.csv)
    fresh = df[df["date"] > FROZEN_CUTOFF].reset_index(drop=True)

    print(f"=== Prospective Monitor (frozen cutoff: {FROZEN_CUTOFF.date()}) ===")
    print(f"Fresh (never-before-seen) rows in this export: {len(fresh)}")
    if len(fresh) == 0:
        print("\nNo games after the frozen cutoff yet in this export -- nothing to report.")
        print("Re-run this script against a newer export once more games have been played.")
        return 0

    print("\n--- Tier 1: Top 50 watch list (descriptive only, never promotable) ---")
    for tid, label, (setA, setB) in TOP50:
        qualifies, is_win = evaluate_agreement(fresh, setA, setB)
        n = int(qualifies.sum())
        if n == 0:
            continue
        wins = int(is_win[qualifies].sum())
        print(f"  {tid}: {label}  n={n} wins={wins} hit_rate={wins/n:.4f}")
    print("  (rows with n=0 on the fresh data omitted for brevity)")

    print(f"\n--- Tier 2: pre-registered candidates (target n>={TARGET_N} each) ---")
    ready_ids, ready_pvals = [], []
    for cid, spec in TIER2.items():
        qualifies, is_win = evaluate_tier2(fresh, spec)
        n = int(qualifies.sum())
        wins = int(is_win[qualifies].sum())
        hit_rate = wins / n if n else None
        lo, hi = wilson(wins, n)
        progress = f"{n}/{TARGET_N}"
        if n > 0:
            print(f"  {cid}: n={n} ({progress}) wins={wins} hit_rate={hit_rate:.4f} wilson=({lo:.4f},{hi:.4f})")
        else:
            print(f"  {cid}: n=0 ({progress})")
        if n >= TARGET_N:
            p = binomtest(wins, n, BREAKEVEN, alternative="greater").pvalue
            ready_ids.append(cid)
            ready_pvals.append(p)

    if ready_ids:
        print(f"\n=== {len(ready_ids)} candidate(s) have reached n>={TARGET_N} -- formal test unlocked ===")
        bonf = bonferroni(ready_pvals)
        bh = benjamini_hochberg(ready_pvals)
        for cid, p, b, h in zip(ready_ids, ready_pvals, bonf, bh, strict=True):
            print(f"  {cid}: raw p={p:.4f}  Bonferroni({len(ready_ids)})={'SURVIVES' if b else 'fails'}  "
                  f"BH({len(ready_ids)})={'SURVIVES' if h else 'fails'}")
        print(f"\n  Correction applied across {len(ready_ids)} ready candidate(s) at THIS revisit -- "
              f"not necessarily all 5, since they reach target at different times (see spec).")
    else:
        print(f"\nNo Tier-2 candidate has reached n>={TARGET_N} yet. Re-run against a later export.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
