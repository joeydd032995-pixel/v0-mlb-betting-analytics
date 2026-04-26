import { cn } from "@/lib/utils"

interface SectionLabelProps {
  index?: string | number
  children: React.ReactNode
  className?: string
}

export function SectionLabel({ index, children, className }: SectionLabelProps) {
  return (
    <div className={cn("ds-section-label my-4", className)}>
      {index !== undefined && (
        <span className="font-jet text-ds-cy font-bold">{String(index).padStart(2, "0")}</span>
      )}
      {children}
    </div>
  )
}
