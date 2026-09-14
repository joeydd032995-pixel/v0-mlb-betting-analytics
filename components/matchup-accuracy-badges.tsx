import type { ExtendedModelAccuracy } from "@/lib/prediction-store"

interface Props {
  accuracy?: Pick<ExtendedModelAccuracy, "byPitcher" | "byPark">
  awayPitcher: string
  homePitcher: string
  awayTeam: string
  homeTeam: string
  venue: string
}

/** Same named buckets and scored population as the Accuracy dashboard. */
export function MatchupAccuracyBadges({ accuracy, awayPitcher, homePitcher, awayTeam, homeTeam, venue }: Props) {
  const pitcherRow = (name: string) => name && name !== "TBD"
    ? accuracy?.byPitcher.find((row) => row.pitcher === name)
    : undefined
  const away = pitcherRow(awayPitcher)
  const home = pitcherRow(homePitcher)
  const park = accuracy?.byPark.find((row) => row.venue === venue)
  const entries = [
    { key: "away", label: `${awayTeam} SP`, name: awayPitcher, row: away, total: away?.starts ?? 0 },
    { key: "home", label: `${homeTeam} SP`, name: homePitcher, row: home, total: home?.starts ?? 0 },
    { key: "park", label: "Park", name: venue, row: park, total: park?.total ?? 0 },
  ].map((entry) => ({
    ...entry,
    known: entry.total > 0 && Number.isFinite(entry.row?.accuracy),
    above: entry.total > 0 && Number.isFinite(entry.row?.accuracy) && entry.row!.accuracy > 0.6,
  }))
  const allKnown = entries.every((entry) => entry.known)
  const allAbove = entries.every((entry) => entry.above)
  const style = (above: boolean) => `rounded-full border px-2 py-1 text-[11px] leading-snug ${above
    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
    : "border-border bg-muted/20 text-muted-foreground"}`

  return (
    <div className="px-3 pb-3 sm:px-4" aria-label="Historical matchup prediction accuracy">
      <p className="mb-1.5 text-[10px] text-muted-foreground">Historical prediction accuracy · green &gt;60%</p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(({ key, label, name, row, total, known, above }) => (
          <span key={key} className={style(above)} title={`${name || "TBD"}: ${known ? `${row!.correct}/${total} correct predictions; ${above ? "above" : "at or below"} 60%` : "No scored history"}`}>
            {label}: {known ? `${(row!.accuracy * 100).toFixed(1)}% (${row!.correct}/${total})` : "No history"}
          </span>
        ))}
        <span className={style(allAbove)} title="Both starting pitchers and the park must each have historical prediction accuracy strictly above 60%.">
          All 3 &gt;60%: {allAbove ? "Yes" : allKnown ? "No" : "Incomplete history"}
        </span>
      </div>
    </div>
  )
}
