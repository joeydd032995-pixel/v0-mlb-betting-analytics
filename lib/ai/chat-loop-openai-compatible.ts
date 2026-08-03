import type OpenAI from "openai"
import { OPENAI_TOOLS } from "@/lib/ai/chat-tool-adapters"
import { SYSTEM_PROMPT } from "@/lib/ai/chat-system-prompt"
import { runTool } from "@/lib/ai/chat-tools"
import { CONFIG } from "@/lib/config"
import type { ChatLoopMessage, ChatLoopResult } from "@/lib/ai/chat-loop-anthropic"

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
  userMessages: ChatLoopMessage[]
): Promise<ChatLoopResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
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
      const result = await runTool(call.function.name, args)
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }

  return {
    reply: "I wasn't able to finish looking that up within my tool-call budget — try narrowing the question.",
    toolCalls: toolCallLog,
  }
}
