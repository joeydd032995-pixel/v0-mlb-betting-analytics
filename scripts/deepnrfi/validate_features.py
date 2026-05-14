"""
DeepNRFI training-set diagnostic + baseline-Brier comparator.

Prints (and writes a markdown report to scripts/deepnrfi/artifacts/feature_report.md):
  - Row count, season distribution, NRFI base rate.
  - Per-feature: mean, std, null%, unique_count, corr(label).
  - Top-10 by |corr|, dead-feature list.
  - Baseline Briers:
      a) constant league rate                       (sanity floor ~ 0.250)
      b) ensemble7_nrfi used directly               (v1 ensemble alone)
      c) logistic regression on top-3 features by |corr|
      d) saved model from manifest.json if present  (current DeepNRFI)

This script is read-only against the CSV; it does not retrain anything.

Usage:
    python scripts/deepnrfi/validate_features.py
    python scripts/deepnrfi/validate_features.py --csv path/to/training.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import brier_score_loss, log_loss
except ImportError as e:
    print(f"Missing dep: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "scripts" / "deepnrfi" / "data"
ARTIFACT_DIR = ROOT / "scripts" / "deepnrfi" / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

META_COLS = {
    "gameId", "date", "season", "homeTeam", "awayTeam", "nrfi",
    "ensemble7_inputs_weather", "ensemble7_inputs_odds", "ensemble7_inputs_lineup",
}
LABEL_COL = "nrfi"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", default=str(DATA_DIR / "training.csv"))
    p.add_argument("--report", default=str(ARTIFACT_DIR / "feature_report.md"))
    return p.parse_args()


def per_feature_stats(df: pd.DataFrame) -> pd.DataFrame:
    feature_cols = [c for c in df.columns if c not in META_COLS]
    rows = []
    y = df[LABEL_COL].astype(int)
    for c in feature_cols:
        s = df[c]
        std = float(s.std())
        nulls = float(s.isna().mean())
        nuniq = int(s.dropna().nunique())
        corr = float(s.corr(y)) if std > 0 and nulls < 1.0 else 0.0
        rows.append({
            "feature": c,
            "mean": float(s.mean()),
            "std": std,
            "null_pct": nulls,
            "unique": nuniq,
            "corr": corr,
            "dead": std == 0 or nulls > 0.9 or nuniq <= 1,
        })
    out = pd.DataFrame(rows)
    out["abs_corr"] = out["corr"].abs()
    return out.sort_values("abs_corr", ascending=False).reset_index(drop=True)


def baseline_briers(df: pd.DataFrame, stats: pd.DataFrame) -> dict[str, float]:
    y = df[LABEL_COL].astype(int).values
    results: dict[str, float] = {}

    # a) Constant league rate
    p_const = np.full(len(y), float(y.mean()))
    results["constant_rate"] = float(brier_score_loss(y, p_const))

    # b) ensemble7_nrfi directly (if present and not dead)
    if "ensemble7_nrfi" in df.columns and float(df["ensemble7_nrfi"].std()) > 0:
        results["ensemble7_nrfi_direct"] = float(brier_score_loss(y, df["ensemble7_nrfi"].clip(0.01, 0.99).values))

    # c) Logistic regression on top-3 by |corr| (skip dead, exclude label leak just in case)
    live = stats[~stats["dead"] & (stats["feature"] != LABEL_COL)]
    top3 = live.head(3)["feature"].tolist()
    if len(top3) >= 1:
        X = df[top3].fillna(df[top3].median()).values
        # Simple held-out: train on first 70%, score on last 30%
        n = len(X)
        split = int(n * 0.7)
        lr = LogisticRegression(max_iter=500)
        lr.fit(X[:split], y[:split])
        p = lr.predict_proba(X[split:])[:, 1]
        results[f"logreg_top3({','.join(top3)})"] = float(brier_score_loss(y[split:], p))

    # d) Current saved DeepNRFI model, if present
    manifest_path = ARTIFACT_DIR / "manifest.json"
    if manifest_path.exists():
        try:
            m = json.loads(manifest_path.read_text())
            if "brier" in m:
                results[f"saved_model({m.get('activeVersion', '?')})"] = float(m["brier"])
        except (json.JSONDecodeError, OSError):
            pass

    return results


def render_report(df: pd.DataFrame, stats: pd.DataFrame, briers: dict[str, float], path: Path) -> None:
    y = df[LABEL_COL].astype(int)
    lines: list[str] = []
    lines.append(f"# DeepNRFI training-set feature report\n")
    lines.append(f"**Rows:** {len(df):,}    **NRFI rate:** {y.mean():.4f}    **CSV:** `{path.parent.parent / 'data' / 'training.csv'}`\n")

    if "season" in df.columns:
        seasons = df["season"].value_counts().sort_index()
        lines.append("## Season distribution\n")
        lines.append("| season | count |")
        lines.append("|---|---|")
        for s, c in seasons.items():
            lines.append(f"| {s} | {c:,} |")
        lines.append("")

    lines.append("## Baseline Briers (lower is better)\n")
    lines.append("| strategy | brier |")
    lines.append("|---|---|")
    for name, b in briers.items():
        lines.append(f"| {name} | {b:.4f} |")
    lines.append("")

    live = stats[~stats["dead"]]
    dead = stats[stats["dead"]]

    lines.append(f"## Live features: {len(live)}    Dead features: {len(dead)}\n")

    lines.append("### Top 15 by |corr| with NRFI label\n")
    lines.append("| feature | corr | std | null% | unique |")
    lines.append("|---|---|---|---|---|")
    for _, r in live.head(15).iterrows():
        lines.append(f"| `{r['feature']}` | {r['corr']:+.4f} | {r['std']:.4f} | {r['null_pct']:.1%} | {r['unique']} |")
    lines.append("")

    if len(dead) > 0:
        lines.append("### Dead features (constants or all-NaN) — likely a builder gap\n")
        for c in dead["feature"]:
            lines.append(f"- `{c}`")
        lines.append("")

    path.write_text("\n".join(lines))


def print_summary(df: pd.DataFrame, stats: pd.DataFrame, briers: dict[str, float]) -> None:
    y = df[LABEL_COL].astype(int)
    print(f"=== rows: {len(df):,}    nrfi rate: {y.mean():.4f}")
    if "season" in df.columns:
        seasons = df["season"].value_counts().sort_index()
        print("=== seasons:")
        for s, c in seasons.items():
            print(f"    {s}: {c:,}")
    print("\n=== baseline briers:")
    for name, b in briers.items():
        print(f"    {name:48s} {b:.4f}")
    live = stats[~stats["dead"]]
    dead = stats[stats["dead"]]
    print(f"\n=== top 10 features by |corr| (of {len(live)} live):")
    for _, r in live.head(10).iterrows():
        print(f"    {r['feature']:36s} corr={r['corr']:+.4f}  std={r['std']:.4f}  null%={r['null_pct']:.0%}")
    if len(dead) > 0:
        print(f"\n=== {len(dead)} dead features (constant/all-NaN):")
        for c in dead["feature"]:
            print(f"    - {c}")


def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 2
    df = pd.read_csv(csv_path)
    if LABEL_COL not in df.columns:
        print(f"CSV missing label column {LABEL_COL!r}", file=sys.stderr)
        return 2

    stats = per_feature_stats(df)
    briers = baseline_briers(df, stats)
    print_summary(df, stats, briers)
    report_path = Path(args.report)
    render_report(df, stats, briers, report_path)
    print(f"\n=== wrote report to {report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
