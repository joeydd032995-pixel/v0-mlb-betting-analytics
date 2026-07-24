import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { CONFIG } from "@/lib/config"

let _limiter: Ratelimit | null | undefined
let _redis: Redis | null | undefined

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  _redis = url && token ? new Redis({ url, token }) : null
  return _redis
}

// Per-user sliding-window limiter for /api/chat. Separate prefix/instance from
// lib/rate-limit.ts's IP-based limiter — this route spends real LLM tokens per
// call, so it needs a tighter, per-identity cap rather than a shared IP bucket.
export function getChatRateLimiter(): Ratelimit | null {
  if (_limiter !== undefined) return _limiter

  const redis = getRedis()
  if (!redis) {
    _limiter = null
    return null
  }

  _limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(CONFIG.chat.rateLimitPerMinute, "60 s"),
    analytics: false,
    prefix: "hm:chat:rl",
  })

  return _limiter
}

/**
 * Increments today's (ET) message counter for a user and reports whether
 * they're still under the daily cap. No-ops (always allows) when Upstash
 * isn't configured, matching the rest of the app's "degrade gracefully
 * without Redis" behavior.
 */
export async function checkDailyChatCap(userId: string): Promise<{ allowed: boolean; count: number }> {
  const redis = getRedis()
  if (!redis) return { allowed: true, count: 0 }

  const dateET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
  const key = `hm:chat:daily:${userId}:${dateET}`

  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, 26 * 60 * 60) // 26h TTL, safely spans the ET day
  }

  return { allowed: count <= CONFIG.chat.dailyMessageLimit, count }
}
