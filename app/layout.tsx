// app/layout.tsx
import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
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

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const inner = (
    <html lang="en" className="dark bg-background">
      <body className="font-sans antialiased flex flex-col min-h-screen">
        <TooltipProvider>
        <SiteHeader />
        <main className="flex-1">
          {children}
        </main>
        <SiteFooter />

        <Toaster
          theme="dark"
          position="top-right"
          richColors
          toastOptions={{
            style: {
              background: "oklch(0.205 0 0)",
              border: "1px solid oklch(0.269 0 0)",
              color: "oklch(0.985 0 0)",
            },
            className: "font-sans text-sm",
          }}
        />

        <Analytics />
        </TooltipProvider>
      </body>
    </html>
  )

  return clerkKey ? (
    <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
      {inner}
    </ClerkProvider>
  ) : inner
}
