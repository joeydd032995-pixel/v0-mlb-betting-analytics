import { SectionLabel } from "@/components/diamond/SectionLabel"
import { ModelInsights } from "@/components/model-insights"
import { FeatureImportanceChart } from "@/components/insights/FeatureImportanceChart"

export default async function InsightsPage() {
  let userId: string | null = null
  try {
    const { auth } = await import("@clerk/nextjs/server")
    const session = await auth()
    userId = session.userId
  } catch {
    // Clerk not configured — proceed without auth
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Model Insights</SectionLabel>

        <SectionLabel index="02">Feature Importance (SHAP-style)</SectionLabel>
        <FeatureImportanceChart />

        <SectionLabel index="03">Engine Breakdown</SectionLabel>
        <ModelInsights userId={userId} />
      </main>
    </div>
  )
}
