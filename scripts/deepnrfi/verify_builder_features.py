"""
Standalone verification for the Tier 1-3 feature aggregators in
build_real_training_set.py.  The repo has no Python test runner, so this is a
self-contained assertion script:

    python scripts/deepnrfi/verify_builder_features.py

Exits 0 on success, 1 on the first failed assertion.  Runs in the builder's own
venv (it imports build_real_training_set, which needs pandas/pybaseball/etc).

The aggregation functions are pure — DataFrame in, dict out — so we exercise
them directly against hand-built Statcast fixtures.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta

try:
    import pandas as pd
except ImportError as e:  # pragma: no cover
    print(f"Missing dep: {e}.  Run inside the builder venv.", file=sys.stderr)
    raise SystemExit(1) from e

from build_real_training_set import (
    DEFAULTS,
    _TEAM_REST_CAP_DAYS,
    aggregate_pitcher,
    aggregate_top_four,
    compute_travel_rest_map,
)
from park_factors import haversine_miles, venue_coords

failures = 0


def ok(label: str, cond: bool, detail: str = "") -> None:
    global failures
    if cond:
        print(f"  ok   {label}")
    else:
        failures += 1
        print(f"  FAIL {label}{(' — ' + detail) if detail else ''}")


def approx(label: str, actual, expected, tol: float = 1e-9) -> None:
    ok(label, actual is not None and abs(actual - expected) <= tol,
       f"got {actual}, want {expected}")


# ─── Fixture builders ─────────────────────────────────────────────────────────

# Columns aggregate_pitcher / aggregate_top_four read.
_COLS = [
    "pitcher", "batter", "pitch_type", "release_speed", "release_spin_rate",
    "events", "inning", "game_pk", "game_date", "post_bat_score", "bat_score",
    "at_bat_number", "p_throws",
]


def _pitch(pitcher, game_pk, game_date, inning, at_bat_number, events,
           batter=900, pitch_type="FF"):
    return {
        "pitcher": pitcher, "batter": batter, "pitch_type": pitch_type,
        "release_speed": 95.0, "release_spin_rate": 2400.0,
        "events": events, "inning": inning, "game_pk": game_pk,
        "game_date": game_date, "post_bat_score": 0, "bat_score": 0,
        "at_bat_number": at_bat_number, "p_throws": "R",
    }


def _starter_game(pitcher, game_pk, game_date):
    """A starter's game: leadoff PA spans 3 pitches (2 non-terminating + a
    'single'), then K, field_out, HR, walk — plus 40 filler pitches so
    pitch_count >= 40 and the is_bullpen pitch-count clause stays false."""
    rows = [
        # multi-pitch leadoff PA — only the 3rd pitch is PA-terminating
        _pitch(pitcher, game_pk, game_date, 1, 1, None),
        _pitch(pitcher, game_pk, game_date, 1, 1, None),
        _pitch(pitcher, game_pk, game_date, 1, 1, "single"),
        _pitch(pitcher, game_pk, game_date, 1, 2, "strikeout"),
        _pitch(pitcher, game_pk, game_date, 1, 3, "field_out"),
        _pitch(pitcher, game_pk, game_date, 2, 10, "home_run"),
        _pitch(pitcher, game_pk, game_date, 2, 11, "walk"),
    ]
    rows += [_pitch(pitcher, game_pk, game_date, 2, 20, None) for _ in range(40)]
    return rows  # pitch_count = 47, min_inning = 1


def _reliever_game(pitcher, game_pk, game_date):
    """A reliever's game: enters in the 7th, ~15 pitches."""
    rows = [
        _pitch(pitcher, game_pk, game_date, 7, 60, "strikeout"),
        _pitch(pitcher, game_pk, game_date, 7, 61, "field_out"),
    ]
    rows += [_pitch(pitcher, game_pk, game_date, 7, 70, None) for _ in range(13)]
    return rows  # pitch_count = 15, min_inning = 7


