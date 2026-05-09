"""
Offline batch scorer for backtests / debugging.

Loads the active artifact from scripts/deepnrfi/artifacts/manifest.json and
scores a CSV that uses the same column layout as the training CSV.

Usage:
    python scripts/deepnrfi/predict.py --in inputs.csv --out predictions.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import lightgbm as lgb
    import numpy as np
    import pandas as pd
except ImportError as e:
    print(f"Missing dependency: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1)


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "scripts" / "deepnrfi" / "artifacts"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Score a CSV with the active DeepNRFI artifact")
    p.add_argument("--in", dest="src", required=True)
    p.add_argument("--out", dest="dst", required=True)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    manifest = json.loads((ARTIFACT_DIR / "manifest.json").read_text())
    booster = lgb.Booster(model_file=str(ARTIFACT_DIR / manifest["modelFile"]))
    feature_order: list[str] = manifest["featureOrder"]

    calib_path = ARTIFACT_DIR / manifest.get("calibrationFile", "")
    knots = json.loads(calib_path.read_text())["knots"] if calib_path.exists() else None

    df = pd.read_csv(args.src)
    missing = [c for c in feature_order if c not in df.columns]
    if missing:
        print(f"input CSV missing columns: {missing}", file=sys.stderr)
        return 2

    raw = booster.predict(df[feature_order].values)
    if knots:
        xs = np.array([k[0] for k in knots])
        ys = np.array([k[1] for k in knots])
        raw = np.interp(raw, xs, ys)
    df["deepNrfi"] = np.clip(raw, 0.02, 0.98)
    df.to_csv(args.dst, index=False)
    print(f"[predict] wrote {len(df)} rows to {args.dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
