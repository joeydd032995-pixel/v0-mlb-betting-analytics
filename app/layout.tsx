// app/layout.tsx
/* eslint-disable @next/next/no-page-custom-font */
import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { DensityProvider } from "@/lib/density-context"
import { TweaksPanel } from "@/components/tweaks-panel"
import "./globals.css"

export const metadata: Metadata = {
  title: "Homeplate Metrics — NRFI/YRFI Prediction Engine",
  description:
    "Advanced 7-model ensemble NRFI/YRFI prediction engine for MLB. First-inning run probability with pitcher analysis, team stats, and value bet identification.",
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

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const inner = (
    <html lang="en" className="dark" style={{ background: "var(--hm-abyss)" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased flex flex-col min-h-screen"
        style={{
          background: "var(--hm-abyss)",
          color: "var(--hm-chalk)",
          fontFamily: "var(--font-ui)",
        }}
      >
        <DensityProvider>
        <TooltipProvider>
        <SiteHeader />
        <main className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <TweaksPanel />

        <Toaster
          theme="dark"
          position="top-right"
          richColors
          toastOptions={{
            style: {
              background: "var(--hm-pitch)",
              border: "1px solid var(--hm-fence)",
              color: "var(--hm-chalk)",
            },
            className: "font-ui text-sm",
          }}
        />

        <Analytics />
        </TooltipProvider>
        </DensityProvider>
      </body>
    </html>
  )

  return clerkKey ? (
    <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
      {inner}
    </ClerkProvider>
  ) : inner
}
