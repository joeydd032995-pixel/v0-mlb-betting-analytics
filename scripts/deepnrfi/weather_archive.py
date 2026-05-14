"""
Historical weather adapter for the DeepNRFI builder.

Backed by **Open-Meteo Archive API** — free, no auth, no rate limit at our
volume.  We make one HTTPS call per venue per request, asking for the entire
training date range at once, and store the results in a single on-disk parquet
file keyed by (venue, date).

For dome games (roofType == "dome") we skip the API entirely and return a
neutral indoor-weather dict matching the live path's `Weather` shape.

Air density mirrors `lib/features/air-density.ts:computeAirDensity` exactly so
train vs. live feature distributions match.

Public API:
    prefetch_weather(venues, date_from, date_to) -> None
    fetch_game_weather(venue, date, park) -> dict
"""

from __future__ import annotations

import json
import math
import sys
import time
from datetime import date
from pathlib import Path
from typing import Iterable

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from park_factors import PARK_FACTORS, NEUTRAL_PARK  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_PATH = DATA_DIR / "weather_cache.parquet"

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# We sample at hour 19 local — covers typical first-pitch (7pm).  This is
# approximate because daytime / west-coast games start earlier, but the
# game-to-game variance from temperature drifts over 6 hours is small compared
# to feature-engineering signal.
GAME_HOUR_LOCAL = 19

# Mapping from Open-Meteo hourly variables to our column names.
_HOURLY_VARS = ",".join([
    "temperature_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "relative_humidity_2m",
    "pressure_msl",
    "precipitation",
])

_DOME_WEATHER = {
    "temp_f": 72.0,
    "wind_mph": 0.0,
    "wind_dir_deg": 0.0,
    "humidity_pct": 50.0,
    "pressure_hpa": 1013.25,
    "precip_in": 0.0,
    "air_density_kg_m3": 1.18,
    "source": "dome",
}

_NEUTRAL_WEATHER = {
    "temp_f": 72.0,
    "wind_mph": 0.0,
    "wind_dir_deg": 0.0,
    "humidity_pct": 50.0,
    "pressure_hpa": 1013.25,
    "precip_in": 0.0,
    "air_density_kg_m3": 1.18,
    "source": "neutral",
}

# ─── Air density (Python port of lib/features/air-density.ts) ─────────────────

_R_DRY = 287.058   # J/(kg·K)
_R_VAPOR = 461.495 # J/(kg·K)


def _saturation_vapor_pressure_hpa(temp_c: float) -> float:
    return 6.1078 * math.exp((17.27 * temp_c) / (temp_c + 237.3))


def _pressure_at_elevation_hpa(elevation_ft: float) -> float:
    elev_m = elevation_ft * 0.3048
    return 1013.25 * (1 - 2.25577e-5 * elev_m) ** 5.25588


def compute_air_density(
    temp_f: float,
    humidity_pct: float,
    elevation_ft: float,
    pressure_hpa: float | None = None,
) -> float:
    """Moist-air density in kg/m³.  Sea-level standard ≈ 1.225, Coors ≈ 1.00."""
    temp_c = (temp_f - 32) * (5 / 9)
    temp_k = temp_c + 273.15
    total_p = (pressure_hpa if pressure_hpa is not None else _pressure_at_elevation_hpa(elevation_ft)) * 100
    psat = _saturation_vapor_pressure_hpa(temp_c) * 100
    rh = max(0.0, min(100.0, humidity_pct)) / 100.0
    p_vapor = rh * psat
    p_dry = total_p - p_vapor
    return p_dry / (_R_DRY * temp_k) + p_vapor / (_R_VAPOR * temp_k)


# ─── Cache I/O ────────────────────────────────────────────────────────────────

def _load_cache() -> pd.DataFrame:
    if CACHE_PATH.exists():
        return pd.read_parquet(CACHE_PATH)
    return pd.DataFrame(columns=["venue", "date", "temp_f", "wind_mph", "wind_dir_deg",
                                 "humidity_pct", "pressure_hpa", "precip_in", "air_density_kg_m3"])


