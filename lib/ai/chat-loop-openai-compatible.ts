import type OpenAI from "openai"
import { OPENAI_TOOLS } from "@/lib/ai/chat-tool-adapters"
import { SYSTEM_PROMPT } from "@/lib/ai/chat-system-prompt"
import { runTool, type ToolContext } from "@/lib/ai/chat-tools"
import { CONFIG } from "@/lib/config"
import type { ChatLoopMessage, ChatLoopResult } from "@/lib/ai/chat-loop-anthropic"
import { tierContextLine } from "@/lib/ai/chat-system-prompt"

/**
 * Hard cap on a serialized tool result before it enters the conversation.
 *
 * Tool results are re-sent on every subsequent loop iteration, so one oversized
 * result is charged against the provider's tokens-per-minute budget repeatedly —
 * that is how a fat get_predictions payload produced a 413 on Groq's free tier.
 * Individual tools should return compact data; this is the backstop so a future
 * one cannot silently blow the request budget again.
 */
const MAX_TOOL_RESULT_CHARS = 6000

export function serializeToolResult(result: unknown): string {
  const json = JSON.stringify(result) ?? "null"
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json
  return `${json.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated: result too large to send in full]`
}

/**
 * Runs the tool-call loop for any OpenAI-compatible provider (Groq, OpenRouter).
 * Structural difference from the Anthropic loop: all tool calls from one turn
 * live in a single assistant message's `tool_calls` array, and each result is
 * pushed as its own `{role: "tool", tool_call_id, content}` message — rather
 * than Anthropic's grouped content-block turns.
 */
export async function runOpenAICompatibleChatLoop(
  client: OpenAI,
  model: string,
  userMessages: ChatLoopMessage[],
  ctx: ToolContext
): Promise<ChatLoopResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    // Tier context is a SEPARATE message, never interpolated into SYSTEM_PROMPT
    // — that constant is kept byte-stable so Anthropic prompt caching works.
    { role: "system", content: tierContextLine(ctx.tier) },
    ...userMessages,
  ]

  const toolCallLog: { name: string; input: unknown }[] = []

  for (let iteration = 0; iteration < CONFIG.chat.maxToolIterations; iteration++) {
    const completion = await client.chat.completions.create({
      model,
      max_tokens: CONFIG.chat.maxTokens,
      messages,
      tools: OPENAI_TOOLS,
    })

    const choice = completion.choices[0]
    const toolCalls = choice.message.tool_calls

    if (!toolCalls || toolCalls.length === 0) {
      return { reply: choice.message.content ?? "", toolCalls: toolCallLog }
    }

    messages.push(choice.message)

    for (const call of toolCalls) {
      if (call.type !== "function") continue

      let args: unknown = {}
      try {
        args = JSON.parse(call.function.arguments)
      } catch {
        // runTool's zod validation will reject a malformed/empty args object.
      }

      toolCallLog.push({ name: call.function.name, input: args })
      const result = await runTool(call.function.name, args, ctx)
      messages.push({ role: "tool", tool_call_id: call.id, content: serializeToolResult(result) })
    }
  }

  return {
    reply: "I wasn't able to finish looking that up within my tool-call budget — try narrowing the question.",
    toolCalls: toolCallLog,
  }
}
