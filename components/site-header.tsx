"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Search, Menu, X } from "lucide-react"
import dynamic from "next/dynamic"
import { GlobalSearch } from "@/components/global-search"
import { HEADER_NAV_LINKS } from "@/lib/constants/nav-links"

const AuthNav = dynamic(
  () => import("@/components/auth-nav").then((m) => ({ default: m.AuthNav })),
  { ssr: false }
)

const NavDrawer = dynamic(
  () => import("@/components/nav-drawer").then((m) => ({ default: m.NavDrawer })),
  { ssr: false }
)

const DIAMOND_SVG = (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="hm-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00e5ff" />
        <stop offset="100%" stopColor="#00e676" />
      </linearGradient>
      <filter id="hm-logo-glow">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    {/* Outer diamond */}
    <polygon
      points="16,2 30,16 16,30 2,16"
      fill="url(#hm-logo-grad)"
      filter="url(#hm-logo-glow)"
    />
    {/* Inner cutout */}
    <polygon
      points="16,7 25,16 16,25 7,16"
      fill="rgba(0,0,0,0.85)"
    />
    {/* HM text */}
    <text
      x="16" y="19.5"
      textAnchor="middle"
      fontFamily="'DM Mono', monospace"
      fontWeight="500"
      fontSize="6.5"
      fill="#00e5ff"
      letterSpacing="0.5"
    >
      HM
    </text>
  </svg>
)

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [drawerOpen, setDrawer] = useState(false)
  const [dateStr, setDateStr] = useState("")

  useEffect(() => {
    setDateStr(
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      }).format(new Date())
    )
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [drawerOpen])

  const openSearch = () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
  }

  return (
    <>
      <header
        className="sticky top-0 z-50 h-[52px] sm:h-[56px] flex items-center"
        style={{
          background: scrolled
            ? "rgba(20,20,20,0.97)"
            : "linear-gradient(180deg, rgba(20,20,20,0.99), rgba(28,28,28,0.92))",
          backdropFilter: scrolled ? "blur(16px) saturate(180%)" : undefined,
          borderBottom: scrolled ? "1px solid rgba(0,229,255,0.12)" : "1px solid transparent",
          boxShadow: scrolled ? "0 4px 32px rgba(0,0,0,0.6)" : "none",
          transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
        }}
      >
        {/* Top accent stripe */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0,
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.6) 30%, rgba(0,230,118,0.4) 60%, transparent)",
          }}
        />

        <div className="mx-auto w-full max-w-[1480px] flex items-center justify-between gap-3 px-3 sm:px-5 lg:px-7">

          {/* ── Brand ── */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            {DIAMOND_SVG}
            <div>
              <div
                className="font-display font-bold uppercase leading-none tracking-[0.08em] text-[13px] sm:text-[15px]"
                style={{ color: "var(--hm-chalk)" }}
              >
                HOMEPLATE
              </div>
              <div
                className="font-mono uppercase tracking-[0.18em] leading-none mt-[2px]"
                style={{ fontSize: "9px", color: "var(--hm-smoke)" }}
              >
                METRICS
              </div>
            </div>
          </Link>

          {/* ── Desktop nav (lg+) ── */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {HEADER_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-mono uppercase px-[10px] py-[5px] rounded-[3px] transition-colors"
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  color: "var(--hm-smoke)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--hm-diamond)"
                  e.currentTarget.style.background = "rgba(0,229,255,0.06)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--hm-smoke)"
                  e.currentTarget.style.background = "transparent"
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* ── Right cluster ── */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Live dot */}
            <div className="flex items-center gap-[6px]">
              <span className="hm-live-dot" />
              <span
                className="hidden sm:inline font-mono uppercase tracking-[0.14em]"
                style={{ fontSize: "9px", color: "var(--hm-mist)" }}
              >
                LIVE
              </span>
            </div>

            {/* Date chip */}
            {dateStr && (
              <span
                className="hidden md:inline font-mono tracking-[0.1em] rounded-[3px] px-[8px] py-[3px]"
                style={{
                  fontSize: "9px",
                  color: "var(--hm-mist)",
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid var(--hm-fence)",
                }}
              >
                {dateStr}
              </span>
            )}

            {/* Search — full on sm+, icon-only below */}
            <button
              onClick={openSearch}
              className="hidden sm:flex items-center gap-2 rounded-[3px] px-[8px] py-[4px] transition-colors"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--hm-fence)",
                color: "var(--hm-mist)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
              }}
            >
              <Search size={13} />
              <span className="hidden md:inline tracking-[0.06em]">Search</span>
              <kbd
                className="rounded-[2px] px-[4px] py-[1px]"
                style={{
                  fontSize: "9px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--hm-fence)",
                  color: "var(--hm-smoke)",
                }}
              >
                ⌘K
              </kbd>
            </button>

            {/* Icon-only search on mobile */}
            <button
              onClick={openSearch}
              className="flex sm:hidden items-center justify-center w-8 h-8 rounded-[3px] transition-colors"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--hm-fence)",
                color: "var(--hm-mist)",
              }}
              aria-label="Search"
            >
              <Search size={14} />
            </button>

            <AuthNav />

            {/* Hamburger — the single nav menu, at every breakpoint */}
            <button
              className="flex items-center justify-center w-8 h-8 rounded-[3px] transition-colors"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--hm-fence)",
                color: "var(--hm-mist)",
              }}
              onClick={() => setDrawer((v) => !v)}
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
              aria-controls="hm-nav-drawer"
            >
              {drawerOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Nav drawer (single menu, all breakpoints) ── */}
      <NavDrawer open={drawerOpen} onClose={() => setDrawer(false)} />

      <GlobalSearch />
    </>
  )
}
