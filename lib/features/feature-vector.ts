/**
 * Builds the flat numeric DeepNRFI feature vector from the same inputs the
 * existing engine consumes.  Pure function — no I/O — safe to call inside
 * computeNRFIPrediction.
 *
 * Every field has a documented default so DeepNRFI can score even when
 * Statcast / lineup / umpire data is missing.  A parallel presence mask
 * (1 = real data, 0 = imputed default) is returned so the trainer can
 * down-weight imputed inputs and the UI can flag low-information cells.
 */

import type {
  Game,
  Pitcher,
  Team,
  Weather,
  DeepNrfiFeatureVector,
  DeepNrfiFeaturePresence,
} from "../types"
import { applyDynamicShrinkage, getDynamicPriorWeight, getLineupVsHand, LEAGUE_AVG_NRFI } from "../nrfi-models"
import { computeAirDensity } from "./air-density"
import { getExtendedParkFactor } from "./park-factors-extended"
import { getUmpireProfile } from "./umpire-zone"

/** League-average defaults used when a real value isn't available. */
const DEFAULTS = {
  k_rate: 0.225,
  bb_rate: 0.085,
  hr_per9: 1.20,
  babip: 0.295,
  first_batter_obp: 0.314,
  start_count: 0,
  recent_form: 0.515,
  fb_velo: 93.5,
  fb_spin: 2300,
  breaking_pct: 0.30,
  stuff_plus: 100,
  pitches_last5: 480,
  days_rest: 5,
  rolling3_ip: 5.5,
  vstop_woba: 0.330,
  vstop_k: 0.22,
  top4_ops: 0.760,
  top4_wrcplus: 110,
  top4_k_pct: 0.22,
  top4_bb_pct: 0.09,
  weather_temp_f: 72,
  weather_pressure_hpa: 1013.25,
  weather_air_density: 1.18,
  weather_humidity: 50,
  weather_precip_prob: 0,
} as const

/** Presence bit pattern used by every field; mirrors DeepNrfiFeatureVector keys. */
type PresenceMap = Partial<DeepNrfiFeaturePresence>

function recentForm(p: Pitcher): { value: number; present: boolean } {
  const r = p.firstInning.last5Results
  if (!r || r.length < 3) return { value: DEFAULTS.recent_form, present: false }
  return { value: r.filter(Boolean).length / r.length, present: true }
}

