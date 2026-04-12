// app/layout.tsx
import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "sonner"
import { SubscriptionProvider } from "@/components/subscription-provider"
import { getSubscriptionTier } from "@/lib/actions/subscription-actions"
import { getPicksUsedToday } from "@/lib/actions/usage-actions"
import { auth } from "@clerk/nextjs/server"
import "./globals.css"

export const metadata: Metadata = {
  title: "NRFI/YRFI Prediction Engine — MLB",
  description:
    "Advanced Poisson-based NRFI/YRFI prediction calculator for MLB. First-inning run probability with pitcher analysis, team stats, and value bet identification.",
  generator: "v0.app",
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Fetch subscription tier and daily pick usage server-side so the
  // SubscriptionProvider has accurate data from the very first render —
  // no client-side flash of wrong tier.
  const { userId } = await auth()

  const [initialTier, initialPicksToday] = await Promise.all([
    getSubscriptionTier(),
    userId ? getPicksUsedToday() : Promise.resolve(0),
  ])

  return (
    // ClerkProvider must be the outermost wrapper so auth state is available
    // everywhere via useAuth(), auth(), currentUser(), etc.
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en" className="dark bg-background">
        <body className="font-sans antialiased">
          {/* SubscriptionProvider makes tier + pick quota available to all
              client components via useSubscription(). It also owns the
              UpgradeModal state so any component can call openUpgradeModal(). */}
          <SubscriptionProvider
            initialTier={initialTier}
            initialPicksToday={initialPicksToday}
          >
            {children}
          </SubscriptionProvider>

          {/* Sonner toast portal — styled to match the dark navy theme */}
          <Toaster
            theme="dark"
            position="top-right"
            richColors
            toastOptions={{
              style: {
                background: "oklch(0.205 0 0)",       /* --card */
                border:     "1px solid oklch(0.269 0 0)", /* --border */
                color:      "oklch(0.985 0 0)",        /* --foreground */
              },
              className: "font-sans text-sm",
            }}
          />

          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  )
}
