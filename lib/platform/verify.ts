import { createHash } from "node:crypto"
import type { CheckScriptRow, PlatformRuleRow } from "@/lib/db"
import { signingPayload, verifyPayload } from "./signing"

// What a staff rule's signature covers: the body and the status it was signed
// into, so a shadow row cannot be flipped live without a new signature.
export const staffRuleSignedBody = (body: unknown, status: string) => ({ body, status })

// What a check's signature covers. The detonator rebuilds the same bytes
// (detonator/check.go), so changing this shape breaks every deployed runner.
export const checkSignedBody = (row: Pick<CheckScriptRow, "language" | "sha256">) => ({ language: row.language, sha256: row.sha256 })

// The id and version are signed alongside the body, so a signed v1 cannot be replayed as v2.
export function verifyStaffRule(row: Pick<PlatformRuleRow, "id" | "version" | "body" | "status" | "signature">, publicKey: string): boolean {
  if (!row.signature) return false
  return verifyPayload(signingPayload(row.id, row.version, staffRuleSignedBody(row.body, row.status)), row.signature, publicKey)
}

export function verifyCheckScript(row: Pick<CheckScriptRow, "id" | "version" | "language" | "body" | "sha256" | "signature">, publicKey: string): boolean {
  if (!row.signature || createHash("sha256").update(row.body).digest("hex") !== row.sha256) return false
  return verifyPayload(signingPayload(row.id, row.version, checkSignedBody(row)), row.signature, publicKey)
}
