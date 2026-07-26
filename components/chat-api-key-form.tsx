"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { KeyRound, Trash2 } from "lucide-react"
import { setChatApiKeyAction, clearChatApiKeyAction } from "@/app/actions"

interface ApiKeyInfo {
  lastFour: string
  updatedAt: Date
}

interface Props {
  apiKeyInfo: ApiKeyInfo | null
}

export function ChatApiKeyForm({ apiKeyInfo }: Props) {
  const [apiKey, setApiKey] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const value = apiKey.trim()
    if (!value) return

    startTransition(async () => {
      const result = await setChatApiKeyAction({ apiKey: value })
      setApiKey("")
      if (result.ok) {
        toast.success("API key saved")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleClear() {
    startTransition(async () => {
      const result = await clearChatApiKeyAction()
      if (result.ok) {
        toast.success("API key removed")
      } else {
        toast.error(result.error)
      }
    })
  }

  const updatedStr = apiKeyInfo
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(apiKeyInfo.updatedAt)
    : null

  return (
    <div
      className="rounded-[12px] px-5 py-4 space-y-3"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="font-mono uppercase tracking-[0.15em] text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        AI Assistant API Key
      </p>

      {apiKeyInfo ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound size={14} style={{ color: "rgba(0,229,255,0.6)" }} />
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              Configured (••••{apiKeyInfo.lastFour}) — updated {updatedStr}
            </span>
          </div>
          <button
            onClick={handleClear}
            disabled={isPending}
            className="shrink-0 rounded-md p-1.5 transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: "rgba(255,255,255,0.06)" }}
            aria-label="Remove API key"
          >
            <Trash2 size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="flex items-center gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            disabled={isPending}
            className="flex-1 rounded-md px-3 py-2 text-xs bg-transparent"
            style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
          />
          <button
            type="submit"
            disabled={isPending || !apiKey.trim()}
            className="shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: "rgba(0,229,255,0.1)", color: "#00e5ff" }}
          >
            Save
          </button>
        </form>
      )}

      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        Optional — bring your own Anthropic key to chat with the AI assistant on your own usage. Without one, the shared assistant key is used (subject to the same rate limits).
      </p>
    </div>
  )
}