def _vstop_starter_first_inning(pitcher, game_pk, game_date):
    """Four first-inning PAs (single, K, walk, field_out) per game.  Used to
    build up enough samples to clear _MIN_VSTOP_PA so vstop_woba / vstop_k
    actually compute."""
    return [
        _pitch(pitcher, game_pk, game_date, 1, 1, "single"),
        _pitch(pitcher, game_pk, game_date, 1, 2, "strikeout"),
        _pitch(pitcher, game_pk, game_date, 1, 3, "walk"),
        _pitch(pitcher, game_pk, game_date, 1, 4, "field_out"),
    ] + [_pitch(pitcher, game_pk, game_date, 2, 20, None) for _ in range(40)]


def build_window() -> pd.DataFrame:
    rows = []
    # Pitcher 100 — clear starter, 3 games, last on 2024-04-13.
    rows += _starter_game(100, 1, date(2024, 4, 1))
    rows += _starter_game(100, 2, date(2024, 4, 7))
    rows += _starter_game(100, 3, date(2024, 4, 13))
    # Pitcher 200 — clear reliever, 3 games.
    rows += _reliever_game(200, 4, date(2024, 4, 5))
    rows += _reliever_game(200, 5, date(2024, 4, 11))
    rows += _reliever_game(200, 6, date(2024, 4, 17))
    # Pitcher 300 — single appearance.
    rows += _starter_game(300, 7, date(2024, 4, 10))
    # Pitcher 400: 14 starts x 4 first-inning PAs = 56 first-inning PAs
    # (clears _MIN_VSTOP_PA = 40).  Each game: 1 single, 1 K, 1 walk, 1 FO.
    for i in range(14):
        rows += _vstop_starter_first_inning(400, 1000 + i, date(2024, 4, 1) + timedelta(days=i))
    # Top-of-order batters 501/502 for the offense_factor test.
    for i, ev in enumerate(["single", "double", "walk", "strikeout", "home_run",
                            "field_out", "single", "walk"]):
        rows.append(_pitch(999, 100 + i, date(2024, 4, 2), 1, 200 + i, ev, batter=501 + (i % 2)))
    # game_date stays as datetime.date objects (matching production line 594),
    # since _pitch() already builds them that way.
    return pd.DataFrame(rows, columns=_COLS)


# ─── Tests ────────────────────────────────────────────────────────────────────

GAME_DATE = date(2024, 4, 19)
window = build_window()

print("aggregate_pitcher — starter (pitcher 100, 3 games):")
p100 = aggregate_pitcher(window, 100, GAME_DATE)
ok("returns a populated dict", bool(p100))
# Per game: n_pa=5, hits=2 (single+HR), bbs=1, hbps=0, ks=1, hrs=1
# babip = (hits-hrs) / (n_pa - bbs - hbps - ks - hrs) = (2-1)/(5-1-0-1-1) = 0.5
# (aggregated over 3 identical games the ratio is unchanged)
approx("babip = 0.5  ((H-HR)/BIP, 3 identical games)", p100["babip"], 0.5)
# leadoff PA each game is the 'single' (terminating-event filter beats the
# two non-terminating pitches at the same at_bat_number) -> on base every game
approx("first_batter_obp = 1.0  (multi-pitch leadoff resolves to 'single')",
       p100["first_batter_obp"], 1.0)
approx("days_rest = 6  (2024-04-19 minus last game 2024-04-13)", p100["days_rest"], 6)
approx("pitches_last5 = 141  (47 pitches x 3 games)", p100["pitches_last5"], 141)
# per-game outs = n_pa - hits - bbs - hbps - errors = 5-2-1-0-0 = 2
approx("rolling3_ip = 2.0  (tail-3 outs 2+2+2 / 3)", p100["rolling3_ip"], 2.0)
ok("is_bullpen = 0  (min_inning 1, pitch_count 47 >= 40)", p100["is_bullpen"] == 0,
   f"got {p100['is_bullpen']}")

