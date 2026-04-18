// components/global-search.tsx
// Global command palette accessed via Cmd+K (Mac) or Ctrl+K (Windows/Linux).
// Fetches and searches games and pitchers from live prediction API.

"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { searchGames, searchPitchers, type SearchResult } from "@/lib/search"
import type { Game, Pitcher, NRFIPrediction } from "@/lib/types"
import { Loader2, Search } from "lucide-react"

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [dataLoaded, setDataLoaded] = useState(false)

  const [games, setGames] = useState<Game[]>([])
  const [predictions, setPredictions] = useState<NRFIPrediction[]>([])
  const [pitchers, setPitchers] = useState<Pitcher[]>([])
  const [pitchersById, setPitchersById] = useState<Map<string, Pitcher>>(new Map())

  const router = useRouter()

  // Fetch live data once
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/predictions")
        if (!res.ok) return
        const data = await res.json()

        setGames(data.games || [])
        setPredictions(data.predictions || [])
        setPitchers(Object.values(data.pitchersById || []))
        setPitchersById(new Map(Object.entries(data.pitchersById || {})))
        setDataLoaded(true)
      } catch {
        // Silently fail if data unavailable
      }
    }

    fetchData()
  }, [])

  // Listen for Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => {
          if (!prev) setQuery("")
          return !prev
        })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const results = useMemo(() => {
    if (!query.trim() || !dataLoaded) return []
    const gameResults = searchGames(query, games, predictions, pitchersById)
    const pitcherResults = searchPitchers(query, pitchers)
    return [...gameResults, ...pitcherResults].slice(0, 10)
  }, [query, dataLoaded, games, predictions, pitchers, pitchersById])

  const handleSelect = (result: SearchResult) => {
    if (result.type === "game") {
      const game = result.data as Game
      // Scroll to game in dashboard
      const gameElement = document.getElementById(`game-${game.id}`)
      if (gameElement) {
        gameElement.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
    setOpen(false)
    setQuery("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md overflow-hidden border-border/50 p-0 shadow-lg">
        <Command className="max-h-96">
          <CommandInput
            placeholder="Search games, pitchers, teams... (Cmd+K)"
            value={query}
            onValueChange={setQuery}
            className="border-0 border-b border-border/50"
            disabled={!dataLoaded}
          />
          <CommandList>
            {!dataLoaded ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !query.trim() ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                <Search className="h-4 w-4 mx-auto mb-2 opacity-50" />
                <p>Type to search games and pitchers</p>
                <p className="mt-1 text-[10px] opacity-50">Cmd+K to focus</p>
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>No results found.</CommandEmpty>
            ) : (
              <>
                {results.some((r) => r.type === "game") && (
                  <CommandGroup heading="Games">
                    {results
                      .filter((r) => r.type === "game")
                      .map((result) => (
                        <CommandItem
                          key={result.id}
                          value={result.id}
                          onSelect={() => handleSelect(result)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-1 items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{result.title}</p>
                              {result.subtitle && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {result.subtitle}
                                </p>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
                {results.some((r) => r.type === "pitcher") && (
                  <CommandGroup heading="Pitchers">
                    {results
                      .filter((r) => r.type === "pitcher")
                      .map((result) => (
                        <CommandItem
                          key={result.id}
                          value={result.id}
                          onSelect={() => handleSelect(result)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-1 items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{result.title}</p>
                              {result.subtitle && (
                                <p className="text-xs text-muted-foreground">
                                  {result.subtitle}
                                </p>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
