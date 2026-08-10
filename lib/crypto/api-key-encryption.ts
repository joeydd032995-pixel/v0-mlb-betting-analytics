// lib/crypto/api-key-encryption.ts
// AES-256-GCM encrypt/decrypt for per-user chat provider API keys
// (UserApiKey.encryptedKey), keyed by the ENCRYPTION_KEY env var (64 hex
// chars / 32 bytes). getEncryptionKeyStatus() is the single source of truth
// for whether that key is usable, distinguishing "missing" from "set but
// malformed" since the two need opposite fixes (see app/api/db-status).

import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i
const HEX_KEY_LENGTH = 64

export type EncryptionKeyStatus =
  | { ok: true }
  | { ok: false; reason: "missing" | "wrong_length" | "non_hex"; detail: string }

/**
 * Reports whether ENCRYPTION_KEY is usable, and if not, precisely why.
 *
 * This is the single source of truth for the key's validity rule — `getKey()`
 * and the /api/db-status diagnostic both go through it so they can't drift.
 *
 * Two things matter here, both learned the hard way in production:
 *  - The value is TRIMMED before validation. The pattern is anchored, so a
 *    correct key pasted into a hosting provider's env-var textarea with a
 *    trailing newline is present and correct but would otherwise be rejected.
 *  - The failure modes are DISTINGUISHED. Collapsing "not set" and
 *    "set but malformed" into one message makes the difference between a
 *    30-second fix and hours of guessing, because they need opposite actions.
 *
 * `detail` is safe to log and to return to an authenticated caller: it
 * describes the shape of the problem and never contains the key itself.
 */
export function getEncryptionKeyStatus(): EncryptionKeyStatus {
  const hex = process.env.ENCRYPTION_KEY?.trim()
  if (!hex) {
    return { ok: false, reason: "missing", detail: "ENCRYPTION_KEY is not set" }
  }
  if (hex.length !== HEX_KEY_LENGTH) {
    return {
      ok: false,
      reason: "wrong_length",
      detail: `expected ${HEX_KEY_LENGTH} hex chars, got ${hex.length}`,
    }
  }
  if (!HEX_KEY_PATTERN.test(hex)) {
    return { ok: false, reason: "non_hex", detail: "contains non-hexadecimal characters" }
  }
  return { ok: true }
}

function getKey(): Buffer {
  const status = getEncryptionKeyStatus()
  if (!status.ok) {
    throw new Error(
      `ENCRYPTION_KEY is unusable (${status.detail}) — it must be a 32-byte hex string (${HEX_KEY_LENGTH} hex chars), generate with \`openssl rand -hex 32\``
    )
  }
  return Buffer.from((process.env.ENCRYPTION_KEY as string).trim(), "hex")
}

/** Encrypts a plaintext API key for storage. Returns `${iv}:${authTag}:${ciphertext}`, all base64. */
export function encryptApiKey(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":")
}

/**
 * True if `encrypted` can be decrypted with the ENCRYPTION_KEY currently in the
 * environment. Never throws, and never returns the plaintext.
 *
 * Rotating ENCRYPTION_KEY permanently orphans every previously stored key —
 * AES-GCM is authenticated, so the old ciphertext can't be read by the new key.
 * Callers use this to tell a working stored key from a dead one, which is
 * otherwise invisible: the row still exists and still has its lastFour.
 */
export function canDecryptApiKey(encrypted: string): boolean {
  try {
    decryptApiKey(encrypted)
    return true
  } catch {
    return false
  }
}

/** Decrypts a value produced by encryptApiKey. Throws on tamper/format mismatch. */
export function decryptApiKey(encrypted: string): string {
  const key = getKey()
  const parts = encrypted.split(":")
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted API key")
  }
  const [ivB64, authTagB64, ciphertextB64] = parts

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ])
  return plaintext.toString("utf8")
}