function pitcherFeatures(p: Pitcher | undefined, prefix: "home_pitcher" | "away_pitcher", presence: PresenceMap): Record<string, number> {
  if (!p) {
    // Pitcher missing — shouldn't happen because the engine returns null first,
    // but keep defensive defaults for safety.  Mark every field absent.
    const out: Record<string, number> = {}
    out[`${prefix}_shrunk_nrfi`] = LEAGUE_AVG_NRFI
    out[`${prefix}_k_rate`] = DEFAULTS.k_rate
    out[`${prefix}_bb_rate`] = DEFAULTS.bb_rate
    out[`${prefix}_hr_per9`] = DEFAULTS.hr_per9
    out[`${prefix}_babip`] = DEFAULTS.babip
    out[`${prefix}_first_batter_obp`] = DEFAULTS.first_batter_obp
    out[`${prefix}_start_count`] = DEFAULTS.start_count
    out[`${prefix}_recent_form`] = DEFAULTS.recent_form
    out[`${prefix}_fb_velo`] = DEFAULTS.fb_velo
    out[`${prefix}_fb_spin`] = DEFAULTS.fb_spin
    out[`${prefix}_breaking_pct`] = DEFAULTS.breaking_pct
    out[`${prefix}_stuff_plus`] = DEFAULTS.stuff_plus
    out[`${prefix}_pitches_last5`] = DEFAULTS.pitches_last5
    out[`${prefix}_days_rest`] = DEFAULTS.days_rest
    out[`${prefix}_rolling3_ip`] = DEFAULTS.rolling3_ip
    out[`${prefix}_vstop_woba`] = DEFAULTS.vstop_woba
    out[`${prefix}_vstop_k`] = DEFAULTS.vstop_k
    out[`${prefix}_is_bullpen`] = 0
    return out
  }

  const shrunk = applyDynamicShrinkage(p, getDynamicPriorWeight(p))
  const fi = p.firstInning
  const sc = p.statcast
  const ft = p.fatigue
  const sp = p.firstInningSplits?.vsTopOfOrder
  const rf = recentForm(p)

  const set = (key: string, value: number, present: boolean) => {
    presence[key as keyof DeepNrfiFeaturePresence] = present ? 1 : 0
    return value
  }

  return {
    [`${prefix}_shrunk_nrfi`]:        set(`${prefix}_shrunk_nrfi`,        shrunk,                                   true),
    [`${prefix}_k_rate`]:             set(`${prefix}_k_rate`,             fi.kRate,                                 true),
    [`${prefix}_bb_rate`]:            set(`${prefix}_bb_rate`,            fi.bbRate,                                true),
    [`${prefix}_hr_per9`]:            set(`${prefix}_hr_per9`,            fi.hrPer9,                                true),
    [`${prefix}_babip`]:              set(`${prefix}_babip`,              fi.babip,                                 true),
    [`${prefix}_first_batter_obp`]:   set(`${prefix}_first_batter_obp`,   fi.firstBatterOBP,                        true),
    [`${prefix}_start_count`]:        set(`${prefix}_start_count`,        fi.startCount,                            true),
    [`${prefix}_recent_form`]:        set(`${prefix}_recent_form`,        rf.value,                                 rf.present),
    [`${prefix}_fb_velo`]:            set(`${prefix}_fb_velo`,            sc?.fbVeloAvg ?? DEFAULTS.fb_velo,        sc !== undefined),
    [`${prefix}_fb_spin`]:            set(`${prefix}_fb_spin`,            sc?.fbSpinAvg ?? DEFAULTS.fb_spin,        sc !== undefined),
    [`${prefix}_breaking_pct`]:       set(`${prefix}_breaking_pct`,       sc?.breaking_pct ?? DEFAULTS.breaking_pct, sc !== undefined),
    [`${prefix}_stuff_plus`]:         set(`${prefix}_stuff_plus`,         sc?.stuffPlus ?? DEFAULTS.stuff_plus,     sc !== undefined),
    [`${prefix}_pitches_last5`]:      set(`${prefix}_pitches_last5`,      ft?.pitchesLast5 ?? DEFAULTS.pitches_last5, ft !== undefined),
    [`${prefix}_days_rest`]:          set(`${prefix}_days_rest`,          ft?.daysRest ?? DEFAULTS.days_rest,       ft !== undefined),
    [`${prefix}_rolling3_ip`]:        set(`${prefix}_rolling3_ip`,        ft?.rolling3StartIP ?? DEFAULTS.rolling3_ip, ft !== undefined),
    [`${prefix}_vstop_woba`]:         set(`${prefix}_vstop_woba`,         sp?.wobaAllowed ?? DEFAULTS.vstop_woba,   sp !== undefined),
    [`${prefix}_vstop_k`]:            set(`${prefix}_vstop_k`,            sp?.k_pct ?? DEFAULTS.vstop_k,            sp !== undefined),
    [`${prefix}_is_bullpen`]:         set(`${prefix}_is_bullpen`,         p.isBullpenGame ? 1 : 0,                  p.isBullpenGame !== undefined),
  }
}

function teamTopFour(team: Team, prefix: "home_top4" | "away_top4", presence: PresenceMap): Record<string, number> {
  const tf = team.firstInning.topFour
  const set = (key: string, value: number, present: boolean) => {
    presence[key as keyof DeepNrfiFeaturePresence] = present ? 1 : 0
    return value
  }
  return {
    [`${prefix}_ops`]:      set(`${prefix}_ops`,      tf?.ops      ?? DEFAULTS.top4_ops,      tf !== undefined),
    [`${prefix}_wrcplus`]:  set(`${prefix}_wrcplus`,  tf?.wRC_plus ?? DEFAULTS.top4_wrcplus,  tf !== undefined),
    [`${prefix}_k_pct`]:    set(`${prefix}_k_pct`,    tf?.k_pct    ?? DEFAULTS.top4_k_pct,    tf !== undefined),
    [`${prefix}_bb_pct`]:   set(`${prefix}_bb_pct`,   tf?.bb_pct   ?? DEFAULTS.top4_bb_pct,   tf !== undefined),
  }
}

function weatherFeatures(w: Weather, elevationFt: number, isDome: boolean, presence: PresenceMap): Record<string, number> {
  const tempF = isDome ? DEFAULTS.weather_temp_f : (w.temperature ?? DEFAULTS.weather_temp_f)
  const humidity = isDome ? DEFAULTS.weather_humidity : (w.humidity ?? DEFAULTS.weather_humidity)
  const pressure = w.pressureHPa ?? undefined
  const density = w.airDensity ?? computeAirDensity({ tempF, humidity, elevationFt, pressureHPa: pressure })
  const windSigned =
    w.windDirection === "out" ? +1 :
    w.windDirection === "in"  ? -1 : 0

  const set = (key: string, value: number, present: boolean) => {
    presence[key as keyof DeepNrfiFeaturePresence] = present ? 1 : 0
    return value
  }
  return {
    weather_temp_f:        set("weather_temp_f",        tempF,                              !isDome),
    weather_wind_mph:      set("weather_wind_mph",      isDome ? 0 : (w.windSpeed ?? 0),    !isDome),
    weather_wind_in_out:   set("weather_wind_in_out",   isDome ? 0 : windSigned,            !isDome),
    weather_humidity:      set("weather_humidity",      humidity,                           !isDome),
    weather_precip_prob:   set("weather_precip_prob",   w.precipProb ?? DEFAULTS.weather_precip_prob, w.precipProb !== undefined),
    weather_pressure_hpa:  set("weather_pressure_hpa",  pressure ?? DEFAULTS.weather_pressure_hpa, pressure !== undefined),
    weather_air_density:   set("weather_air_density",   density,                            true),
    is_dome:               set("is_dome",               isDome ? 1 : 0,                     true),
  }
}

