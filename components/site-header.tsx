// components/site-header.tsx
// Global sticky header — Diamond Stats brand, centered nav pills, live indicator.

"use client"

import { useState, useEffect } from "react"
import { Search } from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { GlobalSearch } from "@/components/global-search"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const AuthNav = dynamic(() => import("@/components/auth-nav").then(m => ({ default: m.AuthNav })), { ssr: false })

const NAV_ITEMS = [
  { label: "Today",    href: "/" },
  { label: "Pitcher",  href: "/pitcher" },
  { label: "Staff",    href: "/staff" },
  { label: "Ensemble", href: "/ensemble" },
  { label: "History",  href: "/history" },
  { label: "Insights", href: "/insights" },
]

export function SiteHeader() {
  const pathname = usePathname()
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
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 flex-wrap px-7 py-4">

          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="w-10 h-10 rounded-[11px] grid place-items-center font-jet font-bold text-[14px] text-[#041018]"
              style={{
                background: "linear-gradient(135deg, var(--ds-cy), var(--ds-gr) 50%, var(--ds-bl))",
                boxShadow: "0 10px 32px -10px var(--ds-cy), inset 0 1px 0 rgba(255,255,255,.3)",
              }}
            >
              DS
            </div>
            <div>
              <div className="font-display font-semibold text-[16px] leading-none text-ds-ink">DIAMOND STATS</div>
              <div className="font-jet text-[10px] text-ds-muted uppercase tracking-[0.2em] mt-1">
                NRFI · YRFI Ensemble
              </div>
            </div>
          </div>

          {/* Center nav pills */}
          <nav
            className="flex gap-1 bg-[#0a1426] border border-ds-line rounded-full p-1"
            aria-label="Main navigation"
          >
            {NAV_ITEMS.map(({ label, href }) => {
              const active =
                href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "ds-nav-pill text-[12px] font-medium px-4 py-2 rounded-full transition-all duration-150",
                    active ? "ds-nav-pill-active" : "hover:text-ds-ink-2"
                  )}
                >
                  {label}
                </Link>
              )
            })}
          </nav>

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
