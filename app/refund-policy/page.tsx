import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — Homeplate Metrics",
  description: "Refund and cancellation policy for Homeplate Metrics Pro and Elite subscriptions.",
}

const EFFECTIVE_DATE = "July 29, 2026"

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">

        <div className="mb-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: "var(--hm-smoke)" }}>Legal</p>
          <h1 className="text-4xl font-bold text-foreground mb-3">Refund &amp; Cancellation Policy</h1>
          <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">1. Overview</h2>
            <p>
              This policy governs refunds and cancellations for Homeplate Metrics Pro and Elite paid
              subscriptions, purchased and billed through Stripe. It should be read alongside our{" "}
              <Link href="/terms" className="underline" style={{ color: "var(--hm-diamond)" }}>Terms of Service</Link>,
              which covers the recurring-billing terms of your subscription.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">2. How to Cancel</h2>
            <p>
              You can cancel your subscription at any time, without contacting support, through the Stripe
              Billing Portal. From your{" "}
              <Link href="/account" className="underline" style={{ color: "var(--hm-diamond)" }}>Account</Link>{" "}
              page, select &quot;Manage billing &amp; invoices&quot; to open the portal and cancel your plan.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">3. What Happens After You Cancel</h2>
            <p>
              Canceling stops future renewals — it does not end your access immediately. You retain full
              access to your plan&apos;s features through the end of your current paid billing period. No
              automatic refund is issued for the unused portion of that period.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">4. When Refunds Are Granted</h2>
            <p>
              Outside of the circumstances below, subscription charges are non-refundable. We will issue a
              refund when:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>You were charged more than once for the same billing period (a duplicate charge)</li>
              <li>A billing error on our part resulted in an incorrect charge</li>
              <li>You were charged after a cancellation request you had already submitted through the Stripe Billing Portal</li>
            </ul>
            <p className="mt-2">
              To request a refund under one of these circumstances, contact us at{" "}
              <a href="mailto:contact@homeplatemetrics.com" className="underline" style={{ color: "var(--hm-diamond)" }}>
                contact@homeplatemetrics.com
              </a>{" "}
              with your account email and the charge in question. We aim to resolve verified billing-error
              refund requests within 5 business days.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">5. Renewal &amp; Price-Change Notices</h2>
            <p>
              Subscriptions renew automatically at the then-current price at the end of each billing period
              unless canceled before the renewal date. If we increase the price of your plan, we will
              provide notice before the increase takes effect on your next renewal. See Section 7
              (&quot;Subscription &amp; Billing&quot;) of our{" "}
              <Link href="/terms" className="underline" style={{ color: "var(--hm-diamond)" }}>Terms of Service</Link>{" "}
              for full details.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">6. Contact for Billing Disputes</h2>
            <p>
              Questions about a charge, or a dispute you&apos;d like us to look into before contacting your
              bank or card issuer? Reach us at{" "}
              <a href="mailto:contact@homeplatemetrics.com" className="underline" style={{ color: "var(--hm-diamond)" }}>
                contact@homeplatemetrics.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-border/30 flex gap-4">
          <Link
            href="/terms"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            ← Terms of Service
          </Link>
          <Link
            href="/account"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            Manage Your Subscription →
          </Link>
        </div>

      </main>
    </div>
  )
}
