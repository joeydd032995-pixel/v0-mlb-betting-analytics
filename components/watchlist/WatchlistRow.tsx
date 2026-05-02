"use client"

import { useState } from "react"
import { RemoveWatchlistButton } from "./RemoveWatchlistButton"

interface WatchlistRowProps {
  gameId: string
  added: string
}

export function WatchlistRow({ gameId, added }: WatchlistRowProps) {
  const [removed, setRemoved] = useState(false)
  if (removed) return null
  return (
    <tr className="border-b border-ds-line/50 last:border-0 hover:bg-white/[0.02]">
      <td className="px-4 py-3 font-jet text-[12px] text-ds-fg">{gameId}</td>
      <td className="px-4 py-3 font-jet text-[11px] text-ds-muted">{added}</td>
      <td className="px-4 py-3 text-right">
        <RemoveWatchlistButton gameId={gameId} onRemoved={() => setRemoved(true)} />
      </td>
    </tr>
  )
}
