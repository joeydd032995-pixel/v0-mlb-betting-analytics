import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy — Homeplate Metrics",
  description: "Privacy Policy for Homeplate Metrics NRFI/YRFI analytics platform.",
}

const EFFECTIVE_DATE = "July 29, 2026"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">

        <div className="mb-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: "var(--hm-smoke)" }}>Legal</p>
          <h1 className="text-4xl font-bold text-foreground mb-3">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">1. Overview</h2>
            <p>
              Homeplate Metrics ("we", "us", "our") is committed to protecting your privacy. This Policy
              explains what information we collect, how we use it, and your rights regarding your data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">2. Information We Collect</h2>

            <h3 className="text-sm font-semibold text-foreground mt-4 mb-1">Authentication Data</h3>
            <p>
              Account creation and authentication are handled by <strong className="text-foreground">Clerk</strong> (clerk.com).
              Clerk stores your email address, hashed password, and OAuth tokens (if you sign in via
              Google or Apple). We receive only a unique user identifier (userId) from Clerk — we do not
              store your password or OAuth tokens directly.
            </p>

            <h3 className="text-sm font-semibold text-foreground mt-4 mb-1">User-Generated Data</h3>
            <p>When you use authenticated features, we store the following in our database (Neon PostgreSQL):</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong className="text-foreground">Bet records</strong> — game ID, bet amount, odds, prediction (NRFI/YRFI), outcome</li>
              <li><strong className="text-foreground">Bankroll data</strong> — starting balance, current balance, transaction ledger</li>
              <li><strong className="text-foreground">Watchlist items</strong> — games you have bookmarked</li>
              <li><strong className="text-foreground">User row</strong> — your Clerk userId and a placeholder email reference</li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mt-4 mb-1">Usage Data</h3>
            <p>
              We use <strong className="text-foreground">Vercel Analytics</strong> (privacy-friendly, no cookies) to collect
              anonymous page view counts and performance metrics. No personally identifiable information is
              collected via analytics.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">3. How We Use Your Data</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>To provide and operate the Service (bet tracking, bankroll management, watchlist)</li>
              <li>To display your personal performance history and accuracy statistics</li>
              <li>To maintain your account across sessions</li>
              <li>To improve the Service based on aggregate usage patterns</li>
            </ul>
            <p className="mt-2">
              We do not sell your personal data. We do not use your data for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">4. Third-Party Services</h2>
            <p>We share limited data with the following third parties to operate the Service:</p>
            <div className="mt-2 space-y-2">
              <div className="rounded-md border border-border/30 px-4 py-3">
                <p className="font-medium text-foreground text-xs">Clerk (clerk.com)</p>
                <p>Authentication provider. Handles account creation, login, and session management. Subject to{" "}
                  <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--hm-diamond)" }}>Clerk&apos;s Privacy Policy</a>.</p>
              </div>
              <div className="rounded-md border border-border/30 px-4 py-3">
                <p className="font-medium text-foreground text-xs">Neon / Vercel (neon.tech, vercel.com)</p>
                <p>Database and hosting infrastructure. Your data is stored in Neon PostgreSQL hosted on Vercel infrastructure in the United States.</p>
              </div>
              <div className="rounded-md border border-border/30 px-4 py-3">
                <p className="font-medium text-foreground text-xs">MLB Stats API (statsapi.mlb.com)</p>
                <p>Free public API. No personal data is sent — we only request game schedule and pitcher data.</p>
              </div>
              <div className="rounded-md border border-border/30 px-4 py-3">
                <p className="font-medium text-foreground text-xs">The Odds API / OpenWeatherMap</p>
                <p>Third-party data providers. No personal data is sent — we only request odds and weather data.</p>
              </div>
              <div className="rounded-md border border-border/30 px-4 py-3">
                <p className="font-medium text-foreground text-xs">SportsBlaze / Baseball Savant (Statcast, via pybaseball)</p>
                <p>Third-party sports-statistics providers used for enhanced splits and pitch-level data. No personal user data is sent — we only request game, player, and pitch statistics.</p>
              </div>
              <div className="rounded-md border border-border/30 px-4 py-3">
                <p className="font-medium text-foreground text-xs">Stripe (stripe.com)</p>
                <p>Payment processor for subscription billing. Stripe collects and stores your payment card
                  details, billing address, and transaction history; we do not store your full card number.
                  Subject to{" "}
                  <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--hm-diamond)" }}>Stripe&apos;s Privacy Policy</a>.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">5. Cookies</h2>
            <p>
              Clerk uses cookies to maintain your authentication session. Vercel Analytics is cookieless.
              No advertising or tracking cookies are set by Homeplate Metrics. If you are in the EU/UK,
              you consent to session cookies by using the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">6. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. If you delete your account
              (via Clerk), we will delete your associated bet, bankroll, and watchlist records within
              30 days. Aggregate model prediction data (not linked to your account) is retained indefinitely
              for backtesting purposes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">7. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and data (right to be forgotten)</li>
              <li>Object to or restrict certain processing</li>
            </ul>
            <p className="mt-2">
              To exercise these rights, contact us at{" "}
              <a href="mailto:contact@homeplatemetrics.com" className="underline" style={{ color: "var(--hm-diamond)" }}>
                contact@homeplatemetrics.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">8. Your Privacy Choices (CCPA/CPRA)</h2>
            <p>
              We do not sell or share your personal information for cross-context behavioral advertising,
              as those terms are defined under the California Consumer Privacy Act (CCPA), as amended by
              the California Privacy Rights Act (CPRA), or under similar state privacy laws.
            </p>
            <p className="mt-2">
              If you are a California resident (or a resident of a state with a comparable privacy law),
              you have the right to know what personal information we collect, request its deletion,
              request correction of inaccurate information, and opt out of the sale or sharing of personal
              information — a mechanism that does not apply here because we do not sell or share your data.
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:contact@homeplatemetrics.com" className="underline" style={{ color: "var(--hm-diamond)" }}>
                contact@homeplatemetrics.com
              </a>. We will not discriminate against you for exercising these rights.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">9. International Users &amp; Data Transfers</h2>
            <p>
              Your data is processed and stored in the United States (Neon/Vercel infrastructure, as
              described in Section 4). If you access the Service from outside the United States, including
              from the EU/UK, you understand and consent to your information being transferred to and
              processed in the United States. We do not currently maintain a designated EU representative;
              if you have a GDPR-related request, contact us at{" "}
              <a href="mailto:contact@homeplatemetrics.com" className="underline" style={{ color: "var(--hm-diamond)" }}>
                contact@homeplatemetrics.com
              </a>{" "}
              and we will respond as required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">10. Data Security</h2>
            <p>
              We use industry-standard security measures including encrypted connections (TLS),
              server-side authentication (Clerk), and parameterized database queries (Prisma ORM).
              No system is 100% secure — please use a strong, unique password for your account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">11. Children&apos;s Privacy</h2>
            <p>
              The Service is not intended for users under 18. We do not knowingly collect personal
              information from anyone under 18. If you believe a minor has created an account, contact
              us and we will promptly delete it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will update the effective date
              above and, for material changes, notify you via the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">13. Contact</h2>
            <p>
              Questions or concerns? Contact us at{" "}
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
            href="/disclaimer"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            Responsible Gambling →
          </Link>
        </div>

      </main>
    </div>
  )
}
