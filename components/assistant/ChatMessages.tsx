"use client"

import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"

type ChatMessage = { role: "user" | "assistant"; content: string }

interface Props {
  /** Tailwind height class for the scrollable transcript area, e.g. "h-[600px]" or "h-[380px]". */
  heightClassName?: string
}

// Transcript is persisted to localStorage only — deliberately never server-side.
// The bubble unmounts when closed, which used to wipe the conversation mid-thread.
const STORAGE_KEY = "hm:chat:transcript"
const MAX_PERSISTED = 50 // matches the server's per-request message cap

export function ChatMessages({ heightClassName = "h-[600px]" }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isPending, setIsPending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Restore on mount. Guarded: a corrupt or hand-edited entry must not brick the
  // widget, so anything unparseable is dropped rather than thrown.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const parsed: unknown = JSON.parse(saved)
      if (!Array.isArray(parsed)) return
      const restored = parsed.filter(
        (m): m is ChatMessage =>
          typeof m === "object" && m !== null &&
          (m as ChatMessage).role !== undefined &&
          typeof (m as ChatMessage).content === "string"
      )
      if (restored.length > 0) setMessages(restored)
    } catch {
      // Ignore — start with an empty transcript.
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    try {
      if (messages.length === 0) window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_PERSISTED)))
    } catch {
      // Quota or private-mode failures are non-fatal; chat still works in-session.
    }
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isPending) return

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }]
    setMessages(nextMessages)
    setInput("")
    setIsPending(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      })

      if (res.status === 429) {
        const body = await res.json().catch(() => ({}))
        toast.error(
          body.reason === "daily_cap"
            ? "You've hit today's message limit — try again tomorrow."
            : "You're sending messages too fast — slow down a bit."
        )
        return
      }

      if (!res.ok) {
        // Show what the server actually said. /api/chat returns a specific
        // `error` (a retired provider model, a key that needs re-entering on
        // /account, …); collapsing all of it into one generic string is what
        // turned a one-line config fix into a log-diving session.
        const body = await res.json().catch(() => ({}))
        toast.error(
          typeof body.error === "string" && body.error
            ? body.error
            : "The assistant couldn't respond. Please try again."
        )
        return
      }

      // Parse defensively: a non-JSON body (e.g. an auth redirect returning
      // HTML) would otherwise throw into the catch below and be reported as a
      // connectivity problem, which it isn't.
      const data = await res.json().catch(() => null)
      if (!data || typeof data.reply !== "string") {
        toast.error("The assistant returned an unreadable response. Please try again.")
        return
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }])
    } catch {
      toast.error("Network error reaching the assistant.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className={`flex flex-col ${heightClassName} border rounded-lg`} style={{ borderColor: "var(--ds-border)" }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm opacity-60">
            Ask about tonight&apos;s picks, why the model likes a game, how your bets are doing, or
            general baseball questions.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
            <span
              className={`inline-block rounded-lg px-3 py-2 max-w-[85%] ${
                m.role === "user" ? "whitespace-pre-wrap" : "hm-chat-md"
              }`}
              style={{
                background: m.role === "user" ? "var(--ds-accent)" : "var(--ds-surface)",
                color: m.role === "user" ? "var(--ds-accent-fg, #fff)" : "inherit",
              }}
            >
              {/* Assistant replies render as markdown — tool results are often
                  tabular (slates, records), and raw pipes/asterisks were being
                  shown literally. User text stays plain so nothing they type is
                  reinterpreted as formatting. */}
              {m.role === "user" ? m.content : <ReactMarkdown>{m.content}</ReactMarkdown>}
            </span>
          </div>
        ))}
        {isPending && <p className="text-sm opacity-60">Thinking…</p>}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t" style={{ borderColor: "var(--ds-border)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about today's games…"
          disabled={isPending}
          className="flex-1 rounded-md border px-3 py-2 text-sm bg-transparent"
          style={{ borderColor: "var(--ds-border)" }}
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--ds-accent)", color: "var(--ds-accent-fg, #fff)" }}
        >
          Send
        </button>
        {/* The transcript now survives closing the bubble, so there has to be a
            way to start over. */}
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={isPending}
            className="rounded-md px-2 py-2 text-xs opacity-60 hover:opacity-100 disabled:opacity-30"
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            Clear
          </button>
        )}
      </form>
    </div>
  )
}
