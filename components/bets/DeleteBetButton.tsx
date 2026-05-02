"use client"

import { useTransition, useState } from "react"
import { deleteBetAction } from "@/app/actions"

export function DeleteBetButton({ betId }: { betId: string }) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  if (done) return null

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const result = await deleteBetAction(betId)
          if (result.ok) setDone(true)
        })
      }
      disabled={isPending}
      className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1 font-jet text-[10px] uppercase tracking-[0.1em] text-red-400 hover:bg-red-500/15 disabled:opacity-50 transition-colors"
    >
      {isPending ? "…" : "Delete"}
    </button>
  )
}
