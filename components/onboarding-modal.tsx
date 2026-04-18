// components/onboarding-modal.tsx
// First-visit onboarding modal with 3 steps: What is NRFI → Poisson Model → Reading Dashboard
// Shown only once per user via localStorage key "hpm_onboarded"

"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react"
import Link from "next/link"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const steps = [
  {
    title: "What is NRFI?",
    description: "No-Run-First-Inning (NRFI) is a popular baseball betting market.",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          NRFI bets that <strong>neither team scores a run in the first inning</strong>.
          It&apos;s a quick, high-value bet that settles in the first 30 minutes of the game.
        </p>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-400">Why bet NRFI?</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• High win rate (~60%) compared to full-game bets (~51%)</li>
            <li>• Pitcher strength matters more than team talent</li>
            <li>• Early settling allows rapid re-betting</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    title: "How the Model Works",
    description: "Our Poisson-based ensemble predicts first-inning run probability.",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          We use three statistical models to estimate the probability that each team
          scores in the first inning, then combine (ensemble) them for robustness.
        </p>
        <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-sky-400">Three models:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• <strong>Poisson</strong>: Expected runs based on pitcher xR + team strength</li>
            <li>• <strong>Markov Chain</strong>: Baserunner state transitions (balls, walks, hits)</li>
            <li>• <strong>ZIP</strong>: Zero-Inflated Poisson (accounts for no-score games)</li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground italic">
          Data sourced from MLB Statcast, weather APIs, and stadium factors.
        </p>
      </div>
    ),
  },
  {
    title: "Reading the Dashboard",
    description: "Navigate predictions, stats, and insights in 4 main tabs.",
    content: (
      <div className="space-y-4">
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold text-foreground mb-1">📊 Today&apos;s Games</p>
            <p className="text-xs text-muted-foreground">
              Card view of all matchups with NRFI/YRFI probability, recent form, and value bets.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">🎯 Pitchers</p>
            <p className="text-xs text-muted-foreground">
              Ranked by NRFI rate, with model confidence, strikeout rate, and last-5 results.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">🏟️ Teams</p>
            <p className="text-xs text-muted-foreground">
              Offensive metrics (OPS, wOBA, strikeout rate) and home/away YRFI splits.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">📈 History</p>
            <p className="text-xs text-muted-foreground">
              Track all past predictions, record results, and review season accuracy.
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3">
          <p className="text-xs text-violet-300">
            💡 <strong>Tip:</strong> Hover over metric labels for explanations. Use Cmd+K to search games.
          </p>
        </div>
      </div>
    ),
  },
]

export function OnboardingModal({ open, onOpenChange }: Props) {
  const [step, setStep] = useState(0)
  const currentStep = steps[step]

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      // Finished — mark as onboarded and close
      if (typeof window !== "undefined") {
        localStorage.setItem("hpm_onboarded", "true")
      }
      onOpenChange(false)
    }
  }

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  const handleSkip = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("hpm_onboarded", "true")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{currentStep.title}</DialogTitle>
          <DialogDescription>{currentStep.description}</DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="py-4">{currentStep.content}</div>

        {/* Step indicator */}
        <div className="flex items-center gap-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-colors ${
                i === step ? "bg-primary" : i < step ? "bg-emerald-500" : "bg-border/30"
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-4">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={step === 0}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            {step + 1} of {steps.length}
          </div>

          <div className="flex gap-2">
            {step === steps.length - 1 ? (
              <Button
                size="sm"
                onClick={handleNext}
                className="gap-1 bg-emerald-500/90 hover:bg-emerald-500"
              >
                <CheckCircle2 className="h-4 w-4" />
                Got it!
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Glossary link */}
        {step === steps.length - 1 && (
          <p className="text-center text-xs text-muted-foreground pt-2 border-t border-border/30">
            Want to dive deeper? Check out our{" "}
            <Link href="/glossary" className="text-primary hover:underline">
              glossary
            </Link>
            .
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
