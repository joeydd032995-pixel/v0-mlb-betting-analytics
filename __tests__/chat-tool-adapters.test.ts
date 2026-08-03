import { describe, it, expect } from "vitest"
import { CHAT_TOOLS } from "@/lib/ai/chat-tools"
import { OPENAI_TOOLS } from "@/lib/ai/chat-tool-adapters"

describe("OPENAI_TOOLS", () => {
  it("derives the same tool count as CHAT_TOOLS", () => {
    expect(OPENAI_TOOLS).toHaveLength(CHAT_TOOLS.length)
  })

  it("preserves name, description, and parameters for every tool", () => {
    CHAT_TOOLS.forEach((tool, i) => {
      const derived = OPENAI_TOOLS[i]
      if (derived.type !== "function") throw new Error("expected a function tool")
      expect(derived.function.name).toBe(tool.name)
      expect(derived.function.description).toBe(tool.description)
      expect(derived.function.parameters).toEqual(tool.input_schema)
    })
  })
})
