"use client"

import { useTransition, useState } from "react"
import { removeWatchlistAction } from "@/app/actions"

export function RemoveWatchlistButton({ gameId }: { gameId: string }) {
  const [isPending, startTransition] = useTransition()
  const [removed, setRemoved] = useState(false)

  if (removed) return null

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const result = await removeWatchlistAction(gameId)
          if (result.ok) setRemoved(true)
        })
      }
      disabled={isPending}
      className="rounded-[6px] border border-red-500/30 bg-red-500/5 px-3 py-1.5 font-jet text-[10px] uppercase tracking-[0.1em] text-red-400 hover:bg-red-500/15 disabled:opacity-50 transition-colors"
    >
      {isPending ? "…" : "Remove"}
    </button>
  )
}
