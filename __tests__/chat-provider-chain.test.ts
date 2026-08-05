import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const getAnthropicClient = vi.fn()
const getGroqClient = vi.fn()
const getOpenRouterClient = vi.fn()
const runAnthropicChatLoop = vi.fn()
const runOpenAICompatibleChatLoop = vi.fn()

vi.mock("@/lib/ai/anthropic-client", () => ({
  getAnthropicClient: (...args: unknown[]) => getAnthropicClient(...args),
}))
vi.mock("@/lib/ai/openai-compatible-client", () => ({
  getGroqClient: (...args: unknown[]) => getGroqClient(...args),
  getOpenRouterClient: (...args: unknown[]) => getOpenRouterClient(...args),
}))
vi.mock("@/lib/ai/chat-loop-anthropic", () => ({
  runAnthropicChatLoop: (...args: unknown[]) => runAnthropicChatLoop(...args),
}))
vi.mock("@/lib/ai/chat-loop-openai-compatible", () => ({
  runOpenAICompatibleChatLoop: (...args: unknown[]) => runOpenAICompatibleChatLoop(...args),
}))

import { runChatWithFailover } from "@/lib/ai/chat-provider-chain"

const messages = [{ role: "user" as const, content: "who's pitching tonight?" }]

function apiError(status: number) {
  const err = new Error(`upstream ${status}`) as Error & { status: number }
  err.status = status
  return err
}

describe("runChatWithFailover", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.OPENROUTER_API_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("succeeds on the first configured provider (Anthropic)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-real"
    getAnthropicClient.mockReturnValue({})
    runAnthropicChatLoop.mockResolvedValue({ reply: "hi", toolCalls: [] })

    const result = await runChatWithFailover(messages, {}, { userId: "user_test", tier: "FREE" })

    expect(result).toEqual({ reply: "hi", toolCalls: [], provider: "anthropic" })
    expect(runOpenAICompatibleChatLoop).not.toHaveBeenCalled()
  })

  it("falls back to Groq when Anthropic returns a 401", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-bad"
    process.env.GROQ_API_KEY = "groq-key"
    getAnthropicClient.mockReturnValue({})
    getGroqClient.mockReturnValue({})
    getOpenRouterClient.mockReturnValue(null)
    runAnthropicChatLoop.mockRejectedValue(apiError(401))
    runOpenAICompatibleChatLoop.mockResolvedValue({ reply: "groq reply", toolCalls: [] })

    const result = await runChatWithFailover(messages, {}, { userId: "user_test", tier: "FREE" })

    expect(result).toEqual({ reply: "groq reply", toolCalls: [], provider: "groq" })
  })

  it("falls back to OpenRouter when Anthropic and Groq both fail", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-bad"
    process.env.GROQ_API_KEY = "groq-bad"
    process.env.OPENROUTER_API_KEY = "or-key"
    getAnthropicClient.mockReturnValue({})
    getGroqClient.mockReturnValue({})
    getOpenRouterClient.mockReturnValue({})
    runAnthropicChatLoop.mockRejectedValue(apiError(500))
    runOpenAICompatibleChatLoop
      .mockRejectedValueOnce(apiError(429))
      .mockResolvedValueOnce({ reply: "openrouter reply", toolCalls: [] })

    const result = await runChatWithFailover(messages, {}, { userId: "user_test", tier: "FREE" })

    expect(result).toEqual({ reply: "openrouter reply", toolCalls: [], provider: "openrouter" })
  })

  // Providers return 404 when a model slug is retired or renamed — which is a
  // provider-side config failure, not a bug in our code, so the next provider
  // should still get a turn. A live example: OpenRouter dropped
  // meta-llama/llama-3.3-70b-instruct:free from its free tier.
  it("falls over to the next provider on a 404 retired-model error", async () => {
    process.env.GROQ_API_KEY = "groq-key"
    process.env.OPENROUTER_API_KEY = "or-key"
    getAnthropicClient.mockReturnValue(null)
    getGroqClient.mockReturnValue({})
    getOpenRouterClient.mockReturnValue({})
    runOpenAICompatibleChatLoop
      .mockRejectedValueOnce(apiError(404))
      .mockResolvedValueOnce({ reply: "openrouter reply", toolCalls: [] })

    const result = await runChatWithFailover(messages, {}, { userId: "user_test", tier: "FREE" })

    expect(result).toEqual({ reply: "openrouter reply", toolCalls: [], provider: "openrouter" })
  })

  it("throws the last error when every configured provider fails", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-bad"
    getAnthropicClient.mockReturnValue({})
    getGroqClient.mockReturnValue(null)
    getOpenRouterClient.mockReturnValue(null)
    runAnthropicChatLoop.mockRejectedValue(apiError(503))

    await expect(runChatWithFailover(messages, {}, { userId: "user_test", tier: "FREE" })).rejects.toThrow("upstream 503")
  })

  it("throws immediately when no provider is configured", async () => {
    getGroqClient.mockReturnValue(null)
    getOpenRouterClient.mockReturnValue(null)

    await expect(runChatWithFailover(messages, {}, { userId: "user_test", tier: "FREE" })).rejects.toThrow(/No chat provider is configured/)
    expect(runAnthropicChatLoop).not.toHaveBeenCalled()
  })

  it("passes each provider's user key through independently, preferring it over the env var", async () => {
    process.env.GROQ_API_KEY = "env-groq-key"
    getAnthropicClient.mockReturnValue({})
    getGroqClient.mockReturnValue({})
    getOpenRouterClient.mockReturnValue(null)
    runAnthropicChatLoop.mockResolvedValue({ reply: "hi", toolCalls: [] })

    await runChatWithFailover(messages, { anthropic: "user-anthropic-key", groq: "user-groq-key" }, { userId: "user_test", tier: "FREE" })

    expect(getAnthropicClient).toHaveBeenCalledWith("user-anthropic-key")
    expect(getGroqClient).toHaveBeenCalledWith("user-groq-key")
    expect(getOpenRouterClient).toHaveBeenCalledWith(undefined)
  })
})