print("aggregate_pitcher — reliever (pitcher 200):")
p200 = aggregate_pitcher(window, 200, GAME_DATE)
ok("is_bullpen = 1  (median min_inning 7 > 1)", p200["is_bullpen"] == 1,
   f"got {p200['is_bullpen']}")

print("aggregate_pitcher — single appearance (pitcher 300):")
p300 = aggregate_pitcher(window, 300, GAME_DATE)
ok("is_bullpen = None  (1 game < _MIN_GAMES_IS_BULLPEN)", p300["is_bullpen"] is None)
ok("pitches_last5 = None  (1 game < _MIN_GAMES_PITCHES_LAST5)", p300["pitches_last5"] is None)
ok("rolling3_ip = None  (1 game < _MIN_GAMES_ROLLING3_IP)", p300["rolling3_ip"] is None)
ok("days_rest still computed from the one game", p300["days_rest"] is not None)
ok("babip still computed", p300["babip"] is not None)

print("aggregate_pitcher - vstop splits:")
# Pitcher 100 has 3 first-inning PAs/game x 3 games = 9 < _MIN_VSTOP_PA -> None.
ok("vstop_woba = None for pitcher 100 (9 first-inning PAs < _MIN_VSTOP_PA)",
   p100["vstop_woba"] is None, f"got {p100['vstop_woba']}")
ok("vstop_k = None for pitcher 100 (9 first-inning PAs < _MIN_VSTOP_PA)",
   p100["vstop_k"] is None, f"got {p100['vstop_k']}")
# Pitcher 400 has 14 x 4 = 56 first-inning PAs; vstop_k = 14/56 = 0.25.
# vstop_woba: 14 walks (0.692), 14 singles (0.882), denom = 56 → 22.036 / 56 = 0.3935.
p400 = aggregate_pitcher(window, 400, GAME_DATE)
approx("vstop_k = 14/56 = 0.25 (14 K out of 56 first-inning PAs)",
       p400["vstop_k"], 0.25, tol=1e-6)
approx("vstop_woba ≈ 0.3935 (14 BB + 14 singles, 0 XBH)",
       p400["vstop_woba"], 0.3935, tol=1e-4)

print("aggregate_pitcher — edge cases:")
ok("pitcher not in window -> {}", aggregate_pitcher(window, 99999, GAME_DATE) == {})
no_abn = aggregate_pitcher(window.drop(columns=["at_bat_number"]), 100, GAME_DATE)
ok("missing at_bat_number -> first_batter_obp is None", no_abn["first_batter_obp"] is None)
ok("missing at_bat_number -> babip still computes", no_abn["babip"] is not None)

print("aggregate_top_four — offense_factor:")
b = aggregate_top_four(window, [501, 502], None)
ok("returns a populated dict", bool(b))
# Hand-compute OPS from the 8 fixture PAs for batters 501/502 in build_window:
# single, double, walk, strikeout, home_run, field_out, single, walk.
#   hits=4 (2x1B,1x2B,1xHR), walks=2, n_pa=8, ab=8-2=6
#   obp = (4+2)/8 = 0.75 ; tb = 2+2+0+4 = 8 ; slg = 8/6 ; ops = 0.75 + 8/6
expected_ops = 0.75 + 8 / 6
approx("ops computed from the 8 fixture PAs", b["ops"], expected_ops)
expected_of = min(1.35, max(0.65, expected_ops / 0.720))
approx("offense_factor = min(1.35, max(0.65, ops/0.720))", b["offense_factor"], expected_of)
ok("offense_factor within clamp [0.65, 1.35]", 0.65 <= b["offense_factor"] <= 1.35)

print("haversine_miles + venue_coords:")
ok("identical coords -> 0.0", haversine_miles(40.0, -75.0, 40.0, -75.0) == 0.0)
# NYC (Yankee Stadium ~40.83, -73.93) -> LAX (Dodger Stadium ~34.07, -118.24)
# Real great-circle is ~2445 miles; verify within 10mi tolerance.
nyc_to_la = haversine_miles(40.8296, -73.9262, 34.0739, -118.2400)
ok("NYC -> LA approx 2445 miles", abs(nyc_to_la - 2445) < 10,
   f"got {nyc_to_la:.1f}")
