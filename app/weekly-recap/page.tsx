import { BarChart3, TrendingUp, Calendar } from "lucide-react"
import { WeeklyRecap } from "@/components/weekly-recap"

export default function WeeklyRecapPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20 text-orange-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Weekly Recap</h1>
              <p className="text-sm text-muted-foreground">
                This week&apos;s model performance and insights
              </p>
            </div>
          </div>
        </div>

        <WeeklyRecap />
      </main>
    </div>
  )
}
