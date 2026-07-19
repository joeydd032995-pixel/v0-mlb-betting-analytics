"""
Directional (NRFI-only vs YRFI-only) significance test for 3 specific, named
Agreement / 5vX-Agreement combos from an EXTERNAL analysis (the uploaded
"Master Documentation" / "Top 50 NRFI Model Combinations" report).

This is NOT part of this repo's own canonical confidence_blend_discovery
search space (01/02/03, CONFIDENCE_BLEND_DISCOVERY_SPEC.md) -- those search
the 7 model x bucket-cell space this repo's ModelPrediction schema defines.
This script instead validates 3 specific combos the EXTERNAL document already
ranked as its own top recommendations (its "Consolidated Recommendations"
section), pre-registered here verbatim from that document's text -- not
re-mined by this script, because re-searching would just add another
uncorrected round of multiple comparisons on top of the (already uncorrected)
search that produced the external document's rankings in the first place.

Definitions match the external document's own methodology exactly, including
treating "Ensemble" as an 8th peer model alongside the other 7 (this repo's
own common.py deliberately EXCLUDES Ensemble from combo search, since it's
the blend output itself, not an independent model -- that choice is set
aside here only because the goal is to test the external document's claims
on the external document's own terms, not to re-litigate its model list).

For each pre-registered combo, reports THREE views side by side:
  - train   (2023-2025): descriptive only, NOT a confirmatory test
  - holdout (2026): the confirmatory test -- multiple-comparison corrected
  - pooled  (2023-2026, no split): included on request, to show empirically
    how much the naive pooled approach (used throughout the external
    document) can overstate apparent significance vs. a disciplined holdout

For each view:
  - Combo-level hit rate + Wilson 95% CI over all qualifying games
  - NRFI-only and YRFI-only subset hit rate + Wilson 95% CI (each only
    computed if n >= 100, the pre-registered minimum per side)
  - A two-proportion z-test comparing the NRFI-only subset's hit rate
    against the YRFI-only subset's hit rate directly (two disjoint,
    independent samples -- NOT subset-vs-pooled-superset, which would
    not be a valid independent comparison since the subset is nested
    inside the pooled sample)

Multiple-comparison correction (Bonferroni and Benjamini-Hochberg) is applied
across the 3 combos' directional z-tests on the HOLDOUT view only -- that is
the single confirmatory family. Train and pooled p-values are reported for
comparison but are explicitly NOT treated as confirmatory evidence.

Usage:
    python 04_agreement_directional_test.py --csv path/to/nrfi-data-all-<date>.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    from statsmodels.stats.proportion import proportion_confint, proportions_ztest
except ImportError as e:
    print(f"Missing dep: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e

ALL8_COLUMNS = [
    "poissonNrfi", "zipNrfi", "markovNrfi", "mapreNrfi",
    "logisticMetaNrfi", "nnInteractionNrfi", "hierarchicalBayesNrfi", "ensembleNrfi",
]
TRAIN_SEASONS = (2023, 2024, 2025)
HOLDOUT_SEASON = 2026
MIN_DIRECTIONAL_N = 100

# ─── Pre-registered candidates (verbatim from the uploaded Master Documentation's
# "Consolidated Recommendations" section) ────────────────────────────────────
COMBOS = [
    {
        "id": "C1_max_pooled",
        "label": "Logistic Meta+Poisson vs Ensemble+MAPRE",
        "category": "Agreement(2-set)",
        "setA": ["logisticMetaNrfi", "poissonNrfi"],
        "setB": ["ensembleNrfi", "mapreNrfi"],
        "threshold": 0.60,
        "alternative": "two-sided",
        "source": "Master Documentation: 'Maximum pooled win rate' recommendation (62.70%, 370 games pooled)",
    },
    {
        "id": "C2_max_stability",
        "label": "Markov+Hierarchical Bayes+NN Interaction+Poisson+ZIP vs Ensemble+MAPRE",
        "category": "5vX Agreement",
        "setA": ["markovNrfi", "hierarchicalBayesNrfi", "nnInteractionNrfi", "poissonNrfi", "zipNrfi"],
        "setB": ["ensembleNrfi", "mapreNrfi"],
        "threshold": 0.60,
        "alternative": "two-sided",
        "source": "Master Documentation: 'Maximum stability/consistency' recommendation (61.06%, 452 games pooled)",
    },
    {
        "id": "C3_yrfi_specific",
        "label": "Poisson+MAPRE vs Hierarchical Bayes+Ensemble+NN Interaction",
        "category": "Agreement(2-set)",
        "setA": ["poissonNrfi", "mapreNrfi"],
        "setB": ["hierarchicalBayesNrfi", "ensembleNrfi", "nnInteractionNrfi"],
        "threshold": 0.60,
        # Pre-registered ONE-SIDED per the source doc's own claim (Section 5.2):
        # "MAPRE vs Ensemble+Poisson ... 75.61% YRFI (41) vs 59.85% NRFI (137)"
        # -- the doc claims YRFI-only beats NRFI-only for this combo family.
        "alternative": "larger",  # tests YRFI subset rate > NRFI subset rate
        "source": "Master Documentation: 'Best YRFI-specific edge' recommendation",
    },
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", required=True, help="Path to a CSV exported via GET /api/export-data?model=all")
    p.add_argument("--out", default=str(Path(__file__).resolve().parent / "agreement_directional_manifest.json"))
    return p.parse_args()


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
    df["date"] = raw["date"]
    return df


def wilson(wins: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    lo, hi = proportion_confint(wins, n, alpha=0.05, method="wilson")
    return float(lo), float(hi)


def evaluate_combo(df: pd.DataFrame, combo: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (qualifies, predicted_side, is_win) arrays aligned to df's rows."""
    avgA = df[combo["setA"]].mean(axis=1).to_numpy()
    avgB = df[combo["setB"]].mean(axis=1).to_numpy()

    side_a_nrfi = avgA >= 0.5
    conf_a = np.where(side_a_nrfi, avgA, 1.0 - avgA)
    side_b_nrfi = avgB >= 0.5
    conf_b = np.where(side_b_nrfi, avgB, 1.0 - avgB)

    thr = combo["threshold"]
    qualifies = (conf_a >= thr) & (conf_b >= thr) & (side_a_nrfi == side_b_nrfi)
    predicted_is_nrfi = side_a_nrfi  # == side_b_nrfi wherever qualifies is True
    is_win = predicted_is_nrfi == df["nrfi_is_nrfi"].to_numpy()
    return qualifies, predicted_is_nrfi, is_win


