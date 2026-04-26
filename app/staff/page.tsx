// app/staff/page.tsx — Team list page

import { SectionLabel } from "@/components/diamond/SectionLabel"
import { Panel } from "@/components/diamond/Panel"
import Link from "next/link"

const MLB_TEAMS = [
  { abbr: "nyy", name: "New York Yankees" },
  { abbr: "bos", name: "Boston Red Sox" },
  { abbr: "lad", name: "Los Angeles Dodgers" },
  { abbr: "sf",  name: "San Francisco Giants" },
  { abbr: "hou", name: "Houston Astros" },
  { abbr: "atl", name: "Atlanta Braves" },
  { abbr: "chc", name: "Chicago Cubs" },
  { abbr: "nym", name: "New York Mets" },
  { abbr: "phi", name: "Philadelphia Phillies" },
  { abbr: "sdp", name: "San Diego Padres" },
]

export default function StaffPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7">
        <SectionLabel index="01">Pitching Staff</SectionLabel>

        <Panel title="Select a Team" chip="2026 Season">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 mt-2">
            {MLB_TEAMS.map(({ abbr, name }) => (
              <Link
                key={abbr}
                href={`/staff/${abbr}`}
                className="flex items-center gap-3 bg-[#0a1426] border border-ds-line rounded-xl px-4 py-3 transition-all hover:border-ds-cy hover:-translate-y-px group"
              >
                <div
                  className="w-9 h-9 rounded-[9px] grid place-items-center font-jet font-bold text-[12px] text-ds-cy shrink-0"
                  style={{ background: "radial-gradient(circle, #1d3457, #0a1426)", border: "1px solid var(--ds-line)" }}
                >
                  {abbr.toUpperCase().slice(0, 3)}
                </div>
                <span className="font-display text-[13px] font-medium text-ds-ink-2 group-hover:text-ds-ink transition-colors truncate">
                  {name}
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      </main>
    </div>
  )
}
