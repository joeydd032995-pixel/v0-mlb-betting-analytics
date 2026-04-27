// app/ensemble/page.tsx — Ensemble landing page; lists today's games for selection
import { cache } from "react"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { mockGames, mockPitchers, mockTeams } from "@/lib/mock-data"
import type { Game, Pitcher, Team } from "@/lib/types"
import Link from "next/link"
import { cn } from "@/lib/utils"

const getCachedSlate = cache((date: string) => getLiveGameSlate(date))

export const revalidate = 300

function pct(n: number) { return `${(n * 100).toFixed(1)}%` }

export default async function EnsembleListPage() {
  let games: Game[]                  = []
  let pitchers: Map<string, Pitcher> = new Map()
  let teams: Map<string, Team>       = new Map()

  try {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
    const live = await getCachedSlate(date)
    games    = live.games
    pitchers = live.pitchers
    teams    = live.teams
  } catch {
    if (process.env.NODE_ENV !== "production") {
      games    = mockGames
      pitchers = mockPitchers
      teams    = mockTeams
    }
  }

  const predictions = computeAllPredictions(games, pitchers, teams)
  const gameMap     = new Map(games.map(g => [g.id, g]))

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
              const game = gameMap.get(pred.gameId)
              if (!game) return null

              const homeTm   = teams.get(game.homeTeamId)
              const awayTm   = teams.get(game.awayTeamId)
              const homeAbbr = homeTm?.abbreviation ?? game.homeTeamId.toUpperCase()
              const awayAbbr = awayTm?.abbreviation ?? game.awayTeamId.toUpperCase()
              const nrfi     = pred.nrfiProbability
              const rec      = pred.recommendation
              const isNrfi   = rec === "STRONG_NRFI" || rec === "LEAN_NRFI"
              const isStrong = rec === "STRONG_NRFI" || rec === "STRONG_YRFI"
              const isTossUp = rec === "TOSS_UP"

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
                        isTossUp
                          ? "text-ds-warn border-ds-warn/40 bg-ds-warn/10"
                          : isNrfi
                          ? "text-ds-gr border-ds-gr/40 bg-ds-gr/10"
                          : "text-ds-bad border-ds-bad/40 bg-ds-bad/10"
                      )}
                    >
                      {isTossUp ? "TOSS UP" : `${isStrong ? "STRONG " : "LEAN "}${isNrfi ? "NRFI" : "YRFI"}`}
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
