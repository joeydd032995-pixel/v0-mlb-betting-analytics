// app/glossary/page.tsx
// Glossary page displaying all metrics and terms with explanations.
// Server component for SEO optimization.

import { Metadata } from "next"
import Link from "next/link"
import { METRIC_GLOSSARY } from "@/lib/types"

export const metadata: Metadata = {
  title: "Glossary — NRFI/YRFI Prediction Engine",
  description:
    "Complete glossary of metrics, statistics, and baseball terminology used in the NRFI/YRFI prediction engine. Learn xR, NRFI rate, wOBA, OPS, and more.",
  openGraph: {
    title: "Glossary — NRFI/YRFI Prediction Engine",
    description: "Complete glossary of metrics and terminology for baseball NRFI/YRFI predictions.",
  },
}

export default function GlossaryPage() {
  // Sort glossary entries alphabetically
  const entries = Object.entries(METRIC_GLOSSARY).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-2">Glossary</h1>
          <p className="text-lg text-muted-foreground">
            Learn the metrics, statistics, and terminology behind the prediction engine.
          </p>
        </div>

        {/* Quick navigation */}
        <nav className="mb-12 flex flex-wrap gap-2">
          {entries.map(([term]) => (
            <a
              key={term}
              href={`#${term}`}
              className="inline-block rounded-md border border-border/30 bg-muted/10 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
            >
              {term}
            </a>
          ))}
        </nav>

        {/* Glossary entries */}
        <dl className="space-y-8">
          {entries.map(([term, definition]) => (
            <div key={term} id={term} className="scroll-mt-20">
              <dt className="flex items-start gap-2 mb-2">
                <span className="inline-block h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                <span className="text-xl font-bold text-foreground">{term}</span>
              </dt>
              <dd className="ml-4 text-base text-muted-foreground leading-relaxed">
                {definition}
              </dd>
            </div>
          ))}
        </dl>

        {/* Footer note */}
        <div className="mt-16 rounded-lg border border-border/30 bg-muted/10 p-6">
          <p className="text-sm text-muted-foreground">
            <strong>Data sources:</strong> Metrics are calculated from MLB Statcast data, weather APIs, and stadium
            factors. The prediction engine uses Poisson, Markov, and ZIP models to estimate first-inning run probability.
          </p>
          <p className="text-sm text-muted-foreground mt-3">
            <strong>Disclaimer:</strong> These predictions are for informational purposes only and should not be
            construed as financial or betting advice. Past performance does not guarantee future results.
          </p>
        </div>

        {/* Back to dashboard link */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-block rounded-md border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}
