"use client"

import { useBankroll } from "@/lib/hooks/use-bankroll"
import { games, teams } from "@/lib/mock-data"
import { BankrollOverview } from "@/components/bankroll-overview"
import { BetHistory } from "@/components/bet-history"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

export default function BankrollPage() {
  const { stats, bets } = useBankroll()

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-4xl font-bold">Bankroll Management</h1>
            <p className="text-muted-foreground text-lg">Track your betting performance and ROI</p>
          </div>
        </div>

        <BankrollOverview stats={stats} />

        <BetHistory bets={bets} games={games} teams={teams} />
      </div>
    </div>
  )
}
