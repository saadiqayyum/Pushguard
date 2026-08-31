import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"
import { AppError } from "@/lib/errors"

// Encryption for secrets belonging to somebody else.

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12

export type SealedSecret = {
  ciphertext: string
  iv: string
  tag: string
}

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw || raw.length < 32) {
    throw new AppError(
      "validation_failed",
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` before storing credentials.",
    )
  }
  return createHash("sha256").update(raw).digest()
}

export function seal(plaintext: string): SealedSecret {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  }
}

// Null rather than throwing on failure.
export function open(sealed: SealedSecret): string | null {
  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(sealed.iv, "base64"))
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"))
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return null
  }
}

// What the dashboard is allowed to see.
export function hint(plaintext: string): string {
  return plaintext.length <= 8 ? "••••" : `••••${plaintext.slice(-4)}`
}
