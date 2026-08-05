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

  it("no longer points at the retired OpenRouter free Llama slug", () => {
    expect(CONFIG.chat.fallbackModels.openrouter).not.toBe("meta-llama/llama-3.3-70b-instruct:free")
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
