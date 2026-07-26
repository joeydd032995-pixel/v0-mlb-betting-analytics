import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { encryptApiKey, decryptApiKey } from "@/lib/crypto/api-key-encryption"

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
