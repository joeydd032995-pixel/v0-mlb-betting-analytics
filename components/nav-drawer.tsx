// components/nav-drawer.tsx
// The single site navigation menu — a right-side, full-height, scrollable drawer.
// Opened by the one hamburger in the site header, at every breakpoint.

"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SignedIn } from "@clerk/nextjs"
import { X } from "lucide-react"
import {
  NAV_SECTIONS,
  isActive,
  type NavItem,
  type NavSection,
} from "@/lib/constants/nav-links"

// ClerkProvider is only mounted when this key is present (see app/layout.tsx),
// and <SignedIn> throws without a provider — so gate on the same condition.
const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

interface NavDrawerProps {
  open: boolean
  onClose: () => void
}

function DrawerLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className="flex items-center uppercase px-5 py-[11px] transition-colors"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        letterSpacing: "0.14em",
        color: active ? "var(--hm-diamond)" : "var(--hm-mist)",
        background: active ? "rgba(0,229,255,0.06)" : "transparent",
        boxShadow: active ? "inset 2px 0 0 var(--hm-diamond)" : undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--hm-diamond)"
        e.currentTarget.style.background = "rgba(0,229,255,0.05)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = active ? "var(--hm-diamond)" : "var(--hm-mist)"
        e.currentTarget.style.background = active ? "rgba(0,229,255,0.06)" : "transparent"
      }}
    >
      {item.label}
    </Link>
  )
}

function DrawerSection({
  section,
  pathname,
  onNavigate,
}: {
  section: NavSection
  pathname: string
  onNavigate: () => void
}) {
  return (
    <div className="pb-2">
      <p
        className="font-mono uppercase px-5 pt-3 pb-1.5"
        style={{ fontSize: "10px", letterSpacing: "0.2em", color: "var(--hm-smoke)" }}
      >
        {section.label}
      </p>
      {section.items.map((item) => (
        <DrawerLink
          key={item.href}
          item={item}
          active={isActive(item.href, pathname)}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

export function NavDrawer({ open, onClose }: NavDrawerProps) {
  const pathname = usePathname()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60]"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        id="hm-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute right-0 top-0 bottom-0 z-[61] w-full sm:w-[280px] max-h-[100dvh] flex flex-col"
        style={{
          background: "var(--hm-pitch)",
          borderLeft: "1px solid var(--hm-fence)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div
          className="flex items-center justify-between px-5 h-[52px] sm:h-[56px] shrink-0"
          style={{ borderBottom: "1px solid var(--hm-fence)" }}
        >
          <span
            className="font-mono uppercase tracking-[0.2em]"
            style={{ fontSize: "10px", color: "var(--hm-mist)" }}
          >
            NAVIGATION
          </span>
          <button
            onClick={onClose}
            style={{ color: "var(--hm-smoke)" }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer links */}
        <nav className="flex-1 overflow-y-auto overscroll-contain py-1 hm-safe-bottom">
          {NAV_SECTIONS.map((section) => {
            const rendered = (
              <DrawerSection
                key={section.label}
                section={section}
                pathname={pathname}
                onNavigate={onClose}
              />
            )

            if (!section.authOnly) return rendered
            if (!CLERK_ENABLED) return null
            return <SignedIn key={section.label}>{rendered}</SignedIn>
          })}
        </nav>

        {/* Drawer footer */}
        <div
          className="px-5 py-4 shrink-0 hm-safe-bottom"
          style={{ borderTop: "1px solid var(--hm-fence)" }}
        >
          <div className="flex items-center gap-2">
            <span className="hm-live-dot" />
            <span
              className="font-mono uppercase tracking-[0.14em]"
              style={{ fontSize: "9px", color: "var(--hm-smoke)" }}
            >
              LIVE · 2026 MLB
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
