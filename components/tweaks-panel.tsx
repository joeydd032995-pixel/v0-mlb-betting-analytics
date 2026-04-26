"use client"

import { useState } from "react"
import { Settings, X } from "lucide-react"
import { useDensity } from "@/lib/density-context"
import { cn } from "@/lib/utils"

type Density = "sparse" | "normal" | "dense"

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "sparse", label: "Sparse" },
  { value: "normal", label: "Normal" },
  { value: "dense",  label: "Dense"  },
]

export function TweaksPanel() {
  const [open, setOpen] = useState(false)
  const { density, setDensity } = useDensity()

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full grid place-items-center text-ds-muted transition-all duration-150 hover:text-ds-cy"
        style={{
          background: "var(--ds-panel)",
          border: "1px solid var(--ds-line)",
          boxShadow: "0 10px 40px -10px rgba(0,0,0,0.6)",
        }}
        aria-label="Display settings"
      >
        <Settings className="w-4 h-4" />
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-16 right-4 z-50 min-w-[220px] rounded-[14px] p-4"
          style={{
            background: "linear-gradient(180deg, var(--ds-panel), var(--ds-panel-2))",
            border: "1px solid var(--ds-line)",
            boxShadow: "0 20px 60px -20px #000, 0 0 40px -20px var(--ds-cy)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-jet text-[11px] uppercase tracking-[0.2em] text-ds-muted font-medium">
              Display
            </h4>
            <button
              onClick={() => setOpen(false)}
              className="text-ds-muted hover:text-ds-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <label className="block font-jet text-[11px] uppercase tracking-[0.1em] text-ds-ink-2 mb-2">
            Density
          </label>
          <div
            className="flex gap-1 bg-[#0a1426] border border-ds-line rounded-full p-[3px]"
          >
            {DENSITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDensity(opt.value)}
                className={cn(
                  "flex-1 font-display text-[11px] font-medium py-[7px] px-2.5 rounded-full transition-all duration-150",
                  density === opt.value
                    ? "bg-gradient-to-r from-ds-cy to-ds-bl text-[#041018] font-semibold"
                    : "text-ds-muted hover:text-ds-ink-2"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="font-jet text-[10px] text-ds-muted mt-3 leading-[1.5]">
            Density controls visible metrics and card padding.
          </p>
        </div>
      )}
    </>
  )
}
