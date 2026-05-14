"""Smoke test for park_factors.py — invariants only, no external deps.

Run:
    python scripts/deepnrfi/test_park_factors.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from park_factors import PARK_FACTORS, TEAM_TO_VENUE, lookup_park, lookup_venue


def main() -> int:
    failures: list[str] = []

    # 1. Every team in TEAM_TO_VENUE points to a venue we have factors for
    #    (Athletics is the one expected gap → falls back to NEUTRAL via lookup_park).
    for team, venue in TEAM_TO_VENUE.items():
        if venue not in PARK_FACTORS:
            failures.append(f"team {team!r} -> venue {venue!r} not in PARK_FACTORS")

    # 2. Every park factor entry has the full field set.
    required = {"runFactor", "firstInningRunsFactor", "hrFactor", "singleFactor",
                "elevationFt", "roofType", "lat", "lon"}
    for venue, factors in PARK_FACTORS.items():
        missing = required - set(factors.keys())
        if missing:
            failures.append(f"venue {venue!r} missing fields: {missing}")
        if factors["roofType"] not in ("open", "dome", "retractable"):
            failures.append(f"venue {venue!r} bad roofType: {factors['roofType']!r}")

    # 3. Sanity-check landmark factors.
    coors = PARK_FACTORS["Coors Field"]
    assert coors["elevationFt"] > 5000, "Coors should be > 5000 ft"
    assert coors["runFactor"] > 1.10, "Coors should be a strong hitter park"

    trop = PARK_FACTORS["Tropicana Field"]
    assert trop["roofType"] == "dome", "Tropicana should be marked as dome"

    petco = PARK_FACTORS["Petco Park"]
    assert petco["runFactor"] < 0.95, "Petco should be a pitcher park"

    # 4. lookup_park returns neutral for unknown teams without throwing.
    unknown = lookup_park("Toledo Mud Hens")
    assert unknown["runFactor"] == 1.0
    assert unknown["elevationFt"] == 0

    # 5. lookup_park returns a copy (callers can't mutate the shared dict).
    a = lookup_park("Colorado Rockies")
    a["runFactor"] = -1.0
    b = lookup_park("Colorado Rockies")
    assert b["runFactor"] > 1.10, "lookup_park must return defensive copies"

    # 6. lookup_venue contract.
    assert lookup_venue("Colorado Rockies") == "Coors Field"
    assert lookup_venue("Toledo Mud Hens") is None

    if failures:
        print("FAIL:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"OK — {len(TEAM_TO_VENUE)} teams, {len(PARK_FACTORS)} venues, all invariants hold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
