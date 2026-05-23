import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Responsible Gambling — Homeplate Metrics",
  description: "Responsible gambling policy and resources for Homeplate Metrics users.",
}

const RESOURCES = [
  {
    name: "National Council on Problem Gambling (NCPG)",
    detail: "24/7 Helpline: 1-800-522-4700 | Text: 1-800-522-4700",
    href: "https://www.ncpgambling.org",
  },
  {
    name: "Gamblers Anonymous",
    detail: "Peer support groups worldwide",
    href: "https://www.gamblersanonymous.org",
  },
  {
    name: "BeGambleAware (UK)",
    detail: "National Gambling Helpline: 0808 8020 133",
    href: "https://www.begambleaware.org",
  },
  {
    name: "GamCare (UK)",
    detail: "Free support, information, and counselling",
    href: "https://www.gamcare.org.uk",
  },
  {
    name: "Problem Gambling Canada",
    detail: "Provincial support and resources",
    href: "https://www.problemgambling.ca",
  },
]

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">

        <div className="mb-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: "var(--hm-smoke)" }}>Responsible Gambling</p>
          <h1 className="text-4xl font-bold text-foreground mb-3">Disclaimer &amp; Responsible Gambling</h1>
          <p className="text-sm text-muted-foreground">
            Please read this page before using Homeplate Metrics for any betting-related decisions.
          </p>
        </div>

        {/* Prominent disclaimer box */}
        <div
          className="rounded-md px-5 py-4 mb-10"
          style={{
            background: "rgba(255,23,68,0.08)",
            border: "1px solid rgba(255,23,68,0.25)",
          }}
        >
          <p className="text-sm font-semibold text-foreground mb-1">Important Notice</p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--hm-mist)" }}>
            Homeplate Metrics is a <strong className="text-foreground">statistical analytics tool only</strong>.
            We are not a sportsbook and we do not facilitate gambling. Our probability estimates are
            mathematical models — they are not guaranteed to be accurate, and they are{" "}
            <strong className="text-foreground">not a recommendation to place any wager</strong>.
            Sports betting involves real financial risk and is not suitable for everyone.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Age Restriction</h2>
            <p>
              You must be of legal gambling age in your jurisdiction to use this Service —
              a minimum of <strong className="text-foreground">18 years old</strong> in most jurisdictions
              and <strong className="text-foreground">21 years old</strong> in some US states.
              If you are under the applicable minimum age, do not use this Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Know Your Jurisdiction</h2>
            <p>
              Sports betting and gambling are regulated differently across US states, countries, and
              territories. It is your responsibility to know and comply with the laws of your jurisdiction.
              Homeplate Metrics makes no representation that using our analytics for betting purposes is
              legal in your location.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">The Limits of Our Models</h2>
            <p>
              Our 7-model ensemble produces probability estimates — not certainties. Even a high-confidence
              NRFI prediction can be wrong. No analytical tool can predict the outcome of a baseball game
              with certainty. Past accuracy of our models does not guarantee future performance.
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Never bet more than you can afford to lose</li>
              <li>Do not use rent, mortgage, or essential living funds to place wagers</li>
              <li>Treat betting as entertainment, not as a reliable income source</li>
              <li>Set a budget before you start, and stick to it</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Signs of Problem Gambling</h2>
            <p>Seek help if you recognize any of these warning signs:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Spending more time or money gambling than intended</li>
              <li>Chasing losses by placing larger bets</li>
              <li>Gambling to escape problems, stress, or anxiety</li>
              <li>Lying to friends or family about gambling activity</li>
              <li>Neglecting work, school, or personal responsibilities</li>
              <li>Borrowing money to gamble</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Get Help — Free Resources</h2>
            <p className="mb-4">
              If you or someone you know may have a problem with gambling, free confidential help is
              available 24/7:
            </p>
            <div className="space-y-2">
              {RESOURCES.map((r) => (
                <a
                  key={r.href}
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-md border border-border/30 px-4 py-3 transition-colors hover:border-border/60"
                >
                  <div>
                    <p className="font-medium text-foreground text-xs">{r.name}</p>
                    <p className="text-xs mt-0.5">{r.detail}</p>
                  </div>
                  <span className="text-xs mt-1 sm:mt-0 sm:ml-4 shrink-0" style={{ color: "var(--hm-diamond)" }}>
                    Visit ↗
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">Self-Exclusion</h2>
            <p>
              Most licensed sportsbooks offer voluntary self-exclusion programs. If you believe you
              need to stop gambling, contact your sportsbook directly to enroll. In the US, many states
              also maintain statewide self-exclusion registries.
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
            href="/terms"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            Terms of Service →
          </Link>
        </div>

      </main>
    </div>
  )
}
