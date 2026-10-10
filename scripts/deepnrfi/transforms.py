"""
Serving-parity transforms for the DeepNRFI training-set builder.

Every function here is a *Python port of the exact TypeScript transform the
live serving path applies*, so that a feature column in training.csv has the
same scale, center, and spread as the value `lib/features/feature-vector.ts`
emits at inference time.  Train/serve skew on these columns was a root cause
of the v1/v2 stackers failing the Brier gate (see AUDIT_REPORT_V2.md §2.1):
LightGBM split thresholds learned on one distribution are applied to another.

TS sources of truth (keep in sync):
  - lib/api/shared-helpers.ts   estimateNrfiRateFromFirstInningRuns
  - lib/nrfi-models.ts          getDynamicPriorWeight / applyDynamicShrinkage
  - lib/api/weather.ts          mapWindDirection (token: out/in/crosswind/calm)
  - lib/nrfi-engine.ts          ENSEMBLE_BLEND / LEAGUE_ANCHOR final blend

No third-party imports — unit-testable without pandas/pybaseball/DB
(`python scripts/deepnrfi/test_transforms.py`).
"""

from __future__ import annotations

import math

# ─── Training feature-contract version ────────────────────────────────────────
#
# Bump whenever the MEANING/scale of any training.csv column changes (not for
# new games appended under the same semantics).  The builder refuses to resume
# into a CSV stamped with a different version, and the refresh script refuses
# to touch one — resuming by gameId across contract versions silently mixes
# incompatible feature distributions.
#
#   v1 — legacy 30-day-window builder (pre Audit V2)
#   v2 — serving-parity builder: season-to-date slices, half-inning shrinkage,
#        wind token, pre-anchor ensemble7_nrfi (AUDIT_REPORT_V2.md §2.1)
#   v3 — LEAGUE_AVG_NRFI re-estimated 0.516 -> 0.5056 (2026-10). Every column
#        anchored to the league rate moves: *_pitcher_shrunk_nrfi (prior target
#        and the e^(-c*r) coefficient feeding it), umpire_career_nrfi (EB prior)
#        and ensemble7_nrfi (anchor inversion). v2 and v3 rows are NOT
#        interchangeable, so the version must move with the constant.
TRAINING_FEATURE_CONTRACT_VERSION = 3

# ─── League constants (mirror lib/nrfi-models.ts) ─────────────────────────────
#
# These restate TypeScript values because Python cannot import them.  That
# restatement is the whole risk: the 0.516 below sat here for a release after
# lib/nrfi-models.ts moved to 0.5056, which is precisely the train/serve skew
# this module exists to prevent.  A comment saying "keep in sync" did not keep
# them in sync, so the pairing is now asserted by a test that parses THIS FILE
# and compares it against the TS source:
#     __tests__/python-mirror-contract.test.ts
# Change a value here and the TS value must move in the same commit, or CI
# fails.  Do not add a second copy of any of these anywhere else in Python —
# import them from this module.

LEAGUE_AVG_NRFI = 0.5056                     # game-level P(no run in the 1st)
LEAGUE_HALF_NRFI = math.sqrt(LEAGUE_AVG_NRFI)  # ≈ 0.7111 — HALF-INNING scoreless rate

# lib/api/shared-helpers.ts: league runs per half-first-inning and the derived
# coefficient anchoring estimateNrfiRateFromFirstInningRuns(league) == LEAGUE_HALF_NRFI.
LEAGUE_FIRST_INNING_RUNS_PER_HALF = 0.52
RUNS_COEF = -math.log(LEAGUE_HALF_NRFI) / LEAGUE_FIRST_INNING_RUNS_PER_HALF  # ≈ 0.6364

# lib/nrfi-engine.ts final blend: nrfiProb = BLEND × calibrated + (1−BLEND) × ANCHOR.
# Under the identity calibration the anchor equals the raw league rate.
ENSEMBLE_BLEND = 0.76
LEAGUE_ANCHOR = LEAGUE_AVG_NRFI
FINAL_CLAMP_MIN = 0.18
FINAL_CLAMP_MAX = 0.85


# ─── Pitcher NRFI rate + shrinkage (serving parity) ───────────────────────────

def estimate_nrfi_rate_from_first_inning_runs(runs_per_first_inning: float) -> float:
    """Port of estimateNrfiRateFromFirstInningRuns (lib/api/shared-helpers.ts).

    P(scoreless half) ≈ e^(−c·r) with c anchored so the league rate (0.52
    runs/half) maps exactly to LEAGUE_HALF_NRFI.  The serving path derives the
    pitcher's nrfiRate this way from the sitCodes=i01 split — the builder must
    apply the same transform to its Statcast-derived runs-per-first-inning, NOT
    use the raw empirical scoreless fraction (different mean and spread).
    """
    if not math.isfinite(runs_per_first_inning) or runs_per_first_inning < 0:
        return LEAGUE_HALF_NRFI
    return min(0.92, max(0.45, math.exp(-runs_per_first_inning * RUNS_COEF)))


