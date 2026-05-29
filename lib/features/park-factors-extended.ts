/**
 * Extended park factors for the DeepNRFI feature vector.
 *
 * The base `MLB_STADIUMS` map only carries a single park factor.  Here we add
 * 1st-inning-specific run factor, HR factor, single factor, elevation, and roof
 * type so DeepNRFI and the air-density calculation can use them directly.
 *
 * Numbers are calibrated to recent (2023-2025) public park-factor publications
 * (Statcast park factors / FanGraphs).  When a venue is unknown we return
 * neutral values (1.00) and elevation 0 so the model degrades gracefully.
 */

export type RoofType = "open" | "dome" | "retractable"

export interface ExtendedParkFactor {
  /** General run-environment park factor (matches existing parkFactor). */
  runFactor: number
  /** 1st-inning-only run factor (slightly compressed vs full game). */
  firstInningRunsFactor: number
  /** HR park factor. */
  hrFactor: number
  /** Single park factor (singles tend to be less park-sensitive than HR). */
  singleFactor: number
  /** Stadium elevation in feet (used for air-density). */
  elevationFt: number
  roofType: RoofType
}

const NEUTRAL: Readonly<ExtendedParkFactor> = Object.freeze({
  runFactor: 1.0,
  firstInningRunsFactor: 1.0,
  hrFactor: 1.0,
  singleFactor: 1.0,
  elevationFt: 0,
  roofType: "open",
})

