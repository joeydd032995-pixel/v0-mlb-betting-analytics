"use client"

import { useAuth, useUser } from "@clerk/nextjs"
import Link from "next/link"
import { Heart, DollarSign, TrendingUp, BarChart3 } from "lucide-react"

export default function DashboardPage() {
  const { isLoaded, userId } = useAuth()
  const { user } = useUser()

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-6xl px-4 py-6">
          <p className="text-muted-foreground">Loading...</p>
        </main>
      </div>
    )
  }

  if (!userId || !user) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-6xl px-4 py-6">
          <p className="text-muted-foreground">Please sign in to view your dashboard.</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Welcome back, {user.firstName || "User"}!</h1>
          <p className="text-lg text-muted-foreground">
            Manage your NRFI/YRFI predictions and track your betting performance.
          </p>
        </div>

        {/* Quick links grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Watchlist */}
          <Link
            href="/watchlist"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400 group-hover:bg-rose-500/30 transition-colors">
              <Heart className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Watchlist</h3>
            <p className="mt-1 text-xs text-muted-foreground">Games you're tracking</p>
          </Link>

          {/* Bet Tracker */}
          <Link
            href="/bets"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400 group-hover:bg-violet-500/30 transition-colors">
              <DollarSign className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Bets</h3>
            <p className="mt-1 text-xs text-muted-foreground">Track your betting record</p>
          </Link>

          {/* Accuracy */}
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

          {/* Insights */}
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

        {/* Quick stats section */}
        <div className="rounded-lg border border-border/30 bg-card/50 p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Stats</h2>
          <p className="text-sm text-muted-foreground">
            Stats will appear here as you add bets and complete predictions.
          </p>
        </div>
      </main>
    </div>
  )
}
