import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { ChatWidget } from "@/components/assistant/ChatWidget"

export default async function AssistantPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[900px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Assistant</SectionLabel>
        <ChatWidget />
      </main>
    </div>
  )
}
