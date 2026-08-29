// lib/ai/chat-provider-chain.ts
// runChatWithFailover() — the single entry point /api/chat calls. Tries
// Anthropic → Groq → OpenRouter in order, using each provider's own key when
// the user has one saved, else the shared env var; only attempts a provider
// that's configured, and falls through to the next on a retryable error (see
// isRetryableProviderError). See CLAUDE.md "AI Chat Assistant" for the full
// picture — do not add another LLM integration path outside this file.

import { getAnthropicClient } from "@/lib/ai/anthropic-client"
import { getGroqClient, getOpenRouterClient } from "@/lib/ai/openai-compatible-client"
import { runAnthropicChatLoop, type ChatLoopMessage } from "@/lib/ai/chat-loop-anthropic"
import { runOpenAICompatibleChatLoop } from "@/lib/ai/chat-loop-openai-compatible"
import type { ToolContext } from "@/lib/ai/chat-tools"
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
 *
 * 413 counts for the same reason: a payload over one provider's per-minute token
 * budget may fit the next one's, so the chain should move on rather than stop.
 *
 * 402 counts because a provider whose account is out of credit says nothing
 * about the next one's balance — an exhausted OpenRouter balance must not stop
 * the chain before a funded provider gets its turn.
 */
function isRetryableProviderError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  if (status !== undefined) {
    return (
      status === 401 ||
      status === 402 ||
      status === 403 ||
      status === 404 ||
      status === 413 ||
      status === 429 ||
      status >= 500
    )
  }
  return true
}

/**
 * Thrown only when no provider in the chain has a usable key — the one failure
 * that genuinely means "not configured".
 *
 * It exists so callers can tell that apart from a configured chain whose
 * providers all failed for their own reasons. Reporting a retired model slug or
 * a rejected key as "not configured" sent a maintainer checking env vars that
 * were set correctly the whole time; describeChatFailure() below is the other
 * half of that fix.
 */
export class NoChatProviderConfiguredError extends Error {
  constructor() {
    super("No chat provider is configured (ANTHROPIC_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY all unset)")
    this.name = "NoChatProviderConfiguredError"
  }
}

/**
 * Wraps the error that ended the chain, keeping the identity of the attempt
 * that produced it.
 *
 * A bare status is not enough to explain a failure: "404, set GROQ_MODEL" is
 * useless advice when the request that 404'd went to Anthropic, whose model
 * comes from CONFIG.chat.model instead. It also over-claims — one provider's
 * status says nothing about the ones that failed before it for their own
 * reasons. The wrapper carries the provider so describeChatFailure() can name
 * the right knob and attribute the status to the right attempt.
 *
 * The original error stays reachable as `providerError` (and as `cause`), and
 * its message is folded into this one so server logs still show what the
 * provider actually said.
 */
export class ChatProvidersFailedError extends Error {
  readonly provider: ChatProvider
  readonly status?: number
  readonly providerError: unknown

  constructor(provider: ChatProvider, providerError: unknown) {
    const detail = providerError instanceof Error ? providerError.message : String(providerError)
    super(`chat provider "${provider}" failed: ${detail}`, { cause: providerError })
    this.name = "ChatProvidersFailedError"
    this.provider = provider
    this.status = (providerError as { status?: number } | null)?.status
    this.providerError = providerError
  }
}

/** Provider names as a user should read them. */
const PROVIDER_LABEL: Record<ChatProvider, string> = {
  anthropic: "Anthropic",
  groq: "Groq",
  openrouter: "OpenRouter",
}

/**
 * Where each provider's model slug is configured — the knob to turn when that
 * provider 404s on a retired model. Anthropic's is a code constant, not an env
 * var, which is exactly why the remediation has to be provider-specific.
 */
const MODEL_SOURCE: Record<ChatProvider, string> = {
  anthropic: "CONFIG.chat.model in lib/config.ts",
  groq: "the GROQ_MODEL environment variable",
  openrouter: "the OPENROUTER_MODEL environment variable",
}

