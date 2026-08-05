import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { runChatWithFailover, type UserProviderKeys } from "@/lib/ai/chat-provider-chain"
import { getChatRateLimiter, checkDailyChatCap } from "@/lib/ai/chat-rate-limit"
import { decryptApiKey } from "@/lib/crypto/api-key-encryption"
import { resolveUserTierWithRetry } from "@/lib/subscription"
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

  // The assistant can now read tier-gated predictions, so it needs the caller's
  // tier before any tool runs. Fail closed exactly like /api/predictions: if the
  // lookup itself fails for a signed-in user, refuse rather than silently
  // downgrading them to FREE (which would under-serve a paying subscriber).
  const { tier, resolved } = await resolveUserTierWithRetry(userId)
  if (!resolved) {
    return NextResponse.json(
      { error: "Couldn't verify your subscription just now — please try again in a moment." },
      { status: 503 }
    )
  }

  let userKeyRows: { provider: string; encryptedKey: string }[]
  try {
    userKeyRows = await prisma.userApiKey.findMany({ where: { userId }, select: { provider: true, encryptedKey: true } })
  } catch (err) {
    console.error("[/api/chat] failed to look up stored API keys", err)
    return NextResponse.json({ error: "Chat request failed" }, { status: 500 })
  }

  const userKeys: UserProviderKeys = {}
  let hadUndecryptableKey = false
  for (const row of userKeyRows) {
    try {
      const decrypted = decryptApiKey(row.encryptedKey)
      if (row.provider === "anthropic" || row.provider === "groq" || row.provider === "openrouter") {
        userKeys[row.provider] = decrypted
      }
    } catch (err) {
      hadUndecryptableKey = true
      console.error(`[/api/chat] failed to decrypt stored ${row.provider} key, skipping`, err)
    }
  }

  try {
    const { reply, toolCalls, provider } = await runChatWithFailover(body.messages, userKeys, {
      userId,
      tier,
    })
    return NextResponse.json({ reply, toolCalls, provider })
  } catch (err) {
    console.error("[/api/chat] all providers failed", err instanceof Error ? err.message : err)
    // If the user has saved keys that no longer decrypt, that's almost certainly
    // why nothing was configured — point at the fix instead of a dead end.
    const error =
      hadUndecryptableKey && Object.keys(userKeys).length === 0
        ? "Your saved API key can no longer be read — re-enter it on the Account page."
        : "Chat assistant is not configured"
    return NextResponse.json({ error }, { status: 500 })
  }
}