/** Park-factor lookup keyed by venue name (matches `MLB_STADIUMS` keys). */
export const EXTENDED_PARK_FACTORS: Record<string, ExtendedParkFactor> = {
  "Oriole Park at Camden Yards": { runFactor: 1.00, firstInningRunsFactor: 1.00, hrFactor: 1.05, singleFactor: 0.99, elevationFt:  20, roofType: "open" },
  "Fenway Park":                  { runFactor: 1.05, firstInningRunsFactor: 1.04, hrFactor: 0.97, singleFactor: 1.06, elevationFt:  21, roofType: "open" },
  "Yankee Stadium":               { runFactor: 1.03, firstInningRunsFactor: 1.02, hrFactor: 1.12, singleFactor: 0.99, elevationFt:  55, roofType: "open" },
  "Tropicana Field":              { runFactor: 0.95, firstInningRunsFactor: 0.96, hrFactor: 0.94, singleFactor: 0.98, elevationFt:  16, roofType: "dome" },
  "Rogers Centre":                { runFactor: 1.00, firstInningRunsFactor: 1.00, hrFactor: 1.04, singleFactor: 0.99, elevationFt:  300, roofType: "retractable" },
  "Guaranteed Rate Field":        { runFactor: 1.05, firstInningRunsFactor: 1.04, hrFactor: 1.10, singleFactor: 1.00, elevationFt:  595, roofType: "open" },
  "Progressive Field":            { runFactor: 0.96, firstInningRunsFactor: 0.97, hrFactor: 0.97, singleFactor: 0.98, elevationFt:  650, roofType: "open" },
  "Comerica Park":                { runFactor: 0.94, firstInningRunsFactor: 0.95, hrFactor: 0.92, singleFactor: 0.98, elevationFt:  600, roofType: "open" },
  "Kauffman Stadium":             { runFactor: 0.97, firstInningRunsFactor: 0.98, hrFactor: 0.92, singleFactor: 1.02, elevationFt:  750, roofType: "open" },
  "Target Field":                 { runFactor: 0.98, firstInningRunsFactor: 0.99, hrFactor: 0.96, singleFactor: 1.00, elevationFt:  815, roofType: "open" },
  "Minute Maid Park":             { runFactor: 1.02, firstInningRunsFactor: 1.01, hrFactor: 1.06, singleFactor: 1.00, elevationFt:  45, roofType: "retractable" },
  "Angel Stadium":                { runFactor: 0.96, firstInningRunsFactor: 0.97, hrFactor: 0.99, singleFactor: 0.98, elevationFt:  160, roofType: "open" },
  "Oakland Coliseum":             { runFactor: 0.94, firstInningRunsFactor: 0.95, hrFactor: 0.93, singleFactor: 0.97, elevationFt:  43, roofType: "open" },
  // Athletics relocated to Sacramento (2025+); keep Oakland Coliseum for historical backfill.
  "Sutter Health Park":           { runFactor: 0.97, firstInningRunsFactor: 0.97, hrFactor: 0.96, singleFactor: 0.99, elevationFt:  25, roofType: "open" },
  "T-Mobile Park":                { runFactor: 0.93, firstInningRunsFactor: 0.94, hrFactor: 0.91, singleFactor: 0.97, elevationFt:  10, roofType: "retractable" },
  "Globe Life Field":             { runFactor: 1.01, firstInningRunsFactor: 1.00, hrFactor: 1.02, singleFactor: 1.00, elevationFt:  551, roofType: "retractable" },
  "Truist Park":                  { runFactor: 1.02, firstInningRunsFactor: 1.01, hrFactor: 1.04, singleFactor: 1.01, elevationFt: 1050, roofType: "open" },
  "loanDepot park":               { runFactor: 0.93, firstInningRunsFactor: 0.94, hrFactor: 0.85, singleFactor: 0.97, elevationFt:  10, roofType: "retractable" },
  "Citi Field":                   { runFactor: 0.96, firstInningRunsFactor: 0.97, hrFactor: 0.94, singleFactor: 0.99, elevationFt:  37, roofType: "open" },
  "Citizens Bank Park":           { runFactor: 1.08, firstInningRunsFactor: 1.06, hrFactor: 1.16, singleFactor: 1.01, elevationFt:  20, roofType: "open" },
  "Nationals Park":               { runFactor: 1.00, firstInningRunsFactor: 1.00, hrFactor: 1.02, singleFactor: 0.99, elevationFt:  25, roofType: "open" },
  "Wrigley Field":                { runFactor: 1.07, firstInningRunsFactor: 1.05, hrFactor: 1.05, singleFactor: 1.04, elevationFt:  600, roofType: "open" },
  "Great American Ball Park":     { runFactor: 1.12, firstInningRunsFactor: 1.09, hrFactor: 1.20, singleFactor: 1.02, elevationFt:  490, roofType: "open" },
  "American Family Field":        { runFactor: 0.98, firstInningRunsFactor: 0.99, hrFactor: 1.04, singleFactor: 0.97, elevationFt:  635, roofType: "retractable" },
  "PNC Park":                     { runFactor: 0.99, firstInningRunsFactor: 0.99, hrFactor: 0.93, singleFactor: 1.01, elevationFt:  725, roofType: "open" },
  "Busch Stadium":                { runFactor: 0.98, firstInningRunsFactor: 0.99, hrFactor: 0.92, singleFactor: 1.00, elevationFt:  465, roofType: "open" },
  "Chase Field":                  { runFactor: 1.05, firstInningRunsFactor: 1.03, hrFactor: 1.08, singleFactor: 1.02, elevationFt: 1059, roofType: "retractable" },
  "Coors Field":                  { runFactor: 1.15, firstInningRunsFactor: 1.10, hrFactor: 1.18, singleFactor: 1.10, elevationFt: 5183, roofType: "open" },
  "Dodger Stadium":               { runFactor: 0.96, firstInningRunsFactor: 0.97, hrFactor: 1.02, singleFactor: 0.96, elevationFt:  502, roofType: "open" },
  "Petco Park":                   { runFactor: 0.87, firstInningRunsFactor: 0.90, hrFactor: 0.84, singleFactor: 0.95, elevationFt:  62, roofType: "open" },
  "Oracle Park":                  { runFactor: 0.91, firstInningRunsFactor: 0.93, hrFactor: 0.80, singleFactor: 0.98, elevationFt:  10, roofType: "open" },
}

export function getExtendedParkFactor(venue: string | undefined): ExtendedParkFactor {
  const factor = venue ? EXTENDED_PARK_FACTORS[venue] : undefined
  // Return a shallow copy so callers can't mutate the shared lookup tables.
  return { ...(factor ?? NEUTRAL) }
}
