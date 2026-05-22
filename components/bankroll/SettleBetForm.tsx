"use client"

import { useTransition, useState } from "react"
import { settleBetAction } from "@/app/actions"

interface Props {
  betId: string
  amount: number
  prediction: string
  odds: number
}

export function SettleBetForm({ betId, amount, prediction, odds }: Props) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<"NRFI" | "YRFI">(prediction as "NRFI" | "YRFI")
  const [error, setError] = useState<string | null>(null)
  const [settled, setSettled] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await settleBetAction({ betId, result })
      if (res.ok) {
        setSettled(true)
      } else {
        setError(res.error)
      }
    })
  }

  if (settled) {
    return (
      <span className="font-jet text-[10px] text-emerald-400 uppercase tracking-[0.1em]">
        Settled
      </span>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap">
      {/* Result radio */}
      {(["NRFI", "YRFI"] as const).map((opt) => (
        <label
          key={opt}
          className={`flex items-center gap-1 cursor-pointer rounded border px-2 py-1 font-jet text-[10px] uppercase tracking-[0.1em] transition-colors ${
            result === opt
              ? "border-sky-400 bg-sky-400/10 text-sky-400"
              : "border-ds-line text-ds-muted"
          }`}
        >
          <input
            type="radio"
            name={`result-${betId}`}
            value={opt}
            checked={result === opt}
            onChange={() => setResult(opt)}
            className="sr-only"
          />
          {opt}
        </label>
      ))}

      {error && <span className="font-jet text-[10px] text-red-400">{error}</span>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-jet text-[10px] uppercase tracking-[0.1em] text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Settling…" : `Settle ($${amount}, ${odds > 0 ? "+" : ""}${odds})`}
      </button>
    </form>
  )
}