def analyze_view(df: pd.DataFrame, combo: dict) -> dict:
    qualifies, predicted_is_nrfi, is_win = evaluate_combo(df, combo)
    n = int(qualifies.sum())
    wins = int(is_win[qualifies].sum())
    lo, hi = wilson(wins, n)
    result = {
        "n": n, "wins": wins,
        "hit_rate": (wins / n) if n else None,
        "wilson_lower": lo, "wilson_upper": hi,
    }

    sub_predicted = predicted_is_nrfi[qualifies]
    sub_win = is_win[qualifies]
    per_side = {}
    for side_name, side_is_nrfi in (("NRFI", True), ("YRFI", False)):
        mask = sub_predicted == side_is_nrfi
        n_s = int(mask.sum())
        w_s = int(sub_win[mask].sum())
        lo_s, hi_s = wilson(w_s, n_s)
        per_side[side_name] = {
            "n": n_s, "wins": w_s,
            "hit_rate": (w_s / n_s) if n_s else None,
            "wilson_lower": lo_s, "wilson_upper": hi_s,
            "meets_min_n": n_s >= MIN_DIRECTIONAL_N,
        }
    result["NRFI"] = per_side["NRFI"]
    result["YRFI"] = per_side["YRFI"]

    n_nrfi, w_nrfi = per_side["NRFI"]["n"], per_side["NRFI"]["wins"]
    n_yrfi, w_yrfi = per_side["YRFI"]["n"], per_side["YRFI"]["wins"]
    sufficient = n_nrfi >= MIN_DIRECTIONAL_N and n_yrfi >= MIN_DIRECTIONAL_N
    if sufficient:
        # alternative interpreted relative to (NRFI_rate - YRFI_rate):
        #   "two-sided" -> NRFI_rate != YRFI_rate
        #   "larger"    -> tests YRFI_rate > NRFI_rate (source doc's claimed direction)
        alt = combo["alternative"]
        z_alt = {"two-sided": "two-sided", "larger": "smaller"}[alt]  # smaller(NRFI-YRFI) == larger(YRFI-NRFI)
        zstat, pval = proportions_ztest([w_nrfi, w_yrfi], [n_nrfi, n_yrfi], alternative=z_alt)
        result["directional_test"] = {
            "alternative": alt, "z": float(zstat), "p_value": float(pval), "insufficient_sample": False,
        }
    else:
        result["directional_test"] = {
            "alternative": combo["alternative"], "z": None, "p_value": None, "insufficient_sample": True,
        }
    return result


