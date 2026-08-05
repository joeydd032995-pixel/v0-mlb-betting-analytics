// app/account/page.tsx
// Subscription management page — shows current tier and billing management options.
// Protected by Clerk middleware (account route is in isProtectedRoute).

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getUserTierInfo } from "@/lib/subscription"
import { prisma } from "@/lib/prisma"
import { AccountClient } from "@/components/account-client"
import { TierUnresolvedNotice } from "@/components/tier-gate-notice"
import { canDecryptApiKey } from "@/lib/crypto/api-key-encryption"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Account — Homeplate Metrics",
}

export default async function AccountPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const [tierInfo, apiKeyRows] = await Promise.all([
    getUserTierInfo(userId),
    prisma.userApiKey.findMany({
      where: { userId },
      select: { provider: true, lastFour: true, updatedAt: true, encryptedKey: true },
    }),
  ])

  // A row encrypted under a previous ENCRYPTION_KEY is permanently unreadable,
  // but still looks configured (it keeps its lastFour). Resolve that here so the
  // form can prompt for re-entry instead of showing a key that silently fails.
  // The ciphertext is dropped before crossing to the client — only the boolean.
  const apiKeyInfo = apiKeyRows.map(({ encryptedKey, ...row }) => ({
    ...row,
    usable: canDecryptApiKey(encryptedKey),
  }))

  return (
    <div className="min-h-screen" style={{ background: "var(--hm-abyss)" }}>
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
        {/* Telling a paying subscriber "You're on the free plan" because the
            lookup failed is worse than telling them we couldn't check. */}
        {tierInfo.resolved
          ? <AccountClient tierInfo={tierInfo} userId={userId} apiKeyInfo={apiKeyInfo} />
          : <TierUnresolvedNotice />}
      </main>
    </div>
  )
}
