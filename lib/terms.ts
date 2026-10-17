import { createHmac, timingSafeEqual } from "node:crypto"
import { recordTermsAcceptance, termsVersionOf } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { TERMS_COOKIE_TTL_SECONDS } from "@/lib/limits"

// The `updated` date of content/legal/terms.md; a test fails when they differ.
// Acceptance covers the Privacy Policy too, so its own date is not part of the version.
export const TERMS_VERSION = "17 October 2026"
export const TERMS_COOKIE = "pushguard_terms"

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(`terms:${payload}`).digest("base64url")

export function signTermsCookie(version: string, secret: string, nowMs: number): string {
  const payload = `${Math.floor(nowMs / 1000) + TERMS_COOKIE_TTL_SECONDS}.${Buffer.from(version).toString("base64url")}`
  return `${payload}.${sign(payload, secret)}`
}

// The version the cookie vouches for, or null when it is forged, malformed or expired.
export function verifyTermsCookie(value: string, secret: string, nowMs: number): string | null {
  const [expires, version, signature, extra] = value.split(".")
  if (!expires || !version || !signature || extra !== undefined) return null
  const given = Buffer.from(signature)
  const expected = Buffer.from(sign(`${expires}.${version}`, secret))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  if (!(Number(expires) * 1000 > nowMs)) return null
  return Buffer.from(version, "base64url").toString()
}

// Inside withUser. One primary-key read.
export async function termsAccepted(login: string): Promise<boolean> {
  return (await termsVersionOf(login)) === TERMS_VERSION
}

export async function requireTerms(login: string): Promise<void> {
  if (!(await termsAccepted(login))) throw new AppError("terms_required", "Accept the Terms of Service to continue")
}

// Inside withUser: RLS limits the write to the caller's own row.
export async function acceptTerms(login: string, shown: string): Promise<void> {
  if (shown !== TERMS_VERSION) throw new AppError("validation_failed", "The terms changed. Reload the page.")
  await recordTermsAcceptance(login, TERMS_VERSION)
}
