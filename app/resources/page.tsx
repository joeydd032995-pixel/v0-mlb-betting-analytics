import { BookOpen, Code2, FileText, BarChart3 } from "lucide-react"
import { ResourcesGrid } from "@/components/resources-grid"

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Resources & Documentation</h1>
              <p className="text-sm text-muted-foreground">
                Learn how to use HomeplateMetrics and access our API
              </p>
            </div>
          </div>
        </div>

        <ResourcesGrid />
      </main>
    </div>
  )
}
