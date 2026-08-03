import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { runChatWithFailover } from "@/lib/ai/chat-provider-chain"
import { getChatRateLimiter, checkDailyChatCap } from "@/lib/ai/chat-rate-limit"
import { decryptApiKey } from "@/lib/crypto/api-key-encryption"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 300

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

  let userKeyRow: { encryptedKey: string } | null
  try {
    userKeyRow = await prisma.userApiKey.findUnique({ where: { userId }, select: { encryptedKey: true } })
  } catch (err) {
    console.error("[/api/chat] failed to look up stored API key", err)
    return NextResponse.json({ error: "Chat request failed" }, { status: 500 })
  }

  let userApiKey: string | null = null
  if (userKeyRow) {
    try {
      userApiKey = decryptApiKey(userKeyRow.encryptedKey)
    } catch (err) {
      console.error("[/api/chat] failed to decrypt stored key, falling back to env", err)
    }
  }

  try {
    const { reply, toolCalls, provider } = await runChatWithFailover(body.messages, userApiKey)
    return NextResponse.json({ reply, toolCalls, provider })
  } catch (err) {
    console.error("[/api/chat] all providers failed", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Chat assistant is not configured" }, { status: 500 })
  }
}
