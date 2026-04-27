// components/auth-nav.tsx
// Global navigation + auth controls — rendered in the site header.
// Hamburger opens a popup with two sections: Navigation (primary routes) + Tools.

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { LogIn, UserPlus, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useState } from "react"
import { cn } from "@/lib/utils"

const userButtonAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#4a7fea",
    colorBackground: "#1a1a1a",
    colorInputBackground: "#252525",
    colorInputText: "#fafafa",
    colorText: "#fafafa",
    colorTextSecondary: "#a8a8a8",
    borderRadius: "0.625rem",
    fontFamily: '"Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    avatarBox: "ring-2 ring-border hover:ring-primary/50 transition-all",
    userButtonPopoverCard:
      "border border-[oklch(0.269_0_0)] bg-[oklch(0.205_0_0)] shadow-2xl",
    userButtonPopoverActions: "border-t border-[oklch(0.269_0_0)]",
    userButtonPopoverActionButton:
      "text-[oklch(0.985_0_0)] hover:bg-[oklch(0.269_0_0)] transition-colors",
    userButtonPopoverActionButtonText: "text-[oklch(0.985_0_0)]",
    userButtonPopoverActionButtonIcon: "text-[oklch(0.708_0_0)]",
    userPreviewMainIdentifier: "text-[oklch(0.985_0_0)] font-semibold",
    userPreviewSecondaryIdentifier: "text-[oklch(0.708_0_0)]",
  },
} as const

const PRIMARY_NAV = [
  { href: "/",         label: "Today" },
  { href: "/pitcher",  label: "Pitcher" },
  { href: "/staff",    label: "Staff" },
  { href: "/ensemble", label: "Ensemble" },
  { href: "/history",  label: "History" },
  { href: "/insights", label: "Insights" },
]

const TOOLS_NAV = [
  { href: "/accuracy",     label: "Accuracy" },
  { href: "/grid",         label: "Grid" },
  { href: "/odds",         label: "Odds & EV" },
  { href: "/weather",      label: "Weather" },
  { href: "/resources",    label: "Resources" },
  { href: "/community",    label: "Community" },
  { href: "/weekly-recap", label: "Weekly Recap" },
  { href: "/glossary",     label: "Glossary" },
]

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

interface NavSectionProps {
  label: string
  items: { href: string; label: string }[]
  pathname: string
  onNavigate: () => void
}

function NavSection({ label, items, pathname, onNavigate }: NavSectionProps) {
  return (
    <div>
      <p className="font-jet text-[10px] uppercase tracking-[0.2em] text-ds-dim px-3 mb-2">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item.href, pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "block px-3 py-2 rounded-md text-[13px] font-medium transition-colors",
                active
                  ? "bg-[var(--ds-panel-2)] text-ds-cy"
                  : "text-ds-muted hover:text-ds-ink hover:bg-[var(--ds-panel)]"
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function AuthNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      {/* Hamburger — visible on all screen sizes */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0 text-ds-muted hover:text-ds-ink hover:bg-[var(--ds-panel)]"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </DialogTrigger>

        <DialogContent
          className="w-[280px] p-0 border-ds-line"
          style={{ background: "var(--ds-panel)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--ds-line)" }}
          >
            <span className="font-jet text-[11px] uppercase tracking-[0.2em] text-ds-muted">
              Navigation
            </span>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-ds-muted hover:text-ds-ink"
                aria-label="Close navigation"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
          </div>

          {/* Nav sections */}
          <div className="px-3 py-3 space-y-4">
            <NavSection
              label="Main"
              items={PRIMARY_NAV}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
            <div style={{ borderTop: "1px solid var(--ds-line-2)" }} className="pt-4">
              <NavSection
                label="Tools"
                items={TOOLS_NAV}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auth controls */}
      <SignedOut>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs text-ds-muted hover:text-ds-ink"
        >
          <Link href="/sign-in">
            <LogIn className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign In</span>
          </Link>
        </Button>

        <Button
          asChild
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs bg-primary/90 hover:bg-primary text-primary-foreground"
        >
          <Link href="/sign-up">
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Up</span>
          </Link>
        </Button>
      </SignedOut>

      <SignedIn>
        <UserButton
          afterSignOutUrl="/"
          appearance={userButtonAppearance}
        />
      </SignedIn>
    </div>
  )
}
