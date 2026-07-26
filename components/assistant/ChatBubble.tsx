"use client"

import { useState } from "react"
import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { MessageCircle, X } from "lucide-react"
import { ChatMessages } from "@/components/assistant/ChatMessages"

export function ChatBubble() {
  const [open, setOpen] = useState(false)
  const { isSignedIn } = useAuth()

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-20 z-50 w-10 h-10 rounded-full grid place-items-center text-ds-muted transition-all duration-150 hover:text-ds-cy"
        style={{
          background: "var(--ds-panel)",
          border: "1px solid var(--ds-line)",
          boxShadow: "0 10px 40px -10px rgba(0,0,0,0.6)",
        }}
        aria-label="AI assistant"
      >
        <MessageCircle className="w-4 h-4" />
      </button>

      {/* Popup */}
      {open && (
        <div
          className="fixed bottom-16 right-20 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[480px] rounded-[14px] flex flex-col overflow-hidden"
          style={{
            background: "linear-gradient(180deg, var(--ds-panel), var(--ds-panel-2))",
            border: "1px solid var(--ds-line)",
            boxShadow: "0 20px 60px -20px #000, 0 0 40px -20px var(--ds-cy)",
          }}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h4 className="font-jet text-[11px] uppercase tracking-[0.2em] text-ds-muted font-medium">
              AI Assistant
            </h4>
            <button
              onClick={() => setOpen(false)}
              className="text-ds-muted hover:text-ds-ink transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 px-4 pb-4 min-h-0">
            {isSignedIn ? (
              <ChatMessages heightClassName="h-full" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
                <p className="text-sm opacity-70">Sign in to chat with the AI assistant.</p>
                <Link
                  href="/sign-in"
                  className="rounded-md px-4 py-2 text-sm font-medium"
                  style={{ background: "var(--ds-accent)", color: "var(--ds-accent-fg, #fff)" }}
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
