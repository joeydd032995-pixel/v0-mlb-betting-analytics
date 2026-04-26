// app/pitcher/page.tsx — Pitcher search / list page

import { SectionLabel } from "@/components/diamond/SectionLabel"
import { Panel } from "@/components/diamond/Panel"
import Link from "next/link"

export default function PitcherListPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7">
        <SectionLabel index="01">Pitcher Deep Dive</SectionLabel>

        <Panel title="Search Pitchers" chip="2026 Season" className="max-w-2xl">
          <p className="font-jet text-[13px] text-ds-muted leading-relaxed">
            Navigate to a specific pitcher by entering their MLB player ID in the URL:
          </p>
          <code className="block mt-3 font-jet text-[12px] text-ds-cy bg-[#0a1426] border border-ds-line rounded-lg px-4 py-3">
            /pitcher/[mlb-player-id]
          </code>
          <p className="mt-3 font-jet text-[11px] text-ds-dim">
            Example: Gerrit Cole = /pitcher/543037 · Tyler Glasnow = /pitcher/607192
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { name: "Gerrit Cole",     id: "543037" },
              { name: "Tyler Glasnow",   id: "607192" },
              { name: "Logan Webb",      id: "657277" },
              { name: "Spencer Strider", id: "675911" },
              { name: "Framber Valdez",  id: "664285" },
            ].map(({ name, id }) => (
              <Link
                key={id}
                href={`/pitcher/${id}`}
                className="ds-chip ds-chip-active hover:opacity-80 transition-opacity"
              >
                {name}
              </Link>
            ))}
          </div>
        </Panel>
      </main>
    </div>
  )
}
