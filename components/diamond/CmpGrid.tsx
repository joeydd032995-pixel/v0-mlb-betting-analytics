import { cn } from "@/lib/utils"

interface CmpItem {
  label: string
  valueA: number | string
  valueB: number | string
  /** 0–1 fractions for the bar (if omitted, computed from values if numeric) */
  fracA?: number
  fracB?: number
}

interface CmpGridProps {
  items: CmpItem[]
  nameA: string
  nameB: string
  className?: string
}

function toFrac(v: number | string, other: number | string): number {
  const a = parseFloat(String(v))
  const b = parseFloat(String(other))
  if (isNaN(a) || isNaN(b)) return 0.5
  const sum = a + b
  return sum === 0 ? 0.5 : a / sum
}

export function CmpGrid({ items, nameA, nameB, className }: CmpGridProps) {
  return (
    <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3", className)}>
      {items.map((it, i) => {
        const fa = it.fracA ?? toFrac(it.valueA, it.valueB)
        const fb = 1 - fa
        return (
          <div key={i} className="bg-[#0a1426] border border-ds-line rounded-[10px] p-3">
            <div className="font-jet text-[9px] uppercase tracking-[0.22em] text-ds-muted mb-2">{it.label}</div>
            <div className="flex justify-between items-baseline font-jet">
              <span className="text-[20px] font-semibold text-ds-cy tracking-[-0.02em]">{it.valueA}</span>
              <span className="text-[14px] font-medium text-ds-gr tracking-[-0.02em]">{it.valueB}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#0d1830] mt-2.5 overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-ds-cy to-ds-bl shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                style={{ width: `${fa * 100}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-ds-gr to-ds-gr-2 opacity-80"
                style={{ width: `${fb * 100}%` }}
              />
            </div>
            <div className="flex justify-between font-jet text-[9px] uppercase tracking-[0.1em] mt-1.5">
              <span className="text-ds-cy">{nameA}</span>
              <span className="text-ds-gr">{nameB}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