export interface BuildFeaturesArgs {
  game: Game
  homePitcher: Pitcher
  awayPitcher: Pitcher
  homeTeam: Team
  awayTeam: Team
  /** Optional 7-model ensemble probability — included in the feature vector for stacking. */
  ensemble7Nrfi?: number
}

export interface BuildFeaturesResult {
  vector: DeepNrfiFeatureVector
  presence: DeepNrfiFeaturePresence
}

/**
 * Build the DeepNRFI feature vector and its presence mask.
 *
 * Deterministic and side-effect free.  All optional inputs degrade to
 * documented league-average defaults with presence=0.
 */
export function buildDeepNrfiFeatures(args: BuildFeaturesArgs): BuildFeaturesResult {
  const { game, homePitcher, awayPitcher, homeTeam, awayTeam, ensemble7Nrfi } = args
  const presence: PresenceMap = {}

  const isDome = game.weather.conditions === "dome"
  const park = getExtendedParkFactor(game.venue)
  const ump = getUmpireProfile(game.umpireId)

  // Pitchers
  const home = pitcherFeatures(homePitcher, "home_pitcher", presence)
  const away = pitcherFeatures(awayPitcher, "away_pitcher", presence)

  // Lineup
  const homeTop4 = teamTopFour(homeTeam, "home_top4", presence)
  const awayTop4 = teamTopFour(awayTeam, "away_top4", presence)

  // Weather + park + umpire
  const weather = weatherFeatures(game.weather, park.elevationFt, isDome, presence)

  const set = (key: keyof DeepNrfiFeatureVector, value: number, present: boolean) => {
    presence[key] = present ? 1 : 0
    return value
  }

  const vector: DeepNrfiFeatureVector = {
    ...(home as Pick<DeepNrfiFeatureVector,
      | "home_pitcher_shrunk_nrfi" | "home_pitcher_k_rate" | "home_pitcher_bb_rate"
      | "home_pitcher_hr_per9" | "home_pitcher_babip" | "home_pitcher_first_batter_obp"
      | "home_pitcher_start_count" | "home_pitcher_recent_form" | "home_pitcher_fb_velo"
      | "home_pitcher_fb_spin" | "home_pitcher_breaking_pct" | "home_pitcher_stuff_plus"
      | "home_pitcher_pitches_last5" | "home_pitcher_days_rest" | "home_pitcher_rolling3_ip"
      | "home_pitcher_vstop_woba" | "home_pitcher_vstop_k" | "home_pitcher_is_bullpen">),
    ...(away as Pick<DeepNrfiFeatureVector,
      | "away_pitcher_shrunk_nrfi" | "away_pitcher_k_rate" | "away_pitcher_bb_rate"
      | "away_pitcher_hr_per9" | "away_pitcher_babip" | "away_pitcher_first_batter_obp"
      | "away_pitcher_start_count" | "away_pitcher_recent_form" | "away_pitcher_fb_velo"
      | "away_pitcher_fb_spin" | "away_pitcher_breaking_pct" | "away_pitcher_stuff_plus"
      | "away_pitcher_pitches_last5" | "away_pitcher_days_rest" | "away_pitcher_rolling3_ip"
      | "away_pitcher_vstop_woba" | "away_pitcher_vstop_k" | "away_pitcher_is_bullpen">),
    ...(homeTop4 as Pick<DeepNrfiFeatureVector,
      | "home_top4_ops" | "home_top4_wrcplus" | "home_top4_k_pct" | "home_top4_bb_pct">),
    ...(awayTop4 as Pick<DeepNrfiFeatureVector,
      | "away_top4_ops" | "away_top4_wrcplus" | "away_top4_k_pct" | "away_top4_bb_pct">),
    home_offense_factor: set("home_offense_factor", homeTeam.firstInning.offenseFactor, true),
    away_offense_factor: set("away_offense_factor", awayTeam.firstInning.offenseFactor, true),
    home_offense_vs_hand: set("home_offense_vs_hand", getLineupVsHand(awayPitcher.throws, homeTeam),
      homeTeam.firstInning.vsLHP !== undefined || homeTeam.firstInning.vsRHP !== undefined),
    away_offense_vs_hand: set("away_offense_vs_hand", getLineupVsHand(homePitcher.throws, awayTeam),
      awayTeam.firstInning.vsLHP !== undefined || awayTeam.firstInning.vsRHP !== undefined),
    ...(weather as Pick<DeepNrfiFeatureVector,
      | "weather_temp_f" | "weather_wind_mph" | "weather_wind_in_out" | "weather_humidity"
      | "weather_precip_prob" | "weather_pressure_hpa" | "weather_air_density" | "is_dome">),
    park_factor:              set("park_factor",              game.parkFactor,                true),
    park_first_inning_runs:   set("park_first_inning_runs",   park.firstInningRunsFactor,     true),
    park_hr_factor:           set("park_hr_factor",           park.hrFactor,                  true),
    park_elevation_ft:        set("park_elevation_ft",        park.elevationFt,               park.elevationFt > 0),
    umpire_zone_tightness:    set("umpire_zone_tightness",    ump.zoneTightness,              ump.sample > 0),
    umpire_career_nrfi:       set("umpire_career_nrfi",       ump.careerNrfi,                 ump.sample > 0),
    umpire_sample:            set("umpire_sample",            ump.sample,                     ump.sample > 0),
    home_rest_days:           set("home_rest_days",           game.restDays?.home ?? 5,       game.restDays !== undefined),
    away_rest_days:           set("away_rest_days",           game.restDays?.away ?? 5,       game.restDays !== undefined),
    home_travel_miles:        set("home_travel_miles",        game.travelMiles?.home ?? 0,    game.travelMiles !== undefined),
    away_travel_miles:        set("away_travel_miles",        game.travelMiles?.away ?? 0,    game.travelMiles !== undefined),
    is_bullpen_game:          set("is_bullpen_game",
      game.bullpenStart?.home || game.bullpenStart?.away ? 1 : 0,
      game.bullpenStart !== undefined),
    ensemble7_nrfi:           set("ensemble7_nrfi",           ensemble7Nrfi ?? LEAGUE_AVG_NRFI, ensemble7Nrfi !== undefined),
  }

  // Coerce presence into a fully-populated record (any unset key defaults to 0).
  const fullPresence = Object.fromEntries(
    (Object.keys(vector) as (keyof DeepNrfiFeatureVector)[]).map((k) => [k, presence[k] ?? 0]),
  ) as DeepNrfiFeaturePresence

  return { vector, presence: fullPresence }
}

