import Anthropic from "@anthropic-ai/sdk"

const globalForAnthropic = global as unknown as { anthropic?: Anthropic }

export const anthropic =
  globalForAnthropic.anthropic ||
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

if (process.env.NODE_ENV !== "production") globalForAnthropic.anthropic = anthropic

/**
 * Per-request client for a user's own key, falling back to the shared env-var
 * singleton when no user key is given. Not cached globally — keys can change,
 * and constructing a client does no network I/O, so per-request is cheap.
 */
export function getAnthropicClient(userApiKey?: string | null): Anthropic {
  if (userApiKey) return new Anthropic({ apiKey: userApiKey })
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("No Anthropic API key available (no user key, and ANTHROPIC_API_KEY is unset)")
  }
  return anthropic
}
