import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

let _limiter: Ratelimit | null | undefined

// Returns an Upstash rate limiter if env vars are configured, otherwise null.
// Sliding window: 100 requests per 60 seconds per identifier (IP).
export function getRateLimiter(): Ratelimit | null {
  if (_limiter !== undefined) return _limiter

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    _limiter = null
    return null
  }

  _limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(100, "60 s"),
    analytics: false,
    prefix: "hm:rl",
  })

  return _limiter
}

// Applies rate limiting for a given identifier. Returns a 429 Response if
// the limit is exceeded, or null to allow the request through.
export async function applyRateLimit(
  identifier: string,
  limiter: Ratelimit
): Promise<Response | null> {
  const result = await limiter.limit(identifier)

  if (!result.success) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit":     String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset":     String(result.reset),
          "Retry-After":           String(Math.ceil((result.reset - Date.now()) / 1000)),
        },
      }
    )
  }

  return null
}
