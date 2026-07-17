"""
Build a real, point-in-time training set for DeepNRFI without a live shadow
window.  Reconstructs each game's feature vector from public data:

  - pybaseball Statcast pitch-by-pitch (season-to-date, strictly BEFORE each game date)
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
    import numpy as np
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
from park_factors import lookup_park, lookup_venue, lookup_cf_bearing, haversine_miles, venue_coords  # noqa: E402
from weather_archive import prefetch_weather, fetch_game_weather  # noqa: E402
from transforms import (  # noqa: E402
    LEAGUE_HALF_NRFI,
    TRAINING_FEATURE_CONTRACT_VERSION,
    invert_league_anchor,
    serving_shrunk_nrfi,
    wind_in_out_token,
)


# ─── Paths ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "scripts" / "deepnrfi" / "data"
BOXSCORE_DIR = DATA_DIR / "boxscores"
DATA_DIR.mkdir(parents=True, exist_ok=True)
BOXSCORE_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = DATA_DIR / "training.csv"


# ─── Constants ────────────────────────────────────────────────────────────────

LEAGUE_AVG_NRFI = 0.516            # game-level rate (umpire career_nrfi prior)
ROLLING_WINDOW_DAYS = 30           # bulk-pull margin before --from (legacy name)
TOP_OF_ORDER = 4
# Pitcher/batter aggregates are SEASON-TO-DATE (strictly before each game
# date) for serving parity: the live feature vector reads season first-inning
# splits and season Statcast pitch-mix aggregates, not a rolling 30-day
# window.  Recency features (pitches_last5, rolling3_ip, recent_form,
# is_bullpen) come from tails of the season per-game summary.
SEASON_START_MONTH_DAY = (3, 1)    # season slice lower bound: March 1

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
    "is_bullpen":         0,
    "offense_factor":     1.0,
}

# Minimum window games before a count-based pitcher feature is trusted; below
# the threshold the feature returns None so make_row's pf() imputes a DEFAULT.
_MIN_GAMES_PITCHES_LAST5 = 3
_MIN_GAMES_ROLLING3_IP = 2
_MIN_GAMES_IS_BULLPEN = 2
# Minimum first-inning PAs before vstop_woba / vstop_k are trusted (≈ 3
# starts).  With season-to-date slices this is reachable by mid-April; early
# rows impute the DEFAULT, matching serving where the split arrives late.
_MIN_VSTOP_PA = 12

# Cap team-level rest at 7 days so off-season -> opening day doesn't show
# 180-day rest values that would dominate any LightGBM split.  Anything
# longer than a week is effectively "fully rested" for our purposes.
_TEAM_REST_CAP_DAYS = 7

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


def _pitcher_window_games(p: pd.DataFrame) -> pd.DataFrame:
    """Per-game_pk summary for one pitcher's window slice, sorted by date.

    Columns: game_pk, game_date, min_inning, pitch_count, outs.  Built once and
    sliced by the count-based features (pitches_last5, rolling3_ip, days_rest,
    is_bullpen) so the per-game groupby happens only once.
    """
    cols = ["game_pk", "game_date", "min_inning", "pitch_count", "outs"]
    if p.empty:
        return pd.DataFrame(columns=cols)
    rows = []
    for game_pk, gp in p.groupby("game_pk"):
        ev = gp[gp["events"].isin(PA_TERMINATING_EVENTS)]
        n_pa = len(ev)
        hits = (ev["events"].isin(["single", "double", "triple", "home_run"])).sum()
        bbs = (ev["events"] == "walk").sum()
        hbps = (ev["events"] == "hit_by_pitch").sum()
        errors = (ev["events"] == "field_error").sum()
        rows.append({
            "game_pk":     game_pk,
            "game_date":   gp["game_date"].iloc[0],
            "min_inning":  int(gp["inning"].min()),
            "pitch_count": len(gp),
            "outs":        max(0, n_pa - hits - bbs - hbps - errors),
        })
    return pd.DataFrame(rows, columns=cols).sort_values("game_date").reset_index(drop=True)


def _pitcher_babip(hits: int, hrs: int, k: int, n_pa: int, bbs: int, hbps: int) -> float | None:
    """BABIP allowed: (H - HR) / balls-in-play, where BIP ≈ PA - BB - HBP - K - HR."""
    bip = n_pa - bbs - hbps - k - hrs
    if bip <= 0:
        return None
    return float((hits - hrs) / bip)


def _pitcher_first_batter_obp(p: pd.DataFrame) -> float | None:
    """OBP allowed to the leadoff hitter (inning 1, first PA), averaged over games.

    Filters to PA-terminating events BEFORE picking the min at_bat_number so the
    leadoff PA's outcome (not a mid-PA pitch with events=NaN) is what's scored.
    """
    if "at_bat_number" not in p.columns or "inning" not in p.columns:
        return None
    first_inn = p[(p["inning"] == 1) & (p["events"].isin(PA_TERMINATING_EVENTS))]
    if first_inn.empty:
        return None
    on_base = {"single", "double", "triple", "home_run", "walk", "hit_by_pitch"}
    skip = {"sac_fly", "sac_fly_double_play", "sac_bunt", "sac_bunt_double_play"}
    results = []
    for _, gp in first_inn.groupby("game_pk"):
        gp_valid = gp[gp["at_bat_number"].notna()]
        if gp_valid.empty:
            # All-null at_bat_number for this game — idxmin() would return NA
            # and .loc[] would raise.  No usable leadoff identifier; skip.
            continue
        ev = gp_valid.loc[gp_valid["at_bat_number"].idxmin(), "events"]
        if ev in skip:
            continue
        results.append(1 if ev in on_base else 0)
    if not results:
        return None
    return float(sum(results) / len(results))


def aggregate_pitcher(season: pd.DataFrame, pitcher_id: int, game_date: date) -> dict:
    """Per-pitcher Statcast summary over a point-in-time slice.

    `season` should be the SEASON-TO-DATE slice (all rows strictly before
    `game_date`, same season) for serving parity — the live feature vector
    reads season first-inning splits (sitCodes=i01) and season pitch-mix
    aggregates.  Recency features come from tails of the per-game summary.

    Serving-parity notes (see AUDIT_REPORT_V2.md §2.1):
      - k_rate/bb_rate/hr_per9/babip are FIRST-INNING-only aggregates (the
        live `firstInning.*` fields are the i01 split, not season-wide rates).
      - shrunk_nrfi replicates the live chain exactly: runs-per-1st →
        estimateNrfiRateFromFirstInningRuns → applyDynamicShrinkage toward
        LEAGUE_HALF_NRFI (transforms.serving_shrunk_nrfi).  The legacy builder
        shrank the raw scoreless fraction toward the game-level 0.516 with
        k = 1.14 — wrong prior scale and ~2.2× the serving feature's spread.
      - start_count is season-to-date first-inning starts (0–33 at serving;
        the legacy 30-day window capped it at ~6).
      - recent_form is the last-5-starts first-inning scoreless rate
        (serving: last5Results mean; needs ≥ 3 starts, else imputed).
    """
    p = season[season["pitcher"] == pitcher_id]
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

    # ── First-inning slice: rate features + per-game scoreless/runs ──────────
    first_inning = p[p["inning"] == 1]
    nrfi_rate = None            # raw empirical scoreless fraction (diagnostic)
    runs_per_first = None       # runs allowed per 1st inning (serving input)
    starts = 0
    last5_scoreless: list[int] = []
    if not first_inning.empty:
        # post_bat_score - bat_score = runs scored on that pitch.  Per game:
        # sum = runs allowed in the pitcher's 1st inning; max == 0 ⇔ scoreless.
        # Column subset keeps this working on pandas 2.0/2.1 (no include_groups).
        deltas = (first_inning["post_bat_score"] - first_inning["bat_score"]).clip(lower=0)
        per_game = pd.DataFrame({
            "game_date": first_inning["game_date"],
            "runs": deltas,
        }).groupby(first_inning["game_pk"]).agg(
            game_date=("game_date", "first"),
            runs=("runs", "sum"),
        ).sort_values("game_date")
        starts = int(len(per_game))
        if starts > 0:
            nrfi_rate = float((per_game["runs"] == 0).mean())
            runs_per_first = float(per_game["runs"].mean())
            last5 = per_game["runs"].tail(5)
            if len(last5) >= 3:
                last5_scoreless = [int(r == 0) for r in last5]

    recent_form = (
        float(sum(last5_scoreless) / len(last5_scoreless))
        if last5_scoreless else None
    )

    # First-inning splits ("vs top of order" by construction — inning 1 always
    # faces the top of the order).
    fi_events = first_inning[first_inning["events"].isin(PA_TERMINATING_EVENTS)]
    vstop_woba = None
    vstop_k = None
    if len(fi_events) >= _MIN_VSTOP_PA:
        vstop_k = float((fi_events["events"] == "strikeout").sum() / len(fi_events))
        vstop_woba = _compute_woba(fi_events)

    # ── First-inning rate stats (serving: the sitCodes=i01 season split) ─────
    n_fi_pa = len(fi_events)
    k_rate = ((fi_events["events"] == "strikeout").sum() / n_fi_pa) if n_fi_pa > 0 else None
    bb_rate = ((fi_events["events"] == "walk").sum() / n_fi_pa) if n_fi_pa > 0 else None

    hits = (fi_events["events"].isin(["single", "double", "triple", "home_run"])).sum()
    bbs = (fi_events["events"] == "walk").sum()
    hbps = (fi_events["events"] == "hit_by_pitch").sum()
    errors = (fi_events["events"] == "field_error").sum()
    ks = (fi_events["events"] == "strikeout").sum()
    outs = max(0, n_fi_pa - hits - bbs - hbps - errors)
    hrs = (fi_events["events"] == "home_run").sum()
    hr_per9 = (hrs * 27 / outs) if outs > 0 else None

    babip = _pitcher_babip(int(hits), int(hrs), int(ks), n_fi_pa, int(bbs), int(hbps))
    first_batter_obp = _pitcher_first_batter_obp(p)

    # ── Recency features off the per-game summary (all appearances) ──────────
    g = _pitcher_window_games(p)
    if not g.empty:
        days_rest = (game_date - g["game_date"].max()).days
    else:
        days_rest = None
    pitches_last5 = (
        int(g["pitch_count"].tail(5).sum())
        if len(g) >= _MIN_GAMES_PITCHES_LAST5 else None
    )
    rolling3_ip = (
        float(g["outs"].tail(3).sum()) / 3
        if len(g) >= _MIN_GAMES_ROLLING3_IP else None
    )
    if len(g) >= _MIN_GAMES_IS_BULLPEN:
        # Role detection from the LAST 10 appearances so a mid-season role
        # change (starter → bullpen or opener) is reflected, mirroring the
        # per-game isBullpenGame flag at serving.  "Enters after inning 1" OR
        # "low pitch count" — the pitch-count clause catches true openers.
        recent = g.tail(10)
        is_bullpen = 1 if (recent["min_inning"].median() > 1 or recent["pitch_count"].median() < 40) else 0
    else:
        is_bullpen = None

    # ── Serving-parity shrunk NRFI rate (transforms.py) ──────────────────────
    shrunk_nrfi = serving_shrunk_nrfi(
        runs_per_first, starts, is_bullpen=bool(is_bullpen),
    )

    return {
        "fb_velo":          fb_velo,
        "fb_spin":          fb_spin,
        "breaking_pct":     breaking_pct,
        "stuff_plus":       stuff_plus,
        "k_rate":           k_rate,
        "bb_rate":          bb_rate,
        "hr_per9":          hr_per9,
        "babip":            babip,
        "first_batter_obp": first_batter_obp,
        "pitches_last5":    pitches_last5,
        "days_rest":        days_rest,
        "rolling3_ip":      rolling3_ip,
        "is_bullpen":       is_bullpen,
        "shrunk_nrfi":      shrunk_nrfi,
        "starts":           starts,
        "nrfi_rate":        nrfi_rate,
        "runs_per_first":   runs_per_first,
        "recent_form":      recent_form,
        "vstop_woba":       vstop_woba,
        "vstop_k":          vstop_k,
    }


def _compute_woba(events: pd.DataFrame) -> float | None:
    """wOBA over a PA-terminating-events slice using 2024 MLB linear weights
    (matches `WOBA_WEIGHTS` in lib/config.ts).  Returns None if empty."""
    n_pa = len(events)
    if n_pa == 0:
        return None
    bb     = (events["events"] == "walk").sum()
    hbp    = (events["events"] == "hit_by_pitch").sum()
    s      = (events["events"] == "single").sum()
    d      = (events["events"] == "double").sum()
    t      = (events["events"] == "triple").sum()
    hr     = (events["events"] == "home_run").sum()
    sf     = (events["events"].isin(["sac_fly", "sac_fly_double_play"])).sum()
    sb     = (events["events"].isin(["sac_bunt", "sac_bunt_double_play"])).sum()
    ab     = n_pa - bb - hbp - sf - sb
    denom  = ab + bb + hbp + sf
    if denom <= 0:
        return None
    numerator = (0.692 * bb + 0.722 * hbp + 0.882 * s + 1.254 * d
                 + 1.590 * t + 2.050 * hr)
    return float(numerator / denom)


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

    Returns the most common value in the supplied point-in-time slice, or None
    if the pitcher isn't in it (e.g. injured / called up mid-season).
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
    """Aggregate top-of-order offensive features (season-to-date slice).

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

    # Offense factor — mirrors estimateOffenseFactor in lib/api/shared-helpers.ts.
    offense_factor = min(1.35, max(0.65, ops / 0.720))

    return {
        "ops":                float(ops),
        "wrcplus":            float(wrcplus),
        "k_pct":              float(k_pct),
        "bb_pct":             float(bb_pct),
        "vs_hand_multiplier": vs_hand_mult,
        "offense_factor":     float(offense_factor),
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


_UMPIRE_SHRINK_K = 20  # mirrors scripts/data/refresh_umpires.ts


def build_umpire_map(db_url: str) -> dict[int, dict[str, float]]:
    """Point-in-time home-plate-umpire features per gamePk.

    Walks ALL game_results in date order (full table, not just the build
    window, so prior-season history carries forward) and computes each game's
    features from the umpire's strictly-PRIOR games only — no lookahead, safe
    for walk-forward validation.  Mirrors scripts/data/refresh_umpires.ts:
      career_nrfi:    EB-shrunk toward 0.516 (k=20)
      zone_tightness: clamp(−z/2, −1, 1), z = shrunk z-score of the umpire's
                      prior mean K/game vs the running league game-K
                      distribution (game-level std, so magnitudes are smaller
                      than the TS profiles — scale-irrelevant for LightGBM).
    Boxscores come from the local cache (network fallback for misses).
    """
    sql = """
        SELECT "gamePk" AS game_pk, date AS date_str, (nrfi)::int AS nrfi
        FROM game_results ORDER BY date, "gamePk"
    """
    with psycopg.connect(db_url) as conn:
        games = pd.read_sql(sql, conn)
    print(f"[builder] umpire map: walking {len(games):,} game_results rows")

    umps: dict[int, dict[str, float]] = {}        # ump_id → running state
    league = {"kSum": 0.0, "kSq": 0.0, "kN": 0}   # running game-K distribution
    out: dict[int, dict[str, float]] = {}

    for g in games.itertuples(index=False):
        box = fetch_boxscore(int(g.game_pk))
        if not box:
            continue
        hp = next((o for o in box.get("officials", [])
                   if o.get("officialType") == "Home Plate"), None)
        ump_id = (hp or {}).get("official", {}).get("id")
        home_k = box.get("teams", {}).get("home", {}).get("teamStats", {}).get("pitching", {}).get("strikeOuts")
        away_k = box.get("teams", {}).get("away", {}).get("teamStats", {}).get("pitching", {}).get("strikeOuts")
        game_k = home_k + away_k if isinstance(home_k, (int, float)) and isinstance(away_k, (int, float)) else None
        if ump_id is None:
            continue

        u = umps.setdefault(int(ump_id), {"n": 0, "nrfi": 0, "kSum": 0.0, "kN": 0})

        # Features from PRIOR state only
        career_nrfi = (u["nrfi"] + _UMPIRE_SHRINK_K * LEAGUE_AVG_NRFI) / (u["n"] + _UMPIRE_SHRINK_K)
        if league["kN"] > 1:
            league_k = league["kSum"] / league["kN"]
            var = league["kSq"] / league["kN"] - league_k ** 2
            k_std = var ** 0.5 if var > 0 else 1.0
        else:
            league_k, k_std = 16.0, 1.0
        ump_mean_k = u["kSum"] / u["kN"] if u["kN"] > 0 else league_k
        z = ((ump_mean_k - league_k) / k_std) * (u["kN"] / (u["kN"] + _UMPIRE_SHRINK_K))
        out[int(g.game_pk)] = {
            "zone_tightness": max(-1.0, min(1.0, -z / 2)),  # fewer K ⇒ tighter ⇒ +
            "career_nrfi":    career_nrfi,
            "sample":         float(u["n"]),
        }

        # Update state with the current game
        u["n"] += 1
        u["nrfi"] += int(g.nrfi)
        if game_k is not None:
            u["kSum"] += float(game_k)
            u["kN"] += 1
            league["kSum"] += float(game_k)
            league["kSq"] += float(game_k) ** 2
            league["kN"] += 1

    print(f"[builder] umpire map: {len(out):,} games, {len(umps)} umpires")
    return out


# ─── Row builder ──────────────────────────────────────────────────────────────

# wind_in_out encoding comes from transforms.wind_in_out_token — the exact
# port of the live mapWindDirection token (±1/0), replacing the legacy
# mph-scaled cosine (wrong scale, no park orientation, inverted sign; see
# AUDIT_REPORT_V2.md §2.1-W).


def compute_travel_rest_map(games: pd.DataFrame) -> dict[int, dict[str, float]]:
    """Walk every game in date order and compute (home, away) rest_days +
    travel_miles per game.  Returns {game_pk: {home_rest_days, away_rest_days,
    home_travel_miles, away_travel_miles}}.

    Travel = great-circle from the team's last venue to today's venue.  For the
    home team this is usually 0 (home stand) but is non-zero when they just
    returned from a road trip.  For the away team it's the distance from their
    previous game's stadium to the current host's stadium.

    Rest = days since the team's last game in the dataset.  First appearances
    fall back to DEFAULTS["days_rest"]; the value is capped at
    _TEAM_REST_CAP_DAYS so off-season -> opening day doesn't dominate splits.

    Built once upfront so the per-game loop's resume logic (skip-if-already-in-CSV)
    can't corrupt the tracker by skipping games mid-walk.
    """
    out: dict[int, dict[str, float]] = {}
    # (last_date, last_venue_coords) per team; None coords if venue unmapped.
    last: dict[str, tuple[date, tuple[float, float] | None]] = {}

    for g in games.itertuples(index=False):
        today_coords = venue_coords(g.home_team)
        home_prev = last.get(g.home_team)
        away_prev = last.get(g.away_team)

        if home_prev is None:
            home_rest = float(DEFAULTS["days_rest"])
        else:
            home_rest = min(float((g.date - home_prev[0]).days), float(_TEAM_REST_CAP_DAYS))

        if away_prev is None:
            away_rest = float(DEFAULTS["days_rest"])
        else:
            away_rest = min(float((g.date - away_prev[0]).days), float(_TEAM_REST_CAP_DAYS))

        if home_prev is None or home_prev[1] is None or today_coords is None:
            home_travel = 0.0
        else:
            home_travel = haversine_miles(
                home_prev[1][0], home_prev[1][1], today_coords[0], today_coords[1]
            )

        if away_prev is None or away_prev[1] is None or today_coords is None:
            away_travel = 0.0
        else:
            away_travel = haversine_miles(
                away_prev[1][0], away_prev[1][1], today_coords[0], today_coords[1]
            )

        out[int(g.game_pk)] = {
            "home_rest_days":    home_rest,
            "away_rest_days":    away_rest,
            "home_travel_miles": home_travel,
            "away_travel_miles": away_travel,
        }
        last[g.home_team] = (g.date, today_coords)
        last[g.away_team] = (g.date, today_coords)

    return out


def make_row(meta: dict, p_home: dict, p_away: dict, b_home: dict, b_away: dict, wx: dict, tr: dict | None = None, ump: dict | None = None) -> dict:
    """Compose one CSV row.  Missing keys → defaults; presence is implicit in NaN handling."""
    def pf(d: dict, key: str, default):
        v = d.get(key)
        return v if v is not None else default

    park = lookup_park(meta["homeTeam"])
    wind_in_out = wind_in_out_token(
        wx.get("wind_mph", 0.0),
        wx.get("wind_dir_deg", 0.0),
        lookup_cf_bearing(lookup_venue(meta["homeTeam"])),
    )

    row = {
        # Pitcher: home (top of 1st = away batting vs home pitcher in the engine,
        # but we keep the same naming as feature-vector.ts).
        "home_pitcher_shrunk_nrfi":     pf(p_home, "shrunk_nrfi", LEAGUE_HALF_NRFI),
        "home_pitcher_k_rate":          pf(p_home, "k_rate", DEFAULTS["k_rate"]),
        "home_pitcher_bb_rate":         pf(p_home, "bb_rate", DEFAULTS["bb_rate"]),
        "home_pitcher_hr_per9":         pf(p_home, "hr_per9", DEFAULTS["hr_per9"]),
        "home_pitcher_babip":           pf(p_home, "babip", DEFAULTS["babip"]),
        "home_pitcher_first_batter_obp": pf(p_home, "first_batter_obp", DEFAULTS["first_batter_obp"]),
        "home_pitcher_start_count":     pf(p_home, "starts", 0),
        "home_pitcher_recent_form":     pf(p_home, "recent_form", DEFAULTS["recent_form"]),
        "home_pitcher_fb_velo":         pf(p_home, "fb_velo", DEFAULTS["fb_velo"]),
        "home_pitcher_fb_spin":         pf(p_home, "fb_spin", DEFAULTS["fb_spin"]),
        "home_pitcher_breaking_pct":    pf(p_home, "breaking_pct", DEFAULTS["breaking_pct"]),
        "home_pitcher_stuff_plus":      pf(p_home, "stuff_plus", DEFAULTS["stuff_plus"]),
        "home_pitcher_pitches_last5":   pf(p_home, "pitches_last5", DEFAULTS["pitches_last5"]),
        "home_pitcher_days_rest":       pf(p_home, "days_rest", DEFAULTS["days_rest"]),
        "home_pitcher_rolling3_ip":     pf(p_home, "rolling3_ip", DEFAULTS["rolling3_ip"]),
        "home_pitcher_vstop_woba":      pf(p_home, "vstop_woba", DEFAULTS["vstop_woba"]),
        "home_pitcher_vstop_k":         pf(p_home, "vstop_k", DEFAULTS["vstop_k"]),
        "home_pitcher_is_bullpen":      pf(p_home, "is_bullpen", DEFAULTS["is_bullpen"]),
        # Pitcher: away
        "away_pitcher_shrunk_nrfi":     pf(p_away, "shrunk_nrfi", LEAGUE_HALF_NRFI),
        "away_pitcher_k_rate":          pf(p_away, "k_rate", DEFAULTS["k_rate"]),
        "away_pitcher_bb_rate":         pf(p_away, "bb_rate", DEFAULTS["bb_rate"]),
        "away_pitcher_hr_per9":         pf(p_away, "hr_per9", DEFAULTS["hr_per9"]),
        "away_pitcher_babip":           pf(p_away, "babip", DEFAULTS["babip"]),
        "away_pitcher_first_batter_obp": pf(p_away, "first_batter_obp", DEFAULTS["first_batter_obp"]),
        "away_pitcher_start_count":     pf(p_away, "starts", 0),
        "away_pitcher_recent_form":     pf(p_away, "recent_form", DEFAULTS["recent_form"]),
        "away_pitcher_fb_velo":         pf(p_away, "fb_velo", DEFAULTS["fb_velo"]),
        "away_pitcher_fb_spin":         pf(p_away, "fb_spin", DEFAULTS["fb_spin"]),
        "away_pitcher_breaking_pct":    pf(p_away, "breaking_pct", DEFAULTS["breaking_pct"]),
        "away_pitcher_stuff_plus":      pf(p_away, "stuff_plus", DEFAULTS["stuff_plus"]),
        "away_pitcher_pitches_last5":   pf(p_away, "pitches_last5", DEFAULTS["pitches_last5"]),
        "away_pitcher_days_rest":       pf(p_away, "days_rest", DEFAULTS["days_rest"]),
        "away_pitcher_rolling3_ip":     pf(p_away, "rolling3_ip", DEFAULTS["rolling3_ip"]),
        "away_pitcher_vstop_woba":      pf(p_away, "vstop_woba", DEFAULTS["vstop_woba"]),
        "away_pitcher_vstop_k":         pf(p_away, "vstop_k", DEFAULTS["vstop_k"]),
        "away_pitcher_is_bullpen":      pf(p_away, "is_bullpen", DEFAULTS["is_bullpen"]),
        # Top-of-order
        "home_top4_ops":     pf(b_home, "ops", DEFAULTS["top4_ops"]),
        "home_top4_wrcplus": pf(b_home, "wrcplus", DEFAULTS["top4_wrcplus"]),
        "home_top4_k_pct":   pf(b_home, "k_pct", DEFAULTS["top4_k_pct"]),
        "home_top4_bb_pct":  pf(b_home, "bb_pct", DEFAULTS["top4_bb_pct"]),
        "away_top4_ops":     pf(b_away, "ops", DEFAULTS["top4_ops"]),
        "away_top4_wrcplus": pf(b_away, "wrcplus", DEFAULTS["top4_wrcplus"]),
        "away_top4_k_pct":   pf(b_away, "k_pct", DEFAULTS["top4_k_pct"]),
        "away_top4_bb_pct":  pf(b_away, "bb_pct", DEFAULTS["top4_bb_pct"]),
        "home_offense_factor":     pf(b_home, "offense_factor", DEFAULTS["offense_factor"]),
        "away_offense_factor":     pf(b_away, "offense_factor", DEFAULTS["offense_factor"]),
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
        "umpire_zone_tightness":   float((ump or {}).get("zone_tightness", 0.0)),
        "umpire_career_nrfi":      float((ump or {}).get("career_nrfi", LEAGUE_AVG_NRFI)),
        "umpire_sample":           float((ump or {}).get("sample", 0.0)),
        "home_rest_days":          float((tr or {}).get("home_rest_days", DEFAULTS["days_rest"])),
        "away_rest_days":          float((tr or {}).get("away_rest_days", DEFAULTS["days_rest"])),
        "home_travel_miles":       float((tr or {}).get("home_travel_miles", 0.0)),
        "away_travel_miles":       float((tr or {}).get("away_travel_miles", 0.0)),
        # A None is_bullpen (insufficient window data) is falsy → treated as starter.
        "is_bullpen_game":         1 if (p_home.get("is_bullpen") or p_away.get("is_bullpen")) else 0,
        # Serving feeds the stacker the PRE-anchor calibrated7; the DB stores
        # the FINAL post-anchor headline probability.  Invert the anchor blend
        # so the training column sits on the serving scale (exact while the
        # calibration knots are identity — see transforms.invert_league_anchor).
        "ensemble7_nrfi":          invert_league_anchor(meta["ensemble7_nrfi"]) if meta.get("ensemble7_nrfi") is not None else LEAGUE_AVG_NRFI,
    }
    out = {k: meta[k] for k in META_COLS}
    out.update({k: row[k] for k in FEATURE_ORDER})
    return out


# ─── Main ─────────────────────────────────────────────────────────────────────

CONTRACT_PATH = DATA_DIR / "training_contract.json"


def check_training_contract(csv_path: Path = CSV_PATH,
                            contract_path: Path = CONTRACT_PATH) -> None:
    """Refuse to resume into a CSV built under a different feature contract.

    The resume logic skips rows purely by gameId, so appending rows whose
    columns mean something different (e.g. legacy 30-day-window scale vs the
    current serving-parity scale) would silently mix incompatible feature
    distributions.  A sidecar marker records which contract version built the
    CSV; mismatch (or a pre-marker legacy CSV) aborts with instructions.
    Stamps the marker when starting fresh.
    """
    csv_live = csv_path.exists() and csv_path.stat().st_size > 0
    if csv_live:
        stamped = None
        if contract_path.exists():
            try:
                stamped = json.loads(contract_path.read_text()).get("featureContractVersion")
            except (json.JSONDecodeError, OSError):
                stamped = None
        if stamped != TRAINING_FEATURE_CONTRACT_VERSION:
            raise SystemExit(
                f"{csv_path.name} was built under feature-contract "
                f"{'v' + str(stamped) if stamped is not None else 'an unknown/legacy version'}; "
                f"this builder emits v{TRAINING_FEATURE_CONTRACT_VERSION}. "
                f"Resuming would mix incompatible feature scales — delete or archive "
                f"{csv_path} (and {contract_path.name}) and rebuild from scratch."
            )
        return
    contract_path.write_text(json.dumps(
        {"featureContractVersion": TRAINING_FEATURE_CONTRACT_VERSION}, indent=2,
    ))


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

    # 1. Bulk Statcast pull — extend the start back to the season opening (March 1
    # of --from's year) so every game gets a full SEASON-TO-DATE slice, matching
    # the serving path's season splits.  (The old 30-day margin only supported a
    # rolling window; keep it as a floor for mid-season --from values.)
    season_floor = date(args.date_from.year, *SEASON_START_MONTH_DAY)
    statcast_start = min(args.date_from - timedelta(days=ROLLING_WINDOW_DAYS), season_floor)
    statcast_df = fetch_statcast(statcast_start, args.date_to, args.no_cache)
    statcast_df["game_date"] = pd.to_datetime(statcast_df["game_date"]).dt.date
    # Exclude spring training / exhibitions — they pollute early-season windows
    # with non-competitive pitch data the serving splits never see.
    if "game_type" in statcast_df.columns:
        before = len(statcast_df)
        statcast_df = statcast_df[statcast_df["game_type"].isin(["R", "F", "D", "L", "W"])]
        if len(statcast_df) < before:
            print(f"[builder] dropped {before - len(statcast_df):,} spring/exhibition pitches")
    statcast_df = statcast_df.reset_index(drop=True)
    print(f"[builder] statcast rows: {len(statcast_df):,} (pulled from {statcast_start} for full season-to-date slices)")

    # Index once by pitcher / batter so the per-game loop slices O(player rows)
    # instead of masking the full frame per game (~5k games × 1.4M rows).
    pitcher_idx = statcast_df.groupby("pitcher").indices
    batter_idx = statcast_df.groupby("batter").indices

    def season_slice_for(idx_map: dict, keys: list[int], game_date: date) -> pd.DataFrame:
        rows: list = []
        for k in keys:
            r = idx_map.get(k)
            if r is not None:
                rows.append(r)
        if not rows:
            return statcast_df.iloc[0:0]
        sub = statcast_df.iloc[np.concatenate(rows)]
        season_start = date(game_date.year, *SEASON_START_MONTH_DAY)
        return sub[(sub["game_date"] < game_date) & (sub["game_date"] >= season_start)]

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

    # 2c. Precompute per-game travel + rest from the full date-sorted slate.
    # Built upfront so the resume-skip logic in the loop can't corrupt the
    # per-team last-game tracker by mid-walk skips.
    travel_rest = compute_travel_rest_map(games)

    # 2d. Point-in-time umpire features over the FULL game_results history
    # (boxscores are cache-hot from prior runs, so this is fast and local).
    umpire_map = build_umpire_map(args.db_url)

    # 3. Resume checkpoint — guarded by the feature-contract version so a
    # legacy-scale CSV can never be silently extended with new-scale rows.
    check_training_contract()
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

        home_slice = season_slice_for(pitcher_idx, [home_pid], game.date)
        away_slice = season_slice_for(pitcher_idx, [away_pid], game.date)

        p_home = aggregate_pitcher(home_slice, home_pid, game.date)
        p_away = aggregate_pitcher(away_slice, away_pid, game.date)
        # Home offense faces the away starter; away offense faces the home starter.
        away_throws = pitcher_throws(away_slice, away_pid)
        home_throws = pitcher_throws(home_slice, home_pid)
        home_order = batting_order(box, "home")
        away_order = batting_order(box, "away")
        b_home = aggregate_top_four(season_slice_for(batter_idx, home_order, game.date), home_order, away_throws)
        b_away = aggregate_top_four(season_slice_for(batter_idx, away_order, game.date), away_order, home_throws)

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
        tr = travel_rest.get(int(game.game_pk))
        chunk.append(make_row(meta, p_home, p_away, b_home, b_away, wx, tr, umpire_map.get(int(game.game_pk))))
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
