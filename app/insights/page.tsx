import { Brain } from "lucide-react"
import { ModelInsights } from "@/components/model-insights"

export default async function InsightsPage() {
  // auth() requires CLERK_SECRET_KEY — guard so the page works without Clerk configured
  let userId: string | null = null
  try {
    const { auth } = await import("@clerk/nextjs/server")
    const session = await auth()
    userId = session.userId
  } catch {
    // Clerk not configured or middleware unavailable — proceed with userId = null
  }

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
