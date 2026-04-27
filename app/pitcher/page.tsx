// app/pitcher/page.tsx — Pitcher search with dropdown list
"use client"

import { useState, useMemo } from "react"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { Panel } from "@/components/diamond/Panel"
import { Search } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface PitcherEntry {
  name: string
  id: string
  team: string
  throws: "R" | "L"
}

const PITCHER_LIST: PitcherEntry[] = [
  { name: "Gerrit Cole",         id: "543037",  team: "NYY", throws: "R" },
  { name: "Carlos Rodón",        id: "607074",  team: "NYY", throws: "L" },
  { name: "Tyler Glasnow",       id: "607192",  team: "LAD", throws: "R" },
  { name: "Gavin Stone",         id: "694816",  team: "LAD", throws: "R" },
  { name: "Logan Webb",          id: "657277",  team: "SF",  throws: "R" },
  { name: "Blake Snell",         id: "605483",  team: "SF",  throws: "L" },
  { name: "Kevin Gausman",       id: "592332",  team: "SF",  throws: "R" },
  { name: "Spencer Strider",     id: "675911",  team: "ATL", throws: "R" },
  { name: "Chris Sale",          id: "519242",  team: "ATL", throws: "L" },
  { name: "Framber Valdez",      id: "664285",  team: "HOU", throws: "L" },
  { name: "Hunter Brown",        id: "682243",  team: "HOU", throws: "R" },
  { name: "Aaron Nola",          id: "605400",  team: "PHI", throws: "R" },
  { name: "Zack Wheeler",        id: "554430",  team: "PHI", throws: "R" },
  { name: "Corbin Burnes",       id: "669203",  team: "BAL", throws: "R" },
  { name: "Grayson Rodriguez",   id: "686772",  team: "BAL", throws: "R" },
  { name: "Sandy Alcantara",     id: "645261",  team: "MIA", throws: "R" },
  { name: "Zac Gallen",          id: "668678",  team: "ARI", throws: "R" },
  { name: "Pablo López",         id: "641154",  team: "MIN", throws: "R" },
  { name: "Joe Ryan",            id: "666201",  team: "MIN", throws: "R" },
  { name: "Dylan Cease",         id: "656302",  team: "SD",  throws: "R" },
  { name: "Michael King",        id: "650928",  team: "SD",  throws: "R" },
  { name: "Luis Castillo",       id: "622608",  team: "SEA", throws: "R" },
  { name: "Bryce Miller",        id: "694190",  team: "SEA", throws: "R" },
  { name: "Shane McClanahan",    id: "663855",  team: "TB",  throws: "L" },
  { name: "Sonny Gray",          id: "543243",  team: "STL", throws: "R" },
  { name: "José Berríos",        id: "621237",  team: "TOR", throws: "R" },
  { name: "Chris Bassitt",       id: "605135",  team: "TOR", throws: "R" },
  { name: "Nick Pivetta",        id: "607680",  team: "BOS", throws: "R" },
  { name: "Tanner Bibee",        id: "680694",  team: "CLE", throws: "R" },
  { name: "Triston McKenzie",    id: "676440",  team: "CLE", throws: "R" },
  { name: "Kodai Senga",         id: "879124",  team: "NYM", throws: "R" },
  { name: "Max Scherzer",        id: "453286",  team: "TEX", throws: "R" },
  { name: "Jordan Montgomery",   id: "666152",  team: "TEX", throws: "L" },
  { name: "Freddy Peralta",      id: "662576",  team: "MIL", throws: "R" },
  { name: "Edward Cabrera",      id: "681912",  team: "MIA", throws: "R" },
]

export default function PitcherListPage() {
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PITCHER_LIST
    return PITCHER_LIST.filter(
      p => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)
    )
  }, [query])

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Pitcher Deep Dive</SectionLabel>

        <Panel title="Search Pitchers" chip="2026 Season" className="max-w-2xl">
          {/* Search input */}
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-muted pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder="Search by name or team…"
              className="w-full rounded-lg border border-ds-line bg-[var(--ds-panel-2)] pl-9 pr-4 py-2.5 font-jet text-[13px] text-ds-ink placeholder:text-ds-dim focus:outline-none focus:border-ds-cy/60 focus:ring-1 focus:ring-ds-cy/30 transition-colors"
            />
          </div>

          {/* Dropdown / inline list */}
          <div
            className={cn(
              "mt-3 rounded-lg border border-ds-line overflow-hidden transition-all",
              (focused || query) ? "opacity-100" : "opacity-80"
            )}
            style={{ background: "var(--ds-panel-2)" }}
          >
            {filtered.length === 0 ? (
              <p className="px-4 py-4 font-jet text-[12px] text-ds-muted text-center">
                No pitchers found for &quot;{query}&quot;
              </p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-ds-line">
                {filtered.map(p => (
                  <Link
                    key={p.id}
                    href={`/pitcher/${p.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-[var(--ds-panel)] transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-jet text-[11px] font-bold text-[#041018] shrink-0"
                        style={{ background: "linear-gradient(135deg, var(--ds-cy), var(--ds-gr) 50%, var(--ds-bl))" }}>
                        {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-display text-[14px] font-medium text-ds-ink group-hover:text-ds-cy transition-colors">
                          {p.name}
                        </p>
                        <p className="font-jet text-[11px] text-ds-muted">
                          {p.team} · {p.throws}HP
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

          <p className="mt-3 font-jet text-[11px] text-ds-dim">
            {PITCHER_LIST.length} starting pitchers available · Direct URL: /pitcher/[mlb-id]
          </p>
        </Panel>
      </main>
    </div>
  )
}
