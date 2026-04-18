import { Cloud } from "lucide-react"
import { WeatherSimulator } from "@/components/weather-simulator"

export default function WeatherPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Weather & Park Factors</h1>
              <p className="text-sm text-muted-foreground">
                Simulate how environmental conditions affect NRFI/YRFI odds
              </p>
            </div>
          </div>
        </div>

        <WeatherSimulator />
      </main>
    </div>
  )
}
