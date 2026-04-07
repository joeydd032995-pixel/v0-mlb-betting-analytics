import type React from "react"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <div className="min-h-screen bg-background">
        <header className="border-b border-border px-4 py-4">
          <div className="mx-auto max-w-4xl flex items-center justify-between">
            <span className="text-lg font-bold tracking-tight text-foreground">
              ⚾ MLB Analytics
            </span>
            <span className="text-sm text-muted-foreground">
              {session.user.email}
            </span>
          </div>
        </header>

        <main id="main-content" className="mx-auto max-w-4xl px-4 py-12">
          {children}
        </main>
      </div>
    </>
  )
}
