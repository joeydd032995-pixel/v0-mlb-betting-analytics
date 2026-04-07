import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { PricingGrid } from "@/components/paywall/PricingGrid"

export const metadata: Metadata = {
  title: "Choose your plan",
}

export default async function PlansPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  if (session.user.plan) {
    redirect("/dashboard")
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Choose your plan
        </h1>
        <p className="mt-2 text-muted-foreground">
          Start free, upgrade anytime. Cancel whenever.
        </p>
      </div>

      <PricingGrid />
    </div>
  )
}
