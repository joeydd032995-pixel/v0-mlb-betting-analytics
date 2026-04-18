// components/site-header.tsx
// Global sticky header rendered from app/layout.tsx.
// Includes logo, navigation (via AuthNav), date, and auth controls.

"use client"

import { Activity } from "lucide-react"
import { AuthNav } from "@/components/auth-nav"

export function SiteHeader() {
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
            <Activity className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none tracking-tight text-foreground sm:text-base">
              HomeplateMetrics
            </h1>
            <p className="text-xs text-muted-foreground">NRFI/YRFI Prediction Engine</p>
          </div>
        </div>

        {/* Navigation + Auth */}
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-400 sm:inline">
            {dateStr}
          </span>
          <AuthNav />
        </div>
      </div>
    </header>
  )
}
