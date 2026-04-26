"use client"

import { useId } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { cn } from "@/lib/utils"

interface SparkDataPoint {
  name?: string
  value: number
  value2?: number
}

interface HfSparkProps {
  data: SparkDataPoint[]
  label?: string
  label2?: string
  color?: string
  color2?: string
  height?: number
  className?: string
  showGrid?: boolean
}

export function HfSpark({
  data,
  label = "Value",
  label2,
  color = "#22d3ee",
  color2 = "#10b981",
  height = 200,
  className,
  showGrid = false,
}: HfSparkProps) {
  const uid = useId()
  const gradId1 = `sparkGrad1-${uid}`
  const gradId2 = `sparkGrad2-${uid}`
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={gradId1} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            {label2 && (
              <linearGradient id={gradId2} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color2} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color2} stopOpacity={0} />
              </linearGradient>
            )}
          </defs>
          {showGrid && <CartesianGrid stroke="var(--ds-line)" strokeDasharray="3 3" opacity={0.5} />}
          <XAxis
            dataKey="name"
            tick={{ fill: "var(--ds-muted)", fontSize: 10, fontFamily: "var(--font-jet)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--ds-muted)", fontSize: 10, fontFamily: "var(--font-jet)" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
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
          <Area
            type="monotone"
            dataKey="value"
            name={label}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId1})`}
            dot={false}
            activeDot={{ r: 3, fill: color }}
          />
          {label2 && (
            <Area
              type="monotone"
              dataKey="value2"
              name={label2}
              stroke={color2}
              strokeWidth={2}
              fill={`url(#${gradId2})`}
              dot={false}
              activeDot={{ r: 3, fill: color2 }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      {label2 && (
        <div className="flex gap-5 mt-2 font-jet text-[11px] text-ds-muted">
          <span><i className="inline-block w-2.5 h-0.5 rounded mr-1.5 align-middle" style={{ background: color }} />{label}</span>
          <span><i className="inline-block w-2.5 h-0.5 rounded mr-1.5 align-middle" style={{ background: color2 }} />{label2}</span>
        </div>
      )}
    </div>
  )
}
