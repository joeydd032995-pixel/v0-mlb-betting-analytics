"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MLB_STADIUMS } from "@/lib/constants/mlb-stadiums"
import { cn } from "@/lib/utils"
import { Wind, Thermometer, Droplets, TrendingUp, BarChart3 } from "lucide-react"

interface WeatherConditions {
  temperature: number
  windSpeed: number
  windDirection: string
  humidity: number
}

type WindDirection = "headwind" | "neutral" | "tailwind"

const STADIUMS_SORTED = Object.entries(MLB_STADIUMS)
  .map(([name, info]) => ({ name, ...info }))
  .sort((a, b) => b.parkFactor - a.parkFactor)

const WEATHER_PRESETS = {
  cold: { temperature: 45, windSpeed: 10, windDirection: "headwind" as WindDirection, humidity: 60 },
  cool: { temperature: 55, windSpeed: 5, windDirection: "neutral" as WindDirection, humidity: 55 },
  perfect: { temperature: 70, windSpeed: 0, windDirection: "neutral" as WindDirection, humidity: 50 },
  warm: { temperature: 80, windSpeed: 5, windDirection: "tailwind" as WindDirection, humidity: 65 },
  hot: { temperature: 90, windSpeed: 15, windDirection: "tailwind" as WindDirection, humidity: 70 },
}

function getWindMultiplier(windSpeed: number, direction: WindDirection): number {
  const baseMultiplier = 1 + windSpeed * 0.015
  if (direction === "tailwind") return baseMultiplier
  if (direction === "headwind") return 2 - baseMultiplier
  return 1
}

function getTemperatureMultiplier(temp: number): number {
  if (temp < 50) return 0.92
  if (temp < 60) return 0.96
  if (temp < 70) return 1.0
  if (temp < 80) return 1.02
  return 1.05
}

function getHumidityMultiplier(humidity: number): number {
  return 1 + (humidity - 50) * 0.003
}

function calculateWeatherMultiplier(conditions: WeatherConditions): number {
  const windMult = getWindMultiplier(conditions.windSpeed, conditions.windDirection as WindDirection)
  const tempMult = getTemperatureMultiplier(conditions.temperature)
  const humidMult = getHumidityMultiplier(conditions.humidity)
  return windMult * tempMult * humidMult
}

function estimateNrfiChange(baseNrfi: number, weatherMult: number): number {
  const adjustment = (weatherMult - 1) * 0.15
  return Math.max(0, Math.min(1, baseNrfi - adjustment))
}

