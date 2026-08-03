import OpenAI from "openai"

/** Groq's free-tier OpenAI-compatible endpoint. Returns null (not throw) when unconfigured. */
export function getGroqClient(): OpenAI | null {
  if (!process.env.GROQ_API_KEY) return null
  return new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })
}

/** OpenRouter's OpenAI-compatible endpoint (used for its :free-tagged models). Returns null when unconfigured. */
export function getOpenRouterClient(): OpenAI | null {
  if (!process.env.OPENROUTER_API_KEY) return null
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000",
      "X-Title": "MLB NRFI/YRFI Assistant",
    },
  })
}
