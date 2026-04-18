import { Zap } from "lucide-react"
import { OddsCalculator } from "@/components/odds-calculator"

export const revalidate = 60

export default async function OddsPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Live Odds & EV Calculator</h1>
              <p className="text-sm text-muted-foreground">
                Find value bets and calculate optimal position sizing
              </p>
            </div>
          </div>
        </div>

        <OddsCalculator />
      </main>
    </div>
  )
}
