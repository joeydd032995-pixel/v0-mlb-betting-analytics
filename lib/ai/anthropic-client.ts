import Anthropic from "@anthropic-ai/sdk"

const globalForAnthropic = global as unknown as { anthropic?: Anthropic }

export const anthropic =
  globalForAnthropic.anthropic ||
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

if (process.env.NODE_ENV !== "production") globalForAnthropic.anthropic = anthropic
