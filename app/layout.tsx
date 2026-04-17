// app/layout.tsx
import type React from "react"
import type { Metadata } from "next"
import { Inter, IBM_Plex_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "sonner"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-mono",
})

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // ClerkProvider must wrap the entire app so auth state is available
    // everywhere via useAuth(), auth(), currentUser(), etc.
    //
    // afterSignOutUrl tells Clerk where to redirect after the user logs out
    // (can also be set via NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL env var).
    <ClerkProvider afterSignOutUrl="/">
      <html
        lang="en"
        className={`dark bg-background ${inter.variable} ${plexMono.variable}`}
      >
        <body className="font-sans antialiased">
          {children}

          {/* Sonner toast portal — styled to match the dark navy theme.
              toast() calls anywhere in the app will render here. */}
          <Toaster
            theme="dark"
            position="top-right"
            richColors
            toastOptions={{
              style: {
                background: "oklch(0.205 0 0)",  /* --card */
                border: "1px solid oklch(0.269 0 0)", /* --border */
                color: "oklch(0.985 0 0)",        /* --foreground */
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
