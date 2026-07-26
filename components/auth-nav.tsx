// components/auth-nav.tsx
// Auth controls for the site header — Sign In / Sign Up when signed out,
// the Clerk user button when signed in.
// Site navigation lives in components/nav-drawer.tsx, opened by the single
// hamburger in components/site-header.tsx.

"use client"

import Link from "next/link"
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { LogIn, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"

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

export function AuthNav() {
  return (
    <div className="flex items-center gap-2">
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
