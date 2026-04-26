"use client"

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { cn } from "@/lib/utils"

interface RadarDataPoint {
  subject: string
  A: number
  B?: number
  fullMark?: number
}

interface HfRadarProps {
  data: RadarDataPoint[]
  labelA?: string
  labelB?: string
  colorA?: string
  colorB?: string
  className?: string
}

export function HfRadar({
  data,
  labelA = "Player",
  labelB,
  colorA = "#22d3ee",
  colorB = "#10b981",
  className,
}: HfRadarProps) {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="var(--ds-line)" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "var(--ds-muted)", fontSize: 11, fontFamily: "var(--font-jet)" }}
          />
          <Radar
            name={labelA}
            dataKey="A"
            stroke={colorA}
            fill={colorA}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          {labelB && (
            <Radar
              name={labelB}
              dataKey="B"
              stroke={colorB}
              fill={colorB}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "var(--ds-panel)",
              border: "1px solid var(--ds-line)",
              borderRadius: 8,
              fontFamily: "var(--font-jet)",
              fontSize: 11,
              color: "var(--ds-ink)",
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
      {labelB && (
        <div className="flex justify-center gap-5 mt-1 font-jet text-[11px] text-ds-muted">
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: colorA }} />{labelA}</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: colorB }} />{labelB}</span>
        </div>
      )}
    </div>
  )
}
