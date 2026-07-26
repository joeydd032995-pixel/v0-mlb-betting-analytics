import { cn } from "@/lib/utils"

export interface MethodologyRow {
  label: string
  value: string
}

interface MethodologyPanelProps {
  /** Heading on the disclosure summary. */
  title?: string
  /** One-line answer to "what am I looking at" — always visible, not collapsed. */
  summary?: string
  /** Source / period / denominator facts, rendered as a definition grid. */
  rows: MethodologyRow[]
  /** Known limitations of the numbers above. Rendered as a bulleted list. */
  caveats?: string[]
  className?: string
}

/**
 * Collapsible "How this is calculated" disclosure.
 *
 * Built on native <details>/<summary> rather than a Radix primitive so it can
 * render inside Server Components (no hooks, no client boundary) — the same
 * constraint components/tier-gate-notice.tsx satisfies.
 *
 * Every stats surface in the app aggregates a different population over a
 * different window, and none of that was previously visible: pages showed a
 * percentage with no period, no denominator and no note that backfilled or
 * system-wide rows were mixed in.  Callers pass real counts here so the
 * disclosure states the actual sample rather than boilerplate.
 */
export function MethodologyPanel({
  title = "How this is calculated",
  summary,
  rows,
  caveats,
  className,
}: MethodologyPanelProps) {
  return (
    <details
      className={cn(
        "group rounded-[14px] border border-ds-line overflow-hidden",
        className
      )}
      style={{ background: "var(--ds-panel)" }}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 list-none [&::-webkit-details-marker]:hidden hover:bg-white/[0.02] transition-colors">
        <span
          aria-hidden
          className="font-jet text-[10px] text-ds-muted transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        <span className="font-jet text-[10px] uppercase tracking-[0.16em] text-ds-muted">
          {title}
        </span>
        {summary && (
          <span className="font-jet text-[10px] text-ds-muted/70 truncate">— {summary}</span>
        )}
      </summary>

      <div className="border-t border-ds-line/50 px-4 py-3 space-y-3">
        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="font-jet text-[10px] uppercase tracking-[0.12em] text-ds-muted">
                {r.label}
              </dt>
              <dd className="font-jet text-[11px] text-ds-fg mb-1.5 sm:mb-0">{r.value}</dd>
            </div>
          ))}
        </dl>

        {caveats && caveats.length > 0 && (
          <ul className="space-y-1 border-t border-ds-line/50 pt-2.5">
            {caveats.map((c) => (
              <li key={c} className="flex gap-2 font-jet text-[10px] leading-relaxed text-ds-muted">
                <span aria-hidden className="text-amber-400/70 shrink-0">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
