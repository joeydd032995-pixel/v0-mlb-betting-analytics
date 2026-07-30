// components/diamond/InfoTip.tsx
// Small ⓘ affordance that reveals what a card is NOT showing.
//
// The trigger is a real <button> so it is reachable by keyboard and by tap —
// Radix opens the tooltip on focus as well as hover, which is the only way this
// works on touch devices.
//
// TooltipProvider is mounted once in app/layout.tsx; do not add another here.

"use client"

import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface InfoTipProps {
  /** The limitation being disclosed — what this number does not cover. */
  text: string
  /** Accessible name for the trigger. */
  label?: string
  className?: string
}

export function InfoTip({ text, label = "What this doesn't show", className }: InfoTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex shrink-0 translate-y-[1px] items-center justify-center rounded-full",
            "text-muted-foreground/60 transition-colors hover:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="h-3 w-3" aria-hidden />
        </button>
      </TooltipTrigger>
      {/* normal-case / tracking-normal reset the uppercase mono styling several
          call sites inherit from their card headers. */}
      <TooltipContent
        side="top"
        collisionPadding={12}
        className="max-w-[280px] text-[11px] font-normal normal-case leading-relaxed tracking-normal"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
