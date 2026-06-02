// app/account/page.tsx
// Subscription management page — shows current tier and billing management options.
// Protected by Clerk middleware (account route is in isProtectedRoute).

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getUserTierInfo } from "@/lib/subscription"
import { AccountClient } from "@/components/account-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Account — Homeplate Metrics",
}

export default async function AccountPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const tierInfo = await getUserTierInfo(userId)

  return (
    <div className="min-h-screen" style={{ background: "var(--hm-abyss)" }}>
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
        <AccountClient tierInfo={tierInfo} userId={userId} />
      </main>
    </div>
  )
}
