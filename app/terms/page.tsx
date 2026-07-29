import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service — Homeplate Metrics",
  description: "Terms of Service for Homeplate Metrics NRFI/YRFI analytics platform.",
}

const EFFECTIVE_DATE = "July 29, 2026"

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">

        <div className="mb-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: "var(--hm-smoke)" }}>Legal</p>
          <h1 className="text-4xl font-bold text-foreground mb-3">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Homeplate Metrics ("the Service", "we", "us"), you agree to be bound by
              these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">2. Description of Service</h2>
            <p>
              Homeplate Metrics is a statistical analytics platform that provides probability estimates and
              data-driven analysis for MLB first-inning outcomes (NRFI/YRFI). <strong className="text-foreground">The Service
              is an informational and analytical tool only. We are not a sportsbook, betting service, or
              gambling operator.</strong> We do not accept wagers, process payments related to gambling, or
              facilitate any betting transactions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">3. Eligibility</h2>
            <p>
              You must be at least 18 years of age (or 21 where required by applicable law) to use the Service.
              By using the Service, you represent and warrant that you meet the minimum age requirement in
              your jurisdiction. Sports betting and gambling analytics may be restricted or prohibited in
              certain jurisdictions. You are solely responsible for complying with the laws applicable to you.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">4. Permitted Use</h2>
            <p>You may use the Service for personal, non-commercial informational purposes only. You may not:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Reproduce, redistribute, or sell our data or analysis for commercial purposes</li>
              <li>Reverse-engineer, scrape, or systematically extract data from the Service</li>
              <li>Use the Service in any way that violates applicable laws or regulations</li>
              <li>Attempt to gain unauthorized access to any part of the Service or its infrastructure</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">5. Data Sources &amp; Intellectual Property</h2>
            <p>
              The Service relies on third-party data providers, including the MLB Stats API, Baseball
              Savant/Statcast data (accessed via the <code>pybaseball</code> library), The Odds API,
              OpenWeatherMap, and SportsBlaze. We do not control the accuracy, availability, or continuity
              of this third-party data.
            </p>
            <p className="mt-2">
              <strong className="text-foreground">Homeplate Metrics is not affiliated with, endorsed by, or
              sponsored by Major League Baseball, MLB Advanced Media, or the MLB Players Association
              (MLBPA).</strong> Team names, player names, and statistics are used solely for factual and
              statistical reference. We do not display player photos or any MLB-licensed imagery.
            </p>
            <p className="mt-2">
              Our probability models, ensemble methodology, calibration logic, user interface, and derived
              analysis are our intellectual property. We do not claim ownership over the underlying,
              independently-sourced statistics themselves, and nothing in this section grants you any
              license to reproduce or redistribute our compiled output beyond the personal use permitted in
              Section 4.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">6. Account Terms</h2>
            <p>
              Account registration is managed by Clerk, a third-party authentication provider. You are
              responsible for maintaining the confidentiality of your account credentials. We reserve the
              right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">7. Subscription &amp; Billing</h2>
            <p>
              Paid tiers (Pro, Elite) are recurring subscriptions billed monthly or annually in advance
              through Stripe, our third-party payment processor. By subscribing, you authorize us to
              charge your payment method on a recurring basis until you cancel.
            </p>
            <p className="mt-2">
              <strong className="text-foreground">Subscriptions renew automatically</strong> at the
              then-current price at the end of each billing period unless canceled before the renewal
              date. If we increase the price of your plan, we will provide notice (e.g. by email or
              in-app notice) before the increase takes effect on your next renewal; continuing to use the
              Service after that date constitutes acceptance of the new price.
            </p>
            <p className="mt-2">
              You may cancel at any time, self-service, through the Stripe Billing Portal linked from your{" "}
              <Link href="/account" className="underline" style={{ color: "var(--hm-diamond)" }}>Account</Link>{" "}
              page. Access continues through the end of your current paid period; cancellation does not
              trigger an automatic partial-period refund. See our{" "}
              <Link href="/refund-policy" className="underline" style={{ color: "var(--hm-diamond)" }}>
                Refund &amp; Cancellation Policy
              </Link>{" "}
              for full details.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">8. No Gambling Advice</h2>
            <p>
              Nothing on this Service constitutes gambling advice, financial advice, or a recommendation
              to place any wager. Our probability estimates are statistical models with inherent uncertainty.
              Past model performance does not guarantee future accuracy. All decisions to place wagers are
              made solely by you at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">9. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, OR ACCURACY OF PREDICTIONS. We do not warrant that the Service will be uninterrupted,
              error-free, or that any data or predictions are correct.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">10. Limitation of Liability</h2>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY LAW, HOMEPLATE METRICS AND ITS OPERATORS SHALL NOT BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING
              ANY LOSSES ARISING FROM RELIANCE ON OUR PREDICTIONS OR ANALYTICS. OUR TOTAL LIABILITY SHALL
              NOT EXCEED $100 USD.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">11. Governing Law</h2>
            <p>
              These Terms shall be governed by the laws of the United States. Any disputes shall be resolved
              through binding arbitration on an individual basis.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">12. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. Continued use of the Service after changes are posted
              constitutes acceptance of the updated Terms. We will update the effective date above when
              changes are made.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">13. Contact</h2>
            <p>
              For questions about these Terms, contact us at{" "}
              <a
                href="mailto:contact@homeplatemetrics.com"
                className="underline"
                style={{ color: "var(--hm-diamond)" }}
              >
                contact@homeplatemetrics.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-border/30 flex gap-4">
          <Link
            href="/"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            ← Back to Home
          </Link>
          <Link
            href="/privacy"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            Privacy Policy →
          </Link>
        </div>

      </main>
    </div>
  )
}
