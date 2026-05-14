"""Smoke test for weather_archive.py — no network required.

Tests:
  1. compute_air_density matches the TS port at sea level and Coors.
  2. fetch_game_weather returns dome defaults for indoor venues.
  3. fetch_game_weather returns neutral defaults when the cache is empty.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from weather_archive import compute_air_density, fetch_game_weather


def approx(a: float, b: float, tol: float = 0.02) -> bool:
    return abs(a - b) <= tol


def main() -> int:
    failures: list[str] = []

    # 1. Sea-level standard atmosphere is ~1.225 kg/m³.
    sl = compute_air_density(59.0, 0.0, 0.0)
    if not approx(sl, 1.225, 0.01):
        failures.append(f"sea-level standard density {sl:.4f} != 1.225")

    # 2. Coors at 75°F, 50% RH, 5183 ft is ~0.98 kg/m³.
    coors = compute_air_density(75.0, 50.0, 5183.0)
    if not (0.95 <= coors <= 1.05):
        failures.append(f"Coors density {coors:.4f} not in [0.95, 1.05]")

    # 3. Indoor lookup returns dome defaults.
    indoor = fetch_game_weather("Rogers Centre", date(2024, 7, 15), indoor=True)
    if indoor["source"] != "dome" or indoor["temp_f"] != 72.0:
        failures.append(f"indoor lookup wrong: {indoor}")

    # 4. Unknown venue or empty cache → neutral fallback.
    miss = fetch_game_weather(None, date(2024, 7, 15), indoor=False)
    if miss["source"] != "neutral":
        failures.append(f"unknown-venue fallback wrong: {miss}")

    # 5. Higher humidity → lower density at fixed temp/elevation.
    dry = compute_air_density(80.0, 10.0, 0.0)
    humid = compute_air_density(80.0, 90.0, 0.0)
    if not (humid < dry):
        failures.append(f"humid air should be less dense than dry: dry={dry:.4f}, humid={humid:.4f}")

    if failures:
        print("FAIL:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"OK — air density sea-level={sl:.4f}, Coors={coors:.4f} kg/m³, lookup fallbacks correct.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
