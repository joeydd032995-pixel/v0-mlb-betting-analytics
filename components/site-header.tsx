// components/site-header.tsx
// Global sticky header — Homeplate Metrics brand, search, live indicator, nav + auth.

"use client"

import { useState, useEffect } from "react"
import { Search } from "lucide-react"
import dynamic from "next/dynamic"
import { GlobalSearch } from "@/components/global-search"
import { Button } from "@/components/ui/button"

const AuthNav = dynamic(() => import("@/components/auth-nav").then(m => ({ default: m.AuthNav })), { ssr: false })

export function SiteHeader() {
  const [dateStr, setDateStr] = useState("")

  useEffect(() => {
    setDateStr(new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }))
  }, [])

  return (
    <>
      <header
        className="sticky top-0 z-50 backdrop-blur-[10px]"
        style={{
          background: "linear-gradient(180deg, rgba(7,14,26,.95), rgba(7,14,26,.7))",
          borderBottom: "1px solid var(--ds-line)",
        }}
      >
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-7 py-4">

          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="w-10 h-10 rounded-[11px] grid place-items-center font-jet font-bold text-[14px] text-[#041018]"
              style={{
                background: "linear-gradient(135deg, var(--ds-cy), var(--ds-gr) 50%, var(--ds-bl))",
                boxShadow: "0 10px 32px -10px var(--ds-cy), inset 0 1px 0 rgba(255,255,255,.3)",
              }}
            >
              HM
            </div>
            <div>
              <div className="font-display font-semibold text-[16px] leading-none text-ds-ink">HOMEPLATE METRICS</div>
              <div className="font-jet text-[10px] text-ds-muted uppercase tracking-[0.2em] mt-1">
                NRFI · YRFI Ensemble
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2.5 text-[12px] shrink-0">
            {/* Search */}
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-7 gap-2 px-2.5 text-[12px] text-ds-muted hover:text-ds-ink sm:flex"
              onClick={() => {
                document.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true })
                )
              }}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Search...</span>
              <span className="ml-auto text-[10px] rounded border border-ds-line px-1 py-0.5">⌘K</span>
            </Button>

            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-2 font-jet text-[11px] text-ds-muted">
              <span className="ds-live-dot" />
              <span>LIVE · {new Date().getFullYear()}</span>
            </div>

            {dateStr && (
              <span className="hidden rounded-full border border-ds-line px-2.5 py-0.5 text-ds-muted font-jet text-[10px] sm:inline">
                {dateStr}
              </span>
            )}

            <AuthNav />
          </div>
        </div>
      </header>

      <GlobalSearch />
    </>
  )
}
