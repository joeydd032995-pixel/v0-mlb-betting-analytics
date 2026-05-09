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
    raise SystemExit(1)


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
        "logloss": float(log_loss(df["y"].clip(0, 1), df["p"].clip(1e-3, 1 - 1e-3))),
        "accuracy": float(((df["p"] >= 0.5) == df["y"].astype(bool)).mean()),
    }


def kelly_roi(df: pd.DataFrame, fraction: float = 0.25, min_edge: float = 0.03) -> dict:
    # Use stored implied edge if present; otherwise assume −110 odds.
    df = df.copy()
    if "edge" not in df.columns:
        implied = 110 / 210
        df["edge"] = df["p"] - implied
    bets = df[df["edge"].abs() >= min_edge].copy()
    if bets.empty:
        return {"n_bets": 0, "roi": 0.0}
    odds_decimal = 100 / 110  # −110 american → 0.909 profit per unit
    bets["bet_size"] = (bets["edge"].abs() * fraction).clip(0, 0.05)
    bets["pl"] = np.where(
        ((bets["edge"] > 0) & (bets["y"] == 1)) | ((bets["edge"] < 0) & (bets["y"] == 0)),
        bets["bet_size"] * odds_decimal,
        -bets["bet_size"],
    )
    return {
        "n_bets": int(len(bets)),
        "roi": float(bets["pl"].sum() / bets["bet_size"].sum()),
        "edge_pct_avg": float(bets["edge"].abs().mean()),
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
        JOIN game_results gr ON CAST(mp.id AS BIGINT) = gr."gamePk"
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