export function WeatherSimulator() {
  const [activeTab, setActiveTab] = useState<"simulator" | "park-factors">("simulator")
  const [weather, setWeather] = useState<WeatherConditions>(WEATHER_PRESETS.perfect)
  const [selectedStadium, setSelectedStadium] = useState<string>("Yankee Stadium")
  const [baseNrfi] = useState<number>(0.62)

  const stadium = MLB_STADIUMS[selectedStadium]
  const weatherMult = calculateWeatherMultiplier(weather)
  const parkFactor = stadium?.parkFactor || 1.0
  const estimatedNrfi = estimateNrfiChange(baseNrfi, weatherMult)

  const weatherFactors = useMemo(
    () => {
      const windLabel = {
        headwind: "Headwind (out)",
        neutral: "No wind",
        tailwind: "Tailwind (in)",
      }[weather.windDirection as WindDirection]
      return [
      {
        label: "Wind",
        value: `${weather.windSpeed} mph ${windLabel}`,
        multiplier: getWindMultiplier(weather.windSpeed, weather.windDirection as WindDirection),
        icon: Wind,
      },
      {
        label: "Temperature",
        value: `${weather.temperature}°F`,
        multiplier: getTemperatureMultiplier(weather.temperature),
        icon: Thermometer,
      },
      {
        label: "Humidity",
        value: `${weather.humidity}%`,
        multiplier: getHumidityMultiplier(weather.humidity),
        icon: Droplets,
      },
      ]
    },
    [weather]
  )

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "simulator" | "park-factors")} className="w-full space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="simulator">Weather Simulator</TabsTrigger>
        <TabsTrigger value="park-factors">Park Factors</TabsTrigger>
      </TabsList>

      <TabsContent value="simulator" className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Controls */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Controls</CardTitle>
                <CardDescription>Adjust weather conditions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preset Buttons */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Presets</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(WEATHER_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => setWeather(preset)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          weather.temperature === preset.temperature &&
                          weather.windSpeed === preset.windSpeed
                            ? "border-sky-500/50 bg-sky-500/10 text-sky-400"
                            : "border-border/30 bg-card/50 hover:bg-card/70 text-muted-foreground"
                        )}
                      >
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Temperature */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-muted-foreground">Temperature</label>
                    <span className="text-sm font-bold text-foreground">{weather.temperature}°F</span>
                  </div>
                  <input
                    type="range"
                    value={weather.temperature}
                    onChange={(e) => setWeather({ ...weather, temperature: parseInt(e.target.value) })}
                    min={35}
                    max={95}
                    step={1}
                    className="w-full h-2 bg-border/30 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Wind Speed */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-muted-foreground">Wind Speed</label>
                    <span className="text-sm font-bold text-foreground">{weather.windSpeed} mph</span>
                  </div>
                  <input
                    type="range"
                    value={weather.windSpeed}
                    onChange={(e) => setWeather({ ...weather, windSpeed: parseInt(e.target.value) })}
                    min={0}
                    max={30}
                    step={1}
                    className="w-full h-2 bg-border/30 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Wind Direction */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Wind Direction</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["headwind", "neutral", "tailwind"] as WindDirection[]).map((dir) => (
                      <button
                        key={dir}
                        onClick={() => setWeather({ ...weather, windDirection: dir })}
                        className={cn(
                          "rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                          weather.windDirection === dir
                            ? "border-sky-500/50 bg-sky-500/10 text-sky-400"
                            : "border-border/30 bg-card/50 hover:bg-card/70 text-muted-foreground"
                        )}
                      >
                        {dir === "headwind" ? "⬅️" : dir === "tailwind" ? "➡️" : "⟷"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Humidity */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-muted-foreground">Humidity</label>
                    <span className="text-sm font-bold text-foreground">{weather.humidity}%</span>
                  </div>
                  <input
                    type="range"
                    value={weather.humidity}
                    onChange={(e) => setWeather({ ...weather, humidity: parseInt(e.target.value) })}
                    min={30}
                    max={90}
                    step={1}
                    className="w-full h-2 bg-border/30 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Stadium Select */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Stadium</p>
                  <select
                    value={selectedStadium}
                    onChange={(e) => setSelectedStadium(e.target.value)}
                    className="w-full rounded-lg border border-border/30 bg-card/50 px-3 py-2 text-sm text-foreground"
                  >
                    {Object.keys(MLB_STADIUMS).map((stadium) => (
                      <option key={stadium} value={stadium}>
                        {stadium}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Results */}
          <div className="lg:col-span-2 space-y-4">
            {/* Weather Multiplier Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Weather Factor Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {weatherFactors.map((factor) => {
                    const Icon = factor.icon
                    const impact = ((factor.multiplier - 1) * 100).toFixed(1)
                    return (
                      <div key={factor.label} className="flex items-start gap-3">
                        <Icon className="h-4 w-4 text-sky-400 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <p className="text-xs font-semibold text-foreground">{factor.label}</p>
                            <p className={cn("text-xs font-bold", factor.multiplier > 1 ? "text-emerald-400" : factor.multiplier < 1 ? "text-rose-400" : "text-muted-foreground")}>
                              {factor.multiplier > 1 ? "+" : ""}{impact}%
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">{factor.value}</p>
                          <div className="h-1 w-full rounded-full bg-border/30 mt-1 overflow-hidden">
                            <div
                              className={cn("h-full", factor.multiplier > 1 ? "bg-emerald-500" : factor.multiplier < 1 ? "bg-rose-500" : "bg-sky-500")}
                              style={{ width: `${Math.min(100, Math.max(0, (factor.multiplier - 0.85) / 0.3 * 100))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Combined Impact */}
            <Card className={cn("border", weatherMult > 1 ? "border-emerald-500/30 bg-emerald-500/5" : weatherMult < 1 ? "border-rose-500/30 bg-rose-500/5" : "border-sky-500/30 bg-sky-500/5")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Combined Weather Impact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Weather Multiplier</p>
                    <p className={cn("text-3xl font-bold", weatherMult > 1 ? "text-emerald-400" : weatherMult < 1 ? "text-rose-400" : "text-foreground")}>
                      {weatherMult > 1 ? "+" : ""}{((weatherMult - 1) * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Park Factor</p>
                    <p className={cn("text-3xl font-bold", parkFactor > 1 ? "text-emerald-400" : parkFactor < 1 ? "text-rose-400" : "text-foreground")}>
                      {parkFactor > 1 ? "+" : ""}{((parkFactor - 1) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/30 bg-card/50 p-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Base NRFI Probability</p>
                    <p className="text-sm font-bold text-foreground">{(baseNrfi * 100).toFixed(1)}%</p>
                  </div>
                  <div className="h-px bg-border/30" />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">
                      {selectedStadium} ({stadium?.isDome ? "Dome" : "Open"})
                    </p>
                    <p className="text-sm font-bold text-foreground">Estimated NRFI: {(estimatedNrfi * 100).toFixed(1)}%</p>
                    <p className={cn("text-xs font-semibold mt-1", estimatedNrfi < baseNrfi ? "text-emerald-400" : "text-rose-400")}>
                      {estimatedNrfi < baseNrfi ? "↓" : "↑"} {Math.abs((estimatedNrfi - baseNrfi) * 100).toFixed(1)}% from base
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/30 bg-card/50 p-3">
                  <p className="text-xs text-muted-foreground">
                    {weatherMult > 1.05
                      ? "Strong tailwind and warm weather favor runs (YRFI)"
                      : weatherMult < 0.95
                      ? "Cold and headwind conditions suppress runs (NRFI favored)"
                      : "Neutral weather conditions - neither team has edge"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Effect on Odds */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Impact on Betting Odds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-border/30 bg-card/50 p-2">
                    <p className="text-muted-foreground mb-1">Current Conditions</p>
                    <p className="font-semibold text-foreground">Favor {estimatedNrfi > 0.5 ? "NRFI" : "YRFI"}</p>
                  </div>
                  <div className="rounded border border-border/30 bg-card/50 p-2">
                    <p className="text-muted-foreground mb-1">Probability Change</p>
                    <p className={cn("font-semibold", estimatedNrfi < baseNrfi ? "text-emerald-400" : "text-rose-400")}>
                      {estimatedNrfi < baseNrfi ? "↓" : "↑"} {Math.abs((estimatedNrfi - baseNrfi) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Wind and temperature are the primary weather drivers. Tailwinds push balls further; cold weather reduces fly ball distance and dampens hitting.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="park-factors" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              MLB Park Factors (Run Multipliers)
            </CardTitle>
            <CardDescription>
              1.0 = neutral | Higher = more runs | Lower = fewer runs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {STADIUMS_SORTED.map((stadium) => {
                const impact = ((stadium.parkFactor - 1) * 100).toFixed(1)
                return (
                  <button
                    key={stadium.name}
                    onClick={() => {
                      setSelectedStadium(stadium.name)
                      setActiveTab("simulator")
                    }}
                    className={cn(
                      "w-full text-left rounded-lg border p-3 transition-colors hover:bg-card/70",
                      selectedStadium === stadium.name ? "border-sky-500/50 bg-sky-500/10" : "border-border/30 bg-card/50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-foreground">{stadium.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{stadium.isDome ? "🏟️" : "⛅"}</span>
                        <span className={cn("text-sm font-bold px-2 py-1 rounded", stadium.parkFactor > 1 ? "bg-emerald-500/20 text-emerald-300" : stadium.parkFactor < 1 ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-300")}>
                          {stadium.parkFactor > 1 ? "+" : ""}{impact}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-border/30 overflow-hidden">
                      <div
                        className={cn("h-full", stadium.parkFactor > 1.05 ? "bg-emerald-500" : stadium.parkFactor < 0.95 ? "bg-rose-500" : "bg-sky-500")}
                        style={{ width: `${Math.min(100, (stadium.parkFactor / 1.2) * 100)}%` }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Park Factor Legend</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-semibold text-emerald-400 mb-1">Run-Friendly (&gt;1.10)</p>
              <p className="text-xs text-muted-foreground">Coors Field (1.15), Great American (1.12)</p>
            </div>
            <div>
              <p className="font-semibold text-sky-400 mb-1">Neutral (0.95–1.05)</p>
              <p className="text-xs text-muted-foreground">Most parks cluster here</p>
            </div>
            <div>
              <p className="font-semibold text-rose-400 mb-1">Pitcher-Friendly (&lt;0.90)</p>
              <p className="text-xs text-muted-foreground">Petco Park (0.87), Oracle (0.91)</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
