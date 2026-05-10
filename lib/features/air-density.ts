/**
 * Air-density calculator for batted-ball carry.
 *
 * Lower density = ball travels farther. Used as a context feature for DeepNRFI
 * and as a multiplier candidate for the existing weather model.
 *
 * Formula: ρ = (P_d / (R_d × T)) + (P_v / (R_v × T))
 * where P_d is partial pressure of dry air, P_v is partial pressure of water
 * vapor (Tetens equation), and T is absolute temperature in Kelvin.
 */

export interface AirDensityInputs {
  /** Temperature in Fahrenheit. */
  tempF: number
  /** Relative humidity, percentage 0-100. */
  humidity: number
  /** Stadium elevation in feet (used to estimate pressure when absent). */
  elevationFt: number
  /** Atmospheric pressure in hPa. When absent, derived from elevation. */
  pressureHPa?: number
}

const R_DRY = 287.058  // J/(kg·K)
const R_VAPOR = 461.495 // J/(kg·K)

/** Tetens equation: saturation vapor pressure in hPa for temperature in °C. */
function saturationVaporPressureHPa(tempC: number): number {
  return 6.1078 * Math.exp((17.27 * tempC) / (tempC + 237.3))
}

/** Standard atmosphere pressure (hPa) at a given altitude in feet. */
function pressureAtElevation(elevationFt: number): number {
  const elevM = elevationFt * 0.3048
  return 1013.25 * Math.pow(1 - 2.25577e-5 * elevM, 5.25588)
}

/**
 * Compute moist-air density in kg/m³.
 *
 * Sea-level standard: ~1.225 kg/m³.  Coors Field at 75°F / 50% RH ≈ ~1.00 kg/m³.
 * The dome default (72°F, 50% RH, sea level) lands at ~1.18 kg/m³.
 */
export function computeAirDensity({ tempF, humidity, elevationFt, pressureHPa }: AirDensityInputs): number {
  const tempC = (tempF - 32) * (5 / 9)
  const tempK = tempC + 273.15
  const totalP = (pressureHPa ?? pressureAtElevation(elevationFt)) * 100  // Pa
  const psat = saturationVaporPressureHPa(tempC) * 100  // Pa
  const rh = Math.max(0, Math.min(100, humidity)) / 100
  const pVapor = rh * psat
  const pDry = totalP - pVapor
  return pDry / (R_DRY * tempK) + pVapor / (R_VAPOR * tempK)
}
