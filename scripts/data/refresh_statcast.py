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
    import numpy as np
    import pandas as pd
    import psycopg
    from psycopg import sql
    from pybaseball import statcast, playerid_lookup, cache
except ImportError as e:
    print(f"Missing dependency: {e}.  Run: pip install -r scripts/data/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e


# League averages circa 2024 season for the Stuff+ proxy (z-scored fb velo + spin).
LEAGUE_FB_VELO_MEAN = 93.5
LEAGUE_FB_VELO_STD = 1.6
LEAGUE_FB_SPIN_MEAN = 2300
LEAGUE_FB_SPIN_STD = 220
STUFFPLUS_VELO_WEIGHT = 8
STUFFPLUS_SPIN_WEIGHT = 5

# ── Pitch-mix / zone-whiff aggregation (season-to-date) ───────────────────────
# MIN_PITCHES kept in sync with lib/config.ts (no cross-runtime import).
MIN_PITCHES = 200
# Statcast pitch_type codes that aren't real pitches; excluded from the arsenal.
NON_PITCH_CODES = {"PO", "FO", "IN", "AB", "UN", "NA", "", None}
# Whiff% = swinging strikes / swings. "swings" includes contact + misses.
SWING_DESC = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play"}
WHIFF_DESC = {"swinging_strike", "swinging_strike_blocked"}
# Expanded 5×5 zone grid (matches the HfZone component): the MIDDLE 3 of 5
# columns/rows cover the rulebook zone, the outer ring is out-of-zone.
ZONE_X_MIN, ZONE_X_MAX = -1.383, 1.383      # inner 3 cols ⇒ plate_x ∈ [-0.83, 0.83]
SZ_BOT_DEFAULT, SZ_TOP_DEFAULT = 1.5, 3.5    # fallback rulebook zone (ft)


def _iso_date(value: str) -> date:
    try:
        return datetime.fromisoformat(value).date()
    except ValueError as err:
        raise argparse.ArgumentTypeError(f"Invalid date '{value}', expected YYYY-MM-DD") from err


def _default_season_start(d: date) -> date:
    """Opening-ish day for the season containing `d` (default Mar 1 of its year)."""
    return date(d.year, 3, 1)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Refresh Statcast caches into Postgres")
    p.add_argument("--from", dest="date_from", type=_iso_date, required=True, help="ISO date YYYY-MM-DD")
    p.add_argument("--to", dest="date_to", type=_iso_date, required=True, help="ISO date YYYY-MM-DD")
    p.add_argument(
        "--season-start",
        dest="season_start",
        type=_iso_date,
        default=None,
        help="Season-to-date window start for pitch-mix/zone aggregates "
             "(default Mar 1 of --to's year). Decoupled from --from/--to, which "
             "drive the numeric summary.",
    )
    p.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL"),
        help="Postgres URL (defaults to $DATABASE_URL).",
    )
    p.add_argument("--dry-run", action="store_true", help="Skip database writes; print summary only.")
    args = p.parse_args()
    if args.date_from > args.date_to:
        p.error("--from must be on or before --to")
    if args.season_start is None:
        args.season_start = _default_season_start(args.date_to)
    if args.season_start > args.date_to:
        p.error("--season-start must be on or before --to")
    return args


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
    velo_z = (out["fbVeloAvg"] - LEAGUE_FB_VELO_MEAN) / LEAGUE_FB_VELO_STD
    spin_z = (out["fbSpinAvg"] - LEAGUE_FB_SPIN_MEAN) / LEAGUE_FB_SPIN_STD
    out["stuffPlus"] = (100 + STUFFPLUS_VELO_WEIGHT * velo_z + STUFFPLUS_SPIN_WEIGHT * spin_z).round(1)
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


