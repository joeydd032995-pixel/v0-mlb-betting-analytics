import { auth } from "@clerk/nextjs/server"
import { Brain, TrendingUp, Zap } from "lucide-react"
import { ModelInsights } from "@/components/model-insights"

export default async function InsightsPage() {
  const { userId } = await auth()

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Model Insights</h1>
              <p className="text-sm text-muted-foreground">
                Understand how the NRFI/YRFI prediction engine works
              </p>
            </div>
          </div>
        </div>

        <ModelInsights userId={userId} />
      </main>
    </div>
  )
}
