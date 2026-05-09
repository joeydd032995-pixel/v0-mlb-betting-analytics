"""
Refit the v1 and v2 calibration splines from recent prediction logs.

Reads model_predictions × game_results out of Postgres, fits an isotonic
regression, samples the curve at 19 evenly spaced raw-probability knots and
prints the new arrays so a maintainer can paste them into:

    lib/calibration.ts        (v1 — current 7-model path)
    lib/calibration-v2.ts     (v2 — new 9-model stacker path)

Manual review/PR is required — this script never auto-promotes.

Usage:
    python scripts/deepnrfi/recalibrate.py --season 2024
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    import psycopg
    from sklearn.calibration import IsotonicRegression
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    raise SystemExit(1) from e


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--season", type=int, default=2024)
    p.add_argument("--db-url", default=os.environ.get("DATABASE_URL"))
    return p.parse_args()


def fetch(args: argparse.Namespace) -> pd.DataFrame:
    sql = """
        SELECT mp."nrfiProbability"     AS p,
               mp."ensembleVersion"     AS version,
               (gr.nrfi)::int           AS y
        FROM model_predictions mp
        JOIN game_results gr ON CAST(mp.id AS BIGINT) = gr."gamePk"
        WHERE mp.season = %s AND mp.status = 'complete'
    """
    with psycopg.connect(args.db_url) as conn:
        return pd.read_sql(sql, conn, params=(args.season,))


def fit(df: pd.DataFrame) -> list[list[float]]:
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(df["p"].values, df["y"].values.astype(int))
    grid = np.linspace(0.05, 0.95, 19)
    return [[float(x), round(float(iso.predict([x])[0]), 4)] for x in grid]


def emit_block(name: str, knots: list[list[float]]) -> None:
    print(f"\n// ─── {name} (paste into lib/{name.lower()}.ts) ───")
    print("const CALIBRATION_KNOTS = [")
    for x, y in knots:
        print(f"  [{x:.2f}, {y:.4f}],")
    print("]")


def main() -> int:
    args = parse_args()
    if not args.db_url:
        print("DATABASE_URL is required.", file=sys.stderr)
        return 2
    df = fetch(args)
    print(f"[recalibrate] {len(df)} rows for season {args.season}")
    if df.empty:
        return 1

    v1 = df[df["version"] == "v1.7models"]
    v2 = df[df["version"] == "v2.9models"]
    if not v1.empty:
        emit_block("calibration_v1", fit(v1))
    if not v2.empty:
        emit_block("calibration_v2", fit(v2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
