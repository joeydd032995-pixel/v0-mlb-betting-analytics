import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { KpiCard } from "@/components/diamond/KpiCard"

function fmtMoney(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`
}

const NAV_TILES = [
  { href: "/bets",      label: "Bet Tracker",   desc: "Log and track wagers",        color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  { href: "/bankroll",  label: "Bankroll",       desc: "Balance & transaction ledger", color: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
  { href: "/watchlist", label: "Watchlist",      desc: "Games you're following",       color: "text-rose-400 bg-rose-400/10 border-rose-400/20" },
  { href: "/history",   label: "History",        desc: "Prediction log & results",     color: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
  { href: "/accuracy",  label: "Accuracy",       desc: "Model performance metrics",    color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  { href: "/insights",  label: "Insights",       desc: "Feature importance & SHAP",    color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
]

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const [bets, watchlist, bankroll] = await Promise.all([
    prisma.bet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.watchlistItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.bankroll.findUnique({ where: { userId } }),
  ])

  const allBets      = await prisma.bet.count({ where: { userId } })
  const completed    = bets.filter((b) => b.result)
  const totalPnL     = completed.reduce((s, b) => s + (b.pnl ?? 0), 0)
  const wins         = completed.filter((b) => b.pnl && b.pnl > 0)
  const winRate      = completed.length > 0 ? (wins.length / completed.length) * 100 : 0

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Dashboard</SectionLabel>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            metric="Balance"
            value={bankroll ? fmtMoney(bankroll.currentBalance) : "—"}
            delta={bankroll ? `from ${fmtMoney(bankroll.startingBalance)}` : "Not initialized"}
            variant="cy"
          />
          <KpiCard
            metric="Total Bets"
            value={String(allBets)}
            delta={`${bets.filter((b) => !b.result).length} pending`}
            variant="bl"
          />
          <KpiCard
            metric="Win Rate"
            value={`${winRate.toFixed(1)}%`}
            delta={`${completed.length} settled`}
            variant="gr"
          />
          <KpiCard
            metric="Total P/L"
            value={`${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}u`}
            delta={`${watchlist.length} watched`}
            deltaPositive={totalPnL >= 0}
            variant={totalPnL >= 0 ? "gr" : "cy"}
          />
        </div>

        {/* Nav tiles */}
        <SectionLabel index="02">Quick Access</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {NAV_TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="rounded-[14px] border border-ds-line p-5 hover:border-ds-line/80 hover:bg-white/[0.02] transition-colors"
              style={{ background: "var(--ds-panel)" }}
            >
              <div className={`inline-flex items-center rounded-[6px] border px-2 py-1 font-jet text-[10px] uppercase tracking-[0.12em] mb-3 ${tile.color}`}>
                {tile.label}
              </div>
              <p className="font-jet text-[11px] text-ds-muted">{tile.desc}</p>
            </Link>
          ))}
        </div>

        {/* Recent bets */}
        {bets.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <SectionLabel index="03">Recent Bets</SectionLabel>
              <Link href="/bets" className="font-jet text-[10px] uppercase tracking-[0.12em] text-sky-400 hover:text-sky-300">
                View all →
              </Link>
            </div>
            <div
              className="rounded-[14px] border border-ds-line overflow-hidden"
              style={{ background: "var(--ds-panel)" }}
            >
              {bets.map((bet, i) => (
                <div
                  key={bet.id}
                  className={`flex items-center justify-between px-4 py-3 ${i < bets.length - 1 ? "border-b border-ds-line/50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`rounded border px-1.5 py-0.5 font-jet text-[10px] uppercase tracking-[0.1em] ${
                      bet.result
                        ? bet.pnl && bet.pnl > 0
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    }`}>
                      {bet.result ? (bet.pnl && bet.pnl > 0 ? "WIN" : "LOSS") : "PENDING"}
                    </span>
                    <span className="font-jet text-[11px] text-ds-fg">{bet.prediction}</span>
                    <span className="font-jet text-[11px] text-ds-muted">{bet.gameId}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-jet text-[11px] text-ds-muted">${bet.amount.toFixed(2)}</span>
                    {bet.result && (
                      <span className={`font-jet text-[11px] font-medium ${bet.pnl && bet.pnl > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {bet.pnl && bet.pnl > 0 ? "+" : ""}{(bet.pnl ?? 0).toFixed(2)}u
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
