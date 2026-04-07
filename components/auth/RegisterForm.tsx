"use client"

import { useReducer, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Eye, EyeOff } from "lucide-react"

import {
  registerStep1Schema,
  registerStep2Schema,
  type RegisterStep1Values,
  type RegisterStep2Values,
} from "@/lib/validations/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { FormError } from "@/components/auth/FormError"
import { StepIndicator } from "@/components/onboarding/StepIndicator"

// ─── State ───────────────────────────────────────────────────────────────────

interface FormState {
  step: 1 | 2
  step1Data: RegisterStep1Values | null
}

type FormAction =
  | { type: "NEXT"; payload: RegisterStep1Values }
  | { type: "BACK" }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "NEXT":
      return { ...state, step: 2, step1Data: action.payload }
    case "BACK":
      return { ...state, step: 1 }
    default:
      return state
  }
}

const STEPS = ["Account", "Profile"]

// ─── Step 1 ──────────────────────────────────────────────────────────────────

interface Step1Props {
  defaultValues: RegisterStep1Values | null
  onNext: (data: RegisterStep1Values) => void
}

function Step1({ defaultValues, onNext }: Step1Props) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const form = useForm<RegisterStep1Values>({
    resolver: zodResolver(registerStep1Schema),
    defaultValues: defaultValues ?? {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      tos: false,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="flex flex-col gap-4" noValidate>
        {/* Full name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="name">Full name</FormLabel>
              <FormControl>
                <Input id="name" autoComplete="name" placeholder="Jane Smith" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="reg-email">Email</FormLabel>
              <FormControl>
                <Input
                  id="reg-email"
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
              <FormLabel htmlFor="reg-password">Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
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

        {/* Confirm password */}
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="confirm-password">Confirm password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="pr-10"
                    {...field}
                  />
                  <button
                    type="button"
                    aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showConfirm ? (
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

        {/* Terms of service */}
        <FormField
          control={form.control}
          name="tos"
          render={({ field }) => (
            <FormItem className="flex items-start gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  id="tos"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="mt-0.5"
                />
              </FormControl>
              <div className="flex flex-col gap-1">
                <FormLabel htmlFor="tos" className="cursor-pointer text-sm font-normal leading-snug">
                  I agree to the{" "}
                  <Dialog>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        Terms of Service
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Terms of Service</DialogTitle>
                        <DialogDescription>
                          Last updated: January 1, 2026
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 text-sm text-muted-foreground">
                        <p>
                          By using this service, you agree to use it only for
                          lawful purposes and in a way that does not infringe the
                          rights of others.
                        </p>
                        <p>
                          The analytics and predictions provided are for
                          informational purposes only. They do not constitute
                          financial or betting advice. Always gamble responsibly.
                        </p>
                        <p>
                          We reserve the right to suspend or terminate accounts
                          that violate these terms at any time without notice.
                        </p>
                        <p>
                          These terms may be updated from time to time. Continued
                          use of the service constitutes acceptance of the updated
                          terms.
                        </p>
                      </div>
                    </DialogContent>
                  </Dialog>
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
    </Form>
  )
}

// ─── Step 2 ──────────────────────────────────────────────────────────────────

interface Step2Props {
  onBack: () => void
  onSubmit: (data: RegisterStep2Values) => Promise<void>
  isSubmitting: boolean
  formError: string | undefined
}

function Step2({ onBack, onSubmit, isSubmitting, formError }: Step2Props) {
  const form = useForm<RegisterStep2Values>({
    resolver: zodResolver(registerStep2Schema),
    defaultValues: { hearAboutUs: "", role: "" },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {/* How did you hear about us */}
        <FormField
          control={form.control}
          name="hearAboutUs"
          render={({ field }) => (
            <FormItem>
              <FormLabel>How did you hear about us?</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="twitter">Twitter / X</SelectItem>
                  <SelectItem value="friend">A friend</SelectItem>
                  <SelectItem value="github">GitHub</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Role */}
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What best describes you?</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="grid grid-cols-2 gap-2"
                >
                  {(
                    [
                      ["developer", "Developer"],
                      ["designer", "Designer"],
                      ["product", "Product"],
                      ["other", "Other"],
                    ] as const
                  ).map(([value, label]) => (
                    <div key={value} className="flex items-center gap-2">
                      <RadioGroupItem value={value} id={`role-${value}`} />
                      <FormLabel
                        htmlFor={`role-${value}`}
                        className="cursor-pointer font-normal"
                      >
                        {label}
                      </FormLabel>
                    </div>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormError message={formError} />

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onBack}
            disabled={isSubmitting}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={() => onSubmit({ hearAboutUs: "", role: "" })}
            disabled={isSubmitting}
          >
            Skip
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Creating…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RegisterForm() {
  const router = useRouter()
  const [state, dispatch] = useReducer(formReducer, { step: 1, step1Data: null })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | undefined>()

  function handleStep1Next(data: RegisterStep1Values) {
    dispatch({ type: "NEXT", payload: data })
  }

  async function handleStep2Submit(step2Data: RegisterStep2Values) {
    if (!state.step1Data) return
    setFormError(undefined)
    setIsSubmitting(true)

    try {
      const payload = {
        ...state.step1Data,
        hearAboutUs: step2Data.hearAboutUs ?? "",
        role: step2Data.role ?? "",
      }

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json() as { error?: string; code?: string }

      if (!res.ok) {
        if (data.code === "EMAIL_EXISTS") {
          setFormError(data.error)
        } else {
          setFormError(data.error ?? "Something went wrong. Please try again.")
        }
        return
      }

      router.push(
        `/verify?email=${encodeURIComponent(state.step1Data.email)}`
      )
    } catch {
      setFormError("Network error. Please check your connection and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator steps={STEPS} currentStep={state.step - 1} />

      <div className="transition-all duration-200">
        {state.step === 1 ? (
          <Step1 defaultValues={state.step1Data} onNext={handleStep1Next} />
        ) : (
          <Step2
            onBack={() => dispatch({ type: "BACK" })}
            onSubmit={handleStep2Submit}
            isSubmitting={isSubmitting}
            formError={formError}
          />
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
