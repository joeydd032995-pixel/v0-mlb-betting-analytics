"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { createBrowserClientSide, type WatchlistItem } from "@/lib/supabase"
import { Heart, Clock, TrendingUp } from "lucide-react"

export default function WatchlistPage() {
  const { isLoaded, userId } = useAuth()
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded || !userId) {
      setLoading(false)
      return
    }

    const fetchWatchlist = async () => {
      try {
        const supabase = createBrowserClientSide()
        const { data, error } = await supabase
          .from("watchlist")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })

        if (error) throw error
        setWatchlist(data || [])
      } catch (error) {
        console.error("Failed to fetch watchlist:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchWatchlist()
  }, [isLoaded, userId])

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-6xl px-4 py-6">
          <p className="text-muted-foreground">Loading...</p>
        </main>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-6xl px-4 py-6">
          <p className="text-muted-foreground">Please sign in to view your watchlist.</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
              <Heart className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">My Watchlist</h1>
              <p className="text-sm text-muted-foreground">
                Games you're tracking for betting decisions.
              </p>
            </div>
          </div>
        </div>

        {/* Watchlist content */}
        {loading ? (
          <div className="rounded-lg border border-border/30 bg-card/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading watchlist...</p>
          </div>
        ) : watchlist.length === 0 ? (
          <div className="rounded-lg border border-border/30 bg-card/50 p-12 text-center">
            <Heart className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No games in your watchlist yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add games to your watchlist from the dashboard to track them here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="text-xs text-muted-foreground">
              {watchlist.length} game{watchlist.length !== 1 ? "s" : ""} in watchlist
            </div>
            {watchlist.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border/30 bg-card/50 p-4 hover:bg-card/70 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Game {item.game_id}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Added {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button className="rounded-md border border-border/30 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors">
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
