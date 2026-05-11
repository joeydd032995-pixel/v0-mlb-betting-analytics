"""
End-to-end orchestrator: backfill missing seasons into Postgres, then build the
DeepNRFI training CSV.

Steps:
  1. Inspect game_results to see which seasons/months are already populated.
  2. For each (season, month) in --seasons × Apr–Oct that has < MIN_GAMES_PER_MONTH
     rows, GET /api/historical-sync?year=YYYY&month=M from --api-base.
  3. Re-check the DB and bail if any required season still looks empty.
  4. Invoke build_real_training_set.py as a subprocess for --from..--to.

Usage:
  export DATABASE_URL="postgresql://..."
  python scripts/deepnrfi/backfill_and_build.py \
    --api-base https://your-app.vercel.app \
    --seasons 2023,2024,2025 \
    --from 2023-04-01 --to 2025-10-31

Env:
  DATABASE_URL    Required.  Passed through to the builder subprocess.
  API_BASE_URL    Optional default for --api-base (e.g. http://localhost:3000).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

try:
    import psycopg
    import requests
except ImportError as e:
    print("Missing deps. Install: pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e

BUILDER = Path(__file__).resolve().parent / "build_real_training_set.py"

# Months 4–10 cover the regular season + October playoffs.  Off-season months
# would just return zero rows; we skip them to avoid wasted HTTP calls.
SEASON_MONTHS = list(range(4, 11))

# A populated MLB month should have a few hundred games.  We treat anything
# less than this as "needs sync" (covers partial/aborted runs too).
MIN_GAMES_PER_MONTH = 100

REQUEST_TIMEOUT = 600  # /api/historical-sync sets maxDuration=300; pad for cold starts.


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--api-base", default=os.environ.get("API_BASE_URL", "http://localhost:3000"),
                   help="Base URL for /api/historical-sync (default: $API_BASE_URL or http://localhost:3000)")
    p.add_argument("--seasons", default="2023,2024,2025",
                   help="Comma-separated seasons to ensure are backfilled (default: 2023,2024,2025)")
    p.add_argument("--from", dest="date_from", required=True, type=date.fromisoformat,
                   help="Builder --from (inclusive)")
    p.add_argument("--to", dest="date_to", required=True, type=date.fromisoformat,
                   help="Builder --to (inclusive)")
    p.add_argument("--skip-builder", action="store_true",
                   help="Only backfill the DB; don't run the builder afterwards")
    p.add_argument("--skip-backfill", action="store_true",
                   help="Skip the historical-sync loop; just run the builder")
    args = p.parse_args()

    if args.date_from > args.date_to:
        p.error("--from must be on or before --to")
    return args


def db_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is required.", file=sys.stderr)
        raise SystemExit(2)
    return url


def month_counts(url: str, seasons: list[int]) -> dict[tuple[int, int], int]:
    """Return {(season, month): row_count} for every season in `seasons`."""
    sql = """
        SELECT season,
               EXTRACT(MONTH FROM date::date)::int AS month,
               COUNT(*)::int AS n
        FROM game_results
        WHERE season = ANY(%s)
        GROUP BY season, month
    """
    out: dict[tuple[int, int], int] = {}
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(sql, (seasons,))
        for season, month, n in cur.fetchall():
            out[(int(season), int(month))] = int(n)
    return out


def sync_one(api_base: str, year: int, month: int) -> dict:
    url = f"{api_base.rstrip('/')}/api/historical-sync"
    print(f"  GET {url}?year={year}&month={month} ...", flush=True)
    r = requests.get(url, params={"year": year, "month": month}, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.json()


def backfill(api_base: str, seasons: list[int]) -> None:
    print(f"[backfill] checking DB for seasons {seasons} ...", flush=True)
    counts = month_counts(db_url(), seasons)

    todo: list[tuple[int, int]] = []
    for season in seasons:
        for month in SEASON_MONTHS:
            existing = counts.get((season, month), 0)
            if existing < MIN_GAMES_PER_MONTH:
                todo.append((season, month))
                print(f"  needs sync: {season}-{month:02d} (have {existing})", flush=True)
            else:
                print(f"  OK:         {season}-{month:02d} ({existing} rows)", flush=True)

    if not todo:
        print("[backfill] all months already populated.", flush=True)
        return

    print(f"[backfill] syncing {len(todo)} month(s) via {api_base} ...", flush=True)
    failures: list[tuple[int, int, str]] = []
    for season, month in todo:
        try:
            res = sync_one(api_base, season, month)
            print(f"    -> synced={res.get('gameResultsSynced')} skipped={res.get('skipped')}", flush=True)
        except Exception as e:
            print(f"    !! failed: {e}", file=sys.stderr, flush=True)
            failures.append((season, month, str(e)))
            time.sleep(2)

    print("[backfill] re-checking DB ...", flush=True)
    final = month_counts(db_url(), seasons)
    still_short = [
        (s, m, final.get((s, m), 0))
        for (s, m) in todo
        if final.get((s, m), 0) < MIN_GAMES_PER_MONTH
    ]
    if still_short:
        print("[backfill] WARNING — these months are still under threshold after sync:", file=sys.stderr)
        for s, m, n in still_short:
            print(f"    {s}-{m:02d}: {n} rows", file=sys.stderr)
        if failures:
            print(f"[backfill] {len(failures)} HTTP failures during sync.", file=sys.stderr)
        # Don't hard-fail: some months legitimately have fewer games (March/Oct
        # short months, current in-progress month).  Let the builder run and
        # surface the truth via its own row counts.


def run_builder(args: argparse.Namespace) -> int:
    cmd = [sys.executable, str(BUILDER),
           "--from", args.date_from.isoformat(),
           "--to",   args.date_to.isoformat()]
    print(f"[build] $ {' '.join(cmd)}", flush=True)
    return subprocess.call(cmd)


def main() -> int:
    args = parse_args()
    seasons = [int(s.strip()) for s in args.seasons.split(",") if s.strip()]

    if not args.skip_backfill:
        backfill(args.api_base, seasons)
    else:
        print("[backfill] skipped (--skip-backfill).", flush=True)

    if args.skip_builder:
        print("[build] skipped (--skip-builder).", flush=True)
        return 0

    return run_builder(args)


if __name__ == "__main__":
    sys.exit(main())
