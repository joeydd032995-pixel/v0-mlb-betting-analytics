import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getGroqClient, getOpenRouterClient } from "@/lib/ai/openai-compatible-client"

describe("getGroqClient / getOpenRouterClient", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.GROQ_API_KEY
    delete process.env.OPENROUTER_API_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns null when neither a user key nor the env var is set", () => {
    expect(getGroqClient()).toBeNull()
    expect(getOpenRouterClient()).toBeNull()
  })

  it("falls back to the env var when no user key is given", () => {
    process.env.GROQ_API_KEY = "env-groq-key"
    process.env.OPENROUTER_API_KEY = "env-or-key"
    expect(getGroqClient()).not.toBeNull()
    expect(getOpenRouterClient()).not.toBeNull()
  })

  it("prefers a user's own key over the env var", () => {
    process.env.GROQ_API_KEY = "env-groq-key"
    const client = getGroqClient("user-groq-key")
    expect(client).not.toBeNull()
    expect(client?.apiKey).toBe("user-groq-key")
  })

  it("uses a user key even when no env var is configured", () => {
    const client = getOpenRouterClient("user-or-key")
    expect(client).not.toBeNull()
    expect(client?.apiKey).toBe("user-or-key")
  })
})
