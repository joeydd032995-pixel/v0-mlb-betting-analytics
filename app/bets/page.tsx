import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { KpiCard } from "@/components/diamond/KpiCard"
import { PlaceBetForm } from "@/components/bets/PlaceBetForm"
import { SettleBetForm } from "@/components/bankroll/SettleBetForm"
import { DeleteBetButton } from "@/components/bets/DeleteBetButton"

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

export default async function BetsPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const bets = await prisma.bet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })

  const pending   = bets.filter((b) => !b.result)
  const completed = bets.filter((b) => b.result)
  const wins      = completed.filter((b) => b.pnl && b.pnl > 0)
  const totalPnL  = completed.reduce((s, b) => s + (b.pnl ?? 0), 0)
  const winRate   = completed.length > 0 ? (wins.length / completed.length) * 100 : 0

  // Serialize dates before passing to Client Components
  const pendingRows   = pending.map((b) => ({ ...b, createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString() }))
  const completedRows = completed.map((b) => ({ ...b, createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString() }))

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <div className="flex items-center justify-between">
          <SectionLabel index="01">Bet Tracker</SectionLabel>
          <PlaceBetForm />
        </div>

        {/* KPIs */}
        {bets.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard metric="Total Bets"  value={String(bets.length)}       delta={`${pending.length} pending`}    variant="cy" />
            <KpiCard metric="Completed"   value={String(completed.length)}   delta={`${wins.length} wins`}           variant="bl" />
            <KpiCard metric="Win Rate"    value={`${winRate.toFixed(1)}%`}   delta={`${completed.length} settled`}  variant="gr" />
            <KpiCard
              metric="Total P/L"
              value={`${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}u`}
              delta="All time"
              deltaPositive={totalPnL >= 0}
              variant={totalPnL >= 0 ? "gr" : "cy"}
            />
          </div>
        )}

        {/* Pending bets */}
        {pendingRows.length > 0 && (
          <>
            <SectionLabel index="02">Pending ({pendingRows.length})</SectionLabel>
            <div
              className="rounded-[14px] border border-ds-line overflow-hidden"
              style={{ background: "var(--ds-panel)" }}
            >
              {pendingRows.map((bet, i) => (
                <div
                  key={bet.id}
                  className={`p-4 ${i < pendingRows.length - 1 ? "border-b border-ds-line" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-jet text-[11px] text-ds-muted">{fmtDate(bet.createdAt)}</span>
                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-jet text-[10px] uppercase tracking-[0.1em] text-amber-400">
                        {bet.prediction}
                      </span>
                      <span className="font-jet text-[11px] text-ds-muted">{bet.gameId}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-jet text-[12px] text-ds-fg font-medium">
                        ${bet.amount.toFixed(2)} @ {bet.odds > 0 ? "+" : ""}{bet.odds}
                      </span>
                      <DeleteBetButton betId={bet.id} />
                    </div>
                  </div>
                  <SettleBetForm
                    betId={bet.id}
                    amount={bet.amount}
                    prediction={bet.prediction}
                    odds={bet.odds}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Completed bets */}
        {completedRows.length > 0 && (
          <>
            <SectionLabel index={pendingRows.length > 0 ? "03" : "02"}>
              History ({completedRows.length})
            </SectionLabel>
            <div
              className="rounded-[14px] border border-ds-line overflow-hidden"
              style={{ background: "var(--ds-panel)" }}
            >
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ds-line">
                    {["Date", "Game", "Prediction", "Result", "Stake", "P/L", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {completedRows.map((bet) => {
                    const won = bet.pnl !== null && bet.pnl > 0
                    return (
                      <tr key={bet.id} className="border-b border-ds-line/50 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-jet text-[11px] text-ds-muted whitespace-nowrap">
                          {fmtDate(bet.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-jet text-[11px] text-ds-muted">
                          {bet.gameId}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded border border-ds-line px-1.5 py-0.5 font-jet text-[10px] uppercase text-ds-muted">
                            {bet.prediction}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded border px-1.5 py-0.5 font-jet text-[10px] uppercase tracking-[0.1em] ${
                            won
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-red-500/30 bg-red-500/10 text-red-400"
                          }`}>
                            {won ? "WIN" : "LOSS"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-jet text-[11px] text-ds-fg">
                          ${bet.amount.toFixed(2)} @ {bet.odds > 0 ? "+" : ""}{bet.odds}
                        </td>
                        <td className={`px-4 py-3 font-jet text-[12px] font-medium ${won ? "text-emerald-400" : "text-red-400"}`}>
                          {won ? "+" : ""}{(bet.pnl ?? 0).toFixed(2)}u
                        </td>
                        <td className="px-4 py-3">
                          <DeleteBetButton betId={bet.id} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {bets.length === 0 && (
          <div
            className="rounded-[14px] border border-ds-line p-12 text-center"
            style={{ background: "var(--ds-panel)" }}
          >
            <p className="font-jet text-[12px] text-ds-muted mb-1">No bets logged yet.</p>
            <p className="font-jet text-[11px] text-ds-muted/60">
              Use the &quot;Log Bet&quot; button above to start tracking your wagers.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
