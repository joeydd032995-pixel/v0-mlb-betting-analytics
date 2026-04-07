"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { MailOpen, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormError } from "@/components/auth/FormError"
import { Suspense } from "react"

const RESEND_COOLDOWN_SECONDS = 60

function VerifyContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email") ?? ""
  // Sanitize: only display plain text — no rendering as HTML
  const displayEmail = decodeURIComponent(email).replace(/[<>]/g, "")

  const [cooldown, setCooldown] = useState(0)
  const [isResending, setIsResending] = useState(false)
  const [resendError, setResendError] = useState<string | undefined>()
  const [resendSuccess, setResendSuccess] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_SECONDS)
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  async function handleResend() {
    if (cooldown > 0 || isResending) return
    setResendError(undefined)
    setResendSuccess(false)
    setIsResending(true)

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: displayEmail }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setResendError(data.error ?? "Failed to resend. Please try again.")
        return
      }
      setResendSuccess(true)
      startCooldown()
    } catch {
      setResendError("Network error. Please check your connection.")
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <MailOpen className="h-10 w-10 text-primary" aria-hidden="true" />
      </div>

      {/* Heading */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to{" "}
          {displayEmail ? (
            <strong className="text-foreground">{displayEmail}</strong>
          ) : (
            "your email address"
          )}
          . Click the link to activate your account.
        </p>
      </div>

      {/* Resend */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        {resendSuccess && (
          <p className="text-sm text-green-400">
            Verification email resent! Check your inbox.
          </p>
        )}
        <FormError message={resendError} />

        <Button
          variant="outline"
          onClick={handleResend}
          disabled={cooldown > 0 || isResending}
          className="w-full"
          aria-label={
            cooldown > 0
              ? `Resend available in ${cooldown}s`
              : "Resend verification email"
          }
        >
          {isResending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : cooldown > 0 ? (
            `Resend in ${cooldown}s`
          ) : (
            "Resend email"
          )}
        </Button>
      </div>

      {/* Back link */}
      <p className="text-sm text-muted-foreground">
        Wrong email?{" "}
        <Link
          href="/register"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Go back and register again
        </Link>
      </p>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  )
}
