"""
Refit the v1 and v2 calibration splines from recent prediction logs.

Reads model_predictions × game_results out of Postgres, fits an isotonic
regression, samples the curve at 19 evenly spaced raw-probability knots and
prints the new arrays so a maintainer can paste them into:

    lib/calibration.ts        (v1 — current 7-model path)
    lib/calibration-v2.ts     (v2 — new 9-model stacker path)

SCALE CORRECTNESS (the reason this script inverts the anchor):
The DB stores the FINAL headline probability
    final = clamp(BLEND × cal(raw) + (1−BLEND) × ANCHOR, 0.18, 0.85)
but the spline in lib/calibration.ts is applied to the RAW ensemble value,
BEFORE the league-anchor blend.  Fitting isotonic on `final` and pasting the
knots into calibration.ts would compose g(raw) with a second shrinkage layer
(the anchor) that re-biases the freshly calibrated output toward 0.516 — the
result would NOT be calibrated.  This script therefore:

  1. reconstructs raw = (final − (1−BLEND)·ANCHOR) / BLEND  (exact while the
     current knots are the identity — assert that before running!),
  2. fits isotonic g(raw) = E[y | raw],
  3. emits knots y' = clamp((g − (1−BLEND)·ANCHOR) / BLEND, 0, 1) so that the
     COMPOSED serving output BLEND·y' + (1−BLEND)·ANCHOR ≈ g(raw).

Alternative (cleaner): set ENSEMBLE_BLEND = 1.0 when adopting fitted knots —
an isotonic fit already shrinks toward the base rate where data is thin, so a
second anchor layer is redundant.  Pass --ensemble-blend 1.0 to emit the
knots for that configuration (y' = g, no transform).

Manual review/PR is required — this script never auto-promotes.  Fit ONLY on
a held-out season the engine's constants were not tuned on.

Usage:
    python scripts/deepnrfi/recalibrate.py --season 2024
    python scripts/deepnrfi/recalibrate.py --season 2024 --ensemble-blend 1.0
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from transforms import ENSEMBLE_BLEND, LEAGUE_ANCHOR  # noqa: E402


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--season", type=int, default=2024)
    p.add_argument("--db-url", default=os.environ.get("DATABASE_URL"))
    p.add_argument(
        "--ensemble-blend", type=float, default=ENSEMBLE_BLEND,
        help="ENSEMBLE_BLEND the emitted knots are compensated for. Pass 1.0 "
             "if you will also set ENSEMBLE_BLEND = 1.0 in lib/nrfi-engine.ts "
             "(recommended once fitted knots ship — see module docstring).",
    )
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


def fit(df: pd.DataFrame, blend: float) -> list[list[float]]:
    """Fit isotonic on the PRE-anchor raw scale and emit anchor-compensated knots.

    raw    = (final − (1−BLEND)·ANCHOR) / BLEND   (identity-knot inversion)
    g(raw) = isotonic fit of E[y | raw]
    y'     = clamp((g − (1−blend)·ANCHOR) / blend, 0, 1)

    With blend = 1.0 the emitted knots are g itself (use with ENSEMBLE_BLEND=1).
    """
    raw = (df["p"].values - (1.0 - ENSEMBLE_BLEND) * LEAGUE_ANCHOR) / ENSEMBLE_BLEND
    raw = np.clip(raw, 0.02, 0.98)
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(raw, df["y"].values.astype(int))
    grid = np.linspace(0.05, 0.95, 19)
    knots = []
    for x in grid:
        g = float(iso.predict([x])[0])
        y_prime = (g - (1.0 - blend) * LEAGUE_ANCHOR) / blend
        knots.append([float(x), round(min(1.0, max(0.0, y_prime)), 4)])
    # Isotonic guarantees monotone g; the affine transform preserves order, but
    # the [0,1] clamp can flatten the tails — re-assert monotonicity defensively.
    for i in range(1, len(knots)):
        knots[i][1] = max(knots[i][1], knots[i - 1][1])
    return knots


_PASTE_TARGETS = {
    # The maintained file paths don't follow the `name.lower()` convention,
    # so we map the v1/v2 names explicitly.
    "calibration_v1": "lib/calibration.ts",
    "calibration_v2": "lib/calibration-v2.ts",
}


def emit_block(name: str, knots: list[list[float]]) -> None:
    target = _PASTE_TARGETS.get(name, f"lib/{name.replace('_', '-')}.ts")
    print(f"\n// ─── {name} (paste into {target}) ───")
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
        emit_block("calibration_v1", fit(v1, args.ensemble_blend))
    if not v2.empty:
        emit_block("calibration_v2", fit(v2, args.ensemble_blend))
    if args.ensemble_blend != 1.0:
        print(
            f"\n[recalibrate] knots are compensated for ENSEMBLE_BLEND = "
            f"{args.ensemble_blend}; keep that constant in lib/nrfi-engine.ts, "
            "or re-run with --ensemble-blend 1.0 and set the constant to 1.0."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
