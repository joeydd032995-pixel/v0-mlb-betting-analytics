import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Heart, DollarSign, TrendingUp, BarChart3 } from "lucide-react"
import { prisma } from "@/lib/prisma"

export default async function DashboardPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const [bets, watchlist, bankroll] = await Promise.all([
    prisma.bet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.watchlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.bankroll.findUnique({
      where: { userId },
    }),
  ])

  const completedBets = bets.filter((b) => b.result)
  const totalPnL = completedBets.reduce((sum, b) => sum + (b.pnl || 0), 0)
  const winRate = completedBets.length > 0
    ? (completedBets.filter((b) => b.pnl && b.pnl > 0).length / completedBets.length) * 100
    : 0

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Welcome back!</h1>
          <p className="text-lg text-muted-foreground">
            Manage your NRFI/YRFI predictions and track your betting performance.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/watchlist"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400 group-hover:bg-rose-500/30 transition-colors">
              <Heart className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Watchlist</h3>
            <p className="mt-1 text-xs text-muted-foreground">{watchlist.length} games tracked</p>
          </Link>

          <Link
            href="/bets"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400 group-hover:bg-violet-500/30 transition-colors">
              <DollarSign className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Bets</h3>
            <p className="mt-1 text-xs text-muted-foreground">{bets.length} bets total</p>
          </Link>

          <Link
            href="/accuracy"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 group-hover:bg-sky-500/30 transition-colors">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Accuracy</h3>
            <p className="mt-1 text-xs text-muted-foreground">View your metrics</p>
          </Link>

          <Link
            href="/insights"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/30 transition-colors">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Insights</h3>
            <p className="mt-1 text-xs text-muted-foreground">Explore model factors</p>
          </Link>
        </div>

        <div className="rounded-lg border border-border/30 bg-card/50 p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Stats</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Bets</p>
              <p className="text-2xl font-bold text-foreground mt-1">{bets.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold text-foreground mt-1">{winRate.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total P/L</p>
              <p className={totalPnL > 0 ? "text-emerald-400" : "text-foreground"}>
                <span className="text-2xl font-bold">{totalPnL > 0 ? "+" : ""}{totalPnL.toFixed(2)}</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Balance</p>
              <p className="text-2xl font-bold text-foreground mt-1">${bankroll?.currentBalance.toFixed(2) || "—"}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
