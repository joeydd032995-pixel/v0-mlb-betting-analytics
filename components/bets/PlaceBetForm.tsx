"use client"

import { useTransition, useState, useEffect, useRef } from "react"
import { placeBetAction } from "@/app/actions"

export function PlaceBetForm() {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [gameId, setGameId] = useState("")
  const [amount, setAmount] = useState("")
  const [odds, setOdds] = useState("")
  const [prediction, setPrediction] = useState<"NRFI" | "YRFI">("NRFI")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  function reset() {
    setGameId("")
    setAmount("")
    setOdds("")
    setPrediction("NRFI")
    setError(null)
    setSuccess(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountVal = parseFloat(amount)
    const oddsVal = parseFloat(odds)
    if (!gameId.trim()) { setError("Game ID is required"); return }
    if (!amountVal || amountVal <= 0) { setError("Enter a positive stake"); return }
    if (isNaN(oddsVal) || oddsVal === 0) { setError("Enter valid non-zero odds (e.g. -110 or +120)"); return }
    setError(null)
    startTransition(async () => {
      const result = await placeBetAction({ gameId: gameId.trim(), amount: amountVal, odds: oddsVal, prediction })
      if (result.ok) {
        setSuccess(true)
        timeoutRef.current = setTimeout(() => { reset(); setOpen(false) }, 1200)
      } else {
        setError(result.error)
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-[8px] bg-sky-500 px-4 py-2 font-jet text-[11px] uppercase tracking-[0.15em] text-white hover:bg-sky-400 transition-colors"
      >
        + Log Bet
      </button>
    )
  }

  return (
    <div
      className="rounded-[14px] border border-ds-line p-6 mb-2"
      style={{ background: "var(--ds-panel)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="font-jet text-[12px] uppercase tracking-[0.15em] text-ds-muted">Log a Bet</span>
        <button
          onClick={() => { reset(); setOpen(false) }}
          className="font-jet text-[11px] text-ds-muted hover:text-ds-fg"
        >
          ✕
        </button>
      </div>

      {success ? (
        <p className="font-jet text-[12px] text-emerald-400 text-center py-4">Bet logged ✓</p>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          {/* Game ID */}
          <div className="col-span-2">
            <label htmlFor="bet-gameId" className="block font-jet text-[10px] uppercase tracking-[0.12em] text-ds-muted mb-1">
              Game ID
            </label>
            <input
              id="bet-gameId"
              type="text"
              placeholder="e.g. 745302"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="w-full rounded-[8px] border border-ds-line bg-transparent px-3 py-2 font-jet text-[12px] text-ds-fg placeholder-ds-muted focus:border-sky-400 focus:outline-none"
            />
          </div>

          {/* Prediction */}
          <div>
            <label className="block font-jet text-[10px] uppercase tracking-[0.12em] text-ds-muted mb-1">
              Prediction
            </label>
            <div className="flex gap-2">
              {(["NRFI", "YRFI"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPrediction(opt)}
                  className={`flex-1 rounded-[6px] border py-1.5 font-jet text-[10px] uppercase tracking-[0.1em] transition-colors ${
                    prediction === opt
                      ? "border-sky-400 bg-sky-400/10 text-sky-400"
                      : "border-ds-line text-ds-muted"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Odds */}
          <div>
            <label htmlFor="bet-odds" className="block font-jet text-[10px] uppercase tracking-[0.12em] text-ds-muted mb-1">
              Odds
            </label>
            <input
              id="bet-odds"
              type="number"
              step="1"
              placeholder="-110"
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              className="w-full rounded-[8px] border border-ds-line bg-transparent px-3 py-2 font-jet text-[12px] text-ds-fg placeholder-ds-muted focus:border-sky-400 focus:outline-none"
            />
          </div>

          {/* Amount */}
          <div className="col-span-2">
            <label htmlFor="bet-amount" className="block font-jet text-[10px] uppercase tracking-[0.12em] text-ds-muted mb-1">
              Stake ($)
            </label>
            <input
              id="bet-amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="50.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-[8px] border border-ds-line bg-transparent px-3 py-2 font-jet text-[12px] text-ds-fg placeholder-ds-muted focus:border-sky-400 focus:outline-none"
            />
          </div>

          {error && <p className="col-span-2 font-jet text-[11px] text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="col-span-2 rounded-[8px] bg-sky-500 px-4 py-2 font-jet text-[11px] uppercase tracking-[0.15em] text-white hover:bg-sky-400 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Logging…" : "Log Bet"}
          </button>
        </form>
      )}
    </div>
  )
}
