import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { KpiCard } from "@/components/diamond/KpiCard"
import { MethodologyPanel } from "@/components/diamond/MethodologyPanel"
import { summariseBetRecord } from "@/lib/bet-record"

function fmtMoney(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`
}

const NAV_TILES = [
  { href: "/bets",      label: "Bet Tracker",   desc: "Log and track wagers",        dot: "#fbbf24" },
  { href: "/bankroll",  label: "Bankroll",       desc: "Balance & transaction ledger", dot: "#38bdf8" },
  { href: "/watchlist", label: "Watchlist",      desc: "Games you're following",       dot: "#fb7185" },
  { href: "/history",   label: "History",        desc: "Prediction log & results",     dot: "#a78bfa" },
  { href: "/accuracy",  label: "Accuracy",       desc: "Model performance metrics",    dot: "#34d399" },
  { href: "/insights",  label: "Insights",       desc: "Feature importance & SHAP",    dot: "#22d3ee" },
]

/** WIN/LOSS are verdicts (stamped); PUSH/PENDING/SETTLED are neutral/in-progress states (ghosted). */
function BetOutcomeBadge({ outcome }: { outcome: "WIN" | "LOSS" | "PUSH" | "PENDING" | "SETTLED" }) {
  if (outcome === "WIN") return <span className="hm-stamp">{outcome}</span>
  if (outcome === "LOSS") return <span className="hm-stamp hm-stamp-bad">{outcome}</span>
  const dot = outcome === "PUSH" ? "#38bdf8" : outcome === "PENDING" ? "#fbbf24" : "var(--hm-smoke)"
  return (
    <span className="hm-ghost">
      <span className="hm-ghost-dot" style={{ background: dot }} />
      {outcome}
    </span>
  )
}

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const [allBetsList, watchlist, bankroll] = await Promise.all([
    prisma.bet.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.watchlistItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.bankroll.findUnique({ where: { userId } }),
  ])

  const recentBets = allBetsList.slice(0, 5)
  const allBets    = allBetsList.length
  const record     = summariseBetRecord(allBetsList)

  const TILE_COUNTS: Record<string, string | undefined> = {
    "/watchlist": `${watchlist.length} watched`,
    "/bets":      `${allBetsList.length} logged`,
  }

  const firstBetDate = allBetsList.length > 0
    ? allBetsList[allBetsList.length - 1].createdAt.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York",
      })
    : null

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
            delta={`${allBetsList.filter((b) => !b.result).length} pending`}
            variant="bl"
          />
          <KpiCard
            metric="Win Rate"
            value={record.winRate !== null ? `${record.winRate.toFixed(1)}%` : "—"}
            delta={`${record.wins}W–${record.losses}L${record.pushes > 0 ? ` · ${record.pushes} push` : ""}`}
            variant="gr"
          />
          <KpiCard
            metric="Total P/L"
            value={`${record.totalPnL >= 0 ? "+" : ""}${fmtMoney(record.totalPnL)}`}
            delta={`${record.settled - record.unresolved} with recorded P/L`}
            deltaPositive={record.totalPnL >= 0}
            variant={record.totalPnL >= 0 ? "gr" : "cy"}
          />
        </div>

        <MethodologyPanel
          summary="Your own bets, all time"
          rows={[
            {
              label: "Source",
              value: "Bets you logged in the Bet Tracker. Model predictions are not counted here.",
            },
            {
              label: "Period",
              value: firstBetDate
                ? `All time — every bet since ${firstBetDate}. There is no date filter on this page.`
                : "All time. There is no date filter on this page.",
            },
            {
              label: "Win Rate",
              value: `${record.wins} won ÷ ${record.decided} decided (won + lost)${
                record.pushes > 0
                  ? `. ${record.pushes} push${record.pushes === 1 ? "" : "es"} excluded from both sides.`
                  : "."
              }`,
            },
            {
              label: "Total P/L",
              value: `Sum of profit and loss in dollars across the ${record.settled - record.unresolved} settled bet${record.settled - record.unresolved === 1 ? "" : "s"} that have a recorded P/L, out of ${record.settled} settled.`,
            },
            {
              label: "Balance",
              value: `Current bankroll${bankroll ? ` against a ${fmtMoney(bankroll.startingBalance)} starting balance` : ""}.`,
            },
          ]}
          caveats={[
            "Win Rate here is your betting record, not model accuracy. For how the prediction engine performs, see the Accuracy page.",
            "Stakes on pending bets are debited from Balance at the moment you place them, so Balance already reflects money at risk on unsettled bets.",
            allBetsList.length > record.settled
              ? `${allBetsList.length - record.settled} pending bet${allBetsList.length - record.settled === 1 ? "" : "s"} contribute to Total Bets and Balance but not to Win Rate or Total P/L.`
              : "Bets settled without a recorded profit/loss are shown as SETTLED and excluded from the win rate.",
            ...(record.unresolved > 0
              ? [`${record.unresolved} settled bet${record.unresolved === 1 ? "" : "s"} have no recorded profit/loss, so they are excluded from the win rate and from Total P/L.`]
              : []),
          ]}
        />

        {/* Nav tiles */}
        <SectionLabel index="02">Quick Access</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {NAV_TILES.map((tile) => {
            // Counts belong on the tile they describe. The watchlist total used
            // to sit under the Total P/L figure, where it read as a P/L delta.
            const count = TILE_COUNTS[tile.href]
            return (
              <Link key={tile.href} href={tile.href} className="hm-panel-lift hm-interactive p-5 block">
                <span className="hm-ghost mb-3">
                  <span className="hm-ghost-dot" style={{ background: tile.dot }} />
                  {tile.label}
                </span>
                <p className="font-jet text-[11px] text-ds-muted">
                  {tile.desc}
                  {count !== undefined && ` · ${count}`}
                </p>
              </Link>
            )
          })}
        </div>

        {/* Recent bets */}
        {recentBets.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <SectionLabel index="03">Recent Bets</SectionLabel>
              <Link href="/bets" className="font-jet text-[10px] uppercase tracking-[0.12em] text-sky-400 hover:text-sky-300">
                View all →
              </Link>
            </div>
            <div className="hm-panel-lift overflow-hidden">
              {recentBets.map((bet, i) => {
                const outcome = !bet.result
                  ? "PENDING"
                  : bet.pnl == null
                    ? "SETTLED"
                    : bet.pnl > 0
                      ? "WIN"
                      : bet.pnl < 0
                        ? "LOSS"
                        : "PUSH"

                return (
                  <div
                    key={bet.id}
                    className={`flex items-center justify-between px-4 py-3 ${i < recentBets.length - 1 ? "border-b border-ds-line/50" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <BetOutcomeBadge outcome={outcome} />
                      <span className="font-jet text-[11px] text-ds-fg">{bet.prediction}</span>
                      <span className="font-jet text-[11px] text-ds-muted">{bet.gameId}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-jet text-[11px] text-ds-muted">{fmtMoney(bet.amount)}</span>
                      {bet.pnl != null && (
                        <span className={`font-jet text-[11px] font-medium ${
                          bet.pnl > 0 ? "text-emerald-400" : bet.pnl < 0 ? "text-red-400" : "text-sky-400"
                        }`}>
                          {bet.pnl > 0 ? "+" : ""}{fmtMoney(bet.pnl)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
