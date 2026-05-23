import { STADIUM_COORDS, STADIUM_IS_DOME, STADIUM_ORIENTATION } from "@/lib/constants/mlb-stadiums"
import type { Weather, WindDirection, WeatherCondition } from "@/lib/types"

const API_KEY = process.env.OPENWEATHER_API_KEY ?? ""
const BASE_URL = "https://api.openweathermap.org/data/2.5/weather"

interface OWMResponse {
  main: { temp: number; humidity: number; pressure?: number }
  wind: { speed: number; deg: number }
  weather: Array<{ id: number; main: string }>
  rain?: { "1h"?: number; "3h"?: number }
}

const DOME_WEATHER = {
  temperature: 72,
  windSpeed: 0,
  windDirection: "calm",
  conditions: "dome",
  humidity: 50,
} as const satisfies Weather

function mapWindDirection(degrees: number, speedMph: number, venue: string): WindDirection {
  if (speedMph < 3) return "calm"

  const orientation = STADIUM_ORIENTATION[venue] ?? "unknown"

  if (orientation === "out-to-cf") {
    // Wind from behind home plate blows toward CF = "out"
    if (degrees >= 315 || degrees <= 45) return "out"
    if (degrees >= 135 && degrees <= 225) return "in"
    return "crosswind"
  }

  return "crosswind"
}

function mapConditions(weatherId: number): WeatherCondition {
  if (weatherId === 800) return "clear"
  if (weatherId >= 801 && weatherId <= 803) return "cloudy"
  if (weatherId === 804) return "overcast"
  if (weatherId >= 200 && weatherId < 300) return "light-rain"  // thunderstorm
  if (weatherId >= 500 && weatherId < 600) return "light-rain"
  return "cloudy"
}

export async function fetchVenueWeather(venue: string): Promise<Weather> {
  // Return dome weather for domes or unknown venues
  if (STADIUM_IS_DOME[venue]) return DOME_WEATHER

  const coords = STADIUM_COORDS[venue]
  if (!coords) return DOME_WEATHER

  if (!API_KEY) {
    console.warn("[weather] OPENWEATHER_API_KEY is not set — using dome defaults")
    return DOME_WEATHER
  }

  try {
    const url = `${BASE_URL}?lat=${coords.lat}&lon=${coords.lon}&appid=${API_KEY}&units=imperial`
    const res = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      console.error(`[weather] HTTP ${res.status} for ${venue}`)
      return DOME_WEATHER
    }
    const data: OWMResponse = await res.json()

    const speedMph = Math.round(data.wind.speed)
    const weatherId = data.weather[0]?.id ?? 800
    // Treat any rain in the 1h/3h windows as a precipitation signal.  OWM does
    // not include POP on /weather; the value here is "is currently raining".
    const precipProb = (data.rain?.["1h"] ?? 0) > 0 || (data.rain?.["3h"] ?? 0) > 0 ? 0.6 : 0

    return {
      temperature: Math.round(data.main.temp),
      windSpeed: speedMph,
      windDirection: mapWindDirection(data.wind.deg, speedMph, venue),
      conditions: mapConditions(weatherId),
      humidity: data.main.humidity,
      precipProb,
      pressureHPa: data.main.pressure,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[weather] fetch error for ${venue}:`, msg)
    return DOME_WEATHER
  }
}

// ─── Open-Meteo Archive (free, no auth, historical back to 1940) ─────────────

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

interface OpenMeteoResponse {
  hourly: {
    time: string[]
    temperature_2m: number[]
    wind_speed_10m: number[]
    wind_direction_10m: number[]
    relative_humidity_2m: number[]
    pressure_msl: number[]
    precipitation: number[]
  }
}

function pickHourIndex(times: string[], targetHour = 19): number {
  // Open-Meteo returns ISO local timestamps when timezone=auto.
  // Pick the closest hour to first pitch (~7pm local).
  for (let i = 0; i < times.length; i++) {
    if (times[i].endsWith(`T${String(targetHour).padStart(2, "0")}:00`)) return i
  }
  return Math.min(targetHour, times.length - 1)
}

export async function fetchHistoricalWeather(venue: string, date: string): Promise<Weather> {
  if (STADIUM_IS_DOME[venue]) return DOME_WEATHER
  const coords = STADIUM_COORDS[venue]
  if (!coords) return DOME_WEATHER

  const params = new URLSearchParams({
    latitude:         String(coords.lat),
    longitude:        String(coords.lon),
    start_date:       date,
    end_date:         date,
    hourly:           "temperature_2m,wind_speed_10m,wind_direction_10m,relative_humidity_2m,pressure_msl,precipitation",
    timezone:         "auto",
    temperature_unit: "fahrenheit",
    wind_speed_unit:  "mph",
  })

  try {
    const res = await fetch(`${ARCHIVE_URL}?${params}`, {
      // Cache aggressively — archive data never changes.
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error(`[weather-archive] HTTP ${res.status} for ${venue} ${date}`)
      return DOME_WEATHER
    }
    const data = (await res.json()) as OpenMeteoResponse
    if (!data.hourly?.time?.length) return DOME_WEATHER

    const i = pickHourIndex(data.hourly.time)
    const temp     = Math.round(data.hourly.temperature_2m[i] ?? 72)
    const speedMph = Math.round(data.hourly.wind_speed_10m[i] ?? 0)
    const windDeg  = data.hourly.wind_direction_10m[i] ?? 0
    const humidity = Math.round(data.hourly.relative_humidity_2m[i] ?? 50)
    const pressure = data.hourly.pressure_msl[i] ?? 1013
    const precip   = data.hourly.precipitation[i] ?? 0

    return {
      temperature:    temp,
      windSpeed:      speedMph,
      windDirection:  mapWindDirection(windDeg, speedMph, venue),
      conditions:     precip > 0.5 ? "light-rain" : "clear",
      humidity,
      precipProb:     precip > 0 ? 0.6 : 0,
      pressureHPa:    Math.round(pressure),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[weather-archive] fetch error for ${venue} ${date}:`, msg)
    return DOME_WEATHER
  }
}
