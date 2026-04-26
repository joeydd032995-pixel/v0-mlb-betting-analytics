import { cn } from "@/lib/utils"

interface HfBarProps {
  /** Value 0–1 determines bar height as a percentage of the container */
  value: number
  label: string
  sublabel?: string
  color?: string
  className?: string
}

export function HfBar({ value, label, sublabel, color = "var(--ds-cy)", className }: HfBarProps) {
  const heightPct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={cn("flex flex-col items-center gap-2 h-full justify-end", className)}>
      <span className="font-jet text-[10px] text-ds-muted tracking-[0.05em]">{heightPct}%</span>
      <div
        className="w-full rounded-[6px_6px_2px_2px] min-h-[6px] transition-all duration-500"
        style={{
          height: `${Math.max(6, heightPct * 1.8)}px`,
          background: color,
          boxShadow: `0 0 28px -6px ${color}`,
        }}
      />
      <div className="text-center font-jet text-[10px] text-ds-muted uppercase tracking-[0.1em] leading-[1.4]">
        {sublabel && <span className="block">{sublabel}</span>}
        <b className="block text-ds-ink text-[14px] font-display font-semibold tracking-[-0.01em] mt-[3px] normal-case">
          {label}
        </b>
      </div>
    </div>
  )
}
