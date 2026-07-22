"""
Stage 1 of confidence-bucket blend discovery: per-(model, side, bucket-cell)
hit rates on the 2023-2025 train period only.

Populates all 70 cells (7 models x 5 buckets x 2 sides) in search_manifest.json,
including empty ones, with each model's null-filtered usable sample count.
See CONFIDENCE_BLEND_DISCOVERY_SPEC.md ("Statistical Bar", "Success Criteria").

Usage:
    python 01_bucket_backtest.py --csv path/to/nrfi-data-all-<date>.csv
    python 01_bucket_backtest.py --db-url "$DATABASE_URL"
    python 01_bucket_backtest.py --csv ... --label smoke --out search_manifest.smoketest.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import numpy as np
except ImportError as e:
    print(f"Missing dep: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    BUCKET_EDGES, BUCKET_LABELS, MODEL_COLUMNS, TRAIN_SEASONS,
    load_games, load_manifest, save_manifest, utcnow_iso,
    add_data_source_args,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_data_source_args(p)
    p.add_argument("--out", default=str(Path(__file__).resolve().parent / "search_manifest.json"))
    p.add_argument("--label", default=None, help="Tag for this run (e.g. 'smoke'); recorded but doesn't change output path")
    return p.parse_args()


def compute_bucket_cells(df) -> tuple[list[dict], dict]:
    """Returns (cells, per_model_null_summary)."""
    train = df[df["season"].isin(TRAIN_SEASONS)]
    cells: dict[tuple[str, str, str], dict] = {}
    for model in MODEL_COLUMNS:
        for side in ("NRFI", "YRFI"):
            for label in BUCKET_LABELS:
                cells[(model, side, label)] = {"model": model, "side": side, "bucket": label, "n": 0, "wins": 0}

    is_nrfi_actual = train["nrfi_is_nrfi"].to_numpy(dtype=bool)

    null_summary = {}
    for model in MODEL_COLUMNS:
        col = train[model]
        n_total = len(col)
        n_null = int(col.isna().sum())
        n_usable = n_total - n_null
        null_summary[model] = {"n_total": n_total, "n_null": n_null, "n_usable": n_usable}

        prob = col.to_numpy(dtype=float)
        valid = ~np.isnan(prob)
        val = np.where(prob >= 0.5, prob * 100.0, 100.0 - prob * 100.0)  # invariant across sides
        for side in ("NRFI", "YRFI"):
            side_mask = valid & ((prob >= 0.5) if side == "NRFI" else (prob < 0.5))
            for lo, hi, label in zip(BUCKET_EDGES[:-1], BUCKET_EDGES[1:], BUCKET_LABELS, strict=True):
                in_bucket = side_mask & (val >= lo) & (val <= hi if hi >= 100 else val < hi)
                cell = cells[(model, side, label)]
                cell["n"] = int(in_bucket.sum())
                cell["wins"] = int((is_nrfi_actual[in_bucket] == (side == "NRFI")).sum())

    cell_rows = list(cells.values())
    for c in cell_rows:
        c["hit_rate"] = c["wins"] / c["n"] if c["n"] > 0 else None
    return cell_rows, null_summary


def main() -> int:
    args = parse_args()
    df, source = load_games(args.csv, args.db_url)

    cell_rows, null_summary = compute_bucket_cells(df)

    print(f"=== Stage 1 bucket backtest (train seasons {TRAIN_SEASONS}) ===")
    print(f"Source: {source['mode']} ({source.get('path') or source.get('created_at_watermark')})")
    print("\nPer-model usable sample counts:")
    for model, s in null_summary.items():
        print(f"  {model:24s} total={s['n_total']:5d}  null={s['n_null']:4d}  usable={s['n_usable']:5d}")

    print("\nCells with n >= 150 (candidate pool for Stage 2):")
    eligible = [c for c in cell_rows if c["n"] >= 150]
    for c in sorted(eligible, key=lambda c: -c["hit_rate"]):
        print(f"  {c['model']:24s} {c['side']:4s} {c['bucket']:10s} n={c['n']:4d} hit_rate={c['hit_rate']:.4f}")
    print(f"\n{len(eligible)} / {len(cell_rows)} cells have n >= 150")

    out_path = Path(args.out)
    manifest = load_manifest(out_path)
    manifest["stage1_bucket_cells"] = cell_rows
    manifest["stage1_null_summary"] = null_summary
    manifest["stage1_source"] = source
    manifest["stage1_generated_at"] = utcnow_iso()
    manifest["stage1_train_seasons"] = list(TRAIN_SEASONS)
    if args.label:
        manifest["stage1_label"] = args.label
    save_manifest(out_path, manifest)
    print(f"\nWrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
