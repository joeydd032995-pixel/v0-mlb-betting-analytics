export interface StadiumInfo {
  lat: number
  lon: number
  isDome: boolean
  parkFactor: number
  /** Compass bearing (degrees) from home plate to center field. 0=N 90=E 180=S 270=W.
   *  Used by the vector wind model to compute the park-relative wind angle. */
  cfBearing: number
}

/** Keyed by venue name string (as returned by MLB Stats API) */
export const MLB_STADIUMS: Record<string, StadiumInfo> = {
  // AL East
  "Oriole Park at Camden Yards": { lat: 39.2838, lon: -76.6218,  isDome: false, parkFactor: 1.00, cfBearing:  30 },
  "Fenway Park":                  { lat: 42.3467, lon: -71.0972,  isDome: false, parkFactor: 1.05, cfBearing:  55 },
  "Yankee Stadium":               { lat: 40.8296, lon: -73.9262,  isDome: false, parkFactor: 1.03, cfBearing: 215 },
  "Tropicana Field":              { lat: 27.7683, lon: -82.6534,  isDome: true,  parkFactor: 0.95, cfBearing:   0 },
  "Rogers Centre":                { lat: 43.6414, lon: -79.3894,  isDome: true,  parkFactor: 1.00, cfBearing:   0 },
  // AL Central
  "Guaranteed Rate Field":        { lat: 41.8300, lon: -87.6338,  isDome: false, parkFactor: 1.05, cfBearing: 280 },
  "Progressive Field":            { lat: 41.4962, lon: -81.6852,  isDome: false, parkFactor: 0.96, cfBearing:  10 },
  "Comerica Park":                { lat: 42.3390, lon: -83.0485,  isDome: false, parkFactor: 0.94, cfBearing: 185 },
  "Kauffman Stadium":             { lat: 39.0517, lon: -94.4803,  isDome: false, parkFactor: 0.97, cfBearing: 215 },
  "Target Field":                 { lat: 44.9817, lon: -93.2781,  isDome: false, parkFactor: 0.98, cfBearing: 330 },
  // AL West
  "Minute Maid Park":             { lat: 29.7572, lon: -95.3556,  isDome: true,  parkFactor: 1.02, cfBearing:   0 },
  "Angel Stadium":                { lat: 33.8003, lon: -117.8827, isDome: false, parkFactor: 0.96, cfBearing: 220 },
  // Athletics relocated to Sacramento for 2025 season. Keep Oakland Coliseum so that
  // historical backfill (2024 and earlier) resolves correct weather/parkFactor.
  "Oakland Coliseum":             { lat: 37.7516, lon: -122.2005, isDome: false, parkFactor: 0.94, cfBearing: 300 },
  "Sutter Health Park":           { lat: 38.5802, lon: -121.5023, isDome: false, parkFactor: 0.97, cfBearing: 200 },
  "T-Mobile Park":                { lat: 47.5914, lon: -122.3325, isDome: false, parkFactor: 0.93, cfBearing: 185 },
  "Globe Life Field":             { lat: 32.7473, lon: -97.0845,  isDome: true,  parkFactor: 1.01, cfBearing:   0 },
  // NL East
  "Truist Park":                  { lat: 33.8908, lon: -84.4678,  isDome: false, parkFactor: 1.02, cfBearing: 195 },
  "loanDepot park":               { lat: 25.7781, lon: -80.2196,  isDome: true,  parkFactor: 0.93, cfBearing:   0 },
  "Citi Field":                   { lat: 40.7571, lon: -73.8458,  isDome: false, parkFactor: 0.96, cfBearing: 100 },
  "Citizens Bank Park":           { lat: 39.9061, lon: -75.1665,  isDome: false, parkFactor: 1.08, cfBearing:  50 },
  "Nationals Park":               { lat: 38.8730, lon: -77.0074,  isDome: false, parkFactor: 1.00, cfBearing: 230 },
  // NL Central
  "Wrigley Field":                { lat: 41.9484, lon: -87.6553,  isDome: false, parkFactor: 1.07, cfBearing: 355 },
  "Great American Ball Park":     { lat: 39.0978, lon: -84.5080,  isDome: false, parkFactor: 1.12, cfBearing: 200 },
  "American Family Field":        { lat: 43.0280, lon: -87.9712,  isDome: true,  parkFactor: 0.98, cfBearing:   0 },
  "PNC Park":                     { lat: 40.4469, lon: -80.0057,  isDome: false, parkFactor: 0.99, cfBearing: 120 },
  "Busch Stadium":                { lat: 38.6226, lon: -90.1928,  isDome: false, parkFactor: 0.98, cfBearing: 200 },
  // NL West
  "Chase Field":                  { lat: 33.4453, lon: -112.0667, isDome: true,  parkFactor: 1.05, cfBearing:   0 },
  "Coors Field":                  { lat: 39.7559, lon: -104.9942, isDome: false, parkFactor: 1.15, cfBearing: 265 },
  "Dodger Stadium":               { lat: 34.0739, lon: -118.2400, isDome: false, parkFactor: 0.96, cfBearing: 200 },
  "Petco Park":                   { lat: 32.7073, lon: -117.1566, isDome: false, parkFactor: 0.87, cfBearing: 315 },
  "Oracle Park":                  { lat: 37.7786, lon: -122.3893, isDome: false, parkFactor: 0.91, cfBearing: 285 },
}

