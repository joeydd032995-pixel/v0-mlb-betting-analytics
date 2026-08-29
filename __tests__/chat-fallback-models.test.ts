import { describe, it, expect, vi } from "vitest"
import { CONFIG } from "@/lib/config"

// Free-tier slugs get retired by providers without warning — that is how chat
// broke in production (OpenRouter 404'd on the old
// meta-llama/llama-3.3-70b-instruct:free default). These assertions don't prove
// a slug is still live; they pin the shape of the escape hatch so the
// env-override path can't be refactored away, since that override is the fix
// that works without a code change.
describe("CONFIG.chat.fallbackModels", () => {
  it("defaults both providers to a non-empty model slug", () => {
    expect(CONFIG.chat.fallbackModels.groq).toBeTruthy()
    expect(CONFIG.chat.fallbackModels.openrouter).toBeTruthy()
  })

  // Each slug below took chat down in production with a 404 while every API key
  // was valid. Pinning them keeps a well-meaning "let's use the free one"
  // change from reintroducing a known-dead default.
  it("no longer points at any slug that has already been retired or gated", () => {
    const dead = [
      "meta-llama/llama-3.3-70b-instruct:free", // dropped from OpenRouter's free tier
      "openai/gpt-oss-20b:free", // ditto — OpenRouter now points at the paid slug
      "llama-3.3-70b-versatile", // Groq moved it to Enterprise "contact sales"
      "llama-3.1-8b-instant", // ditto
    ]
    expect(dead).not.toContain(CONFIG.chat.fallbackModels.openrouter)
    expect(dead).not.toContain(CONFIG.chat.fallbackModels.groq)
  })

  it("honours the OPENROUTER_MODEL / GROQ_MODEL env overrides", async () => {
    const originalOr = process.env.OPENROUTER_MODEL
    const originalGroq = process.env.GROQ_MODEL
    process.env.OPENROUTER_MODEL = "vendor/override-model"
    process.env.GROQ_MODEL = "vendor/groq-override"
    try {
      // CONFIG resolves the override at module load, so drop the cached copy
      // and re-import with the env set.
      vi.resetModules()
      const fresh = await import("@/lib/config")
      expect(fresh.CONFIG.chat.fallbackModels.openrouter).toBe("vendor/override-model")
      expect(fresh.CONFIG.chat.fallbackModels.groq).toBe("vendor/groq-override")
    } finally {
      vi.resetModules()
      if (originalOr === undefined) delete process.env.OPENROUTER_MODEL
      else process.env.OPENROUTER_MODEL = originalOr
      if (originalGroq === undefined) delete process.env.GROQ_MODEL
      else process.env.GROQ_MODEL = originalGroq
    }
  })
})
