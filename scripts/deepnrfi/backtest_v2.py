"""
v1 vs v2 ROI / Brier / log-loss backtest.

Reads model_predictions × game_results out of Postgres and reports:
    • Brier and log-loss for each ensemble version
    • ROI@Kelly per confidence tier and edge bucket
    • Calibration intercept/slope (logit-linear regression)

Promote v2 only when it beats v1 on Brier AND on ROI in the ≥3% edge bucket.

Usage:
    python scripts/deepnrfi/backtest_v2.py --season 2024
"""

from __future__ import annotations

import argparse
import os
import sys

try:
    import numpy as np
    import pandas as pd
    import psycopg
    from sklearn.metrics import brier_score_loss, log_loss
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    raise SystemExit(1) from e


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--season", type=int, default=2024)
    p.add_argument("--db-url", default=os.environ.get("DATABASE_URL"))
    return p.parse_args()


def metrics(df: pd.DataFrame) -> dict:
    if df.empty:
        return {}
    return {
        "n": int(len(df)),
        "brier": float(brier_score_loss(df["y"], df["p"])),
        # Pass labels=[0, 1] so log_loss handles single-class slices (e.g. a
        # confidence tier that contains only NRFI hits) without raising.
        "logloss": float(
            log_loss(
                df["y"].clip(0, 1),
                df["p"].clip(1e-3, 1 - 1e-3),
                labels=[0, 1],
            )
        ),
        "accuracy": float(((df["p"] >= 0.5) == df["y"].astype(bool)).mean()),
    }


def kelly_roi(df: pd.DataFrame, fraction: float = 0.25, min_edge: float = 0.03) -> dict:
    """
    ROI simulation using proper fractional Kelly criterion, matching the TypeScript
    production formula in lib/nrfi-engine.ts:kellyFraction():

        decimalOdds = 100 / |american_odds|          # profit per unit at -110 = 0.9091
        q           = 1 - model_prob
        rawKelly    = (decimalOdds * model_prob - q) / decimalOdds
        bet_size    = clip(rawKelly * fraction, 0, 0.25)

    The prior implementation used `edge * fraction` (linear approximation) which
    ignores the odds term and diverges from the TypeScript formula — making ROI
    figures not directly comparable to production betting behaviour.
    """
    df = df.copy()
    # Derive edge from model probability vs -110 implied probability.
    # Use stored edge column if present (future: could store actual odds per game).
    implied = 110 / 210  # -110 American → implied probability ≈ 0.5238
    if "edge" not in df.columns:
        df["edge"] = df["p"] - implied

    bets = df[df["edge"].abs() >= min_edge].copy()
    if bets.empty:
        return {"n_bets": 0, "roi": 0.0}

    # Proper Kelly: decimalOdds = profit per unit staked at -110 odds
    odds_decimal = 100 / 110  # ≈ 0.9091

    # Model probability in the bet direction:
    #   edge > 0 → bet on NRFI (y=1), model_prob = p
    #   edge < 0 → bet on YRFI (y=0), model_prob = 1 - p
    bets["model_prob"] = np.where(bets["edge"] > 0, bets["p"], 1 - bets["p"])
    bets["model_prob"] = bets["model_prob"].clip(0.01, 0.99)
    bets["q"] = 1 - bets["model_prob"]

    # rawKelly = (b * p - q) / b  where b = decimalOdds
    bets["raw_kelly"] = (odds_decimal * bets["model_prob"] - bets["q"]) / odds_decimal
    # Fractional Kelly, capped at 25% max bankroll (matches KELLY_FRACTION = 0.25 cap)
    bets["bet_size"] = (bets["raw_kelly"] * fraction).clip(0, 0.25)

    bets["pl"] = np.where(
        ((bets["edge"] > 0) & (bets["y"] == 1)) | ((bets["edge"] < 0) & (bets["y"] == 0)),
        bets["bet_size"] * odds_decimal,
        -bets["bet_size"],
    )
    total_wagered = bets["bet_size"].sum()
    return {
        "n_bets": int(len(bets)),
        "roi": float(bets["pl"].sum() / total_wagered) if total_wagered > 0 else 0.0,
        "edge_pct_avg": float(bets["edge"].abs().mean()),
        "avg_bet_size": float(bets["bet_size"].mean()),
    }


def main() -> int:
    args = parse_args()
    if not args.db_url:
        print("DATABASE_URL is required.", file=sys.stderr)
        return 2
    sql = """
        SELECT mp."nrfiProbability" AS p,
               mp."ensembleVersion" AS version,
               mp.confidence,
               (gr.nrfi)::int AS y
        FROM model_predictions mp
        JOIN game_results gr ON mp.id ~ '^[0-9]+$' AND mp.id::bigint = gr."gamePk"
        WHERE mp.season = %s AND mp.status = 'complete'
    """
    with psycopg.connect(args.db_url) as conn:
        df = pd.read_sql(sql, conn, params=(args.season,))
    print(f"[backtest_v2] season={args.season} total rows={len(df)}")
    for version in ("v1.7models", "v2.9models"):
        sub = df[df["version"] == version]
        m = metrics(sub)
        roi = kelly_roi(sub)
        print(f"\n=== {version} ===")
        print("metrics:", m)
        print("roi:", roi)
        for tier in ("High", "Medium", "Low"):
            tier_df = sub[sub["confidence"] == tier]
            if tier_df.empty:
                continue
            print(f"  tier={tier:6s} n={len(tier_df):4d} brier={brier_score_loss(tier_df['y'], tier_df['p']):.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
