"""Unit tests for transforms.py — the serving-parity ports.

No third-party deps.  Run:
    python scripts/deepnrfi/test_transforms.py

Each block re-derives the expected value independently (not by calling the
function under test) so a regression in transforms.py cannot self-verify.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from transforms import (
    ENSEMBLE_BLEND,
    FINAL_CLAMP_MAX,
    FINAL_CLAMP_MIN,
    LEAGUE_ANCHOR,
    LEAGUE_AVG_NRFI,
    LEAGUE_HALF_NRFI,
    apply_dynamic_shrinkage,
    dynamic_prior_weight,
    estimate_nrfi_rate_from_first_inning_runs,
    invert_league_anchor,
    serving_shrunk_nrfi,
    wind_in_out_token,
)

failures = 0


def ok(label: str, cond: bool, detail: str = "") -> None:
    global failures
    if cond:
        print(f"  ok   {label}")
    else:
        failures += 1
        print(f"  FAIL {label}{(' — ' + detail) if detail else ''}")


def approx(label: str, actual: float | None, expected: float, tol: float = 1e-9) -> None:
    ok(label, actual is not None and abs(actual - expected) <= tol,
       f"got {actual}, want {expected} ± {tol}")


print("league constants:")
approx("LEAGUE_HALF_NRFI = sqrt(0.516)", LEAGUE_HALF_NRFI, math.sqrt(0.516))
approx("half rate squared recovers game rate", LEAGUE_HALF_NRFI ** 2, LEAGUE_AVG_NRFI)

print("estimate_nrfi_rate_from_first_inning_runs (anchored to league):")
# Anchor: league 0.52 runs/half must map EXACTLY to LEAGUE_HALF_NRFI.
approx("league input → LEAGUE_HALF_NRFI", estimate_nrfi_rate_from_first_inning_runs(0.52), LEAGUE_HALF_NRFI, 1e-12)
# Independent re-derivation for a non-league input: c = −ln(0.7183)/0.52.
c = -math.log(math.sqrt(0.516)) / 0.52
approx("0.30 runs/half", estimate_nrfi_rate_from_first_inning_runs(0.30), math.exp(-0.30 * c), 1e-12)
ok("clamps to [0.45, 0.92]",
   estimate_nrfi_rate_from_first_inning_runs(5.0) == 0.45
   and estimate_nrfi_rate_from_first_inning_runs(0.0) == 0.92)
approx("negative / NaN input → league rate", estimate_nrfi_rate_from_first_inning_runs(float("nan")), LEAGUE_HALF_NRFI)

print("dynamic_prior_weight (mirrors getDynamicPriorWeight incl. careerIP fallback):")
ok("bullpen → 80", dynamic_prior_weight(10, is_bullpen=True) == 80)
ok("33-start season, no careerIP → 30 (99 < 100)", dynamic_prior_weight(33) == 30)
ok("careerIP 150 → 50", dynamic_prior_weight(10, career_first_innings=150) == 50)

print("apply_dynamic_shrinkage (prior = HALF-inning league rate):")
# Independent: (0.80·20 + 0.7183·30) / 50
expected = (0.80 * 20 + math.sqrt(0.516) * 30) / 50
approx("obs 0.80, n=20, k=30", apply_dynamic_shrinkage(0.80, 20, 30), expected, 1e-12)
ok("clamped to [0.35, 0.92]",
   apply_dynamic_shrinkage(0.99, 1000, 1) <= 0.92 and apply_dynamic_shrinkage(0.01, 1000, 1) >= 0.35)
ok("zero starts treated as n=1", apply_dynamic_shrinkage(0.9, 0, 30) == apply_dynamic_shrinkage(0.9, 1, 30))

print("serving_shrunk_nrfi (full chain):")
rate = estimate_nrfi_rate_from_first_inning_runs(0.30)
approx("runs 0.30, 20 starts",
       serving_shrunk_nrfi(0.30, 20),
       (rate * 20 + math.sqrt(0.516) * 30) / 50, 1e-12)
ok("no data → None", serving_shrunk_nrfi(None, 5) is None and serving_shrunk_nrfi(0.4, 0) is None)
# The legacy builder's output for the same pitcher (k=1.14 toward 0.516) was
# materially different — pin the gap so nobody "simplifies" this back.
legacy = (0.72 * 6 + 0.516 * 1.14) / (6 + 1.14)
current = serving_shrunk_nrfi(0.30, 6)
ok("differs from legacy k=1.14/0.516 scheme by > 0.02",
   current is not None and abs(current - legacy) > 0.02,
   f"current={current}, legacy={legacy}")

print("wind_in_out_token (mirrors lib/api/weather.ts mapWindDirection):")
# Wrigley CF bearing 355°: "out" requires wind FROM (355+180)%360 = 175° ± 45.
ok("wind FROM 175° at Wrigley → out (+1)", wind_in_out_token(10, 175, 355) == 1.0)
ok("wind FROM 355° at Wrigley → in (−1)", wind_in_out_token(10, 355, 355) == -1.0)
ok("wind FROM 85° at Wrigley → crosswind (0)", wind_in_out_token(10, 85, 355) == 0.0)
ok("< 3 mph → calm (0) regardless of direction", wind_in_out_token(2.9, 175, 355) == 0.0)
ok("unknown bearing → crosswind (0)", wind_in_out_token(15, 175, None) == 0.0)
# Sector boundaries: relDeg == 45 is still "out"; 46 is crosswind; 135 is "in".
ok("boundary relDeg=45 → out", wind_in_out_token(10, (175 + 45) % 360, 355) == 1.0)
ok("boundary relDeg=46 → crosswind", wind_in_out_token(10, (175 + 46) % 360, 355) == 0.0)
ok("boundary relDeg=135 → in", wind_in_out_token(10, (175 + 135) % 360, 355) == -1.0)
ok("output is always in {−1, 0, +1}",
   all(wind_in_out_token(m, d, b) in (-1.0, 0.0, 1.0)
       for m in (0, 5, 12, 30) for d in range(0, 360, 15) for b in (None, 0, 90, 215, 355)))

print("invert_league_anchor (exact inverse of the identity-knot final blend):")
# Boundary preimages: the cal values whose blend lands exactly on the clamps.
LOWER_PREIMAGE = (FINAL_CLAMP_MIN - (1 - ENSEMBLE_BLEND) * LEAGUE_ANCHOR) / ENSEMBLE_BLEND  # ≈ 0.0737
UPPER_PREIMAGE = (FINAL_CLAMP_MAX - (1 - ENSEMBLE_BLEND) * LEAGUE_ANCHOR) / ENSEMBLE_BLEND  # ≈ 0.9553
for cal in (0.0, 0.10, 0.30, 0.516, 0.65, 0.95, 1.0):
    final_unclamped = ENSEMBLE_BLEND * cal + (1 - ENSEMBLE_BLEND) * LEAGUE_ANCHOR
    final = min(FINAL_CLAMP_MAX, max(FINAL_CLAMP_MIN, final_unclamped))
    recovered = invert_league_anchor(final)
    if FINAL_CLAMP_MIN < final_unclamped < FINAL_CLAMP_MAX:
        # Exact recovery whenever the clamp did not bind.
        approx(f"round-trips cal={cal}", recovered, cal, 1e-12)
    elif final_unclamped <= FINAL_CLAMP_MIN:
        approx(f"lower-clamped cal={cal} → lower boundary preimage", recovered, LOWER_PREIMAGE, 1e-12)
    else:
        approx(f"upper-clamped cal={cal} → upper boundary preimage", recovered, UPPER_PREIMAGE, 1e-12)
approx("anchor fixed point: 0.516 → 0.516", invert_league_anchor(LEAGUE_AVG_NRFI), LEAGUE_AVG_NRFI, 1e-12)
approx("non-finite input → league rate", invert_league_anchor(float("nan")), LEAGUE_AVG_NRFI)
ok("monotone over the stored range",
   all(invert_league_anchor(a) <= invert_league_anchor(b) + 1e-12
       for a, b in zip([x / 100 for x in range(18, 85)], [x / 100 for x in range(19, 86)])))

print()
if failures:
    print(f"{failures} FAILURE(S)")
    sys.exit(1)
print("all transforms tests passed")
sys.exit(0)
