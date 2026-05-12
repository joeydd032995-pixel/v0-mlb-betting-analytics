"""
Park factors for the DeepNRFI training pipeline.

Python port of `lib/features/park-factors-extended.ts` plus a team-name → venue
table so we can look up park factors from the `homeTeam` string stored in the
`game_results` Postgres table (which is the MLB Stats API's full team name,
e.g. "Boston Red Sox").

Keep this file in sync with the TS source of truth when park factors are
recalibrated.  When the venue is unknown we return neutral values (1.00) and
elevation 0 so the trainer degrades gracefully.
"""

from __future__ import annotations

from typing import TypedDict


class ExtendedParkFactor(TypedDict):
    runFactor: float
    firstInningRunsFactor: float
    hrFactor: float
    singleFactor: float
    elevationFt: int
    roofType: str  # "open" | "dome" | "retractable"
    lat: float
    lon: float


NEUTRAL_PARK: ExtendedParkFactor = {
    "runFactor": 1.0,
    "firstInningRunsFactor": 1.0,
    "hrFactor": 1.0,
    "singleFactor": 1.0,
    "elevationFt": 0,
    "roofType": "open",
    "lat": 0.0,
    "lon": 0.0,
}


# Mirrors lib/features/park-factors-extended.ts:EXTENDED_PARK_FACTORS
# plus lat/lon from lib/constants/mlb-stadiums.ts so Step 3's weather adapter
# can read coords from the same lookup.
PARK_FACTORS: dict[str, ExtendedParkFactor] = {
    "Oriole Park at Camden Yards": {"runFactor": 1.00, "firstInningRunsFactor": 1.00, "hrFactor": 1.05, "singleFactor": 0.99, "elevationFt":  20, "roofType": "open",        "lat": 39.2838, "lon":  -76.6218},
    "Fenway Park":                  {"runFactor": 1.05, "firstInningRunsFactor": 1.04, "hrFactor": 0.97, "singleFactor": 1.06, "elevationFt":  21, "roofType": "open",        "lat": 42.3467, "lon":  -71.0972},
    "Yankee Stadium":               {"runFactor": 1.03, "firstInningRunsFactor": 1.02, "hrFactor": 1.12, "singleFactor": 0.99, "elevationFt":  55, "roofType": "open",        "lat": 40.8296, "lon":  -73.9262},
    "Tropicana Field":              {"runFactor": 0.95, "firstInningRunsFactor": 0.96, "hrFactor": 0.94, "singleFactor": 0.98, "elevationFt":  16, "roofType": "dome",        "lat": 27.7683, "lon":  -82.6534},
    "Rogers Centre":                {"runFactor": 1.00, "firstInningRunsFactor": 1.00, "hrFactor": 1.04, "singleFactor": 0.99, "elevationFt": 300, "roofType": "retractable", "lat": 43.6414, "lon":  -79.3894},
    "Guaranteed Rate Field":        {"runFactor": 1.05, "firstInningRunsFactor": 1.04, "hrFactor": 1.10, "singleFactor": 1.00, "elevationFt": 595, "roofType": "open",        "lat": 41.8300, "lon":  -87.6338},
    "Progressive Field":            {"runFactor": 0.96, "firstInningRunsFactor": 0.97, "hrFactor": 0.97, "singleFactor": 0.98, "elevationFt": 650, "roofType": "open",        "lat": 41.4962, "lon":  -81.6852},
    "Comerica Park":                {"runFactor": 0.94, "firstInningRunsFactor": 0.95, "hrFactor": 0.92, "singleFactor": 0.98, "elevationFt": 600, "roofType": "open",        "lat": 42.3390, "lon":  -83.0485},
    "Kauffman Stadium":             {"runFactor": 0.97, "firstInningRunsFactor": 0.98, "hrFactor": 0.92, "singleFactor": 1.02, "elevationFt": 750, "roofType": "open",        "lat": 39.0517, "lon":  -94.4803},
    "Target Field":                 {"runFactor": 0.98, "firstInningRunsFactor": 0.99, "hrFactor": 0.96, "singleFactor": 1.00, "elevationFt": 815, "roofType": "open",        "lat": 44.9817, "lon":  -93.2781},
    "Minute Maid Park":             {"runFactor": 1.02, "firstInningRunsFactor": 1.01, "hrFactor": 1.06, "singleFactor": 1.00, "elevationFt":  45, "roofType": "retractable", "lat": 29.7572, "lon":  -95.3556},
    "Angel Stadium":                {"runFactor": 0.96, "firstInningRunsFactor": 0.97, "hrFactor": 0.99, "singleFactor": 0.98, "elevationFt": 160, "roofType": "open",        "lat": 33.8003, "lon": -117.8827},
    "Oakland Coliseum":             {"runFactor": 0.94, "firstInningRunsFactor": 0.95, "hrFactor": 0.93, "singleFactor": 0.97, "elevationFt":  43, "roofType": "open",        "lat": 37.7516, "lon": -122.2005},
    "T-Mobile Park":                {"runFactor": 0.93, "firstInningRunsFactor": 0.94, "hrFactor": 0.91, "singleFactor": 0.97, "elevationFt":  10, "roofType": "retractable", "lat": 47.5914, "lon": -122.3325},
    "Globe Life Field":             {"runFactor": 1.01, "firstInningRunsFactor": 1.00, "hrFactor": 1.02, "singleFactor": 1.00, "elevationFt": 551, "roofType": "retractable", "lat": 32.7473, "lon":  -97.0845},
    "Truist Park":                  {"runFactor": 1.02, "firstInningRunsFactor": 1.01, "hrFactor": 1.04, "singleFactor": 1.01, "elevationFt": 1050, "roofType": "open",       "lat": 33.8908, "lon":  -84.4678},
    "loanDepot park":               {"runFactor": 0.93, "firstInningRunsFactor": 0.94, "hrFactor": 0.85, "singleFactor": 0.97, "elevationFt":  10, "roofType": "retractable", "lat": 25.7781, "lon":  -80.2196},
    "Citi Field":                   {"runFactor": 0.96, "firstInningRunsFactor": 0.97, "hrFactor": 0.94, "singleFactor": 0.99, "elevationFt":  37, "roofType": "open",        "lat": 40.7571, "lon":  -73.8458},
    "Citizens Bank Park":           {"runFactor": 1.08, "firstInningRunsFactor": 1.06, "hrFactor": 1.16, "singleFactor": 1.01, "elevationFt":  20, "roofType": "open",        "lat": 39.9061, "lon":  -75.1665},
    "Nationals Park":               {"runFactor": 1.00, "firstInningRunsFactor": 1.00, "hrFactor": 1.02, "singleFactor": 0.99, "elevationFt":  25, "roofType": "open",        "lat": 38.8730, "lon":  -77.0074},
    "Wrigley Field":                {"runFactor": 1.07, "firstInningRunsFactor": 1.05, "hrFactor": 1.05, "singleFactor": 1.04, "elevationFt": 600, "roofType": "open",        "lat": 41.9484, "lon":  -87.6553},
    "Great American Ball Park":     {"runFactor": 1.12, "firstInningRunsFactor": 1.09, "hrFactor": 1.20, "singleFactor": 1.02, "elevationFt": 490, "roofType": "open",        "lat": 39.0978, "lon":  -84.5080},
    "American Family Field":        {"runFactor": 0.98, "firstInningRunsFactor": 0.99, "hrFactor": 1.04, "singleFactor": 0.97, "elevationFt": 635, "roofType": "retractable", "lat": 43.0280, "lon":  -87.9712},
    "PNC Park":                     {"runFactor": 0.99, "firstInningRunsFactor": 0.99, "hrFactor": 0.93, "singleFactor": 1.01, "elevationFt": 725, "roofType": "open",        "lat": 40.4469, "lon":  -80.0057},
    "Busch Stadium":                {"runFactor": 0.98, "firstInningRunsFactor": 0.99, "hrFactor": 0.92, "singleFactor": 1.00, "elevationFt": 465, "roofType": "open",        "lat": 38.6226, "lon":  -90.1928},
    "Chase Field":                  {"runFactor": 1.05, "firstInningRunsFactor": 1.03, "hrFactor": 1.08, "singleFactor": 1.02, "elevationFt": 1059, "roofType": "retractable","lat": 33.4453, "lon": -112.0667},
    "Coors Field":                  {"runFactor": 1.15, "firstInningRunsFactor": 1.10, "hrFactor": 1.18, "singleFactor": 1.10, "elevationFt": 5183, "roofType": "open",       "lat": 39.7559, "lon": -104.9942},
    "Dodger Stadium":               {"runFactor": 0.96, "firstInningRunsFactor": 0.97, "hrFactor": 1.02, "singleFactor": 0.96, "elevationFt": 502, "roofType": "open",        "lat": 34.0739, "lon": -118.2400},
    "Petco Park":                   {"runFactor": 0.87, "firstInningRunsFactor": 0.90, "hrFactor": 0.84, "singleFactor": 0.95, "elevationFt":  62, "roofType": "open",        "lat": 32.7073, "lon": -117.1566},
    "Oracle Park":                  {"runFactor": 0.91, "firstInningRunsFactor": 0.93, "hrFactor": 0.80, "singleFactor": 0.98, "elevationFt":  10, "roofType": "open",        "lat": 37.7786, "lon": -122.3893},
    # The Athletics played their 2024 home games at Oakland Coliseum and moved
    # to Sutter Health Park (West Sacramento) for 2025.  Sutter Health is a
    # minor-league park with no published factors yet — fall back to neutral
    # by routing the 2025 alias to NEUTRAL via the team map, but keep the
    # Oakland Coliseum entry for 2024 lookups.
    "Sutter Health Park":           {"runFactor": 1.00, "firstInningRunsFactor": 1.00, "hrFactor": 1.00, "singleFactor": 1.00, "elevationFt":  30, "roofType": "open",        "lat": 38.5803, "lon": -121.5135},
}


