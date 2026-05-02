"use client"

import { useTransition, useState } from "react"
import { removeWatchlistAction } from "@/app/actions"

export function RemoveWatchlistButton({ gameId, onRemoved }: { gameId: string; onRemoved: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="font-jet text-[10px] text-red-400">{error}</span>}
      <button
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await removeWatchlistAction(gameId)
            if (result.ok) onRemoved()
            else setError(result.error)
          })
        }}
        disabled={isPending}
        className="rounded-[6px] border border-red-500/30 bg-red-500/5 px-3 py-1.5 font-jet text-[10px] uppercase tracking-[0.1em] text-red-400 hover:bg-red-500/15 disabled:opacity-50 transition-colors"
      >
        {isPending ? "…" : "Remove"}
      </button>
    </div>
  )
}
