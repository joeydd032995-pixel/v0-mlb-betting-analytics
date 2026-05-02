"use client"

import { useTransition, useState } from "react"
import { deleteBetAction } from "@/app/actions"

export function DeleteBetButton({ betId }: { betId: string }) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (done) return null

  return (
    <>
      <button
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await deleteBetAction(betId)
            if (result.ok) setDone(true)
            else setError(result.error)
          })
        }}
        disabled={isPending}
        className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1 font-jet text-[10px] uppercase tracking-[0.1em] text-red-400 hover:bg-red-500/15 disabled:opacity-50 transition-colors"
      >
        {isPending ? "…" : "Delete"}
      </button>
      {error && <span className="font-jet text-[10px] text-red-400 ml-2">{error}</span>}
    </>
  )
}