def dynamic_prior_weight(start_count: int, is_bullpen: bool = False,
                         career_first_innings: float | None = None) -> int:
    """Port of getDynamicPriorWeight (lib/nrfi-models.ts).

    Serving fallback: careerFirstInnings ?? startCount × 3.  Note that a full
    33-start season gives 99 < 100, so in-season live predictions effectively
    always use k = 30 for non-bullpen pitchers — the builder must match that,
    not the nominal k = 50 default.
    """
    if is_bullpen:
        return 80
    career = career_first_innings if career_first_innings is not None else start_count * 3
    if career < 100:
        return 30
    return 50


def apply_dynamic_shrinkage(observed_rate: float, start_count: int,
                            prior_weight: int) -> float:
    """Port of applyDynamicShrinkage (lib/nrfi-models.ts).

    Shrinks the HALF-INNING scoreless rate toward LEAGUE_HALF_NRFI (≈ 0.711).
    The legacy builder shrank toward the GAME-level 0.516 with k = 1.14 — a
    scale error (the exact P0-1 bug, reintroduced in the training pipeline)
    that gave the training column a different mean (≈ 0.69 vs ≈ 0.72) and
    2.2× the spread of the serving feature.
    """
    n = start_count if start_count > 0 else 1
    shrunk = (observed_rate * n + LEAGUE_HALF_NRFI * prior_weight) / (n + prior_weight)
    return max(0.35, min(0.92, shrunk))


def serving_shrunk_nrfi(runs_per_first_inning: float | None, start_count: int,
                        is_bullpen: bool = False) -> float | None:
    """Full serving-parity pipeline: runs/1st → rate estimate → EB shrinkage.

    Returns None when there is no observed data (caller imputes the default).
    """
    if runs_per_first_inning is None or start_count <= 0:
        return None
    rate = estimate_nrfi_rate_from_first_inning_runs(runs_per_first_inning)
    k = dynamic_prior_weight(start_count, is_bullpen=is_bullpen)
    return apply_dynamic_shrinkage(rate, start_count, k)


# ─── Wind token (serving parity) ──────────────────────────────────────────────

def wind_in_out_token(wind_mph: float, wind_from_deg: float,
                      cf_bearing_deg: float | None) -> float:
    """Port of mapWindDirection (lib/api/weather.ts) → serving feature encoding.

    The serving feature `weather_wind_in_out` is the token mapped to ±1/0:
      "out" → +1, "in" → −1, "crosswind"/"calm" → 0.

    Sector logic (identical to the TS source):
      - speed < 3 mph                      → calm      → 0
      - unknown CF bearing                 → crosswind → 0
      - fromDeg = (cfBearing + 180) % 360  (wind must blow FROM the direction
        opposite CF to travel OUT toward CF)
      - relDeg  = (wind_from_deg − fromDeg) % 360
      - relDeg ≤ 45 or ≥ 315               → out  → +1
      - 135 ≤ relDeg ≤ 225                 → in   → −1
      - otherwise                          → crosswind → 0

    The legacy builder emitted `wind_mph × cos(wind_from_deg)` — wrong scale
    (±30 vs ±1), park orientation ignored (assumed CF = true north for all 30
    stadiums), and sign inverted relative to this convention (wind blowing
    FROM the CF bearing travels toward home plate = "in", not "out").
    """
    if wind_mph < 3:
        return 0.0
    if cf_bearing_deg is None:
        return 0.0
    from_deg = (cf_bearing_deg + 180.0) % 360.0
    rel_deg = (wind_from_deg - from_deg + 360.0) % 360.0
    if rel_deg <= 45.0 or rel_deg >= 315.0:
        return 1.0
    if 135.0 <= rel_deg <= 225.0:
        return -1.0
    return 0.0


# ─── League-anchor inversion for the ensemble7_nrfi feature ───────────────────

def invert_league_anchor(final_prob: float) -> float:
    """Recover the pre-anchor calibrated ensemble value from the stored final
    headline probability.

    The DB's ModelPrediction.ensembleNrfi is the FINAL output:
        final = clamp(BLEND × calibrated7 + (1−BLEND) × ANCHOR, 0.18, 0.85)
    while the serving path feeds the stacker the PRE-anchor `calibrated7`
    (lib/nrfi-engine.ts passes it into buildDeepNrfiFeatures explicitly so the
    anchor is applied exactly once).  Training on the final value therefore
    compresses the feature by a factor of BLEND around the anchor — up to
    ±0.056 absolute over the realistic range.

    VALIDITY: this inversion is exact only while lib/calibration.ts is the
    identity mapping (the current state — see AUDIT_FIXES.md P1-4).  Once
    non-identity knots ship, the engine should store calibrated7 directly
    (new column) instead of relying on inversion.  Values that hit the final
    clamp (outside [0.18, 0.85]) cannot be recovered exactly; they are mapped
    to the clamp-boundary preimage.
    """
    if not math.isfinite(final_prob):
        return LEAGUE_AVG_NRFI
    p = min(FINAL_CLAMP_MAX, max(FINAL_CLAMP_MIN, final_prob))
    raw = (p - (1.0 - ENSEMBLE_BLEND) * LEAGUE_ANCHOR) / ENSEMBLE_BLEND
    return min(0.98, max(0.02, raw))