/**
 * Turns a runChatWithFailover() rejection into a message safe to show the user
 * and specific enough to act on: which attempt failed, how, and what to change.
 *
 * Never echoes the provider's raw error text — it can carry account and key
 * details that don't belong in a browser toast (the server log has the full
 * message for whoever is debugging).
 */
export function describeChatFailure(err: unknown): string {
  if (err instanceof NoChatProviderConfiguredError) {
    return "The chat assistant isn't set up yet — no provider API key is configured on the server or your account."
  }

  const failure = err instanceof ChatProvidersFailedError ? err : null
  const status = failure?.status ?? (err as { status?: number } | null)?.status
  const provider = failure?.provider ?? null
  // Attribute the status to the attempt that actually returned it. Without a
  // provider we can only speak generically — never invent one.
  const subject = provider
    ? `Chat failed on every configured provider; the last one tried (${PROVIDER_LABEL[provider]})`
    : "The chat provider"

  if (status === 404) {
    const fix = provider
      ? `Point ${MODEL_SOURCE[provider]} at a current model.`
      : "Check the configured model slugs (CONFIG.chat.model, GROQ_MODEL, OPENROUTER_MODEL)."
    return `${subject} rejected the model this app asks for — the slug has most likely been retired or isn't available on that account's plan. ${fix}`
  }
  if (status === 401 || status === 403) {
    return `${subject} rejected the API key in use — check the key saved on your Account page, or the server's provider keys.`
  }
  if (status === 402) {
    return `${subject} rejected the request for billing reasons — the account behind that API key is out of credit.`
  }
  if (status === 429) {
    return `${subject} is rate-limiting us right now — please try again in a minute.`
  }
  if (status === 413) {
    return "This conversation got too long for the available providers — clear the chat and ask again."
  }
  return "The chat assistant is temporarily unavailable — please try again in a moment."
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
  userKeys: UserProviderKeys,
  ctx: ToolContext
): Promise<ChatFailoverResult> {
  const attempts: ChatAttempt[] = []

  if (userKeys.anthropic || process.env.ANTHROPIC_API_KEY) {
    attempts.push({
      provider: "anthropic",
      run: () => runAnthropicChatLoop(getAnthropicClient(userKeys.anthropic ?? null), userMessages, ctx),
    })
  }

  const groq = getGroqClient(userKeys.groq)
  if (groq) {
    attempts.push({
      provider: "groq",
      run: () => runOpenAICompatibleChatLoop(groq, CONFIG.chat.fallbackModels.groq, userMessages, ctx),
    })
  }

  const openrouter = getOpenRouterClient(userKeys.openrouter)
  if (openrouter) {
    attempts.push({
      provider: "openrouter",
      run: () => runOpenAICompatibleChatLoop(openrouter, CONFIG.chat.fallbackModels.openrouter, userMessages, ctx),
    })
  }

  if (attempts.length === 0) {
    throw new NoChatProviderConfiguredError()
  }

  let lastErr: unknown
  let lastProvider: ChatProvider = attempts[0].provider
  for (const attempt of attempts) {
    try {
      const result = await attempt.run()
      if (attempt !== attempts[0]) {
        console.warn(`[chat-provider-chain] served by fallback provider "${attempt.provider}"`)
      }
      return { ...result, provider: attempt.provider }
    } catch (err) {
      lastErr = err
      lastProvider = attempt.provider
      console.warn(
        `[chat-provider-chain] provider "${attempt.provider}" failed, trying next`,
        err instanceof Error ? err.message : err
      )
      // Both exits carry the failing provider, so the caller can say which
      // attempt produced the status instead of guessing at a remediation.
      if (!isRetryableProviderError(err)) throw new ChatProvidersFailedError(attempt.provider, err)
    }
  }

  throw new ChatProvidersFailedError(lastProvider, lastErr)
}