def _save_cache(df: pd.DataFrame) -> None:
    df = df.drop_duplicates(subset=["venue", "date"], keep="last")
    df.to_parquet(CACHE_PATH, index=False)


# ─── Open-Meteo fetch ─────────────────────────────────────────────────────────

def _fetch_venue_range(venue: str, lat: float, lon: float, date_from: date, date_to: date) -> pd.DataFrame:
    """One Open-Meteo call covering the full date range for a venue."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": date_from.isoformat(),
        "end_date":   date_to.isoformat(),
        "hourly":     _HOURLY_VARS,
        "timezone":   "auto",
        "wind_speed_unit": "mph",
        "temperature_unit": "fahrenheit",
        "precipitation_unit": "inch",
    }
    for attempt in range(1, 5):
        try:
            r = requests.get(ARCHIVE_URL, params=params, timeout=120)
            if r.status_code == 200:
                payload = r.json()
                return _parse_hourly_payload(venue, payload)
            if r.status_code in (429, 500, 502, 503, 504):
                wait = 2 ** attempt
                print(f"[weather] {venue} HTTP {r.status_code}, retry {attempt}/4 in {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            # Hard failure — log and move on.
            print(f"[weather] {venue} HTTP {r.status_code}; skipping ({r.text[:200]})", file=sys.stderr)
            return pd.DataFrame()
        except (requests.RequestException, ValueError, json.JSONDecodeError) as e:
            wait = 2 ** attempt
            print(f"[weather] {venue} error {e}, retry {attempt}/4 in {wait}s", file=sys.stderr)
            time.sleep(wait)
    print(f"[weather] {venue} gave up after 4 attempts", file=sys.stderr)
    return pd.DataFrame()


def _parse_hourly_payload(venue: str, payload: dict) -> pd.DataFrame:
    hourly = payload.get("hourly")
    if not hourly:
        return pd.DataFrame()
    times = pd.to_datetime(hourly.get("time", []))
    if len(times) == 0:
        return pd.DataFrame()

    df = pd.DataFrame({
        "time_local": times,
        "temp_f":            hourly.get("temperature_2m", []),
        "wind_mph":          hourly.get("wind_speed_10m", []),
        "wind_dir_deg":      hourly.get("wind_direction_10m", []),
        "humidity_pct":      hourly.get("relative_humidity_2m", []),
        "pressure_hpa":      hourly.get("pressure_msl", []),
        "precip_in":         hourly.get("precipitation", []),
    })
    # Pick the row closest to GAME_HOUR_LOCAL for each calendar date.
    df["date"] = df["time_local"].dt.date
    df["hour"] = df["time_local"].dt.hour
    df["abs_offset"] = (df["hour"] - GAME_HOUR_LOCAL).abs()
    df = df.sort_values(["date", "abs_offset"]).drop_duplicates(subset=["date"], keep="first")
    df = df.drop(columns=["time_local", "hour", "abs_offset"])
    df["venue"] = venue

    # Air density requires venue elevation; resolve from PARK_FACTORS.
    elev = PARK_FACTORS.get(venue, NEUTRAL_PARK)["elevationFt"]
    df["air_density_kg_m3"] = df.apply(
        lambda r: compute_air_density(
            float(r["temp_f"]) if pd.notna(r["temp_f"]) else 72.0,
            float(r["humidity_pct"]) if pd.notna(r["humidity_pct"]) else 50.0,
            float(elev),
            float(r["pressure_hpa"]) if pd.notna(r["pressure_hpa"]) else None,
        ),
        axis=1,
    )
    return df[["venue", "date", "temp_f", "wind_mph", "wind_dir_deg",
               "humidity_pct", "pressure_hpa", "precip_in", "air_density_kg_m3"]]


# ─── Public API ───────────────────────────────────────────────────────────────

def prefetch_weather(venues: Iterable[str], date_from: date, date_to: date) -> None:
    """
    Make one HTTPS call per venue covering the full date range, merge into the
    on-disk parquet cache.  Idempotent — already-cached (venue, date) rows are
    kept.  Domes are skipped entirely (they get neutral weather at lookup time).
    """
    cache = _load_cache()
    cached_venues = set(cache["venue"].unique()) if not cache.empty else set()

    pending = []
    for v in venues:
        park = PARK_FACTORS.get(v)
        if park is None:
            continue  # Unmapped venue — caller will get NEUTRAL_WEATHER.
        if park["roofType"] == "dome":
            continue
        # Cheap check: if we already have ≥ 80% of expected dates for this venue
        # in cache, skip.  Otherwise fetch.
        if v in cached_venues:
            have = cache[(cache["venue"] == v)
                         & (cache["date"] >= date_from)
                         & (cache["date"] <= date_to)]
            expected_days = (date_to - date_from).days + 1
            if len(have) >= expected_days * 0.8:
                continue
        pending.append(v)

    if not pending:
        print(f"[weather] cache covers all {sum(1 for v in venues if PARK_FACTORS.get(v, {}).get('roofType') != 'dome')} non-dome venues, skipping fetch")
        return

    print(f"[weather] fetching {len(pending)} venue(s) from Open-Meteo Archive ({date_from} → {date_to})")
    rows = [cache] if not cache.empty else []
    for i, v in enumerate(pending, start=1):
        park = PARK_FACTORS[v]
        df = _fetch_venue_range(v, park["lat"], park["lon"], date_from, date_to)
        if not df.empty:
            rows.append(df)
            print(f"  [{i}/{len(pending)}] {v}: {len(df)} day(s) cached")
        time.sleep(0.5)  # gentle on the free tier
    if rows:
        merged = pd.concat(rows, ignore_index=True)
        _save_cache(merged)


def fetch_game_weather(venue: str | None, game_date: date, *, indoor: bool) -> dict:
    """
    Return a weather dict for one game.  Looks up the prefetched cache, never
    issues a live HTTP call — call prefetch_weather() once before the main loop.
    """
    if indoor:
        return dict(_DOME_WEATHER)
    if venue is None or venue not in PARK_FACTORS:
        return dict(_NEUTRAL_WEATHER)
    cache = _load_cache()
    if cache.empty:
        return dict(_NEUTRAL_WEATHER)
    hits = cache[(cache["venue"] == venue) & (cache["date"] == game_date)]
    if hits.empty:
        return dict(_NEUTRAL_WEATHER)
    row = hits.iloc[0]
    return {
        "temp_f":            float(row["temp_f"])            if pd.notna(row["temp_f"])            else _NEUTRAL_WEATHER["temp_f"],
        "wind_mph":          float(row["wind_mph"])          if pd.notna(row["wind_mph"])          else _NEUTRAL_WEATHER["wind_mph"],
        "wind_dir_deg":      float(row["wind_dir_deg"])      if pd.notna(row["wind_dir_deg"])      else _NEUTRAL_WEATHER["wind_dir_deg"],
        "humidity_pct":      float(row["humidity_pct"])      if pd.notna(row["humidity_pct"])      else _NEUTRAL_WEATHER["humidity_pct"],
        "pressure_hpa":      float(row["pressure_hpa"])      if pd.notna(row["pressure_hpa"])      else _NEUTRAL_WEATHER["pressure_hpa"],
        "precip_in":         float(row["precip_in"])         if pd.notna(row["precip_in"])         else 0.0,
        "air_density_kg_m3": float(row["air_density_kg_m3"]) if pd.notna(row["air_density_kg_m3"]) else _NEUTRAL_WEATHER["air_density_kg_m3"],
        "source":            "open-meteo",
    }
