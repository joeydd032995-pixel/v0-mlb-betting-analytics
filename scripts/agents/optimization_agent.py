"""
Optimization Agent — weekly retrain + recalibration entrypoint.

Drives, in order:
  1. Refit calibration splines (v1 + v2) using the last 365 days of
     ModelPrediction × GameResult data, by invoking
     scripts/deepnrfi/recalibrate.py.
  2. Backtest v2 vs v1 over the most recent completed season via
     scripts/deepnrfi/backtest_v2.py.
  3. Print a short markdown report summarising metric deltas.

The agent **never** modifies committed artifacts or production env vars.
When run from a GitHub Actions workflow it should be paired with a job step
that opens a PR if and only if a maintainer approves the recalibration
output (see .github/workflows/optimization-cron.yml for the suggested
pattern using `peter-evans/create-pull-request`).

Usage:
  python scripts/agents/optimization_agent.py
  python scripts/agents/optimization_agent.py --season 2024 --dry-run

Env:
  DATABASE_URL                Required (passed through to the underlying scripts).
  OPTIMIZATION_SEASON         Override the backtest season (defaults to current ET year).
  OPTIMIZATION_DRY_RUN=1      Skip recalibration and only run the backtest summary.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
DEEPNRFI_DIR = ROOT / "scripts" / "deepnrfi"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run weekly Ensemble++ optimization tasks")
    p.add_argument(
        "--season",
        type=int,
        default=int(os.environ.get("OPTIMIZATION_SEASON") or datetime.now(ZoneInfo("America/New_York")).year),
    )
    p.add_argument("--dry-run", action="store_true", default=os.environ.get("OPTIMIZATION_DRY_RUN") == "1")
    return p.parse_args()


def run(cmd: list[str], *, capture: bool = False) -> tuple[int, str]:
    print(f"[optimization-agent] $ {' '.join(cmd)}", file=sys.stderr)
    result = subprocess.run(cmd, capture_output=capture, text=True)
    if capture:
        return result.returncode, (result.stdout or "") + (result.stderr or "")
    return result.returncode, ""


def main() -> int:
    args = parse_args()
    if not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL is required.", file=sys.stderr)
        return 2

    print(f"# Ensemble++ optimization report — {datetime.utcnow().date().isoformat()}")
    print(f"_Season: {args.season} · dry-run: {args.dry_run}_")
    print()

    # 1. Recalibration ------------------------------------------------------
    if args.dry_run:
        print("Skipping recalibration in dry-run mode.")
    else:
        rc, out = run(
            [sys.executable, str(DEEPNRFI_DIR / "recalibrate.py"), "--season", str(args.season)],
            capture=True,
        )
        print("## Calibration spline refit")
        if rc == 0:
            print("```")
            print(out.strip())
            print("```")
        else:
            print(f"❌ recalibration failed (exit {rc})")
            print(f"```\n{out.strip()}\n```")

    # 2. Backtest -----------------------------------------------------------
    rc, out = run(
        [sys.executable, str(DEEPNRFI_DIR / "backtest_v2.py"), "--season", str(args.season)],
        capture=True,
    )
    print("\n## v1 vs v2 backtest")
    if rc == 0:
        print("```")
        print(out.strip())
        print("```")
    else:
        print(f"❌ backtest failed (exit {rc})")
        print(f"```\n{out.strip()}\n```")
        return rc

    print("\n_To promote v2 to production: review the metric deltas above, then update_")
    print("_`ENSEMBLE_VERSION=v2.9models` in the deployment environment._")
    return 0


if __name__ == "__main__":
    sys.exit(main())
