import { Check } from "lucide-react"

interface StepIndicatorProps {
  steps: string[]
  currentStep: number // 0-indexed
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <nav aria-label="Registration progress">
      <ol className="flex items-center gap-0">
        {steps.map((label, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep

          return (
            <li key={label} className="flex flex-1 items-center">
              {/* Step circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  aria-current={isCurrent ? "step" : undefined}
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-200",
                    isCompleted
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCurrent
                        ? "border-primary bg-transparent text-primary"
                        : "border-border bg-transparent text-muted-foreground",
                  ].join(" ")}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={[
                    "text-xs font-medium",
                    isCurrent
                      ? "text-foreground"
                      : isCompleted
                        ? "text-primary"
                        : "text-muted-foreground",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>

              {/* Connector line (not after last step) */}
              {index < steps.length - 1 && (
                <div
                  className={[
                    "mb-5 h-0.5 flex-1 transition-all duration-200",
                    index < currentStep ? "bg-primary" : "bg-border",
                  ].join(" ")}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
