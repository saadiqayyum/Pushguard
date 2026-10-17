import { createHash } from "node:crypto"
import { z } from "zod"
import { checkScriptVersions, insertCheckScript, recordPlatformAudit, updateCheckScript, updateCheckScriptDraft, type CheckScriptRow } from "@/lib/db"
import { CHECK_LANGUAGES, MAX_CHECK_BYTES } from "@/schemas/staff-rule"
import { auditTarget, draftVersion, type ArtifactKind } from "./transition"
import { checkSignedBody } from "./verify"

export const checkScriptInput = z
  .object({
    id: z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use kebab-case"),
    language: z.enum(CHECK_LANGUAGES),
    body: z.string().min(1).refine((b) => Buffer.byteLength(b) <= MAX_CHECK_BYTES, `At most ${MAX_CHECK_BYTES} bytes`),
  })
  .strict()

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

// The signature covers the hash, and the hash covers the body: a runner checks both.
export const checkScriptKind: ArtifactKind<CheckScriptRow> = {
  name: "check",
  versions: checkScriptVersions,
  async evidence(row) {
    const parsed = checkScriptInput.safeParse({ id: row.id, language: row.language, body: row.body })
    const problems = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
    if (sha256(row.body) !== row.sha256) problems.push("Stored sha256 does not match the body")
    return { schemaProblems: problems, regexProblems: [], fixtures: null }
  },
  signedBody: (row) => checkSignedBody(row),
  setStatus: (row, change) => updateCheckScript(row.id, row.version, change),
}

export async function saveCheckScriptDraft(actor: string, input: unknown): Promise<{ id: string; version: number; sha256: string }> {
  const { id, language, body } = checkScriptInput.parse(input)
  const hash = sha256(body)
  const { version, exists } = await draftVersion(checkScriptKind, id)
  if (exists) await updateCheckScriptDraft(id, version, { language, body, sha256: hash })
  else await insertCheckScript({ id, version, language, body, sha256: hash, status: "draft", createdBy: actor })
  await recordPlatformAudit({ actor, action: "draft_saved", target: auditTarget("check", id, version), details: { sha256: hash } })
  return { id, version, sha256: hash }
}
