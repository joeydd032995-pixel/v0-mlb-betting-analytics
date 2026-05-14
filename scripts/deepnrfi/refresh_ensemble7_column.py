"""
One-shot: refresh the `ensemble7_nrfi` column in
scripts/deepnrfi/data/training.csv from the latest `ensembleNrfi` values in
the `model_predictions` table.  Useful after running
scripts/deepnrfi/recompute_historical_predictions.py — the recompute updates
the DB but doesn't touch the training CSV, so the CSV's ensemble7_nrfi column
goes stale.

This script does NOT re-fetch Statcast, boxscores, or any other feature.  Only
the ensemble7_nrfi column changes; every other column is left untouched.

Usage:
    export DATABASE_URL="postgresql://..."
    python scripts/deepnrfi/refresh_ensemble7_column.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import pandas as pd
    import psycopg
except ImportError as e:
    print(f"Missing dep: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "scripts" / "deepnrfi" / "data" / "training.csv"


def main() -> int:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL is required.", file=sys.stderr)
        return 2
    if not CSV_PATH.exists():
        print(f"Training CSV not found: {CSV_PATH}", file=sys.stderr)
        return 2

    print(f"[refresh] loading {CSV_PATH} ...")
    df = pd.read_csv(CSV_PATH)
    n = len(df)
    game_ids = [int(g) for g in df["gameId"].unique().tolist()]
    print(f"[refresh] {n:,} rows · {len(game_ids):,} unique gameIds")

    print("[refresh] querying ensembleNrfi from model_predictions ...")
    sql = """
        SELECT CAST(id AS BIGINT) AS game_pk,
               "ensembleNrfi"      AS ensemble_nrfi,
               "inputsPresence"    AS inputs_presence
        FROM model_predictions
        WHERE CAST(id AS BIGINT) = ANY(%s)
    """
    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(sql, (game_ids,))
        rows = cur.fetchall()

    fetched = {int(gp): (float(en) if en is not None else None, ip) for gp, en, ip in rows}
    print(f"[refresh] matched {len(fetched):,} / {len(game_ids):,} gameIds in DB")

    # Stats on what changed
    old = df["ensemble7_nrfi"].copy()
    new_values = df["gameId"].map(lambda g: fetched.get(int(g), (None, None))[0])
    changed = (new_values != old) & new_values.notna()

    if "ensemble7_inputs_weather" in df.columns:
        df["ensemble7_inputs_weather"] = df["gameId"].map(
            lambda g: 1 if (fetched.get(int(g), (None, None))[1] or {}).get("weather") else 0
        )
    if "ensemble7_inputs_odds" in df.columns:
        df["ensemble7_inputs_odds"] = df["gameId"].map(
            lambda g: 1 if (fetched.get(int(g), (None, None))[1] or {}).get("odds") else 0
        )

    df["ensemble7_nrfi"] = new_values.fillna(old)

    if changed.sum() == 0:
        print("[refresh] no rows changed — DB ensembleNrfi values match the CSV already.")
    else:
        delta = (df["ensemble7_nrfi"] - old).abs()
        print(f"[refresh] {int(changed.sum()):,} rows updated · "
              f"mean |Δ| = {delta[changed].mean():.4f} · "
              f"max |Δ| = {delta[changed].max():.4f}")

    print(f"[refresh] writing {CSV_PATH} ...")
    df.to_csv(CSV_PATH, index=False)
    print("[refresh] done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
