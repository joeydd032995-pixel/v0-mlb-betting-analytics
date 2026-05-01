import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { BankrollInitForm } from "@/components/bankroll/BankrollInitForm"
import { BankrollAdjustForm } from "@/components/bankroll/BankrollAdjustForm"
import { SettleBetForm } from "@/components/bankroll/SettleBetForm"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { KpiCard } from "@/components/diamond/KpiCard"

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtMoney(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TYPE_STYLES: Record<string, string> = {
  deposit:    "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  withdrawal: "text-red-400 bg-red-400/10 border-red-400/20",
  adjustment: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  wager:      "text-amber-400 bg-amber-400/10 border-amber-400/20",
  win:        "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  loss:       "text-red-400 bg-red-400/10 border-red-400/20",
}

export default async function BankrollPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const [bankroll, transactions, pendingBets] = await Promise.all([
    prisma.bankroll.findUnique({ where: { userId } }),
    prisma.bankrollTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.bet.findMany({
      where: { userId, result: null },
      orderBy: { createdAt: "desc" },
    }),
  ])

  // Serialize Dates before passing to Client Components
  const txRows = transactions.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
  }))

  const betRows = pendingBets.map((b) => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }))

  const roi =
    bankroll
      ? ((bankroll.currentBalance - bankroll.startingBalance) / bankroll.startingBalance) * 100
      : 0

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Bankroll</SectionLabel>

        {!bankroll ? (
          <BankrollInitForm />
        ) : (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                metric="Current Balance"
                value={fmtMoney(bankroll.currentBalance)}
                delta="Current"
                variant="cy"
              />
              <KpiCard
                metric="Starting Balance"
                value={fmtMoney(bankroll.startingBalance)}
                delta="Baseline"
                variant="bl"
              />
              <KpiCard
                metric="Net P&L"
                value={fmtMoney(bankroll.currentBalance - bankroll.startingBalance)}
                delta={`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}% ROI`}
                deltaPositive={roi >= 0}
                variant={roi >= 0 ? "gr" : "cy"}
              />
              <KpiCard
                metric="Pending Bets"
                value={String(betRows.length)}
                delta={`$${betRows.reduce((s, b) => s + b.amount, 0).toFixed(2)} at risk`}
                variant="cy"
              />
            </div>

            {/* Adjust form + pending bets */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <BankrollAdjustForm />

              {betRows.length > 0 && (
                <div
                  className="rounded-[14px] border border-ds-line p-6"
                  style={{ background: "var(--ds-panel)" }}
                >
                  <h2 className="font-jet text-[12px] uppercase tracking-[0.15em] text-ds-muted mb-4">
                    Pending Bets
                  </h2>
                  <div className="space-y-4">
                    {betRows.map((bet) => (
                      <div
                        key={bet.id}
                        className="border-b border-ds-line pb-4 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-jet text-[11px] text-ds-fg">{bet.gameId}</span>
                            <span className="rounded border border-ds-line px-1.5 py-0.5 font-jet text-[10px] uppercase text-ds-muted">
                              {bet.prediction}
                            </span>
                          </div>
                          <span className="font-jet text-[11px] text-amber-400">
                            ${bet.amount.toFixed(2)} @ {bet.odds > 0 ? "+" : ""}
                            {bet.odds}
                          </span>
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
                </div>
              )}
            </div>

            {/* Transaction ledger */}
            <SectionLabel index="02">Transaction History</SectionLabel>
            <div
              className="rounded-[14px] border border-ds-line overflow-hidden"
              style={{ background: "var(--ds-panel)" }}
            >
              {txRows.length === 0 ? (
                <p className="p-8 text-center font-jet text-[12px] text-ds-muted">
                  No transactions yet.
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ds-line">
                      {["Date", "Type", "Amount", "Balance", "Note"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {txRows.map((tx) => {
                      const typeStyle =
                        TYPE_STYLES[tx.type] ?? "text-ds-muted bg-ds-panel border-ds-line"
                      return (
                        <tr
                          key={tx.id}
                          className="border-b border-ds-line/50 last:border-0 hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3 font-jet text-[11px] text-ds-muted whitespace-nowrap">
                            {fmtDate(tx.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 font-jet text-[10px] uppercase tracking-[0.1em] ${typeStyle}`}
                            >
                              {tx.type}
                            </span>
                          </td>
                          <td
                            className={`px-4 py-3 font-jet text-[12px] font-medium ${
                              tx.amount >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {tx.amount >= 0 ? "+" : ""}
                            {fmtMoney(tx.amount)}
                          </td>
                          <td className="px-4 py-3 font-jet text-[12px] text-ds-fg">
                            {fmtMoney(tx.balance)}
                          </td>
                          <td className="px-4 py-3 font-jet text-[11px] text-ds-muted max-w-xs truncate">
                            {tx.note ?? "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
