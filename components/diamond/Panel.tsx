import { cn } from "@/lib/utils"

interface PanelProps {
  children: React.ReactNode
  className?: string
  title?: string
  chip?: string
}

export function Panel({ children, className, title, chip }: PanelProps) {
  return (
    <div className={cn("ds-panel p-[18px]", className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 mb-[14px]">
          <h3 className="font-jet text-[11px] font-medium uppercase tracking-[0.18em] text-ds-muted">
            {title}
          </h3>
          {chip && (
            <span className="font-jet text-[10px] text-ds-ink-2 bg-[#0a1426] border border-ds-line rounded-full px-[9px] py-[3px] tracking-[0.05em]">
              {chip}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
