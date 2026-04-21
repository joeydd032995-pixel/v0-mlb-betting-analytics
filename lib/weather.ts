/**
 * Enhanced Vector Weather Model (Opt #3)
 *
 * Replaces the scalar wind model (multiplier based on a plain "out/in" flag)
 * with a vector projection: effective wind = windSpeed × cos(θ_wind − θ_park).
 * Humidity dampens the ball-carry effect (humid air is denser and reduces carry).
 *
 * The existing Weather type uses WindDirection = "in" | "out" | "crosswind" | "calm"
 * (relative to the park, not compass degrees).  We map those tokens to relative
 * angles so the cosine formula produces physically correct scaling:
 *
 *   "out"       →   0° (directly to outfield)   → cos = +1.0  (max carry boost)
 *   "crosswind" →  90°                           → cos =  0.0  (no net effect)
 *   "in"        → 180° (blowing toward home)     → cos = −1.0  (suppresses scoring)
 *   "calm"      →   0° but windSpeed ≈ 0                        (no effect)
 *
 * parkOrientation (degrees) shifts the reference frame for stadiums where the
 * cardinal orientation of the diamond matters (e.g. Coors Field faces northeast).
 * When the existing Weather.windDirection is already park-relative (the common
 * case for MLB data), pass parkOrientation = 0 (the default).
 *
 * Formula:
 *   windEffect    = windSpeed × cos((windDeg − parkOrientation) × π / 180)
 *   humidityEffect = 1 − (humidity / 100) × 0.08
 *   multiplier    = clamp(1 + windEffect × 0.012 × humidityEffect, 0.82, 1.22)
 */

import type { Weather } from "./types"

/** Maps the park-relative WindDirection token to degrees (0 = straight out). */
const WIND_DIR_DEG: Record<string, number> = {
  out:       0,
  crosswind: 90,
  in:        180,
  calm:      0,
}

/**
 * Compute a run-scoring multiplier from weather using vector wind projection.
 *
 * @param weather         The game's weather object (from types.ts).
 * @param parkOrientation Compass bearing of the outfield in degrees (default 0).
 *                        Use 0 when windDirection is already park-relative.
 * @returns               Multiplier in [0.82, 1.22].
 *                        > 1.0 = more expected runs; < 1.0 = fewer expected runs.
 */
export function computeVectorWeatherMultiplier(
  weather: Weather,
  parkOrientation = 0
): number {
  if (weather.conditions === "dome") return 1.0

  const windDeg      = WIND_DIR_DEG[weather.windDirection] ?? 0
  const relAngleRad  = (windDeg - parkOrientation) * (Math.PI / 180)
  const windEffect   = weather.windSpeed * Math.cos(relAngleRad)
  const humidityEffect = 1 - (weather.humidity / 100) * 0.08

  return Math.max(0.82, Math.min(1.22, 1 + windEffect * 0.012 * humidityEffect))
}
