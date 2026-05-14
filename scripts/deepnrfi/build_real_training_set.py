"""
Build a real, point-in-time training set for DeepNRFI without a live shadow
window.  Reconstructs each game's feature vector from public data:

  - pybaseball Statcast pitch-by-pitch (rolling 30 days BEFORE each game date)
  - MLB Stats `/game/{gamePk}/boxscore` for the actual posted lineup + starters
  - Existing `model_predictions.ensembleNrfi` for the v1 ensemble feature
  - Static park / league-average defaults for weather + umpire (presence=0)

Output: scripts/deepnrfi/data/training.csv ready for `train.py`.

Both heavy fetches are checkpointed to disk so a re-run resumes instantly:
  - Bulk Statcast pull → scripts/deepnrfi/data/statcast_<from>_<to>.parquet
  - Per-game boxscore  → scripts/deepnrfi/data/boxscores/<gamePk>.json
  - Per-row training   → scripts/deepnrfi/data/training.csv (appended in chunks)

Usage:
  DATABASE_URL=... python scripts/deepnrfi/build_real_training_set.py \
    --from 2023-04-01 --to 2024-09-30

Env:
  DATABASE_URL                 Required.  Same Neon URL used by Prisma.
  BUILDER_MAX_GAMES            Cap the loop for testing (default no cap).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    import pandas as pd
    import requests
    import psycopg
    from pybaseball import statcast, cache as pybaseball_cache
except ImportError as e:
    print(
        f"Missing dependency: {e}.  Run: pip install -r scripts/deepnrfi/requirements.txt",
        file=sys.stderr,
    )
    raise SystemExit(1) from e

# Local modules — sibling files in the same scripts/deepnrfi/ dir.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from park_factors import lookup_park, lookup_venue  # noqa: E402
from weather_archive import prefetch_weather, fetch_game_weather  # noqa: E402


# ─── Paths ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "scripts" / "deepnrfi" / "data"
BOXSCORE_DIR = DATA_DIR / "boxscores"
DATA_DIR.mkdir(parents=True, exist_ok=True)
BOXSCORE_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = DATA_DIR / "training.csv"


# ─── Constants ────────────────────────────────────────────────────────────────

LEAGUE_AVG_NRFI = 0.516
ROLLING_WINDOW_DAYS = 30
TOP_OF_ORDER = 4
SHRINKAGE_K = 1.14  # within_var / between_var, matches lib/nrfi-models.ts

# Defaults mirror lib/features/feature-vector.ts so a missing/imputed feature
# matches what the engine would emit at runtime.
DEFAULTS = {
    "k_rate":             0.225,
    "bb_rate":            0.085,
    "hr_per9":            1.20,
    "babip":              0.295,
    "first_batter_obp":   0.314,
    "recent_form":        0.515,
    "fb_velo":            93.5,
    "fb_spin":            2300.0,
    "breaking_pct":       0.30,
    "stuff_plus":         100.0,
    "pitches_last5":      480,
    "days_rest":          5,
    "rolling3_ip":        5.5,
    "vstop_woba":         0.330,
    "vstop_k":            0.22,
    "top4_ops":           0.760,
    "top4_wrcplus":       110.0,
    "top4_k_pct":         0.22,
    "top4_bb_pct":        0.09,
    "weather_temp_f":     72,
    "weather_humidity":   50,
    "weather_pressure":   1013.25,
    "weather_air_density": 1.18,
}

# Match lib/features/feature-vector.ts FEATURE_ORDER exactly.
FEATURE_ORDER = [
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

META_COLS = [
    "gameId", "date", "season", "homeTeam", "awayTeam", "nrfi",
    # Lineage flags for the ensemble7_nrfi feature.  Surfaced from
    # ModelPrediction.inputsPresence so the trainer can filter or downweight
    # rows where the v1 ensemble was computed with degraded inputs (e.g.
    # historical-sync's NEUTRAL_WEATHER).  These are META, not FEATURE_ORDER —
    # the live serving path always has weather=1 so they'd be dead at inference.
    "ensemble7_inputs_weather",
    "ensemble7_inputs_odds",
    "ensemble7_inputs_lineup",
]


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build a point-in-time DeepNRFI training set")
    p.add_argument("--from", dest="date_from", required=True, type=date.fromisoformat,
                   help="Inclusive start date (YYYY-MM-DD)")
    p.add_argument("--to",   dest="date_to",   required=True, type=date.fromisoformat,
                   help="Inclusive end date (YYYY-MM-DD)")
    p.add_argument("--db-url", default=os.environ.get("DATABASE_URL"))
    p.add_argument("--max-games", type=int, default=int(os.environ.get("BUILDER_MAX_GAMES") or 0),
                   help="Cap the number of games for testing")
    p.add_argument("--no-cache", action="store_true",
                   help="Ignore cached Statcast parquet and re-pull")
    args = p.parse_args()
    if args.date_from > args.date_to:
        p.error("--from must be on or before --to")
    if not args.db_url:
        p.error("DATABASE_URL is required (or pass --db-url)")
    return args


# ─── Statcast bulk pull (cached) ──────────────────────────────────────────────

def statcast_path(date_from: date, date_to: date) -> Path:
    return DATA_DIR / f"statcast_{date_from.isoformat()}_{date_to.isoformat()}.parquet"


def fetch_statcast(date_from: date, date_to: date, no_cache: bool) -> pd.DataFrame:
    path = statcast_path(date_from, date_to)
    if not no_cache and path.exists():
        print(f"[builder] using cached Statcast at {path}")
        return pd.read_parquet(path)

    pybaseball_cache.enable()
    print(f"[builder] pulling Statcast {date_from} → {date_to} (this takes ~1–3 hours)")
    df = statcast(start_dt=date_from.isoformat(), end_dt=date_to.isoformat(), verbose=False)
    if df is None or df.empty:
        raise RuntimeError("Statcast returned no rows; check the date range")

    # pybaseball returns game_date as a mixed-type object column (Timestamps and
    # strings intermixed across the concatenated season chunks).  pyarrow can't
    # serialise that, so normalise to real datetimes before writing parquet.
    if "game_date" in df.columns:
        df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")

    # Write to a temp path then rename so a crash mid-write can't leave a
    # corrupt cache file that the next run would try (and fail) to read.
    tmp_path = path.with_suffix(".parquet.tmp")
    df.to_parquet(tmp_path)
    tmp_path.replace(path)
    print(f"[builder] cached {len(df):,} pitches to {path}")
    return df


# ─── MLB Stats boxscores (cached per-game) ────────────────────────────────────

_BOXSCORE_MAX_ATTEMPTS = 4
_BOXSCORE_BACKOFF_BASE = 1.5  # seconds; doubles with jitter on each retry


def fetch_boxscore(game_pk: int) -> dict | None:
    cache_path = BOXSCORE_DIR / f"{game_pk}.json"
    if cache_path.exists():
        try:
            return json.loads(cache_path.read_text())
        except json.JSONDecodeError:
            cache_path.unlink(missing_ok=True)

    url = f"https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"
    last_failure = ""
    for attempt in range(1, _BOXSCORE_MAX_ATTEMPTS + 1):
        try:
            r = requests.get(
                url,
                timeout=30,
                headers={"user-agent": "ensemble-plus-builder/1.0"},
            )
            if r.status_code == 200:
                data = r.json()
                cache_path.write_text(json.dumps(data))
                time.sleep(0.4)  # gentle on MLB Stats
                return data
            if r.status_code in (429, 500, 502, 503, 504):
                # Honour Retry-After when MLB Stats sets it (rare but real).
                retry_after = r.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else (
                    _BOXSCORE_BACKOFF_BASE * (2 ** (attempt - 1)) + (attempt * 0.25)
                )
                last_failure = f"HTTP {r.status_code}"
                print(f"[builder] boxscore {game_pk} {last_failure}; retry {attempt}/{_BOXSCORE_MAX_ATTEMPTS} in {wait:.1f}s", file=sys.stderr)
                time.sleep(wait)
                continue
            # Other 4xx — don't retry, treat as permanently missing.
            print(f"[builder] boxscore {game_pk} HTTP {r.status_code}; not retrying", file=sys.stderr)
            return None
        except (requests.RequestException, ValueError) as err:
            wait = _BOXSCORE_BACKOFF_BASE * (2 ** (attempt - 1)) + (attempt * 0.25)
            last_failure = str(err)
            print(f"[builder] boxscore {game_pk} error {err}; retry {attempt}/{_BOXSCORE_MAX_ATTEMPTS} in {wait:.1f}s", file=sys.stderr)
            time.sleep(wait)
    print(f"[builder] boxscore {game_pk} dropped after {_BOXSCORE_MAX_ATTEMPTS} attempts ({last_failure})", file=sys.stderr)
    return None


def starting_pitcher(box: dict, side: str) -> int | None:
    team = box.get("teams", {}).get(side, {})
    pitchers = team.get("pitchers") or []
    return int(pitchers[0]) if pitchers else None


def batting_order(box: dict, side: str, top_k: int = TOP_OF_ORDER) -> list[int]:
    team = box.get("teams", {}).get(side, {})
    order = team.get("battingOrder") or []
    return [int(p) for p in order[:top_k]]


# ─── Feature aggregation ──────────────────────────────────────────────────────

PA_TERMINATING_EVENTS = {
    "single", "double", "triple", "home_run",
    "strikeout", "walk", "hit_by_pitch",
    "field_out", "force_out", "grounded_into_double_play",
    "fielders_choice", "fielders_choice_out", "double_play",
    "sac_fly", "sac_fly_double_play", "sac_bunt", "sac_bunt_double_play",
    "field_error", "fly_out", "ground_out", "line_out", "pop_out",
    "triple_play",
}


def _safe_float(v: float | None) -> float | None:
    if v is None or pd.isna(v):
        return None
    return float(v)


def aggregate_pitcher(window: pd.DataFrame, pitcher_id: int) -> dict:
    """Per-pitcher Statcast summary over a date-windowed slice."""
    p = window[window["pitcher"] == pitcher_id]
    if p.empty:
        return {}

    fb = p[p["pitch_type"].isin(["FF", "FT", "SI"])]
    fb_velo = _safe_float(fb["release_speed"].mean()) if not fb.empty else None
    fb_spin = _safe_float(fb["release_spin_rate"].mean()) if not fb.empty else None

    breaking = p[p["pitch_type"].isin(["SL", "CU", "ST", "KC", "SV"])]
    breaking_pct = (len(breaking) / len(p)) if len(p) > 0 else None

    stuff_plus = None
    if fb_velo is not None and fb_spin is not None:
        velo_z = (fb_velo - 93.5) / 1.6
        spin_z = (fb_spin - 2300) / 220
        stuff_plus = 100 + 8 * velo_z + 5 * spin_z

    events = p[p["events"].isin(PA_TERMINATING_EVENTS)]
    n_pa = len(events)
    k_rate = ((events["events"] == "strikeout").sum() / n_pa) if n_pa > 0 else None
    bb_rate = ((events["events"] == "walk").sum() / n_pa) if n_pa > 0 else None

    # Point-in-time first-inning NRFI rate.
    # post_bat_score - bat_score = runs scored on the pitch; aggregate per game.
    first_inning = p[p["inning"] == 1]
    nrfi_rate = None
    starts = 0
    if not first_inning.empty:
        # Select only the columns we operate on so this works on pandas 2.0/2.1
        # without needing the include_groups flag (added in pandas 2.2).
        per_game = (
            first_inning.groupby("game_pk")[["post_bat_score", "bat_score"]]
            .apply(lambda g: int((g["post_bat_score"] - g["bat_score"]).max() == 0))
        )
        starts = int(len(per_game))
        if starts > 0:
            nrfi_rate = float(per_game.mean())

    if nrfi_rate is not None:
        weight = starts / (starts + SHRINKAGE_K)
        shrunk = weight * nrfi_rate + (1 - weight) * LEAGUE_AVG_NRFI
        shrunk_nrfi = max(0.35, min(0.92, shrunk))
    else:
        shrunk_nrfi = None

    # HR/9: HRs allowed per 27 outs (~9 innings).  Outs ≈ PA - hits - walks - HBP - errors.
    hits = (events["events"].isin(["single", "double", "triple", "home_run"])).sum()
    bbs = (events["events"] == "walk").sum()
    hbps = (events["events"] == "hit_by_pitch").sum()
    errors = (events["events"] == "field_error").sum()
    outs = max(0, n_pa - hits - bbs - hbps - errors)
    hrs = (events["events"] == "home_run").sum()
    hr_per9 = (hrs * 27 / outs) if outs > 0 else None

    return {
        "fb_velo":      fb_velo,
        "fb_spin":      fb_spin,
        "breaking_pct": breaking_pct,
        "stuff_plus":   stuff_plus,
        "k_rate":       k_rate,
        "bb_rate":      bb_rate,
        "hr_per9":      hr_per9,
        "shrunk_nrfi":  shrunk_nrfi,
        "starts":       starts,
        "nrfi_rate":    nrfi_rate,
    }


def _compute_ops(events: pd.DataFrame) -> float | None:
    """Slash-line OPS over a PA-terminating-events slice.  Returns None if empty."""
    n_pa = len(events)
    if n_pa == 0:
        return None
    singles = (events["events"] == "single").sum()
    doubles = (events["events"] == "double").sum()
    triples = (events["events"] == "triple").sum()
    hrs = (events["events"] == "home_run").sum()
    walks = (events["events"] == "walk").sum()
    hbps = (events["events"] == "hit_by_pitch").sum()
    sfs = (events["events"].isin(["sac_fly", "sac_fly_double_play"])).sum()
    sbns = (events["events"].isin(["sac_bunt", "sac_bunt_double_play"])).sum()

    hits = singles + doubles + triples + hrs
    ab = n_pa - walks - hbps - sfs - sbns
    obp = (hits + walks + hbps) / max(1, n_pa - sbns)
    total_bases = singles + 2 * doubles + 3 * triples + 4 * hrs
    slg = total_bases / max(1, ab)
    return float(obp + slg)


def pitcher_throws(window: pd.DataFrame, pitcher_id: int) -> str | None:
    """Look up R/L/S from Statcast `p_throws` column for a given pitcher.

    Returns the most common value in their last 30 days of pitches, or None
    if the pitcher isn't in the window (e.g. injured / called up mid-season).
    """
    if "p_throws" not in window.columns:
        return None
    p = window[window["pitcher"] == pitcher_id]
    if p.empty:
        return None
    modes = p["p_throws"].mode()
    if modes.empty:
        return None
    val = modes.iloc[0]
    return str(val) if val in ("L", "R", "S") else None


# Minimum PAs vs the specific opposing hand before we trust the split ratio.
# Below this, fall back to the pooled OPS (multiplier = 1.0) to avoid tiny-
# sample noise.
_VS_HAND_MIN_PA = 20


def aggregate_top_four(
    window: pd.DataFrame,
    batter_ids: list[int],
    opposing_throws: str | None = None,
) -> dict:
    """Aggregate top-of-order offensive features (rolling window).

    When `opposing_throws` is "L" or "R", also computes a `vs_hand_multiplier`
    equal to top-4 OPS vs that hand divided by top-4 OPS overall.  Mirrors the
    intent of `getLineupVsHand` in lib/nrfi-models.ts.
    """
    if not batter_ids:
        return {}
    top = window[window["batter"].isin(batter_ids)]
    events = top[top["events"].isin(PA_TERMINATING_EVENTS)]
    n_pa = len(events)
    if n_pa == 0:
        return {}

    ops = _compute_ops(events) or 0.730
    k_pct = (events["events"] == "strikeout").sum() / n_pa
    bb_pct = (events["events"] == "walk").sum() / n_pa
    # Rough wRC+ proxy: 100 = league-average OPS (~.730).
    wrcplus = 100 + (ops - 0.730) * 100

    vs_hand_mult = 1.0
    if opposing_throws in ("L", "R") and "p_throws" in events.columns:
        vs_hand_events = events[events["p_throws"] == opposing_throws]
        if len(vs_hand_events) >= _VS_HAND_MIN_PA:
            vs_hand_ops = _compute_ops(vs_hand_events) or ops
            vs_hand_mult = float(vs_hand_ops / max(0.5, ops))

    return {
        "ops":                float(ops),
        "wrcplus":            float(wrcplus),
        "k_pct":              float(k_pct),
        "bb_pct":             float(bb_pct),
        "vs_hand_multiplier": vs_hand_mult,
    }


# ─── Game source ──────────────────────────────────────────────────────────────

def fetch_games(db_url: str, date_from: date, date_to: date) -> pd.DataFrame:
    sql = """
        SELECT gr."gamePk"           AS game_pk,
               gr.date                AS date_str,
               gr.season              AS season,
               gr."homeTeam"          AS home_team,
               gr."awayTeam"          AS away_team,
               (gr.nrfi)::int         AS nrfi,
               mp."ensembleNrfi"      AS ensemble_nrfi,
               mp."inputsPresence"    AS inputs_presence
        FROM game_results gr
        LEFT JOIN model_predictions mp
          ON CAST(mp.id AS BIGINT) = gr."gamePk"
        WHERE gr.date >= %s AND gr.date <= %s
        ORDER BY gr.date, gr."gamePk"
    """
    with psycopg.connect(db_url) as conn:
        df = pd.read_sql(sql, conn, params=(date_from.isoformat(), date_to.isoformat()))
    if df.empty:
        raise RuntimeError("No game_results rows in this window — run /api/historical-sync first")
    df["date"] = pd.to_datetime(df["date_str"]).dt.date
    return df


# ─── Row builder ──────────────────────────────────────────────────────────────

def _wind_in_out_scalar(wind_mph: float, wind_dir_deg: float, park_orientation_deg: float = 0.0) -> float:
    """
    Signed wind-aligned-with-CF projection in mph.  Positive = blowing out
    toward CF, negative = blowing in toward home.  When park_orientation is
    unknown (0.0), this collapses to cos(dir) — directionally meaningful for
    most parks since true north ≈ CF for the majority of stadiums.
    """
    import math as _math
    theta = _math.radians(float(wind_dir_deg) - float(park_orientation_deg))
    return float(wind_mph) * _math.cos(theta)


def make_row(meta: dict, p_home: dict, p_away: dict, b_home: dict, b_away: dict, wx: dict) -> dict:
    """Compose one CSV row.  Missing keys → defaults; presence is implicit in NaN handling."""
    def pf(d: dict, key: str, default):
        v = d.get(key)
        return v if v is not None else default

    park = lookup_park(meta["homeTeam"])
    wind_in_out = _wind_in_out_scalar(wx.get("wind_mph", 0.0), wx.get("wind_dir_deg", 0.0))

    row = {
        # Pitcher: home (top of 1st = away batting vs home pitcher in the engine,
        # but we keep the same naming as feature-vector.ts).
        "home_pitcher_shrunk_nrfi":     pf(p_home, "shrunk_nrfi", LEAGUE_AVG_NRFI),
        "home_pitcher_k_rate":          pf(p_home, "k_rate", DEFAULTS["k_rate"]),
        "home_pitcher_bb_rate":         pf(p_home, "bb_rate", DEFAULTS["bb_rate"]),
        "home_pitcher_hr_per9":         pf(p_home, "hr_per9", DEFAULTS["hr_per9"]),
        "home_pitcher_babip":           DEFAULTS["babip"],
        "home_pitcher_first_batter_obp": DEFAULTS["first_batter_obp"],
        "home_pitcher_start_count":     pf(p_home, "starts", 0),
        "home_pitcher_recent_form":     pf(p_home, "nrfi_rate", DEFAULTS["recent_form"]),
        "home_pitcher_fb_velo":         pf(p_home, "fb_velo", DEFAULTS["fb_velo"]),
        "home_pitcher_fb_spin":         pf(p_home, "fb_spin", DEFAULTS["fb_spin"]),
        "home_pitcher_breaking_pct":    pf(p_home, "breaking_pct", DEFAULTS["breaking_pct"]),
        "home_pitcher_stuff_plus":      pf(p_home, "stuff_plus", DEFAULTS["stuff_plus"]),
        "home_pitcher_pitches_last5":   DEFAULTS["pitches_last5"],
        "home_pitcher_days_rest":       DEFAULTS["days_rest"],
        "home_pitcher_rolling3_ip":     DEFAULTS["rolling3_ip"],
        "home_pitcher_vstop_woba":      DEFAULTS["vstop_woba"],
        "home_pitcher_vstop_k":         DEFAULTS["vstop_k"],
        "home_pitcher_is_bullpen":      0,
        # Pitcher: away
        "away_pitcher_shrunk_nrfi":     pf(p_away, "shrunk_nrfi", LEAGUE_AVG_NRFI),
        "away_pitcher_k_rate":          pf(p_away, "k_rate", DEFAULTS["k_rate"]),
        "away_pitcher_bb_rate":         pf(p_away, "bb_rate", DEFAULTS["bb_rate"]),
        "away_pitcher_hr_per9":         pf(p_away, "hr_per9", DEFAULTS["hr_per9"]),
        "away_pitcher_babip":           DEFAULTS["babip"],
        "away_pitcher_first_batter_obp": DEFAULTS["first_batter_obp"],
        "away_pitcher_start_count":     pf(p_away, "starts", 0),
        "away_pitcher_recent_form":     pf(p_away, "nrfi_rate", DEFAULTS["recent_form"]),
        "away_pitcher_fb_velo":         pf(p_away, "fb_velo", DEFAULTS["fb_velo"]),
        "away_pitcher_fb_spin":         pf(p_away, "fb_spin", DEFAULTS["fb_spin"]),
        "away_pitcher_breaking_pct":    pf(p_away, "breaking_pct", DEFAULTS["breaking_pct"]),
        "away_pitcher_stuff_plus":      pf(p_away, "stuff_plus", DEFAULTS["stuff_plus"]),
        "away_pitcher_pitches_last5":   DEFAULTS["pitches_last5"],
        "away_pitcher_days_rest":       DEFAULTS["days_rest"],
        "away_pitcher_rolling3_ip":     DEFAULTS["rolling3_ip"],
        "away_pitcher_vstop_woba":      DEFAULTS["vstop_woba"],
        "away_pitcher_vstop_k":         DEFAULTS["vstop_k"],
        "away_pitcher_is_bullpen":      0,
        # Top-of-order
        "home_top4_ops":     pf(b_home, "ops", DEFAULTS["top4_ops"]),
        "home_top4_wrcplus": pf(b_home, "wrcplus", DEFAULTS["top4_wrcplus"]),
        "home_top4_k_pct":   pf(b_home, "k_pct", DEFAULTS["top4_k_pct"]),
        "home_top4_bb_pct":  pf(b_home, "bb_pct", DEFAULTS["top4_bb_pct"]),
        "away_top4_ops":     pf(b_away, "ops", DEFAULTS["top4_ops"]),
        "away_top4_wrcplus": pf(b_away, "wrcplus", DEFAULTS["top4_wrcplus"]),
        "away_top4_k_pct":   pf(b_away, "k_pct", DEFAULTS["top4_k_pct"]),
        "away_top4_bb_pct":  pf(b_away, "bb_pct", DEFAULTS["top4_bb_pct"]),
        # Static / placeholder
        "home_offense_factor":     1.0,
        "away_offense_factor":     1.0,
        "home_offense_vs_hand":    pf(b_home, "vs_hand_multiplier", 1.0),
        "away_offense_vs_hand":    pf(b_away, "vs_hand_multiplier", 1.0),
        "weather_temp_f":          float(wx.get("temp_f", DEFAULTS["weather_temp_f"])),
        "weather_wind_mph":        float(wx.get("wind_mph", 0.0)),
        "weather_wind_in_out":     wind_in_out,
        "weather_humidity":        float(wx.get("humidity_pct", DEFAULTS["weather_humidity"])),
        # precip_prob isn't directly returned by Open-Meteo; use a binary
        # precip-occurred indicator from `precip_in > 0` as a stand-in.
        "weather_precip_prob":     1.0 if float(wx.get("precip_in", 0.0)) > 0.0 else 0.0,
        "weather_pressure_hpa":    float(wx.get("pressure_hpa", DEFAULTS["weather_pressure"])),
        "weather_air_density":     float(wx.get("air_density_kg_m3", DEFAULTS["weather_air_density"])),
        "is_dome":                 1 if park["roofType"] == "dome" else 0,
        "park_factor":             park["runFactor"],
        "park_first_inning_runs":  park["firstInningRunsFactor"],
        "park_hr_factor":          park["hrFactor"],
        "park_elevation_ft":       park["elevationFt"],
        "umpire_zone_tightness":   0,
        "umpire_career_nrfi":      LEAGUE_AVG_NRFI,
        "umpire_sample":           0,
        "home_rest_days":          DEFAULTS["days_rest"],
        "away_rest_days":          DEFAULTS["days_rest"],
        "home_travel_miles":       0,
        "away_travel_miles":       0,
        "is_bullpen_game":         0,
        "ensemble7_nrfi":          meta.get("ensemble7_nrfi") if meta.get("ensemble7_nrfi") is not None else LEAGUE_AVG_NRFI,
    }
    out = {k: meta[k] for k in META_COLS}
    out.update({k: row[k] for k in FEATURE_ORDER})
    return out


# ─── Main ─────────────────────────────────────────────────────────────────────

def load_existing_game_ids() -> set[int]:
    if not CSV_PATH.exists():
        return set()
    try:
        prev = pd.read_csv(CSV_PATH, usecols=["gameId"])
    except pd.errors.EmptyDataError:
        return set()
    except (pd.errors.ParserError, ValueError, KeyError) as err:
        raise RuntimeError(
            f"Failed to read resume checkpoint at {CSV_PATH}; "
            "delete or repair the file before rerunning."
        ) from err
    return set(int(x) for x in prev["gameId"].dropna().unique())


def write_chunk(rows: list[dict], header: bool) -> None:
    if not rows:
        return
    df = pd.DataFrame(rows, columns=META_COLS + FEATURE_ORDER)
    df.to_csv(CSV_PATH, mode="w" if header else "a", header=header, index=False)


def main() -> int:
    args = parse_args()

    # 1. Bulk Statcast pull — extend the start by ROLLING_WINDOW_DAYS so games on
    # the early edge of --from still get a full rolling-30 window of history.
    statcast_start = args.date_from - timedelta(days=ROLLING_WINDOW_DAYS)
    statcast_df = fetch_statcast(statcast_start, args.date_to, args.no_cache)
    statcast_df["game_date"] = pd.to_datetime(statcast_df["game_date"]).dt.date
    print(f"[builder] statcast rows: {len(statcast_df):,} (pulled from {statcast_start} to give a full rolling-30 window)")

    # 2. Games to score
    games = fetch_games(args.db_url, args.date_from, args.date_to)
    print(f"[builder] games found: {len(games)}")
    if args.max_games > 0:
        games = games.head(args.max_games)
        print(f"[builder] capped to {len(games)} for --max-games")

    # 2b. Prefetch weather for every home venue we'll touch.  One HTTP call per
    # venue covering the entire date range; cached to data/weather_cache.parquet.
    venues_used = {lookup_venue(t) for t in games["home_team"].unique() if lookup_venue(t)}
    prefetch_weather(venues_used, args.date_from, args.date_to)

    # 3. Resume checkpoint
    already = load_existing_game_ids()
    if already:
        print(f"[builder] resuming: {len(already):,} games already in {CSV_PATH.name}")
    write_header = (not CSV_PATH.exists()) or CSV_PATH.stat().st_size == 0

    # 4. Loop
    chunk: list[dict] = []
    processed = 0
    skipped = 0
    started = time.time()
    for i, game in enumerate(games.itertuples(index=False), start=1):
        if int(game.game_pk) in already:
            continue

        if i % 200 == 0:
            elapsed = time.time() - started
            rate = processed / elapsed if elapsed > 0 else 0
            remaining = len(games) - i
            eta_min = remaining / rate / 60 if rate > 0 else 0
            print(f"  [{i}/{len(games)}] processed={processed} skipped={skipped} ~{eta_min:.0f} min left")

        box = fetch_boxscore(int(game.game_pk))
        if not box:
            skipped += 1
            continue
        home_pid = starting_pitcher(box, "home")
        away_pid = starting_pitcher(box, "away")
        if home_pid is None or away_pid is None:
            skipped += 1
            continue

        cutoff = game.date - timedelta(days=ROLLING_WINDOW_DAYS)
        window = statcast_df[
            (statcast_df["game_date"] < game.date) &
            (statcast_df["game_date"] >= cutoff)
        ]

        p_home = aggregate_pitcher(window, home_pid)
        p_away = aggregate_pitcher(window, away_pid)
        # Home offense faces the away starter; away offense faces the home starter.
        away_throws = pitcher_throws(window, away_pid)
        home_throws = pitcher_throws(window, home_pid)
        b_home = aggregate_top_four(window, batting_order(box, "home"), away_throws)
        b_away = aggregate_top_four(window, batting_order(box, "away"), home_throws)

        venue = lookup_venue(game.home_team)
        park = lookup_park(game.home_team)
        wx = fetch_game_weather(venue, game.date, indoor=park["roofType"] == "dome")

        ip = game.inputs_presence if hasattr(game, "inputs_presence") else None
        if ip is None or (isinstance(ip, float) and pd.isna(ip)):
            ip = {}
        meta = {
            "gameId":          int(game.game_pk),
            "date":            game.date.isoformat(),
            "season":          int(game.season),
            "homeTeam":        game.home_team,
            "awayTeam":        game.away_team,
            "nrfi":            int(game.nrfi),
            "ensemble7_nrfi":  None if pd.isna(game.ensemble_nrfi) else float(game.ensemble_nrfi),
            "ensemble7_inputs_weather": 1 if ip.get("weather") else 0,
            "ensemble7_inputs_odds":    1 if ip.get("odds") else 0,
            "ensemble7_inputs_lineup":  1 if ip.get("lineup") else 0,
        }
        chunk.append(make_row(meta, p_home, p_away, b_home, b_away, wx))
        processed += 1

        # Flush every 200 rows so a crash resumes cleanly.
        if len(chunk) >= 200:
            write_chunk(chunk, write_header)
            chunk = []
            write_header = False

    if chunk:
        write_chunk(chunk, write_header)

    print(f"[builder] done — wrote {processed} new rows, skipped {skipped}.  CSV: {CSV_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
