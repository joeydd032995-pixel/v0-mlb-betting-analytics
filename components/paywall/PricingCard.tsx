"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"

import type { PlanConfig } from "@/lib/validations/plans"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FormError } from "@/components/auth/FormError"

interface PricingCardProps {
  plan: PlanConfig
  billingCycle: "monthly" | "annual"
  onSelect: (plan: PlanConfig) => Promise<void>
  isLoading: boolean
}

export function PricingCard({
  plan,
  billingCycle,
  onSelect,
  isLoading,
}: PricingCardProps) {
  const price =
    billingCycle === "annual" ? plan.annualPrice : plan.monthlyPrice
  const isEnterprise = plan.id === "enterprise"

  // Enterprise contact form state
  const [contactName, setContactName] = useState("")
  const [contactCompany, setContactCompany] = useState("")
  const [contactMessage, setContactMessage] = useState("")
  const [contactError, setContactError] = useState<string | undefined>()
  const [contactSent, setContactSent] = useState(false)
  const [contactPending, setContactPending] = useState(false)

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    setContactError(undefined)
    setContactPending(true)
    try {
      // Stub endpoint — responds 200
      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: contactName, company: contactCompany, message: contactMessage }),
      })
      setContactSent(true)
    } catch {
      setContactError("Failed to send. Please email us directly.")
    } finally {
      setContactPending(false)
    }
  }

  return (
    <Card
      role="group"
      aria-label={`${plan.name} plan`}
      className={[
        "relative flex flex-col transition-all duration-200",
        plan.recommended ? "ring-2 ring-primary shadow-lg" : "",
      ].join(" ")}
    >
      {plan.recommended && (
        <CardAction>
          <Badge className="absolute -top-3 right-4">Most Popular</Badge>
        </CardAction>
      )}

      <CardHeader>
        <CardTitle className="text-lg">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>

        <div className="mt-4 flex items-end gap-1">
          <span className="text-4xl font-bold text-foreground">
            {price === 0 ? "Free" : `$${price}`}
          </span>
          {price > 0 && (
            <span className="mb-1 text-sm text-muted-foreground">
              / mo{billingCycle === "annual" ? ", billed annually" : ""}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <ul className="flex flex-col gap-2" aria-label={`${plan.name} features`}>
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        {isEnterprise ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                {plan.cta}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Contact our sales team</DialogTitle>
                <DialogDescription>
                  Tell us about your team and we&apos;ll get back to you within one
                  business day.
                </DialogDescription>
              </DialogHeader>
              {contactSent ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Thanks! We&apos;ll be in touch shortly.
                </div>
              ) : (
                <form
                  onSubmit={handleContactSubmit}
                  className="flex flex-col gap-4 pt-2"
                >
                  <Input
                    placeholder="Your name"
                    aria-label="Your name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                  />
                  <Input
                    placeholder="Company"
                    aria-label="Company"
                    value={contactCompany}
                    onChange={(e) => setContactCompany(e.target.value)}
                  />
                  <textarea
                    placeholder="What can we help you with?"
                    aria-label="Message"
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    rows={4}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <FormError message={contactError} />
                  <Button type="submit" disabled={contactPending} className="w-full">
                    {contactPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        Sending…
                      </>
                    ) : (
                      "Send message"
                    )}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        ) : (
          <Button
            className="w-full"
            variant={plan.recommended ? "default" : "outline"}
            disabled={isLoading}
            onClick={() => onSelect(plan)}
            aria-label={`Select ${plan.name} plan`}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Processing…
              </>
            ) : (
              plan.cta
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
