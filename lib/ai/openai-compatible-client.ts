// lib/ai/openai-compatible-client.ts
// Groq/OpenRouter equivalent of anthropic-client.ts — both fallback providers
// speak the OpenAI wire format, so both are built on the official `openai`
// SDK with a custom baseURL rather than a bespoke HTTP client per provider.
// getGroqClient()/getOpenRouterClient() return null (not throw) when
// unconfigured, so the failover chain can just skip them.

import OpenAI from "openai"

/**
 * Groq's free-tier OpenAI-compatible endpoint. Prefers a user's own key
 * (from /account) over the shared GROQ_API_KEY env var. Returns null (not
 * throw) when neither is configured.
 */
export function getGroqClient(userApiKey?: string | null): OpenAI | null {
  const apiKey = userApiKey || process.env.GROQ_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" })
}

/**
 * OpenRouter's OpenAI-compatible endpoint (used for its :free-tagged
 * models). Prefers a user's own key over the shared OPENROUTER_API_KEY env
 * var. Returns null when neither is configured.
 */
export function getOpenRouterClient(userApiKey?: string | null): OpenAI | null {
  const apiKey = userApiKey || process.env.OPENROUTER_API_KEY
  if (!apiKey) return null
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000",
      "X-Title": "MLB NRFI/YRFI Assistant",
    },
  })
}
