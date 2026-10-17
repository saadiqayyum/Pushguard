import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto"
import { env } from "@/lib/env"

// Keys travel as base64 DER: PKCS#8 for the private key, SPKI for the public one.
const privateKey = (b64: string) => createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" })
const publicKey = (b64: string) => createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" })

// Sorted keys at every depth, so the same artifact always signs to the same bytes.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

export function signingPayload(id: string, version: number, body: unknown): string {
  return canonicalJson({ id, version, body })
}

export function signPayload(payload: string, privateKeyB64: string): string {
  return sign(null, Buffer.from(payload), privateKey(privateKeyB64)).toString("base64")
}

export function verifyPayload(payload: string, signatureB64: string, publicKeyB64: string): boolean {
  try {
    return verify(null, Buffer.from(payload), publicKey(publicKeyB64), Buffer.from(signatureB64, "base64"))
  } catch {
    return false
  }
}

export function derivePublicKey(privateKeyB64: string): string {
  return createPublicKey(privateKey(privateKeyB64)).export({ format: "der", type: "spki" }).toString("base64")
}

export function generateSigningKeys(): { privateKey: string; publicKey: string } {
  const pair = generateKeyPairSync("ed25519")
  return {
    privateKey: pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    publicKey: pair.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  }
}

// The private key exists only where publishing happens; verification needs only the public one.
export function configuredKeys(): { privateKey: string | null; publicKey: string | null } {
  const { PLAYBOOK_SIGNING_KEY: priv, PLAYBOOK_PUBLIC_KEY: pub } = env()
  return { privateKey: priv ?? null, publicKey: pub ?? (priv ? derivePublicKey(priv) : null) }
}
