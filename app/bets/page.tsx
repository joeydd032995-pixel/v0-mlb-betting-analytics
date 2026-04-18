import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { Clock, DollarSign } from "lucide-react"
import { cn } from "@/lib/utils"
import { prisma } from "@/lib/prisma"

export default async function BetsPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const bets = await prisma.bet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })

  const pendingBets = bets.filter((b) => !b.result)
  const completedBets = bets.filter((b) => b.result)
  const totalPnL = completedBets.reduce((sum, b) => sum + (b.pnl || 0), 0)
  const winRate = completedBets.length > 0
    ? (completedBets.filter((b) => b.pnl && b.pnl > 0).length / completedBets.length) * 100
    : 0

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Bet Tracker</h1>
              <p className="text-sm text-muted-foreground">
                View all your NRFI/YRFI bets and track performance.
              </p>
            </div>
          </div>
        </div>

        {completedBets.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-border/30 bg-card/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">Total Bets</p>
              <p className="text-2xl font-bold text-foreground mt-1">{bets.length}</p>
            </div>
            <div className="rounded-lg border border-border/30 bg-card/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold text-foreground mt-1">{completedBets.length}</p>
            </div>
            <div className="rounded-lg border border-border/30 bg-card/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold text-foreground mt-1">{winRate.toFixed(1)}%</p>
            </div>
            <div className={cn(
              "rounded-lg border p-4",
              totalPnL > 0
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-border/30 bg-card/50"
            )}>
              <p className="text-xs font-medium text-muted-foreground">Total P/L</p>
              <p className={cn(
                "text-2xl font-bold mt-1",
                totalPnL > 0 ? "text-emerald-400" : "text-foreground"
              )}>
                {totalPnL > 0 ? "+" : ""}{totalPnL.toFixed(2)}u
              </p>
            </div>
          </div>
        )}

        {pendingBets.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Pending Bets ({pendingBets.length})</h2>
            <div className="grid gap-3">
              {pendingBets.map((bet) => (
                <div key={bet.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{bet.prediction}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {bet.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">${bet.amount}</p>
                      <p className="text-xs text-muted-foreground">{(bet.odds > 0 ? "+" : "")}{bet.odds}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {completedBets.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Completed Bets ({completedBets.length})</h2>
            <div className="grid gap-3">
              {completedBets.map((bet) => (
                <div
                  key={bet.id}
                  className={cn(
                    "rounded-lg border p-4",
                    bet.pnl && bet.pnl > 0
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-rose-500/30 bg-rose-500/5"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{bet.prediction}</p>
                        <p className={cn(
                          "text-xs px-2 py-0.5 rounded",
                          bet.result === bet.prediction
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-300"
                        )}>
                          {bet.result === bet.prediction ? "WIN" : "LOSS"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {bet.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">${bet.amount}</p>
                      <p className={cn(
                        "text-xs font-medium mt-0.5",
                        bet.pnl && bet.pnl > 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {bet.pnl && bet.pnl > 0 ? "+" : ""}{bet.pnl?.toFixed(2)}u
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {bets.length === 0 && (
          <div className="rounded-lg border border-border/30 bg-card/50 p-12 text-center">
            <DollarSign className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No bets yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start tracking your bets here to see your performance metrics.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
