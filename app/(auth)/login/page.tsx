import type { Metadata } from "next"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LoginForm } from "@/components/auth/LoginForm"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Sign in",
}

export default function LoginPage() {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>
          Sign in to your account to access predictions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Suspense required for useSearchParams() in LoginForm */}
        <Suspense fallback={<div className="h-80 animate-pulse rounded-md bg-muted" />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
