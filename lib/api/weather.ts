import { STADIUM_COORDS, STADIUM_IS_DOME, STADIUM_ORIENTATION } from "../constants/mlb-stadiums"
import type { Weather, WindDirection, WeatherCondition } from "../types"

const API_KEY = process.env.OPENWEATHER_API_KEY ?? ""
const BASE_URL = "https://api.openweathermap.org/data/2.5/weather"

interface OWMResponse {
  main: { temp: number; humidity: number }
  wind: { speed: number; deg: number }
  weather: Array<{ id: number; main: string }>
}

const DOME_WEATHER: Weather = {
  temperature: 72,
  windSpeed: 0,
  windDirection: "calm",
  conditions: "dome",
  humidity: 50,
}

function mapWindDirection(degrees: number, speedMph: number, venue: string): WindDirection {
  if (speedMph < 3) return "calm"

  const orientation = STADIUM_ORIENTATION[venue] ?? "unknown"

  if (orientation === "out-to-cf") {
    // wind blowing from home plate toward CF = "out" when degrees roughly 315–45
    if ((degrees >= 315 || degrees <= 45)) return "out"
    if (degrees >= 135 && degrees <= 225) return "in"
    return "crosswind"
  }

  // For unknown orientation, default to crosswind
  return "crosswind"
}

function mapConditions(weatherId: number): WeatherCondition {
  if (weatherId === 800) return "clear"
  if (weatherId >= 801 && weatherId <= 803) return "cloudy"
  if (weatherId === 804) return "overcast"
  if (weatherId >= 500 && weatherId < 600) return "light-rain"
  return "cloudy"
}

export async function fetchVenueWeather(venue: string): Promise<Weather> {
  // Return dome weather for domes or unknown venues
  if (STADIUM_IS_DOME[venue]) return DOME_WEATHER

  const coords = STADIUM_COORDS[venue]
  if (!coords) return DOME_WEATHER

  try {
    const url = `${BASE_URL}?lat=${coords.lat}&lon=${coords.lon}&appid=${API_KEY}&units=imperial`
    const res = await fetch(url, { next: { revalidate: 600 } })
    if (!res.ok) {
      console.error(`[weather] HTTP ${res.status} for ${venue}`)
      return DOME_WEATHER
    }
    const data: OWMResponse = await res.json()

    const speedMph = Math.round(data.wind.speed)
    const weatherId = data.weather[0]?.id ?? 800

    return {
      temperature: Math.round(data.main.temp),
      windSpeed: speedMph,
      windDirection: mapWindDirection(data.wind.deg, speedMph, venue),
      conditions: mapConditions(weatherId),
      humidity: data.main.humidity,
    }
  } catch (err) {
    console.error(`[weather] fetch error for ${venue}:`, err)
    return DOME_WEATHER
  }
}
