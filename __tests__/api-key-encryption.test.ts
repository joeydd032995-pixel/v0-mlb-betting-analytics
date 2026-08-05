import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest"
import { encryptApiKey, decryptApiKey, getEncryptionKeyStatus } from "@/lib/crypto/api-key-encryption"

const originalEncryptionKey = process.env.ENCRYPTION_KEY

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(64)
})

afterAll(() => {
  if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = originalEncryptionKey
})

describe("api-key-encryption", () => {
  it("round-trips a plaintext key through encrypt/decrypt", () => {
    const plaintext = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"
    const encrypted = encryptApiKey(plaintext)
    expect(decryptApiKey(encrypted)).toBe(plaintext)
  })

  it("produces a different ciphertext each time (random IV)", () => {
    const plaintext = "sk-ant-api03-same-key-twice"
    expect(encryptApiKey(plaintext)).not.toBe(encryptApiKey(plaintext))
  })

  it("throws when decrypting a malformed value", () => {
    expect(() => decryptApiKey("not-a-valid-payload")).toThrow()
  })

  it("throws when decrypting a tampered ciphertext", () => {
    const encrypted = encryptApiKey("sk-ant-api03-tamper-test")
    const [iv, authTag, ciphertext] = encrypted.split(":")
    const tampered = [iv, authTag, ciphertext.slice(0, -2) + "AA"].join(":")
    expect(() => decryptApiKey(tampered)).toThrow()
  })
})

describe("ENCRYPTION_KEY normalization", () => {
  const validKey = "0".repeat(64)

  afterEach(() => {
    process.env.ENCRYPTION_KEY = validKey
  })

  // A key pasted into a hosting provider's env-var textarea can pick up a
  // trailing newline or stray spaces. The value is correct; only the framing
  // is wrong. Before the trim it failed the anchored regex and was rejected
  // with the same message as a completely absent key.
  it("accepts a key with a trailing newline and still round-trips", () => {
    process.env.ENCRYPTION_KEY = `${validKey}\n`
    const plaintext = "sk-or-v1-padded-env-var"
    expect(decryptApiKey(encryptApiKey(plaintext))).toBe(plaintext)
  })

  it("accepts a key padded with spaces on both sides", () => {
    process.env.ENCRYPTION_KEY = `  ${validKey}  `
    expect(getEncryptionKeyStatus()).toEqual({ ok: true })
  })

  it("derives the same key bytes whether or not the value is padded", () => {
    const plaintext = "sk-or-v1-same-bytes"
    process.env.ENCRYPTION_KEY = validKey
    const encrypted = encryptApiKey(plaintext)
    process.env.ENCRYPTION_KEY = `${validKey}\n`
    expect(decryptApiKey(encrypted)).toBe(plaintext)
  })
})

describe("getEncryptionKeyStatus", () => {
  const validKey = "0".repeat(64)

  afterEach(() => {
    process.env.ENCRYPTION_KEY = validKey
  })

  it("reports ok for a valid 64-char hex key", () => {
    process.env.ENCRYPTION_KEY = validKey
    expect(getEncryptionKeyStatus()).toEqual({ ok: true })
  })

  it("accepts uppercase hex", () => {
    process.env.ENCRYPTION_KEY = "ABCDEF0123456789".repeat(4)
    expect(getEncryptionKeyStatus()).toEqual({ ok: true })
  })

  it("reports missing when unset", () => {
    delete process.env.ENCRYPTION_KEY
    expect(getEncryptionKeyStatus()).toMatchObject({ ok: false, reason: "missing" })
  })

  it("reports missing for an empty or whitespace-only value", () => {
    process.env.ENCRYPTION_KEY = ""
    expect(getEncryptionKeyStatus()).toMatchObject({ ok: false, reason: "missing" })
    process.env.ENCRYPTION_KEY = "   \n "
    expect(getEncryptionKeyStatus()).toMatchObject({ ok: false, reason: "missing" })
  })

  it("reports wrong_length for a too-short or too-long value", () => {
    process.env.ENCRYPTION_KEY = "0".repeat(63)
    expect(getEncryptionKeyStatus()).toMatchObject({ ok: false, reason: "wrong_length" })
    process.env.ENCRYPTION_KEY = "0".repeat(65)
    expect(getEncryptionKeyStatus()).toMatchObject({ ok: false, reason: "wrong_length" })
  })

  it("reports non_hex for a 64-char value with non-hex characters", () => {
    process.env.ENCRYPTION_KEY = "g".repeat(64)
    expect(getEncryptionKeyStatus()).toMatchObject({ ok: false, reason: "non_hex" })
  })

  it("never includes the key value in the failure detail", () => {
    const secret = "deadbeef".repeat(9) // 72 chars — wrong length
    process.env.ENCRYPTION_KEY = secret
    const status = getEncryptionKeyStatus()
    expect(status.ok).toBe(false)
    if (!status.ok) expect(status.detail).not.toContain(secret)
  })
})
