// lib/ai/chat-loop-anthropic.ts
// The Anthropic leg of the chat provider chain: a bounded tool-call loop using
// Anthropic's content-block message format. See chat-loop-openai-compatible.ts
// for the Groq/OpenRouter equivalent (different wire format, same ToolContext
// and CHAT_TOOLS dispatch underneath).

import type Anthropic from "@anthropic-ai/sdk"
import { SYSTEM_PROMPT, tierContextLine } from "@/lib/ai/chat-system-prompt"
import { CHAT_TOOLS, runTool, type ToolContext } from "@/lib/ai/chat-tools"
import { CONFIG } from "@/lib/config"
import { serializeToolResult } from "@/lib/ai/chat-loop-openai-compatible"

export interface ChatLoopMessage {
  role: "user" | "assistant"
  content: string
}

export interface ChatLoopResult {
  reply: string
  toolCalls: { name: string; input: unknown }[]
}

/** Runs the Anthropic tool-call loop (content-block based) for one provider attempt. */
export async function runAnthropicChatLoop(
  client: Anthropic,
  userMessages: ChatLoopMessage[],
  ctx: ToolContext
): Promise<ChatLoopResult> {
  const messages: Anthropic.MessageParam[] = userMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const toolCallLog: { name: string; input: unknown }[] = []

  for (let iteration = 0; iteration < CONFIG.chat.maxToolIterations; iteration++) {
    const response = await client.messages.create({
      model: CONFIG.chat.model,
      max_tokens: CONFIG.chat.maxTokens,
      // SYSTEM_PROMPT stays byte-stable so the ephemeral cache entry keeps
      // hitting; per-user tier goes in a second, uncached block after it.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: tierContextLine(ctx.tier) },
      ],
      tools: CHAT_TOOLS,
      messages,
    })

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
      return { reply, toolCalls: toolCallLog }
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    )

    messages.push({ role: "assistant", content: response.content })

    const results = await Promise.all(
      toolUseBlocks.map(async (block) => {
        toolCallLog.push({ name: block.name, input: block.input })
        const result = await runTool(block.name, block.input, ctx)
        const isError = typeof result === "object" && result !== null && "error" in result
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: serializeToolResult(result),
          is_error: isError,
        }
      })
    )

    messages.push({ role: "user", content: results })
  }

  return {
    reply: "I wasn't able to finish looking that up within my tool-call budget — try narrowing the question.",
    toolCalls: toolCallLog,
  }
}
