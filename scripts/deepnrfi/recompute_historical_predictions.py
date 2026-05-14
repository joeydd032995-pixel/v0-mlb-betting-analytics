"""
Opt-in: re-run /api/historical-sync with `recompute=true` for one or more
seasons, after the route has been wired to fetch real historical weather.

This is the **stub** step of Phase 5 / Step 5 in the plan — it's committed so
the workflow is documented, but should only be run after:
  1. Steps 1–4 of Phase 5 have shipped and trained successfully.
  2. The historical-sync route has been updated to call
     `fetchHistoricalWeather` from `lib/api/weather.ts` instead of using
     `NEUTRAL_WEATHER`.  (Not yet done — left to a follow-up commit.)
  3. The Vercel deployment has `RECOMPUTE_HISTORICAL=true` set in its env.

Without those prerequisites the route returns 403 and this script exits
fast, leaving the table untouched.

Usage:
    python scripts/deepnrfi/recompute_historical_predictions.py \\
      --api-base https://homeplatemetrics.com \\
      --season 2024 \\
      [--season 2025]

Env:
    RECOMPUTE_HISTORICAL=true must be set on the API server.
    RECOMPUTE_TOKEN        Shared secret matching the server's RECOMPUTE_TOKEN
                           env var.  Passed as `Authorization: Bearer <token>`.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Iterable

try:
    import requests
except ImportError as e:
    print(f"Missing dep: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e


SEASON_MONTHS = list(range(3, 11))  # March (pre-season) through October (postseason short)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--api-base", default=os.environ.get("API_BASE_URL", "http://localhost:3000"))
    p.add_argument("--season", action="append", type=int, required=True,
                   help="Season(s) to recompute.  Pass multiple times for multiple years.")
    p.add_argument("--dry-run", action="store_true",
                   help="Print the URLs that would be hit, but don't call them.")
    return p.parse_args()


def recompute_season(api_base: str, season: int, token: str, dry_run: bool) -> tuple[int, int]:
    """Returns (synced_total, failed_months)."""
    failed = 0
    synced = 0
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    for month in SEASON_MONTHS:
        url = f"{api_base.rstrip('/')}/api/historical-sync"
        params = {"year": season, "month": month, "recompute": "true"}
        if dry_run:
            print(f"  [dry-run] GET {url}?year={season}&month={month}&recompute=true")
            continue
        print(f"  GET {url}?year={season}&month={month}&recompute=true ...", flush=True)
        try:
            r = requests.get(url, params=params, headers=headers, timeout=600)
            if r.status_code == 401:
                print("    !! 401 — set RECOMPUTE_TOKEN locally and on the server", file=sys.stderr)
                failed += 1
                continue
            if r.status_code == 403:
                print(f"    !! 403 — does the server have RECOMPUTE_HISTORICAL=true?", file=sys.stderr)
                failed += 1
                continue
            r.raise_for_status()
            j = r.json()
            print(f"    -> predictions={j.get('predictionsSynced', 0)}")
            synced += int(j.get("predictionsSynced", 0))
        except (requests.RequestException, ValueError) as e:
            print(f"    !! failed: {e}", file=sys.stderr)
            failed += 1
        time.sleep(2)
    return synced, failed


def main() -> int:
    args = parse_args()
    token = os.environ.get("RECOMPUTE_TOKEN", "")
    if not args.dry_run and not token:
        print("RECOMPUTE_TOKEN env var is required (must match server).", file=sys.stderr)
        return 2

    if args.dry_run:
        print(f"[recompute] dry-run mode (no HTTP calls)")
    else:
        print(f"[recompute] hitting {args.api_base} — Ctrl+C to abort within 5s")
        time.sleep(5)

    total_synced = 0
    total_failed = 0
    for season in args.season:
        print(f"\n[recompute] season {season}:")
        s, f = recompute_season(args.api_base, season, token, args.dry_run)
        total_synced += s
        total_failed += f

    print(f"\n[recompute] done — {total_synced} predictions recomputed, {total_failed} month(s) failed.")
    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
