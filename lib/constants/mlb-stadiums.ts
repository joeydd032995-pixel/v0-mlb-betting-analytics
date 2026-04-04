export interface StadiumInfo {
  lat: number
  lon: number
  isDome: boolean
  parkFactor: number
}

/** Keyed by venue name string (as returned by API-Sports) */
export const MLB_STADIUMS: Record<string, StadiumInfo> = {
  // AL East
  "Oriole Park at Camden Yards": { lat: 39.2838, lon: -76.6218, isDome: false, parkFactor: 1.00 },
  "Fenway Park": { lat: 42.3467, lon: -71.0972, isDome: false, parkFactor: 1.05 },
  "Yankee Stadium": { lat: 40.8296, lon: -73.9262, isDome: false, parkFactor: 1.03 },
  "Tropicana Field": { lat: 27.7683, lon: -82.6534, isDome: true, parkFactor: 0.95 },
  "Rogers Centre": { lat: 43.6414, lon: -79.3894, isDome: true, parkFactor: 1.00 },
  // AL Central
  "Guaranteed Rate Field": { lat: 41.8300, lon: -87.6338, isDome: false, parkFactor: 1.05 },
  "Progressive Field": { lat: 41.4962, lon: -81.6852, isDome: false, parkFactor: 0.96 },
  "Comerica Park": { lat: 42.3390, lon: -83.0485, isDome: false, parkFactor: 0.94 },
  "Kauffman Stadium": { lat: 39.0517, lon: -94.4803, isDome: false, parkFactor: 0.97 },
  "Target Field": { lat: 44.9817, lon: -93.2781, isDome: false, parkFactor: 0.98 },
  // AL West
  "Minute Maid Park": { lat: 29.7572, lon: -95.3556, isDome: true, parkFactor: 1.02 },
  "Angel Stadium": { lat: 33.8003, lon: -117.8827, isDome: false, parkFactor: 0.96 },
  "Oakland Coliseum": { lat: 37.7516, lon: -122.2005, isDome: false, parkFactor: 0.94 },
  "T-Mobile Park": { lat: 47.5914, lon: -122.3325, isDome: false, parkFactor: 0.93 },
  "Globe Life Field": { lat: 32.7473, lon: -97.0845, isDome: true, parkFactor: 1.01 },
  // NL East
  "Truist Park": { lat: 33.8908, lon: -84.4678, isDome: false, parkFactor: 1.02 },
  "loanDepot park": { lat: 25.7781, lon: -80.2196, isDome: true, parkFactor: 0.93 },
  "Citi Field": { lat: 40.7571, lon: -73.8458, isDome: false, parkFactor: 0.96 },
  "Citizens Bank Park": { lat: 39.9061, lon: -75.1665, isDome: false, parkFactor: 1.08 },
  "Nationals Park": { lat: 38.8730, lon: -77.0074, isDome: false, parkFactor: 1.00 },
  // NL Central
  "Wrigley Field": { lat: 41.9484, lon: -87.6553, isDome: false, parkFactor: 1.07 },
  "Great American Ball Park": { lat: 39.0978, lon: -84.5080, isDome: false, parkFactor: 1.12 },
  "American Family Field": { lat: 43.0280, lon: -87.9712, isDome: true, parkFactor: 0.98 },
  "PNC Park": { lat: 40.4469, lon: -80.0057, isDome: false, parkFactor: 0.99 },
  "Busch Stadium": { lat: 38.6226, lon: -90.1928, isDome: false, parkFactor: 0.98 },
  // NL West
  "Chase Field": { lat: 33.4453, lon: -112.0667, isDome: true, parkFactor: 1.05 },
  "Coors Field": { lat: 39.7559, lon: -104.9942, isDome: false, parkFactor: 1.15 },
  "Dodger Stadium": { lat: 34.0739, lon: -118.2400, isDome: false, parkFactor: 0.96 },
  "Petco Park": { lat: 32.7073, lon: -117.1566, isDome: false, parkFactor: 0.87 },
  "Oracle Park": { lat: 37.7786, lon: -122.3893, isDome: false, parkFactor: 0.91 },
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
 * Simplified wind carry direction.
 * "out-to-cf" = wind blowing out to center field is meaningful (e.g., Wrigley, Coors)
 * "unknown" = insufficient info or dome
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
