"""
Refresh Statcast pitcher and batter summaries into Postgres.

Phase 1 (this engagement): manual one-shot tool.  Phase 6 will wire this into
a weekly GitHub Actions cron.

Usage:
    python scripts/data/refresh_statcast.py --from 2024-04-01 --to 2024-09-30

Requires:
    pip install -r scripts/data/requirements.txt
    DATABASE_URL pointing to the Neon Postgres instance.

Writes to:
    pitcher_statcast (mlbam_id, date, payload jsonb) — keyed by latest summary date
    batter_statcast  (mlbam_id, date, payload jsonb)

Both tables are created by the Phase 1 Prisma migration.  The payload JSON
matches StatcastPitcherSummary / StatcastBatterSummary from lib/types.ts so the
TS adapter (lib/api/statcast.ts) can pass it through unchanged.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, date

try:
    import pandas as pd
    import psycopg
    from pybaseball import statcast, playerid_lookup, cache
except ImportError as e:
    print(f"Missing dependency: {e}.  Run: pip install -r scripts/data/requirements.txt", file=sys.stderr)
    raise SystemExit(1)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Refresh Statcast caches into Postgres")
    p.add_argument("--from", dest="date_from", required=True, help="ISO date YYYY-MM-DD")
    p.add_argument("--to", dest="date_to", required=True, help="ISO date YYYY-MM-DD")
    p.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL"),
        help="Postgres URL (defaults to $DATABASE_URL).",
    )
    p.add_argument("--dry-run", action="store_true", help="Skip database writes; print summary only.")
    return p.parse_args()


def summarise_pitchers(df: pd.DataFrame) -> pd.DataFrame:
    """Per-pitcher fastball velocity, spin, breaking-ball share, and a Stuff+ proxy."""
    if df.empty:
        return pd.DataFrame()
    fb = df[df["pitch_type"].isin(["FF", "FT", "SI"])]
    breaking = df[df["pitch_type"].isin(["SL", "CU", "ST", "KC"])]

    g = df.groupby("pitcher").size().rename("n_pitches")
    fb_velo = fb.groupby("pitcher")["release_speed"].mean().rename("fbVeloAvg")
    fb_spin = fb.groupby("pitcher")["release_spin_rate"].mean().rename("fbSpinAvg")
    breaking_ct = breaking.groupby("pitcher").size().rename("n_breaking")
    rel_h = df.groupby("pitcher")["release_pos_z"].mean().rename("releaseHeight")
    rel_s = df.groupby("pitcher")["release_pos_x"].mean().rename("releaseSide")

    out = pd.concat([g, fb_velo, fb_spin, breaking_ct, rel_h, rel_s], axis=1)
    out["breaking_pct"] = (out["n_breaking"].fillna(0) / out["n_pitches"]).clip(0, 1)
    # Lightweight Stuff+ proxy: z-scored fb velo + spin (centred at league means).
    velo_z = (out["fbVeloAvg"] - 93.5) / 1.6
    spin_z = (out["fbSpinAvg"] - 2300) / 220
    out["stuffPlus"] = (100 + 8 * velo_z + 5 * spin_z).round(1)
    out = out.dropna(subset=["fbVeloAvg", "fbSpinAvg"])
    return out


def summarise_batters(df: pd.DataFrame) -> pd.DataFrame:
    """Per-batter xwOBA, barrel%, hard-hit%, and average exit velocity."""
    if df.empty:
        return pd.DataFrame()
    bb = df[df["type"] == "X"].copy()  # batted balls only
    if bb.empty:
        return pd.DataFrame()
    g = bb.groupby("batter").size().rename("n_bb")
    xwoba = bb.groupby("batter")["estimated_woba_using_speedangle"].mean().rename("xwoba")
    avg_ev = bb.groupby("batter")["launch_speed"].mean().rename("avg_ev")
    barrel = bb[bb["barrel"] == 1].groupby("batter").size().rename("n_barrel")
    hardhit = bb[bb["launch_speed"] >= 95].groupby("batter").size().rename("n_hardhit")
    out = pd.concat([g, xwoba, avg_ev, barrel, hardhit], axis=1)
    out["barrel_pct"] = (out["n_barrel"].fillna(0) / out["n_bb"]).clip(0, 1)
    out["hardhit_pct"] = (out["n_hardhit"].fillna(0) / out["n_bb"]).clip(0, 1)
    out = out.dropna(subset=["xwoba", "avg_ev"])
    return out


def upsert(conn: "psycopg.Connection", table: str, mlbam_id: str, dt: date, payload: dict) -> None:
    sql = (
        f'INSERT INTO {table} (id, "mlbamId", date, payload, "createdAt") '
        f"VALUES (gen_random_uuid()::text, %s, %s, %s::jsonb, NOW()) "
        f'ON CONFLICT ("mlbamId", date) DO UPDATE SET payload = EXCLUDED.payload'
    )
    conn.execute(sql, (mlbam_id, dt, json.dumps(payload)))


def main() -> int:
    args = parse_args()
    if not args.dry_run and not args.db_url:
        print("DATABASE_URL is required (or pass --db-url).", file=sys.stderr)
        return 2

    cache.enable()
    print(f"[refresh-statcast] pulling Statcast {args.date_from} → {args.date_to}")
    df = statcast(start_dt=args.date_from, end_dt=args.date_to, verbose=False)
    if df is None or df.empty:
        print("[refresh-statcast] no rows returned")
        return 0

    pitchers = summarise_pitchers(df)
    batters = summarise_batters(df)
    summary_date = datetime.fromisoformat(args.date_to).date()
    print(f"[refresh-statcast] pitchers={len(pitchers)} batters={len(batters)} (as of {summary_date})")

    if args.dry_run:
        if not pitchers.empty:
            print(pitchers.head(5))
        if not batters.empty:
            print(batters.head(5))
        return 0

    with psycopg.connect(args.db_url) as conn:
        for mlbam_id, row in pitchers.iterrows():
            payload = {
                "fbVeloAvg": float(row["fbVeloAvg"]),
                "fbSpinAvg": float(row["fbSpinAvg"]),
                "breaking_pct": float(row["breaking_pct"]),
                "stuffPlus": float(row["stuffPlus"]),
                "releaseHeight": float(row.get("releaseHeight", 6.0)) if pd.notna(row.get("releaseHeight")) else None,
                "releaseSide": float(row.get("releaseSide", 0.0)) if pd.notna(row.get("releaseSide")) else None,
            }
            upsert(conn, "pitcher_statcast", str(int(mlbam_id)), summary_date, payload)
        for mlbam_id, row in batters.iterrows():
            payload = {
                "xwoba": float(row["xwoba"]),
                "barrel_pct": float(row["barrel_pct"]),
                "hardhit_pct": float(row["hardhit_pct"]),
                "avg_ev": float(row["avg_ev"]),
            }
            upsert(conn, "batter_statcast", str(int(mlbam_id)), summary_date, payload)
        conn.commit()

    print("[refresh-statcast] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
