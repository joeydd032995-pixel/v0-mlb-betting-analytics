import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || !HEX_KEY_PATTERN.test(hex)) {
    throw new Error("ENCRYPTION_KEY must be set to a 32-byte hex string (64 hex chars) — generate with `openssl rand -hex 32`")
  }
  return Buffer.from(hex, "hex")
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
