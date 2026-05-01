"use client"

import { useTransition, useState } from "react"
import { initBankrollAction } from "@/app/actions"

export function BankrollInitForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseFloat(amount)
    if (!value || value <= 0) {
      setError("Enter a positive starting balance")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await initBankrollAction({ startingBalance: value })
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div
      className="rounded-[14px] border border-ds-line p-8 max-w-md mx-auto"
      style={{ background: "var(--ds-panel)" }}
    >
      <h2 className="font-jet text-[13px] uppercase tracking-[0.15em] text-ds-muted mb-1">
        Initialize Bankroll
      </h2>
      <p className="font-jet text-[11px] text-ds-muted mb-6">
        Set your starting bankroll to begin tracking bets and P&L.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="startingBalance"
            className="block font-jet text-[10px] uppercase tracking-[0.15em] text-ds-muted mb-2"
          >
            Starting Balance ($)
          </label>
          <input
            id="startingBalance"
            type="number"
            min="1"
            step="0.01"
            placeholder="1000.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-[8px] border border-ds-line bg-transparent px-3 py-2 font-jet text-[13px] text-ds-fg placeholder-ds-muted focus:border-sky-400 focus:outline-none"
          />
        </div>
        {error && (
          <p className="font-jet text-[11px] text-red-400">{error}</p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-[8px] bg-sky-500 px-4 py-2 font-jet text-[11px] uppercase tracking-[0.15em] text-white hover:bg-sky-400 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Initializing…" : "Initialize Bankroll"}
        </button>
      </form>
    </div>
  )
}