yc = venue_coords("New York Yankees")
ok("venue_coords returns (lat, lon) for known team", yc == (40.8296, -73.9262),
   f"got {yc}")
ok("venue_coords returns None for unknown team",
   venue_coords("Fake Team") is None)

print("compute_travel_rest_map:")
# Three-game slate: Yankees home Apr 1, then travel to Dodgers Apr 5 (away),
# Dodgers host Yankees Apr 5 (home), then back to Yankees Apr 9 (home).
# After Apr 1, Yankees were at NYY; Apr 5 they're at LAD (huge travel),
# rested 4 days.  Dodgers' first game in window so they default.
games_df = pd.DataFrame([
    {"game_pk": 1, "date": date(2024, 4, 1),
     "home_team": "New York Yankees", "away_team": "Boston Red Sox"},
    {"game_pk": 2, "date": date(2024, 4, 5),
     "home_team": "Los Angeles Dodgers", "away_team": "New York Yankees"},
    {"game_pk": 3, "date": date(2024, 4, 9),
     "home_team": "New York Yankees", "away_team": "Houston Astros"},
])
tr = compute_travel_rest_map(games_df)
# Game 1: both teams have no prior -> defaults, travel 0
ok("game 1 home_rest = DEFAULTS['days_rest'] (no prior)",
   tr[1]["home_rest_days"] == float(DEFAULTS["days_rest"]),
   f"got {tr[1]['home_rest_days']}")
ok("game 1 home_travel = 0 (no prior)", tr[1]["home_travel_miles"] == 0.0)
ok("game 1 away_travel = 0 (no prior)", tr[1]["away_travel_miles"] == 0.0)
# Game 2: Dodgers (host) first appearance -> default rest, 0 travel.
# Yankees (away) had Apr 1, so 4 days rest, travel NYC->LA ~2445 miles.
ok("game 2 home_rest = DEFAULTS (Dodgers' first appearance)",
   tr[2]["home_rest_days"] == float(DEFAULTS["days_rest"]),
   f"got {tr[2]['home_rest_days']}")
ok("game 2 away_rest = 4 (Yankees: Apr 5 - Apr 1)",
   tr[2]["away_rest_days"] == 4.0, f"got {tr[2]['away_rest_days']}")
ok("game 2 away_travel ~2445 miles (NYC -> LA)",
   abs(tr[2]["away_travel_miles"] - 2445) < 10,
   f"got {tr[2]['away_travel_miles']:.1f}")
# Game 3: Yankees back home from LA -> 4 days rest, ~2445 miles travel home.
approx("game 3 home_travel ~2445 miles (LA -> NYC)",
       tr[3]["home_travel_miles"], 2445, tol=10)
ok("game 3 home_rest = 4 (Yankees: Apr 9 - Apr 5)",
   tr[3]["home_rest_days"] == 4.0, f"got {tr[3]['home_rest_days']}")

# Rest cap: 30-day gap should clamp to _TEAM_REST_CAP_DAYS.
gap_df = pd.DataFrame([
    {"game_pk": 10, "date": date(2024, 4, 1),
     "home_team": "New York Yankees", "away_team": "Boston Red Sox"},
    {"game_pk": 11, "date": date(2024, 5, 1),
     "home_team": "New York Yankees", "away_team": "Boston Red Sox"},
])
tr_gap = compute_travel_rest_map(gap_df)
ok("rest_days capped at _TEAM_REST_CAP_DAYS",
   tr_gap[11]["home_rest_days"] == float(_TEAM_REST_CAP_DAYS),
   f"got {tr_gap[11]['home_rest_days']}")

print()
if failures:
    print(f"{failures} assertion(s) failed.")
    sys.exit(1)
print("All Tier 1-3 builder-feature checks passed.")
