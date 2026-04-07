import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    template: "%s — MLB Prediction Engine",
    default: "Auth — MLB Prediction Engine",
  },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {/* Skip-to-content for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md">
          {/* Brand mark */}
          <div className="mb-8 text-center">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              ⚾ MLB Analytics
            </span>
          </div>

          {children}
        </div>
      </main>
    </>
  )
}
