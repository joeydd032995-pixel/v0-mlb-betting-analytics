import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { BarChart3, TrendingUp, Activity } from "lucide-react"

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  if (!session.user.plan) {
    redirect("/onboarding/plans")
  }

  const planLabel =
    session.user.plan.charAt(0).toUpperCase() + session.user.plan.slice(1)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-lg font-bold tracking-tight">
            ⚾ MLB Analytics
          </span>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{planLabel} plan</Badge>
            <span className="hidden text-sm text-muted-foreground sm:block">
              {session.user.email}
            </span>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-5xl px-4 py-10">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}!
          </h1>
          <p className="mt-1 text-muted-foreground">
            You&apos;re on the{" "}
            <strong className="text-foreground">{planLabel}</strong> plan.
            The full prediction engine is ready.
          </p>
        </div>

        {/* Quick-access cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle className="text-base">Predictions</CardTitle>
              </div>
              <CardDescription>NRFI/YRFI daily slate</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="outline">
                <Link href="/">View predictions</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle className="text-base">Edge finder</CardTitle>
              </div>
              <CardDescription>Value bets via Kelly Criterion</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="outline">
                <Link href="/">Find edges</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle className="text-base">Live odds</CardTitle>
              </div>
              <CardDescription>Real-time market monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="outline">
                <Link href="/">Monitor odds</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Plan upgrade nudge for free users */}
        {session.user.plan === "free" && (
          <Card className="mt-6 border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Unlock advanced features</CardTitle>
              <CardDescription>
                Upgrade to Pro for unlimited projects, API access, and priority
                support.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/onboarding/plans">Upgrade to Pro</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
