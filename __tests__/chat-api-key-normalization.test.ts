import { describe, it, expect } from "vitest"
import { SetChatApiKeySchema } from "@/lib/validation/chat-api-key"

describe("SetChatApiKeySchema apiKey normalization", () => {
  it("strips embedded whitespace/newlines before validating length", () => {
    const result = SetChatApiKeySchema.parse({
      provider: "openrouter",
      apiKey: "sk-or-v1-abc\ndef\tghi jkl ",
    })
    expect(result.apiKey).toBe("sk-or-v1-abcdefghijkl")
  })

  it("strips a key pasted with real line breaks across multiple lines", () => {
    const result = SetChatApiKeySchema.parse({
      provider: "openrouter",
      apiKey: "sk-or-v1-3c3f8fe127e6b50c\na689e0aaaaaaaaaaa319c27942b6\n79ebe5b9c0d443e1bba6a3e",
    })
    expect(result.apiKey).not.toMatch(/\s/)
    expect(result.apiKey).toBe(
      "sk-or-v1-3c3f8fe127e6b50ca689e0aaaaaaaaaaa319c27942b679ebe5b9c0d443e1bba6a3e",
    )
  })

  it("still enforces the minimum length after stripping whitespace", () => {
    expect(() =>
      SetChatApiKeySchema.parse({ provider: "groq", apiKey: "  a b c  " }),
    ).toThrow()
  })
})