/** Park factor lookup by venue name */
export const STADIUM_PARK_FACTORS: Record<string, number> = Object.fromEntries(
  Object.entries(MLB_STADIUMS).map(([name, info]) => [name, info.parkFactor])
)

/** GPS coordinates lookup by venue name */
export const STADIUM_COORDS: Record<string, { lat: number; lon: number }> = Object.fromEntries(
  Object.entries(MLB_STADIUMS).map(([name, info]) => [name, { lat: info.lat, lon: info.lon }])
)

/** Dome status lookup by venue name */
export const STADIUM_IS_DOME: Record<string, boolean> = Object.fromEntries(
  Object.entries(MLB_STADIUMS).map(([name, info]) => [name, info.isDome])
)

/**
 * CF bearing (compass degrees from home plate to center field) by venue name.
 * Used by the vector wind model to convert OWM compass degrees to park-relative wind direction.
 * Domes have bearing 0 but are excluded by the dome check upstream.
 */
export const STADIUM_CF_BEARING: Record<string, number> = Object.fromEntries(
  Object.entries(MLB_STADIUMS).map(([name, info]) => [name, info.cfBearing])
)

/**
 * @deprecated Use STADIUM_CF_BEARING for numeric outfield bearings.
 * Kept for backward-compatibility; only Wrigley and Coors were ever populated.
 */
export const STADIUM_ORIENTATION: Record<string, "out-to-lf" | "out-to-cf" | "out-to-rf" | "unknown"> = {
  "Oriole Park at Camden Yards": "unknown",
  "Fenway Park": "unknown",
  "Yankee Stadium": "unknown",
  "Tropicana Field": "unknown",
  "Rogers Centre": "unknown",
  "Guaranteed Rate Field": "unknown",
  "Progressive Field": "unknown",
  "Comerica Park": "unknown",
  "Kauffman Stadium": "unknown",
  "Target Field": "unknown",
  "Minute Maid Park": "unknown",
  "Angel Stadium": "unknown",
  "Oakland Coliseum": "unknown",
  "Sutter Health Park": "unknown",
  "T-Mobile Park": "unknown",
  "Globe Life Field": "unknown",
  "Truist Park": "unknown",
  "loanDepot park": "unknown",
  "Citi Field": "unknown",
  "Citizens Bank Park": "unknown",
  "Nationals Park": "unknown",
  "Wrigley Field": "out-to-cf",
  "Great American Ball Park": "unknown",
  "American Family Field": "unknown",
  "PNC Park": "unknown",
  "Busch Stadium": "unknown",
  "Chase Field": "unknown",
  "Coors Field": "out-to-cf",
  "Dodger Stadium": "unknown",
  "Petco Park": "unknown",
  "Oracle Park": "unknown",
}