def summarise_pitch_mix(df: pd.DataFrame) -> dict[int, list[dict]]:
    """Per-pitcher full arsenal: {usage, velocityMph} per pitch_type, usage desc.

    Gated at MIN_PITCHES season-to-date. Non-pitch codes and pitch types whose
    mean velocity is non-finite are dropped (the latter guards a NaN reaching the
    jsonb payload). Returns {} when the required columns are absent.
    """
    if df is None or df.empty:
        return {}
    if not {"pitcher", "pitch_type", "release_speed"}.issubset(df.columns):
        return {}
    out: dict[int, list[dict]] = {}
    for pid, g in df.groupby("pitcher"):
        if len(g) < MIN_PITCHES:
            continue
        arsenal = g[g["pitch_type"].notna() & ~g["pitch_type"].isin(NON_PITCH_CODES)]
        n = len(arsenal)
        if n == 0:
            continue
        usage = arsenal.groupby("pitch_type").size() / n
        velo = arsenal.groupby("pitch_type")["release_speed"].mean()
        entries = []
        for code in usage.index:
            v = velo.get(code)
            if v is None or not np.isfinite(v):
                continue  # drop pitch types with no usable velocity (NaN→jsonb fails)
            entries.append({
                "code": str(code),
                "usage": round(float(usage[code]), 4),
                "velocityMph": round(float(v), 1),
            })
        if not entries:
            continue
        entries.sort(key=lambda e: e["usage"], reverse=True)
        out[int(pid)] = entries
    return out


def summarise_zone_whiff(df: pd.DataFrame) -> dict[int, list[float]]:
    """Per-pitcher 25-cell whiff% grid (swinging strikes / swings).

    5×5 equal-width bins over an EXPANDED zone so the middle 3×3 covers the
    rulebook zone and the outer ring is out-of-zone (matches the HfZone
    component). Row 0 = top (highest plate_z); row-major top-left→bottom-right.
    Pitches outside the extent clamp to the edge cell (none dropped). Gated at
    MIN_PITCHES season-to-date.
    """
    if df is None or df.empty:
        return {}
    needed = {"pitcher", "plate_x", "plate_z", "description", "sz_top", "sz_bot"}
    if not needed.issubset(df.columns):
        return {}

    n_by_pitcher = df.groupby("pitcher").size()
    eligible = set(n_by_pitcher[n_by_pitcher >= MIN_PITCHES].index)
    if not eligible:
        return {}

    sw = df[df["pitcher"].isin(eligible) & df["description"].isin(SWING_DESC)].copy()
    sw = sw.dropna(subset=["plate_x", "plate_z"])
    if sw.empty:
        return {}

    sz_top = sw["sz_top"].fillna(SZ_TOP_DEFAULT)
    sz_bot = sw["sz_bot"].fillna(SZ_BOT_DEFAULT)
    h = (sz_top - sz_bot) / 3.0
    default_h = (SZ_TOP_DEFAULT - SZ_BOT_DEFAULT) / 3.0
    h = h.where(h > 0, default_h)            # guard degenerate per-pitch zones
    z_min = sz_bot - h
    cell_w = (ZONE_X_MAX - ZONE_X_MIN) / 5.0

    col = np.clip(((sw["plate_x"] - ZONE_X_MIN) / cell_w).astype(int), 0, 4)
    row_from_bottom = np.clip(((sw["plate_z"] - z_min) / h).astype(int), 0, 4)
    row = 4 - row_from_bottom               # row 0 = top
    sw["cell"] = (np.asarray(row) * 5 + np.asarray(col)).astype(int)
    sw["is_whiff"] = sw["description"].isin(WHIFF_DESC)

    out: dict[int, list[float]] = {}
    for pid, g in sw.groupby("pitcher"):
        swings_per = g.groupby("cell").size()
        whiffs_per = g[g["is_whiff"]].groupby("cell").size()
        grid = []
        for c in range(25):
            s = int(swings_per.get(c, 0))
            w = int(whiffs_per.get(c, 0))
            grid.append(round(w / s, 4) if s > 0 else 0.0)
        out[int(pid)] = grid
    return out


_ALLOWED_TABLES = {"pitcher_statcast", "batter_statcast"}


def upsert(conn: "psycopg.Connection", table: str, mlbam_id: str, dt: date, payload: dict) -> None:
    # Whitelist + sql.Identifier so a future caller passing untrusted input can't
    # produce a SQL-injection vector via the table name.
    if table not in _ALLOWED_TABLES:
        raise ValueError(f"Refusing to upsert into unknown table {table!r}")
    query = sql.SQL(
        'INSERT INTO {} (id, "mlbamId", date, payload, "createdAt") '
        "VALUES (gen_random_uuid()::text, %s, %s, %s::jsonb, NOW()) "
        'ON CONFLICT ("mlbamId", date) DO UPDATE SET payload = EXCLUDED.payload'
    ).format(sql.Identifier(table))
    conn.execute(query, (mlbam_id, dt, json.dumps(payload)))