# `gr."homeTeam"` is the MLB Stats API full name (see app/api/historical-sync/route.ts:245).
# This map drives off that string.  Add aliases here when a team relocates or
# the API name drifts (e.g. the Athletics 2024→2025 rename).
TEAM_TO_VENUE: dict[str, str] = {
    "Baltimore Orioles":     "Oriole Park at Camden Yards",
    "Boston Red Sox":        "Fenway Park",
    "New York Yankees":      "Yankee Stadium",
    "Tampa Bay Rays":        "Tropicana Field",
    "Toronto Blue Jays":     "Rogers Centre",
    "Chicago White Sox":     "Guaranteed Rate Field",
    "Cleveland Guardians":   "Progressive Field",
    "Detroit Tigers":        "Comerica Park",
    "Kansas City Royals":    "Kauffman Stadium",
    "Minnesota Twins":       "Target Field",
    "Houston Astros":        "Minute Maid Park",
    "Los Angeles Angels":    "Angel Stadium",
    "Oakland Athletics":     "Oakland Coliseum",
    "Athletics":             "Sutter Health Park",  # MLB API name from 2025 onward
    "Seattle Mariners":      "T-Mobile Park",
    "Texas Rangers":         "Globe Life Field",
    "Atlanta Braves":        "Truist Park",
    "Miami Marlins":         "loanDepot park",
    "New York Mets":         "Citi Field",
    "Philadelphia Phillies": "Citizens Bank Park",
    "Washington Nationals":  "Nationals Park",
    "Chicago Cubs":          "Wrigley Field",
    "Cincinnati Reds":       "Great American Ball Park",
    "Milwaukee Brewers":     "American Family Field",
    "Pittsburgh Pirates":    "PNC Park",
    "St. Louis Cardinals":   "Busch Stadium",
    "Arizona Diamondbacks":  "Chase Field",
    "Colorado Rockies":      "Coors Field",
    "Los Angeles Dodgers":   "Dodger Stadium",
    "San Diego Padres":      "Petco Park",
    "San Francisco Giants":  "Oracle Park",
}


def lookup_park(home_team: str) -> ExtendedParkFactor:
    """Resolve the home team's full MLB-API name to extended park factors."""
    venue = TEAM_TO_VENUE.get(home_team)
    if venue is None:
        return dict(NEUTRAL_PARK)  # type: ignore[return-value]
    return dict(PARK_FACTORS.get(venue, NEUTRAL_PARK))  # type: ignore[return-value]


def lookup_venue(home_team: str) -> str | None:
    """Return the venue name for a home team, or None if unmapped."""
    return TEAM_TO_VENUE.get(home_team)
