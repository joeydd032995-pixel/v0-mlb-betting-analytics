import { getAnthropicClient } from "@/lib/ai/anthropic-client"
import { getGroqClient, getOpenRouterClient } from "@/lib/ai/openai-compatible-client"
import { runAnthropicChatLoop, type ChatLoopMessage } from "@/lib/ai/chat-loop-anthropic"
import { runOpenAICompatibleChatLoop } from "@/lib/ai/chat-loop-openai-compatible"
import { CONFIG } from "@/lib/config"

export type ChatProvider = "anthropic" | "groq" | "openrouter"

/** A user's own key per provider, from /account — each is independent and optional. */
export interface UserProviderKeys {
  anthropic?: string | null
  groq?: string | null
  openrouter?: string | null
}

export interface ChatFailoverResult {
  reply: string
  toolCalls: { name: string; input: unknown }[]
  provider: ChatProvider
}

interface ChatAttempt {
  provider: ChatProvider
  run: () => Promise<{ reply: string; toolCalls: { name: string; input: unknown }[] }>
}

/**
 * Retryable errors move to the next provider in the chain: auth failures,
 * rate limits, retired models, server errors, and anything without an HTTP
 * status (network errors, timeouts, JSON parse failures). Anything else (a
 * programmer error) is rethrown immediately — falling through would just mask
 * a real bug.
 *
 * 404 counts because that's what providers return when a model slug has been
 * retired or renamed out from under us — a provider-side config failure, not a
 * bug here, so the remaining providers still deserve a turn. OpenRouter
 * dropping `meta-llama/llama-3.3-70b-instruct:free` from its free tier is the
 * case that prompted this.
 */
function isRetryableProviderError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  if (status !== undefined) {
    return status === 401 || status === 403 || status === 404 || status === 429 || status >= 500
  }
  return true
}

/**
 * Tries providers in priority order for reliability, not cost or user choice:
 * (1) Anthropic — user's own key if set, else the shared ANTHROPIC_API_KEY —
 * (2) Groq, (3) OpenRouter. Each step is only attempted if it's configured.
 * Every attempt runs its own bounded tool-call loop so live MLB lookups keep
 * working through the whole chain, not just on the primary provider.
 */
export async function runChatWithFailover(
  userMessages: ChatLoopMessage[],
  userKeys: UserProviderKeys
): Promise<ChatFailoverResult> {
  const attempts: ChatAttempt[] = []

  if (userKeys.anthropic || process.env.ANTHROPIC_API_KEY) {
    attempts.push({
      provider: "anthropic",
      run: () => runAnthropicChatLoop(getAnthropicClient(userKeys.anthropic ?? null), userMessages),
    })
  }

  const groq = getGroqClient(userKeys.groq)
  if (groq) {
    attempts.push({
      provider: "groq",
      run: () => runOpenAICompatibleChatLoop(groq, CONFIG.chat.fallbackModels.groq, userMessages),
    })
  }

  const openrouter = getOpenRouterClient(userKeys.openrouter)
  if (openrouter) {
    attempts.push({
      provider: "openrouter",
      run: () => runOpenAICompatibleChatLoop(openrouter, CONFIG.chat.fallbackModels.openrouter, userMessages),
    })
  }

  if (attempts.length === 0) {
    throw new Error("No chat provider is configured (ANTHROPIC_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY all unset)")
  }

  let lastErr: unknown
  for (const attempt of attempts) {
    try {
      const result = await attempt.run()
      if (attempt !== attempts[0]) {
        console.warn(`[chat-provider-chain] served by fallback provider "${attempt.provider}"`)
      }
      return { ...result, provider: attempt.provider }
    } catch (err) {
      lastErr = err
      console.warn(
        `[chat-provider-chain] provider "${attempt.provider}" failed, trying next`,
        err instanceof Error ? err.message : err
      )
      if (!isRetryableProviderError(err)) throw err
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("All chat providers failed")
}
