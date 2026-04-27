"use client"

import { useState, useMemo } from "react"
import { Search } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { ActiveStarter } from "@/lib/api/mlb-stats"

interface Props {
  pitchers: ActiveStarter[]
}

const DIVISIONS = ["AL East", "AL Central", "AL West", "NL East", "NL Central", "NL West"] as const

export function PitcherSearch({ pitchers }: Props) {
  const [query,    setQuery]    = useState("")
  const [division, setDivision] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pitchers.filter((p) => {
      const matchesQuery    = !q || p.name.toLowerCase().includes(q) || p.teamAbbr.toLowerCase().includes(q) || p.teamName.toLowerCase().includes(q)
      const matchesDivision = !division || p.division === division
      return matchesQuery && matchesDivision
    })
  }, [pitchers, query, division])

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or team…"
          className="w-full rounded-lg border border-ds-line bg-[var(--ds-panel-2)] pl-9 pr-4 py-2.5 font-jet text-[13px] text-ds-ink placeholder:text-ds-dim focus:outline-none focus:border-ds-cy/60 focus:ring-1 focus:ring-ds-cy/30 transition-colors"
        />
      </div>

      {/* Division filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setDivision(null)}
          className={cn(
            "rounded-full border px-3 py-1 font-jet text-[11px] font-medium transition-colors",
            division === null
              ? "border-ds-cy/50 bg-ds-cy/10 text-ds-cy"
              : "border-ds-line text-ds-muted hover:text-ds-ink hover:border-ds-line/80"
          )}
        >
          All
        </button>
        {DIVISIONS.map((div) => (
          <button
            key={div}
            onClick={() => setDivision(division === div ? null : div)}
            className={cn(
              "rounded-full border px-3 py-1 font-jet text-[11px] font-medium transition-colors",
              division === div
                ? "border-ds-cy/50 bg-ds-cy/10 text-ds-cy"
                : "border-ds-line text-ds-muted hover:text-ds-ink hover:border-ds-line/80"
            )}
          >
            {div}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-lg border border-ds-line overflow-hidden" style={{ background: "var(--ds-panel-2)" }}>
        {filtered.length === 0 ? (
          <p className="px-4 py-6 font-jet text-[12px] text-ds-muted text-center">
            {query ? `No pitchers found for "${query}"` : "No pitchers in this division"}
          </p>
        ) : (
          <div className="max-h-[520px] overflow-y-auto divide-y divide-ds-line">
            {filtered.map((p) => (
              <Link
                key={p.id}
                href={`/pitcher/${p.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-[var(--ds-panel)] transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-jet text-[11px] font-bold text-[#041018] shrink-0"
                    style={{ background: "linear-gradient(135deg, var(--ds-cy), var(--ds-gr) 50%, var(--ds-bl))" }}
                  >
                    {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-display text-[14px] font-medium text-ds-ink group-hover:text-ds-cy transition-colors">
                      {p.name}
                    </p>
                    <p className="font-jet text-[11px] text-ds-muted">
                      {p.teamAbbr} · {p.division}
                    </p>
                  </div>
                </div>
                <span className="font-jet text-[11px] text-ds-dim group-hover:text-ds-cy transition-colors">
                  #{p.id} →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <p className="font-jet text-[11px] text-ds-dim">
        {filtered.length} of {pitchers.length} active starters · 2026 season · Direct URL: /pitcher/[mlb-id]
      </p>
    </div>
  )
}
