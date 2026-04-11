// app/sign-in/[[...sign-in]]/page.tsx
//
// Catch-all route required by Clerk's App Router integration.
// The [[...sign-in]] pattern lets Clerk handle its own sub-routes
// (/sign-in, /sign-in/factor-one, /sign-in/sso-callback, etc.)
// without any additional Next.js routing config.

import { SignIn } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import Link from "next/link"
import { Activity } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign In — NRFI/YRFI Prediction Engine",
  description: "Sign in to your account to access full MLB first-inning predictions.",
}

// Clerk appearance object — uses `dark` as the base theme, then layers our
// exact CSS variable values so the form feels native to the dark navy design.
const clerkAppearance = {
  baseTheme: dark,
  variables: {
    // Primary blue accent — matches --primary: oklch(0.7 0.15 240)
    colorPrimary: "#4a7fea",
    // Page / card background — matches --background / --card
    colorBackground: "#1a1a1a",
    // Input field background — slightly lighter than background
    colorInputBackground: "#252525",
    // Input text — matches --foreground
    colorInputText: "#fafafa",
    // Body text
    colorText: "#fafafa",
    // Secondary / muted text — matches --muted-foreground
    colorTextSecondary: "#a8a8a8",
    // Danger / error — matches --destructive (dark mode)
    colorDanger: "#ef4444",
    // Success
    colorSuccess: "#22c55e",
    // Border radius — matches --radius: 0.625rem
    borderRadius: "0.625rem",
    // Font — matches app font stack
    fontFamily: '"Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif',
    fontSize: "14px",
  },
  elements: {
    // Outer card: match the dark navy card style with subtle border
    card: "shadow-2xl border border-[oklch(0.269_0_0)] bg-[oklch(0.205_0_0)]",
    // Reduce excessive internal padding that Clerk adds by default
    cardBox: "shadow-none",
    // Social provider buttons: match muted secondary style
    socialButtonsBlockButton:
      "border border-[oklch(0.269_0_0)] bg-[oklch(0.269_0_0)] text-[oklch(0.985_0_0)] hover:bg-[oklch(0.3_0_0)] transition-colors",
    socialButtonsBlockButtonText: "font-medium",
    // Divider line between social and email sections
    dividerLine: "bg-[oklch(0.269_0_0)]",
    dividerText: "text-[oklch(0.556_0_0)] text-xs",
    // Form input fields
    formFieldInput:
      "border border-[oklch(0.269_0_0)] bg-[oklch(0.205_0_0)] text-[oklch(0.985_0_0)] placeholder:text-[oklch(0.556_0_0)] focus:border-[#4a7fea] focus:ring-1 focus:ring-[#4a7fea]/30",
    formFieldLabel: "text-[oklch(0.85_0_0)] font-medium text-xs",
    formFieldErrorText: "text-red-400 text-xs",
    // Primary action button (Sign In)
    formButtonPrimary:
      "bg-[#4a7fea] hover:bg-[#3a6fd8] text-white font-semibold transition-colors",
    // Links (Forgot password, back, etc.)
    footerActionLink: "text-[#4a7fea] hover:text-[#7aa8f8] font-medium",
    identityPreviewEditButton: "text-[#4a7fea] hover:text-[#7aa8f8]",
    // Header title / subtitle
    headerTitle: "text-[oklch(0.985_0_0)] font-bold",
    headerSubtitle: "text-[oklch(0.708_0_0)]",
    // Internal nav (back arrows, etc.)
    navbar: "hidden",
    navbarButtons: "hidden",
  },
} as const

export default function SignInPage() {
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
      </div>

      {/* ── Clerk SignIn component ────────────────────────────────────────── */}
      {/*
        afterSignInUrl  → redirect target after a successful login.
        signUpUrl       → link users can follow to create an account instead.
        Both are also configurable via NEXT_PUBLIC_CLERK_* env vars (env takes
        precedence over props, so set them in .env.local for production).
      */}
      <SignIn
        appearance={clerkAppearance}
        afterSignInUrl="/"
        signUpUrl="/sign-up"
        routing="path"
        path="/sign-in"
      />

      {/* ── Back-to-dashboard escape hatch ───────────────────────────────── */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link
          href="/"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Continue as guest
        </Link>{" "}
        — the dashboard is fully public.
      </p>
    </div>
  )
}
