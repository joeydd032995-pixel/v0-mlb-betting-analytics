"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { KeyRound, Trash2, AlertTriangle } from "lucide-react"
import { setChatApiKeyAction, clearChatApiKeyAction, type ChatProvider } from "@/app/actions"

interface ApiKeyRow {
  provider: string
  lastFour: string
  updatedAt: Date
  /** False when the stored key can no longer be decrypted (ENCRYPTION_KEY changed). */
  usable: boolean
}

interface Props {
  apiKeyInfo: ApiKeyRow[]
}

const PROVIDERS: { id: ChatProvider; label: string; placeholder: string }[] = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "groq", label: "Groq", placeholder: "gsk_..." },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-v1-..." },
]

function formatUpdated(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(date)
}

export function ChatApiKeyForm({ apiKeyInfo }: Props) {
  const [inputs, setInputs] = useState<Record<ChatProvider, string>>({ anthropic: "", groq: "", openrouter: "" })
  const [isPending, startTransition] = useTransition()

  const rowsByProvider = Object.fromEntries(apiKeyInfo.map((row) => [row.provider, row])) as Partial<
    Record<ChatProvider, ApiKeyRow>
  >

  function handleSave(provider: ChatProvider, e: React.FormEvent) {
    e.preventDefault()
    // Strip ALL whitespace, not just leading/trailing — a key copied from a
    // UI that hard-wraps long strings can carry embedded newlines, which
    // corrupts the Authorization header once the key is used (surfaces as a
    // provider-side "missing/invalid credential" error, not a local one).
    const value = inputs[provider].replace(/\s+/g, "")
    if (!value) return

    startTransition(async () => {
      const result = await setChatApiKeyAction({ provider, apiKey: value })
      setInputs((prev) => ({ ...prev, [provider]: "" }))
      if (result.ok) {
        toast.success(`${provider} key saved`)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleClear(provider: ChatProvider) {
    startTransition(async () => {
      const result = await clearChatApiKeyAction({ provider })
      if (result.ok) {
        toast.success(`${provider} key removed`)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div
      className="rounded-[12px] px-5 py-4 space-y-4"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="font-mono uppercase tracking-[0.15em] text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        AI Assistant API Keys
      </p>

      <div className="space-y-3">
        {PROVIDERS.map(({ id, label, placeholder }) => {
          const row = rowsByProvider[id]
          return (
            <div key={id} className="space-y-1.5">
              <p className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>
                {label}
              </p>
              {row && row.usable ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <KeyRound size={14} style={{ color: "rgba(0,229,255,0.6)" }} />
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                      Configured (••••{row.lastFour}) — updated {formatUpdated(row.updatedAt)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleClear(id)}
                    disabled={isPending}
                    className="shrink-0 rounded-md p-1.5 transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                    aria-label={`Remove ${label} API key`}
                  >
                    <Trash2 size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
                  </button>
                </div>
              ) : (
                <>
                  {/* A stored-but-unreadable key would otherwise look configured
                      while silently failing every chat request. Say so, and show
                      the input — saving over it upserts the same row. */}
                  {row && !row.usable && (
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: "rgba(255,180,0,0.8)" }} />
                      <span className="text-[11px]" style={{ color: "rgba(255,180,0,0.8)" }}>
                        The saved key (••••{row.lastFour}) can no longer be read — the server&apos;s encryption key
                        changed since it was stored. Enter it again to restore access.
                      </span>
                    </div>
                  )}
                  <form onSubmit={(e) => handleSave(id, e)} className="flex items-center gap-2">
                    <input
                      type="password"
                      value={inputs[id]}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                      placeholder={placeholder}
                      disabled={isPending}
                      className="flex-1 rounded-md px-3 py-2 text-xs bg-transparent"
                      style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
                    />
                    <button
                      type="submit"
                      disabled={isPending || !inputs[id].trim()}
                      className="shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ background: "rgba(0,229,255,0.1)", color: "#00e5ff" }}
                    >
                      Save
                    </button>
                    {row && !row.usable && (
                      <button
                        type="button"
                        onClick={() => handleClear(id)}
                        disabled={isPending}
                        className="shrink-0 rounded-md p-1.5 transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                        aria-label={`Remove ${label} API key`}
                      >
                        <Trash2 size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
                      </button>
                    )}
                  </form>
                </>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        Optional — bring your own key(s) to chat with the AI assistant on your own usage. The assistant tries
        Anthropic, then Groq, then OpenRouter in order; a saved key only takes effect at its own step (e.g. a Groq
        key has no effect if the Anthropic step already answers). Without any keys, the shared assistant keys are
        used (subject to the same rate limits).
      </p>
    </div>
  )
}
