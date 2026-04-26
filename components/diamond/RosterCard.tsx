"use client"

import { cn } from "@/lib/utils"

interface RosterCardProps {
  initials: string
  name: string
  role?: string
  value?: string
  valueLabel?: string
  tag?: string
  selected?: boolean
  compare?: boolean
  onClick?: () => void
  className?: string
}

export function RosterCard({
  initials,
  name,
  role,
  value,
  valueLabel,
  tag,
  selected,
  compare,
  onClick,
  className,
}: RosterCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden bg-[#0a1426] border border-ds-line rounded-xl p-[14px] flex gap-3 items-center cursor-pointer transition-all duration-150",
        "hover:border-ds-cy hover:-translate-y-px hover:shadow-[0_10px_30px_-15px_rgba(34,211,238,0.3)]",
        selected && "border-ds-cy bg-gradient-to-br from-ds-cy/10 to-ds-bl/5 shadow-[0_0_30px_-10px_var(--ds-cy)]",
        compare && "border-ds-gr bg-gradient-to-br from-ds-gr/10 to-ds-gr-2/5",
        className
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-[38px] h-[38px] shrink-0 rounded-[11px] border border-ds-line bg-gradient-to-br from-[#1d3457] to-[#0a1426] grid place-items-center font-jet font-semibold text-[12px]",
          compare ? "text-ds-gr" : "text-ds-cy"
        )}
      >
        {initials}
      </div>
      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="font-display text-[13px] font-medium text-ds-ink leading-[1.2] truncate">{name}</div>
        {role && (
          <div className="font-jet text-[9px] text-ds-muted uppercase tracking-[0.15em] mt-[2px]">{role}</div>
        )}
        {value !== undefined && (
          <div className="mt-1.5 font-display text-[16px] font-semibold tracking-[-0.02em] text-ds-ink">
            {value}
            {valueLabel && (
              <span className="font-jet text-[9px] text-ds-muted uppercase tracking-[0.15em] ml-1 font-normal">{valueLabel}</span>
            )}
          </div>
        )}
      </div>
      {tag && (
        <span className="absolute top-2 right-2.5 font-jet text-[8px] uppercase tracking-[0.15em] text-ds-cy">
          {tag}
        </span>
      )}
    </div>
  )
}
