import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { WatchlistRow } from "@/components/watchlist/WatchlistRow"

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

export default async function WatchlistPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const watchlist = await prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })

  const rows = watchlist.map((w) => ({
    ...w,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  }))

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <div className="flex items-center justify-between">
          <SectionLabel index="01">Watchlist</SectionLabel>
          {rows.length > 0 && (
            <span className="font-jet text-[11px] text-ds-muted">
              {rows.length} game{rows.length !== 1 ? "s" : ""} tracked
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div
            className="rounded-[14px] border border-ds-line p-12 text-center"
            style={{ background: "var(--ds-panel)" }}
          >
            <p className="font-jet text-[12px] text-ds-muted mb-1">No games in your watchlist yet.</p>
            <p className="font-jet text-[11px] text-ds-muted/60">
              Add games from the{" "}
              <Link href="/" className="text-sky-400 hover:text-sky-300 underline">
                prediction dashboard
              </Link>{" "}
              to track them here.
            </p>
          </div>
        ) : (
          <div
            className="rounded-[14px] border border-ds-line overflow-hidden"
            style={{ background: "var(--ds-panel)" }}
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-ds-line">
                  <th className="px-4 py-3 text-left font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">Game ID</th>
                  <th className="px-4 py-3 text-left font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">Added</th>
                  <th className="px-4 py-3 text-left font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <WatchlistRow
                    key={item.id}
                    gameId={item.gameId}
                    added={fmtDate(item.createdAt)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