/** Stable feature key order — used by the LightGBM artifact's manifest.json. */
export const FEATURE_ORDER: (keyof DeepNrfiFeatureVector)[] = [
  "home_pitcher_shrunk_nrfi", "home_pitcher_k_rate", "home_pitcher_bb_rate",
  "home_pitcher_hr_per9", "home_pitcher_babip", "home_pitcher_first_batter_obp",
  "home_pitcher_start_count", "home_pitcher_recent_form", "home_pitcher_fb_velo",
  "home_pitcher_fb_spin", "home_pitcher_breaking_pct", "home_pitcher_stuff_plus",
  "home_pitcher_pitches_last5", "home_pitcher_days_rest", "home_pitcher_rolling3_ip",
  "home_pitcher_vstop_woba", "home_pitcher_vstop_k", "home_pitcher_is_bullpen",
  "away_pitcher_shrunk_nrfi", "away_pitcher_k_rate", "away_pitcher_bb_rate",
  "away_pitcher_hr_per9", "away_pitcher_babip", "away_pitcher_first_batter_obp",
  "away_pitcher_start_count", "away_pitcher_recent_form", "away_pitcher_fb_velo",
  "away_pitcher_fb_spin", "away_pitcher_breaking_pct", "away_pitcher_stuff_plus",
  "away_pitcher_pitches_last5", "away_pitcher_days_rest", "away_pitcher_rolling3_ip",
  "away_pitcher_vstop_woba", "away_pitcher_vstop_k", "away_pitcher_is_bullpen",
  "home_top4_ops", "home_top4_wrcplus", "home_top4_k_pct", "home_top4_bb_pct",
  "away_top4_ops", "away_top4_wrcplus", "away_top4_k_pct", "away_top4_bb_pct",
  "home_offense_factor", "away_offense_factor",
  "home_offense_vs_hand", "away_offense_vs_hand",
  "weather_temp_f", "weather_wind_mph", "weather_wind_in_out", "weather_humidity",
  "weather_precip_prob", "weather_pressure_hpa", "weather_air_density", "is_dome",
  "park_factor", "park_first_inning_runs", "park_hr_factor", "park_elevation_ft",
  "umpire_zone_tightness", "umpire_career_nrfi", "umpire_sample",
  "home_rest_days", "away_rest_days", "home_travel_miles", "away_travel_miles",
  "is_bullpen_game", "ensemble7_nrfi",
]
