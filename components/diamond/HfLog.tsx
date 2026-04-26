"use client"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface GameLogEntry {
  result: "W" | "L" | "ND"
  isShutout?: boolean
  date?: string
  opponent?: string
  score?: string
  label?: string
}

interface HfLogProps {
  games: GameLogEntry[]
  className?: string
}

const tileClass: Record<string, string> = {
  W: "ds-log-w",
  L: "ds-log-l",
  ND: "ds-log-nd",
}

export function HfLog({ games, className }: HfLogProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-[repeat(12,1fr)] gap-[6px]">
        {games.map((g, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "aspect-square rounded-[7px] bg-[#0a1426] border border-ds-line relative grid place-items-center font-jet text-[10px] text-ds-muted cursor-pointer transition-transform hover:-translate-y-0.5",
                  tileClass[g.result]
                )}
              >
                {g.label ?? g.result}
                {g.isShutout && (
                  <span className="absolute top-[3px] right-[3px] w-[5px] h-[5px] rounded-full bg-[#fffbe0] shadow-[0_0_6px_#fffbe0]" />
                )}
              </div>
            </TooltipTrigger>
            {(g.date || g.opponent || g.score) && (
              <TooltipContent className="font-jet text-[11px] bg-ds-panel border-ds-line text-ds-ink">
                {g.date && <p className="text-ds-muted">{g.date}</p>}
                {g.opponent && <p>vs {g.opponent}</p>}
                {g.score && <p className="font-semibold">{g.score}</p>}
              </TooltipContent>
            )}
          </Tooltip>
        ))}
      </div>
      {/* Legend */}
      <div className="flex gap-4 flex-wrap font-jet text-[10px] text-ds-muted uppercase tracking-[0.1em]">
        <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-[3px] ds-log-w border border-transparent" />NRFI</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-[3px] ds-log-l border border-transparent" />YRFI</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-[3px] ds-log-nd border border-transparent" />No Decision</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="inline-block w-[5px] h-[5px] rounded-full bg-[#fffbe0] shadow-[0_0_4px_#fffbe0]" />Shutout
        </span>
      </div>
    </div>
  )
}
