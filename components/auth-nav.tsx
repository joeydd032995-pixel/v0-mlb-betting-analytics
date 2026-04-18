// components/auth-nav.tsx
// Global navigation + auth controls — rendered in the site header.
//
// Navigation: Dashboard | Grid | Accuracy | History | Insights | Glossary
// Auth: Sign In / Sign Up for guests, Clerk UserButton for members
// Mobile: Hamburger menu via Radix Dialog

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

// Clerk UserButton appearance — keeps the avatar consistent with the dark theme.
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
    // The trigger avatar button
    avatarBox: "ring-2 ring-border hover:ring-primary/50 transition-all",
    // Dropdown card
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

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/grid", label: "Grid" },
  { href: "/accuracy", label: "Accuracy" },
  { href: "/history", label: "History" },
  { href: "/insights", label: "Insights" },
  { href: "/glossary", label: "Glossary" },
]

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const isActive = pathname === href
  return (
    <Link
      href={href}
      className={cn(
        "text-sm font-medium transition-colors px-3 py-2 rounded-md relative",
        isActive
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {isActive && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
      )}
    </Link>
  )
}

export function AuthNav() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex items-center gap-4">
      {/* ── Desktop nav ─────────────────────────────────────────────────────── */}
      <nav className="hidden md:flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
      </nav>

      {/* ── Mobile hamburger ────────────────────────────────────────────────── */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="w-[80vw] max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Navigation</h2>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "block px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </DialogContent>
      </Dialog>

      {/* ── Auth controls ───────────────────────────────────────────────────── */}
      <SignedOut>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
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
