import { describe, expect, it } from "vitest"
import { sanitizeForLog } from "@/lib/utils/log"

describe("sanitizeForLog", () => {
  it("strips CR and LF so injected lines collapse into one", () => {
    expect(sanitizeForLog("Acme\n[ERROR] forged entry\r\n")).toBe(
      "Acme[ERROR] forged entry"
    )
  })

  it("returns plain strings unchanged", () => {
    expect(sanitizeForLog("user_2abc123")).toBe("user_2abc123")
  })

  it("stringifies non-string runtime values instead of throwing", () => {
    expect(sanitizeForLog(undefined)).toBe("undefined")
    expect(sanitizeForLog(12345)).toBe("12345")
    expect(sanitizeForLog(null)).toBe("null")
  })
})
