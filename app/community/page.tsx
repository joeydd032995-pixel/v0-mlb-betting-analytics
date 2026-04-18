import { Users, TrendingUp, Trophy } from "lucide-react"
import { Leaderboard } from "@/components/leaderboard"

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Community</h1>
              <p className="text-sm text-muted-foreground">
                See how top predictors are performing
              </p>
            </div>
          </div>
        </div>

        <Leaderboard />
      </main>
    </div>
  )
}
