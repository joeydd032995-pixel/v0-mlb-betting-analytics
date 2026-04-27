// app/pitcher/page.tsx — Pitcher search with live MLB roster data
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { Panel } from "@/components/diamond/Panel"
import { PitcherSearch } from "@/components/pitcher/PitcherSearch"
import { fetchAllActiveStarters } from "@/lib/api/mlb-stats"
import type { ActiveStarter } from "@/lib/api/mlb-stats"

export const revalidate = 3600

// Fallback list of verified-correct MLB pitcher IDs (used when API is unavailable)
const FALLBACK_PITCHERS: ActiveStarter[] = [
  { id: "543037", name: "Gerrit Cole",       teamAbbr: "NYY", teamName: "New York Yankees",       division: "AL East"   },
  { id: "607074", name: "Carlos Rodón",      teamAbbr: "NYY", teamName: "New York Yankees",       division: "AL East"   },
  { id: "607192", name: "Tyler Glasnow",     teamAbbr: "LAD", teamName: "Los Angeles Dodgers",    division: "NL West"   },
  { id: "657277", name: "Logan Webb",        teamAbbr: "SF",  teamName: "San Francisco Giants",   division: "NL West"   },
  { id: "605483", name: "Blake Snell",       teamAbbr: "SF",  teamName: "San Francisco Giants",   division: "NL West"   },
  { id: "592332", name: "Kevin Gausman",     teamAbbr: "SF",  teamName: "San Francisco Giants",   division: "NL West"   },
  { id: "675911", name: "Spencer Strider",   teamAbbr: "ATL", teamName: "Atlanta Braves",         division: "NL East"   },
  { id: "519242", name: "Chris Sale",        teamAbbr: "ATL", teamName: "Atlanta Braves",         division: "NL East"   },
  { id: "664285", name: "Framber Valdez",    teamAbbr: "HOU", teamName: "Houston Astros",         division: "AL West"   },
  { id: "605400", name: "Aaron Nola",        teamAbbr: "PHI", teamName: "Philadelphia Phillies",  division: "NL East"   },
  { id: "554430", name: "Zack Wheeler",      teamAbbr: "PHI", teamName: "Philadelphia Phillies",  division: "NL East"   },
  { id: "669203", name: "Corbin Burnes",     teamAbbr: "BAL", teamName: "Baltimore Orioles",      division: "AL East"   },
  { id: "645261", name: "Sandy Alcantara",   teamAbbr: "MIA", teamName: "Miami Marlins",          division: "NL East"   },
  { id: "668678", name: "Zac Gallen",        teamAbbr: "ARI", teamName: "Arizona Diamondbacks",   division: "NL West"   },
  { id: "641154", name: "Pablo López",       teamAbbr: "MIN", teamName: "Minnesota Twins",        division: "AL Central"},
  { id: "656302", name: "Dylan Cease",       teamAbbr: "SD",  teamName: "San Diego Padres",       division: "NL West"   },
  { id: "605135", name: "Chris Bassitt",     teamAbbr: "TOR", teamName: "Toronto Blue Jays",      division: "AL East"   },
  { id: "543243", name: "Sonny Gray",        teamAbbr: "STL", teamName: "St. Louis Cardinals",    division: "NL Central"},
]

export default async function PitcherListPage() {
  const live = await fetchAllActiveStarters()
  const pitchers = live.length > 0 ? live : FALLBACK_PITCHERS

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Pitcher Deep Dive</SectionLabel>

        <Panel title="Search Pitchers" chip="2026 Season" className="max-w-2xl">
          <PitcherSearch pitchers={pitchers} />
        </Panel>
      </main>
    </div>
  )
}
