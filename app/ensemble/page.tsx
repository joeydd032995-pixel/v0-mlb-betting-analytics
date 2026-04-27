// app/ensemble/page.tsx — Ensemble landing page; lists today's games for selection
import { cache } from "react"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { mockGames, mockPitchers, mockTeams } from "@/lib/mock-data"
import Link from "next/link"
import { cn } from "@/lib/utils"

const getCachedSlate = cache((date: string) => getLiveGameSlate(date))

export const revalidate = 300

function pct(n: number) { return `${(n * 100).toFixed(1)}%` }

export default async function EnsembleListPage() {
  let games  = mockGames
  let pitchers = mockPitchers
  let teams    = mockTeams

  try {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
    const live = await getCachedSlate(date)
    if (live.games.length > 0) {
      games    = live.games
      pitchers = live.pitchers
      teams    = live.teams
    }
  } catch {
    // fall through to mock data
  }

  const predictions = computeAllPredictions(games, pitchers, teams)

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">
          Ensemble Deep Dive · Select a Game
        </SectionLabel>

        {predictions.length === 0 ? (
          <div className="rounded-xl border border-ds-line bg-[var(--ds-panel)] p-12 text-center space-y-3">
            <p className="font-display text-[18px] font-semibold text-ds-ink">No Games Today</p>
            <p className="font-jet text-[12px] text-ds-muted">Check back later or view a past game from Today&apos;s Games.</p>
            <Link href="/" className="ds-chip ds-chip-active inline-block mt-2">← Today&apos;s Games</Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {predictions.map((pred) => {
              const game    = games.find(g => g.id === pred.gameId) ?? games[predictions.indexOf(pred)]
              const homeTm  = teams.get(game.homeTeamId)
              const awayTm  = teams.get(game.awayTeamId)
              const homeAbbr = homeTm?.abbreviation ?? game.homeTeamId.toUpperCase()
              const awayAbbr = awayTm?.abbreviation ?? game.awayTeamId.toUpperCase()
              const nrfi    = pred.nrfiProbability
              const rec     = pred.recommendation
              const isNrfi  = rec?.includes("NRFI")
              const isStrong = rec?.includes("STRONG")

              return (
                <Link
                  key={game.id}
                  href={`/ensemble/${game.id}`}
                  className="group rounded-xl border border-ds-line bg-[var(--ds-panel)] p-5 space-y-4 hover:border-ds-cy/50 hover:bg-[var(--ds-panel-2)] transition-all"
                >
                  {/* Matchup */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display font-semibold text-[15px] text-ds-ink">
                        {awayAbbr} <span className="text-ds-muted font-normal">@</span> {homeAbbr}
                      </p>
                      <p className="font-jet text-[11px] text-ds-muted mt-0.5">{game.venue} · {game.time}</p>
                    </div>
                    <span
                      className={cn(
                        "font-jet text-[11px] font-semibold px-2.5 py-1 rounded-full border",
                        isNrfi
                          ? "text-ds-gr border-ds-gr/40 bg-ds-gr/10"
                          : "text-ds-bad border-ds-bad/40 bg-ds-bad/10"
                      )}
                    >
                      {isStrong ? "STRONG " : "LEAN "}{isNrfi ? "NRFI" : "YRFI"}
                    </span>
                  </div>

                  {/* Probability bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-jet text-[11px]">
                      <span className="text-ds-gr">NRFI {pct(nrfi)}</span>
                      <span className="text-ds-bad">YRFI {pct(1 - nrfi)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ds-line)" }}>
                      <div
                        className="h-full rounded-full bg-ds-gr transition-all"
                        style={{ width: `${nrfi * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between font-jet text-[11px] text-ds-muted">
                    <span>Confidence {pred.confidenceScore ?? "—"}</span>
                    <span className="text-ds-cy group-hover:underline">View Deep Dive →</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
