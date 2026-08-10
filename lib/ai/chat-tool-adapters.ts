// lib/ai/chat-tool-adapters.ts
// Format-conversion layer only — derives the OpenAI-format tool list
// (OPENAI_TOOLS) from lib/ai/chat-tools.ts's CHAT_TOOLS, the single
// hand-written source of truth for tool schemas. Add a new tool there, not here.

import type OpenAI from "openai"
import { CHAT_TOOLS } from "@/lib/ai/chat-tools"

/**
 * Derives OpenAI-format tool definitions from the single hand-written source
 * of truth (CHAT_TOOLS, in Anthropic's {name, description, input_schema}
 * shape). Never hand-write a second copy of a tool's schema here.
 */
export const OPENAI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = CHAT_TOOLS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema as Record<string, unknown>,
  },
}))
