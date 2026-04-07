"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff, Loader2, CheckCircle } from "lucide-react"

import { loginSchema, type LoginFormValues } from "@/lib/validations/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { FormError } from "@/components/auth/FormError"
import { OAuthButtons } from "@/components/auth/OAuthButtons"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard"
  const isVerified = searchParams.get("verified") === "true"
  const prefillEmail = searchParams.get("email") ?? ""
  const tokenError = searchParams.get("error")

  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | undefined>()
  const [isPending, setIsPending] = useState(false)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: prefillEmail,
      password: "",
      rememberMe: false,
    },
  })

  async function onSubmit(values: LoginFormValues) {
    setFormError(undefined)
    setIsPending(true)

    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      })

      if (result?.error) {
        setFormError(
          result.error === "CredentialsSignin"
            ? "Invalid email or password. Please try again."
            : "Something went wrong. Please try again."
        )
        return
      }

      router.push(callbackUrl)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Verification success banner */}
      {isVerified && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400"
        >
          <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Email verified! Sign in to continue.
        </div>
      )}

      {/* Token error banner */}
      {tokenError === "invalid-token" && (
        <FormError message="Your verification link has expired or is invalid. Please register again." />
      )}
      {tokenError === "missing-token" && (
        <FormError message="Verification link is missing a token. Please use the link from your email." />
      )}

      <Form {...form}>
        <form
          id="main-content"
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          {/* Email */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="email">Email</FormLabel>
                <FormControl>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Password */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel htmlFor="password">Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Remember me */}
          <FormField
            control={form.control}
            name="rememberMe"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    id="rememberMe"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel
                  htmlFor="rememberMe"
                  className="cursor-pointer text-sm font-normal"
                >
                  Remember me
                </FormLabel>
              </FormItem>
            )}
          />

          {/* Form-level error */}
          <FormError message={formError} />

          {/* Submit */}
          <Button
            type="submit"
            className="w-full"
            disabled={isPending}
            aria-disabled={isPending}
            aria-label={isPending ? "Signing in…" : undefined}
          >
            {isPending ? (
              <>
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </Form>

      {/* OAuth divider */}
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <OAuthButtons callbackUrl={callbackUrl} />

      {/* Register link */}
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}
