import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { getAnthropicClient } from "@/lib/ai/anthropic-client"
import { SYSTEM_PROMPT } from "@/lib/ai/chat-system-prompt"
import { CHAT_TOOLS, runTool } from "@/lib/ai/chat-tools"
import { getChatRateLimiter, checkDailyChatCap } from "@/lib/ai/chat-rate-limit"
import { decryptApiKey } from "@/lib/crypto/api-key-encryption"
import { prisma } from "@/lib/prisma"
import { CONFIG } from "@/lib/config"
import type Anthropic from "@anthropic-ai/sdk"

export const dynamic = "force-dynamic"

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(50),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const limiter = getChatRateLimiter()
  if (limiter) {
    const { success } = await limiter.limit(userId)
    if (!success) {
      return NextResponse.json({ reason: "rate_limited" }, { status: 429 })
    }
  }

  const { allowed } = await checkDailyChatCap(userId)
  if (!allowed) {
    return NextResponse.json({ reason: "daily_cap" }, { status: 429 })
  }

  let body: z.infer<typeof requestSchema>
  try {
    body = requestSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const userKeyRow = await prisma.userApiKey.findUnique({ where: { userId } })
  let userApiKey: string | null = null
  if (userKeyRow) {
    try {
      userApiKey = decryptApiKey(userKeyRow.encryptedKey)
    } catch (err) {
      console.error("[/api/chat] failed to decrypt stored key, falling back to env", err)
    }
  }

  if (!userApiKey && !process.env.ANTHROPIC_API_KEY) {
    console.error("[/api/chat] ANTHROPIC_API_KEY is not configured")
    return NextResponse.json({ error: "Chat assistant is not configured" }, { status: 500 })
  }

  const client = getAnthropicClient(userApiKey)

  try {
    const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const toolCallLog: { name: string; input: unknown }[] = []

    for (let iteration = 0; iteration < CONFIG.chat.maxToolIterations; iteration++) {
      const response = await client.messages.create({
        model: CONFIG.chat.model,
        max_tokens: CONFIG.chat.maxTokens,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: CHAT_TOOLS,
        messages,
      })

      if (response.stop_reason !== "tool_use") {
        const reply = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
        return NextResponse.json({ reply, toolCalls: toolCallLog })
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      )

      messages.push({ role: "assistant", content: response.content })

      const results = await Promise.all(
        toolUseBlocks.map(async (block) => {
          toolCallLog.push({ name: block.name, input: block.input })
          const result = await runTool(block.name, block.input)
          const isError = typeof result === "object" && result !== null && "error" in result
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
            is_error: isError,
          }
        })
      )

      messages.push({ role: "user", content: results })
    }

    return NextResponse.json({
      reply: "I wasn't able to finish looking that up within my tool-call budget — try narrowing the question.",
      toolCalls: toolCallLog,
    })
  } catch (err) {
    console.error("[/api/chat]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Chat request failed" }, { status: 500 })
  }
}
