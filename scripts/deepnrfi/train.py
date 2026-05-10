"""
Train the DeepNRFI LightGBM model.

Inputs:
    scripts/deepnrfi/data/training.csv
        Produced by `node scripts/deepnrfi/export_training_data.ts`.  One row
        per historical game with all DeepNrfiFeatureVector columns plus a
        binary `nrfi` label.

Outputs (under scripts/deepnrfi/artifacts/):
    model_v{N}.txt                 LightGBM Booster text format (parseable by
                                   the pure-JS tree-walker in lib/deepnrfi-model.ts)
    feature_importance_v{N}.json   { features: [{ name, gain, meanAbsShap }] }
    calibration_v{N}.json          { knots: [[raw, calibrated], ...] }
    manifest.json                  { activeVersion, modelFile, calibrationFile,
                                     featureOrder, brier, logLoss, trainedAt }

Usage:
    python scripts/deepnrfi/train.py --version v1
    python scripts/deepnrfi/train.py --version v1 --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import lightgbm as lgb
    import numpy as np
    import pandas as pd
    from sklearn.calibration import IsotonicRegression
    from sklearn.metrics import brier_score_loss, log_loss
    from sklearn.model_selection import TimeSeriesSplit
except ImportError as e:
    print(f"Missing dependency: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "scripts" / "deepnrfi" / "data"
ARTIFACT_DIR = ROOT / "scripts" / "deepnrfi" / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

LABEL_COL = "nrfi"
DROP_COLS = {"nrfi", "gameId", "date", "season", "homeTeam", "awayTeam"}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train DeepNRFI LightGBM model")
    p.add_argument("--version", default="v1", help='Artifact version tag (e.g. "v1")')
    p.add_argument("--data", default=str(DATA_DIR / "training.csv"), help="Training CSV path")
    p.add_argument("--dry-run", action="store_true", help="Train on synthetic data; don't touch real CSV")
    p.add_argument("--n-estimators", type=int, default=400)
    p.add_argument("--learning-rate", type=float, default=0.04)
    p.add_argument("--num-leaves", type=int, default=31)
    return p.parse_args()


def synthetic_dataset(n: int = 4000, seed: int = 42) -> pd.DataFrame:
    """Generate a synthetic training set when a real CSV isn't available.

    Used by --dry-run so the artifact pipeline can be exercised end-to-end.
    """
    rng = np.random.default_rng(seed)
    cols = [
        "home_pitcher_shrunk_nrfi", "home_pitcher_k_rate", "home_pitcher_bb_rate",
        "home_pitcher_hr_per9", "home_pitcher_babip", "home_pitcher_first_batter_obp",
        "home_pitcher_start_count", "home_pitcher_recent_form", "home_pitcher_fb_velo",
        "home_pitcher_fb_spin", "home_pitcher_breaking_pct", "home_pitcher_stuff_plus",
        "home_pitcher_pitches_last5", "home_pitcher_days_rest", "home_pitcher_rolling3_ip",
        "home_pitcher_vstop_woba", "home_pitcher_vstop_k", "home_pitcher_is_bullpen",
        "away_pitcher_shrunk_nrfi", "away_pitcher_k_rate", "away_pitcher_bb_rate",
        "away_pitcher_hr_per9", "away_pitcher_babip", "away_pitcher_first_batter_obp",
        "away_pitcher_start_count", "away_pitcher_recent_form", "away_pitcher_fb_velo",
        "away_pitcher_fb_spin", "away_pitcher_breaking_pct", "away_pitcher_stuff_plus",
        "away_pitcher_pitches_last5", "away_pitcher_days_rest", "away_pitcher_rolling3_ip",
        "away_pitcher_vstop_woba", "away_pitcher_vstop_k", "away_pitcher_is_bullpen",
        "home_top4_ops", "home_top4_wrcplus", "home_top4_k_pct", "home_top4_bb_pct",
        "away_top4_ops", "away_top4_wrcplus", "away_top4_k_pct", "away_top4_bb_pct",
        "home_offense_factor", "away_offense_factor",
        "home_offense_vs_hand", "away_offense_vs_hand",
        "weather_temp_f", "weather_wind_mph", "weather_wind_in_out", "weather_humidity",
        "weather_precip_prob", "weather_pressure_hpa", "weather_air_density", "is_dome",
        "park_factor", "park_first_inning_runs", "park_hr_factor", "park_elevation_ft",
        "umpire_zone_tightness", "umpire_career_nrfi", "umpire_sample",
        "home_rest_days", "away_rest_days", "home_travel_miles", "away_travel_miles",
        "is_bullpen_game", "ensemble7_nrfi",
    ]
    data = {c: rng.normal(0, 1, size=n) for c in cols}
    # Generate label loosely correlated with ensemble7_nrfi + pitcher quality
    score = (
        0.6 * data["ensemble7_nrfi"]
        + 0.3 * data["home_pitcher_shrunk_nrfi"]
        + 0.3 * data["away_pitcher_shrunk_nrfi"]
        - 0.2 * data["home_top4_ops"]
        - 0.2 * data["away_top4_ops"]
        + rng.normal(0, 0.4, size=n)
    )
    nrfi = (score > np.median(score)).astype(int)
    df = pd.DataFrame(data)
    df["nrfi"] = nrfi
    df["gameId"] = [f"synth-{i}" for i in range(n)]
    df["date"] = pd.date_range("2023-04-01", periods=n, freq="3h").astype(str)
    return df


def train_one(df: pd.DataFrame, args: argparse.Namespace):
    feature_cols = [c for c in df.columns if c not in DROP_COLS]
    X = df[feature_cols].values
    y = df[LABEL_COL].values.astype(int)

    # Walk-forward CV by row order (assumes data is date-sorted)
    tscv = TimeSeriesSplit(n_splits=4)
    val_pred = np.zeros(len(y), dtype=float)
    for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
        params = dict(
            objective="binary",
            metric=["binary_logloss", "binary_error"],
            num_leaves=args.num_leaves,
            learning_rate=args.learning_rate,
            feature_pre_filter=False,
            verbosity=-1,
        )
        train_set = lgb.Dataset(X[train_idx], y[train_idx], feature_name=feature_cols)
        val_set = lgb.Dataset(X[val_idx], y[val_idx], reference=train_set, feature_name=feature_cols)
        booster = lgb.train(
            params,
            train_set,
            num_boost_round=args.n_estimators,
            valid_sets=[val_set],
            callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
        )
        val_pred[val_idx] = booster.predict(X[val_idx])
        print(
            f"[deepnrfi] fold {fold + 1}/{tscv.n_splits} best_iter={booster.best_iteration} "
            f"val_logloss={log_loss(y[val_idx], val_pred[val_idx]):.4f}"
        )

    # Final model on all data
    full_set = lgb.Dataset(X, y, feature_name=feature_cols)
    full_booster = lgb.train(
        dict(
            objective="binary",
            metric=["binary_logloss"],
            num_leaves=args.num_leaves,
            learning_rate=args.learning_rate,
            feature_pre_filter=False,
            verbosity=-1,
        ),
        full_set,
        num_boost_round=args.n_estimators,
        callbacks=[lgb.log_evaluation(0)],
    )
    print(
        f"[deepnrfi] full model: brier={brier_score_loss(y, val_pred):.4f} "
        f"logloss={log_loss(y, val_pred):.4f}"
    )
    return full_booster, feature_cols, val_pred, y


def fit_calibration(val_pred: np.ndarray, y: np.ndarray) -> list[list[float]]:
    """Fit a 19-knot piecewise-linear calibration via isotonic regression."""
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(val_pred, y)
    grid = np.linspace(0.05, 0.95, 19)
    return [[float(x), float(iso.predict([x])[0])] for x in grid]


def feature_importance(booster: "lgb.Booster", feature_cols: list[str], X: np.ndarray) -> list[dict]:
    """Combine gain importance and per-feature mean-abs-SHAP into one report."""
    gain = booster.feature_importance(importance_type="gain")
    shap_vals = booster.predict(X[:1000], pred_contrib=True)  # last col is bias
    shap_means = np.abs(shap_vals[:, :-1]).mean(axis=0)
    rows = []
    for i, name in enumerate(feature_cols):
        rows.append({
            "name": name,
            "gain": float(gain[i]),
            "meanAbsShap": float(shap_means[i]),
        })
    rows.sort(key=lambda r: r["gain"], reverse=True)
    return rows


def main() -> int:
    args = parse_args()
    if args.dry_run:
        df = synthetic_dataset()
        print(f"[deepnrfi] dry-run: synthetic dataset rows={len(df)}")
    else:
        if not Path(args.data).exists():
            print(f"Training CSV not found: {args.data}.  Run scripts/deepnrfi/export_training_data.ts first.", file=sys.stderr)
            return 2
        df = pd.read_csv(args.data)
        print(f"[deepnrfi] loaded {len(df)} rows from {args.data}")

    booster, feature_cols, val_pred, y = train_one(df, args)
    knots = fit_calibration(val_pred, y)
    importance = feature_importance(booster, feature_cols, df[feature_cols].values)

    version = args.version
    model_path = ARTIFACT_DIR / f"model_{version}.txt"
    calib_path = ARTIFACT_DIR / f"calibration_{version}.json"
    importance_path = ARTIFACT_DIR / f"feature_importance_{version}.json"
    manifest_path = ARTIFACT_DIR / "manifest.json"

    booster.save_model(str(model_path))
    calib_path.write_text(json.dumps({"knots": knots}, indent=2))
    importance_path.write_text(json.dumps({"features": importance}, indent=2))
    manifest = {
        "activeVersion": version,
        "modelFile": model_path.name,
        "calibrationFile": calib_path.name,
        "importanceFile": importance_path.name,
        "featureOrder": feature_cols,
        "brier": float(brier_score_loss(y, val_pred)),
        "logLoss": float(log_loss(y, val_pred)),
        "trainedAt": datetime.now(timezone.utc).isoformat(),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"[deepnrfi] wrote artifacts to {ARTIFACT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
