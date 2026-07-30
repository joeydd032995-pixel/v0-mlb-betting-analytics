// components/diamond/CardNote.tsx
// The house pattern for explaining a card: a plain-language description that is
// always visible, with the "what this isn't showing" caveat tucked behind an ⓘ.
//
// `tone` exists because the app runs two design systems side by side and they
// must not be mixed:
//   "ds" — the --hm-* / mono tokens used inside components/diamond/Panel
//   "ui" — shadcn's CardDescription, used inside components/ui/card

import { CardDescription } from "@/components/ui/card"
import { InfoTip } from "@/components/diamond/InfoTip"
import { cn } from "@/lib/utils"

export interface CardCopy {
  /** What the card is showing, in one line. */
  description: string
  /** What it is not covering. Surfaced on hover/focus of the ⓘ. */
  disclaimer: string
}

interface CardNoteProps extends Partial<CardCopy> {
  tone?: "ds" | "ui"
  className?: string
}

/**
 * Description line plus ⓘ disclaimer. Either half may be omitted — passing only
 * a disclaimer renders a bare ⓘ.
 */
export function CardNote({ description, disclaimer, tone = "ui", className }: CardNoteProps) {
  if (!description && !disclaimer) return null

  const body = (
    <>
      {description}
      {disclaimer && (
        <>
          {description ? " " : null}
          <InfoTip text={disclaimer} />
        </>
      )}
    </>
  )

  if (tone === "ds") {
    return (
      <p
        className={cn("font-mono text-[10px] leading-relaxed", className)}
        style={{ color: "var(--hm-smoke)" }}
      >
        {body}
      </p>
    )
  }

  return <CardDescription className={className}>{body}</CardDescription>
}

/**
 * Just the ⓘ, for cards whose description already reads well in place. Keeps us
 * from rewriting the many CardDescriptions that are already accurate.
 */
export function CardNoteTip({ disclaimer, className }: { disclaimer: string; className?: string }) {
  return <InfoTip text={disclaimer} className={className} />
}
