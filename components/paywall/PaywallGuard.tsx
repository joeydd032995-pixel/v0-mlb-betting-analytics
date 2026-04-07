"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader2 } from "lucide-react"

interface PaywallGuardProps {
  children: React.ReactNode
}

/**
 * Client-side paywall guard.
 * Use this as a second line of defence inside pages that are already
 * protected by middleware. The middleware handles SSR redirects; this
 * component handles client-side navigation.
 */
export function PaywallGuard({ children }: PaywallGuardProps) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login")
    } else if (status === "authenticated" && !session.user.plan) {
      router.replace("/onboarding/plans")
    }
  }, [status, session, router])

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2
          className="h-8 w-8 animate-spin text-muted-foreground"
          aria-label="Loading…"
        />
      </div>
    )
  }

  if (status === "unauthenticated" || !session?.user?.plan) {
    return null
  }

  return <>{children}</>
}
