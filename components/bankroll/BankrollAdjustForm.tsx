"use client"

import { useTransition, useState } from "react"
import { adjustBankrollAction } from "@/app/actions"

type TransactionType = "deposit" | "withdrawal" | "adjustment"

export function BankrollAdjustForm() {
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState<TransactionType>("deposit")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseFloat(amount)
    if (!value || value <= 0) {
      setError("Enter a positive amount")
      return
    }
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await adjustBankrollAction({
        amount: value,
        type,
        note: note.trim() || undefined,
      })
      if (result.ok) {
        setAmount("")
        setNote("")
        setSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} recorded`)
      } else {
        setError(result.error)
      }
    })
  }

  const TYPES: { value: TransactionType; label: string }[] = [
    { value: "deposit",    label: "Deposit" },
    { value: "withdrawal", label: "Withdrawal" },
    { value: "adjustment", label: "Adjustment" },
  ]

  return (
    <div
      className="rounded-[14px] border border-ds-line p-6"
      style={{ background: "var(--ds-panel)" }}
    >
      <h2 className="font-jet text-[12px] uppercase tracking-[0.15em] text-ds-muted mb-4">
        Adjust Bankroll
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type selector */}
        <div className="flex gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`flex-1 rounded-[6px] border px-3 py-1.5 font-jet text-[10px] uppercase tracking-[0.12em] transition-colors ${
                type === t.value
                  ? "border-sky-400 bg-sky-400/10 text-sky-400"
                  : "border-ds-line text-ds-muted hover:border-sky-400/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div>
          <label className="block font-jet text-[10px] uppercase tracking-[0.15em] text-ds-muted mb-2">
            Amount ($)
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-[8px] border border-ds-line bg-transparent px-3 py-2 font-jet text-[13px] text-ds-fg placeholder-ds-muted focus:border-sky-400 focus:outline-none"
          />
        </div>

        {/* Note */}
        <div>
          <label className="block font-jet text-[10px] uppercase tracking-[0.15em] text-ds-muted mb-2">
            Note (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Reload for new month"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-[8px] border border-ds-line bg-transparent px-3 py-2 font-jet text-[13px] text-ds-fg placeholder-ds-muted focus:border-sky-400 focus:outline-none"
          />
        </div>

        {error && <p className="font-jet text-[11px] text-red-400">{error}</p>}
        {success && <p className="font-jet text-[11px] text-emerald-400">{success}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-[8px] bg-sky-500 px-4 py-2 font-jet text-[11px] uppercase tracking-[0.15em] text-white hover:bg-sky-400 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  )
}