def bonferroni(pvalues: list[float], alpha: float = 0.05) -> list[bool]:
    corrected_alpha = alpha / len(pvalues)
    return [p < corrected_alpha for p in pvalues]


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


def print_view(label: str, result: dict, confirmatory: bool) -> None:
    tag = "[CONFIRMATORY]" if confirmatory else "[descriptive only, not confirmatory]"
    print(f"  {label} {tag}")
    print(f"    pooled:  n={result['n']:5d} wins={result['wins']:5d} "
          f"hit_rate={result['hit_rate']:.4f} wilson=({result['wilson_lower']:.4f},{result['wilson_upper']:.4f})"
          if result["n"] else f"    pooled:  n=0")
    for side in ("NRFI", "YRFI"):
        s = result[side]
        if s["n"]:
            print(f"    {side}:     n={s['n']:5d} wins={s['wins']:5d} hit_rate={s['hit_rate']:.4f} "
                  f"wilson=({s['wilson_lower']:.4f},{s['wilson_upper']:.4f}) "
                  f"{'OK' if s['meets_min_n'] else f'BELOW MIN N={MIN_DIRECTIONAL_N}'}")
        else:
            print(f"    {side}:     n=0")
    dt = result["directional_test"]
    if dt["insufficient_sample"]:
        print(f"    directional test: SKIPPED (insufficient sample on one or both sides)")
    else:
        print(f"    directional test ({dt['alternative']}): z={dt['z']:.4f} p={dt['p_value']:.6f}")


def main() -> int:
    args = parse_args()
    df = load_8model_csv(args.csv)

    train = df[df["season"].isin(TRAIN_SEASONS)]
    holdout = df[df["season"] == HOLDOUT_SEASON]
    pooled = df

    print(f"=== Directional Agreement-Combo Validation ===")
    print(f"Train: n={len(train)} (seasons {TRAIN_SEASONS})   "
          f"Holdout: n={len(holdout)} (season {HOLDOUT_SEASON})   Pooled: n={len(pooled)}")
    print(f"Pre-registered from: uploaded Master Documentation's Consolidated Recommendations\n")

    manifest = {"combos": []}
    holdout_pvalues = []
    holdout_combo_ids = []

    for combo in COMBOS:
        print(f"--- {combo['id']}: {combo['label']} ({combo['category']}) ---")
        print(f"    Source: {combo['source']}")
        views = {}
        for view_name, view_df, confirmatory in (
            ("train", train, False), ("holdout", holdout, True), ("pooled", pooled, False),
        ):
            result = analyze_view(view_df, combo)
            print_view(view_name, result, confirmatory)
            views[view_name] = result
        print()

        manifest["combos"].append({**combo, "views": views})
        dt = views["holdout"]["directional_test"]
        if not dt["insufficient_sample"]:
            holdout_pvalues.append(dt["p_value"])
            holdout_combo_ids.append(combo["id"])

    print("=== Multiple-comparison correction across HOLDOUT directional tests (the confirmatory family) ===")
    if holdout_pvalues:
        bonf = bonferroni(holdout_pvalues)
        bh = benjamini_hochberg(holdout_pvalues)
        for cid, p, b, h in zip(holdout_combo_ids, holdout_pvalues, bonf, bh):
            print(f"  {cid}: raw p={p:.6f}  Bonferroni({len(holdout_pvalues)})={'SURVIVES' if b else 'fails'}  "
                  f"BH({len(holdout_pvalues)})={'SURVIVES' if h else 'fails'}")
        manifest["holdout_correction"] = {
            "combo_ids": holdout_combo_ids, "raw_p_values": holdout_pvalues,
            "bonferroni_alpha": 0.05 / len(holdout_pvalues),
            "bonferroni_survives": dict(zip(holdout_combo_ids, bonf)),
            "benjamini_hochberg_survives": dict(zip(holdout_combo_ids, bh)),
        }
    else:
        print("  No holdout directional tests had sufficient sample on both sides -- nothing to correct.")
        manifest["holdout_correction"] = None

    Path(args.out).write_text(json.dumps(manifest, indent=2, default=str))
    print(f"\nWrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
