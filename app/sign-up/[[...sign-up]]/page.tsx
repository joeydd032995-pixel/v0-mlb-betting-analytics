// app/sign-up/[[...sign-up]]/page.tsx
//
// Catch-all route for Clerk's sign-up flow.
// Handles /sign-up, /sign-up/verify-email-address, /sign-up/sso-callback, etc.

import { SignUp } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import Link from "next/link"
import { Activity } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create Account — NRFI/YRFI Prediction Engine",
  description: "Create a free account to track your picks and access premium NRFI/YRFI predictions.",
}

// Re-use the exact same appearance config as sign-in for visual consistency.
const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#4a7fea",
    colorBackground: "#1a1a1a",
    colorInputBackground: "#252525",
    colorInputText: "#fafafa",
    colorText: "#fafafa",
    colorTextSecondary: "#a8a8a8",
    colorDanger: "#ef4444",
    colorSuccess: "#22c55e",
    borderRadius: "0.625rem",
    fontFamily: '"Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif',
    fontSize: "14px",
  },
  elements: {
    card: "shadow-2xl border border-[oklch(0.269_0_0)] bg-[oklch(0.205_0_0)]",
    cardBox: "shadow-none",
    socialButtonsBlockButton:
      "border border-[oklch(0.269_0_0)] bg-[oklch(0.269_0_0)] text-[oklch(0.985_0_0)] hover:bg-[oklch(0.3_0_0)] transition-colors",
    socialButtonsBlockButtonText: "font-medium",
    dividerLine: "bg-[oklch(0.269_0_0)]",
    dividerText: "text-[oklch(0.556_0_0)] text-xs",
    formFieldInput:
      "border border-[oklch(0.269_0_0)] bg-[oklch(0.205_0_0)] text-[oklch(0.985_0_0)] placeholder:text-[oklch(0.556_0_0)] focus:border-[#4a7fea] focus:ring-1 focus:ring-[#4a7fea]/30",
    formFieldLabel: "text-[oklch(0.85_0_0)] font-medium text-xs",
    formFieldErrorText: "text-red-400 text-xs",
    formButtonPrimary:
      "bg-[#4a7fea] hover:bg-[#3a6fd8] text-white font-semibold transition-colors",
    footerActionLink: "text-[#4a7fea] hover:text-[#7aa8f8] font-medium",
    identityPreviewEditButton: "text-[#4a7fea] hover:text-[#7aa8f8]",
    headerTitle: "text-[oklch(0.985_0_0)] font-bold",
    headerSubtitle: "text-[oklch(0.708_0_0)]",
    navbar: "hidden",
    navbarButtons: "hidden",
  },
} as const

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      {/* ── App branding ─────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            NRFI/YRFI Prediction Engine
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Advanced MLB Betting Analytics · 2026 Season
          </p>
        </div>

        {/* Free-tier callout */}
        <div className="mt-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-1 text-xs text-emerald-400">
          Free account — no credit card required
        </div>
      </div>

      {/* ── Clerk SignUp component ────────────────────────────────────────── */}
      {/*
        afterSignUpUrl  → redirect target after account creation.
        signInUrl       → link for users who already have an account.
      */}
      <SignUp
        appearance={clerkAppearance}
        afterSignUpUrl="/"
        signInUrl="/sign-in"
        routing="path"
        path="/sign-up"
      />

      {/* ── Guest escape hatch ───────────────────────────────────────────── */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Just browsing?{" "}
        <Link
          href="/"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          View the dashboard as a guest
        </Link>
        .
      </p>
    </div>
  )
}