def main() -> int:
    args = parse_args()
    if not args.dry_run and not args.db_url:
        print("DATABASE_URL is required (or pass --db-url).", file=sys.stderr)
        return 2

    cache.enable()
    print(f"[refresh-statcast] pulling Statcast {args.date_from} → {args.date_to}")
    df = statcast(start_dt=args.date_from.isoformat(), end_dt=args.date_to.isoformat(), verbose=False)
    if df is None or df.empty:
        print("[refresh-statcast] no rows returned")
        return 0

    pitchers = summarise_pitchers(df)
    batters = summarise_batters(df)
    summary_date = args.date_to
    print(f"[refresh-statcast] pitchers={len(pitchers)} batters={len(batters)} (as of {summary_date})")

    # Pitch-mix / zone-whiff need a larger sample than the numeric-summary window,
    # so aggregate them season-to-date (the cron's --from/--to is often ~14 days
    # and rarely clears MIN_PITCHES). pybaseball's on-disk cache bounds the cost.
    if args.season_start < args.date_from:
        print(f"[refresh-statcast] pulling season-to-date {args.season_start} → {args.date_to} for pitch-mix/zone")
        df_std = statcast(start_dt=args.season_start.isoformat(), end_dt=args.date_to.isoformat(), verbose=False)
    else:
        df_std = df  # window already covers the season-to-date span
    pitch_mix_map = summarise_pitch_mix(df_std)
    zone_whiff_map = summarise_zone_whiff(df_std)
    print(f"[refresh-statcast] pitchMix pitchers={len(pitch_mix_map)} zoneWhiff pitchers={len(zone_whiff_map)} "
          f"(season-to-date, MIN_PITCHES={MIN_PITCHES})")

    if args.dry_run:
        if not pitchers.empty:
            print(pitchers.head(5))
        if not batters.empty:
            print(batters.head(5))
        for pid, mix in list(pitch_mix_map.items())[:3]:
            print(f"  pitchMix {pid}: {mix}")
        for pid, grid in list(zone_whiff_map.items())[:1]:
            print(f"  zoneWhiff {pid} (len={len(grid)}): {grid}")
        return 0

    skipped_pitchers = 0
    skipped_batters = 0
    with psycopg.connect(args.db_url) as conn:
        for mlbam_id, row in pitchers.iterrows():
            try:
                payload = {
                    "fbVeloAvg": float(row["fbVeloAvg"]),
                    "fbSpinAvg": float(row["fbSpinAvg"]),
                    "breaking_pct": float(row["breaking_pct"]),
                    "stuffPlus": float(row["stuffPlus"]),
                    "releaseHeight": float(row.get("releaseHeight", 6.0)) if pd.notna(row.get("releaseHeight")) else None,
                    "releaseSide": float(row.get("releaseSide", 0.0)) if pd.notna(row.get("releaseSide")) else None,
                }
                # Merge season-to-date rich fields when the pitcher cleared the gate.
                mix = pitch_mix_map.get(int(mlbam_id))
                if mix:
                    payload["pitchMix"] = mix
                zone = zone_whiff_map.get(int(mlbam_id))
                if zone:
                    payload["zoneWhiff"] = zone
                upsert(conn, "pitcher_statcast", str(int(mlbam_id)), summary_date, payload)
            except (ValueError, TypeError) as err:
                skipped_pitchers += 1
                print(f"[refresh-statcast] skip pitcher {mlbam_id} ({summary_date}): {err}", file=sys.stderr)
        for mlbam_id, row in batters.iterrows():
            try:
                payload = {
                    "xwoba": float(row["xwoba"]),
                    "barrel_pct": float(row["barrel_pct"]),
                    "hardhit_pct": float(row["hardhit_pct"]),
                    "avg_ev": float(row["avg_ev"]),
                }
                upsert(conn, "batter_statcast", str(int(mlbam_id)), summary_date, payload)
            except (ValueError, TypeError) as err:
                skipped_batters += 1
                print(f"[refresh-statcast] skip batter {mlbam_id} ({summary_date}): {err}", file=sys.stderr)
        conn.commit()
    if skipped_pitchers or skipped_batters:
        print(f"[refresh-statcast] skipped {skipped_pitchers} pitchers / {skipped_batters} batters")

    print("[refresh-statcast] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
