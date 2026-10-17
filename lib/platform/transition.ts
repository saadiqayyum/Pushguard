import { lastEnteredStatus, recordPlatformAudit } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { checkTransition, LIVE_STATUSES, STATUSES, type GateEvidence, type Status } from "./lifecycle"
import { configuredKeys, signingPayload, signPayload } from "./signing"

export type ArtifactRow = { id: string; version: number; status: string }

export type StatusChange = { status: Status; signature?: string; signedBy?: string; publishedAt?: Date }

// What the lifecycle needs from one kind of staff artifact: its versions, the
// evidence its gates read, and the bytes its signature covers.
export type ArtifactKind<Row extends ArtifactRow> = {
  name: "rule" | "check"
  versions(id: string): Promise<Row[]>
  evidence(row: Row): Promise<Omit<GateEvidence, "shadowSince">>
  signedBody(row: Row, to: Status): unknown
  setStatus(row: Row, change: StatusChange): Promise<void>
}

export const auditTarget = (kind: string, id: string, version: number) => `${kind}:${id}@${version}`

const asStatus = (value: string): Status =>
  (STATUSES as readonly string[]).includes(value) ? (value as Status) : "retired"

export async function transition<Row extends ArtifactRow>(
  kind: ArtifactKind<Row>,
  actor: string,
  input: { id: string; version: number; to: Status; override?: string },
): Promise<{ problems: string[] }> {
  const versions = await kind.versions(input.id)
  const row = versions.find((v) => v.version === input.version)
  if (!row) throw new AppError("not_found", "Not found")
  const from = asStatus(row.status)
  const target = auditTarget(kind.name, row.id, row.version)

  const backward = input.to === "draft" || input.to === "retired"
  const gates = backward ? { schemaProblems: [], regexProblems: [], fixtures: null } : await kind.evidence(row)
  const evidence = { ...gates, shadowSince: await lastEnteredStatus(target, "shadow") }
  const verdict = checkTransition({ from, to: input.to, now: new Date(), override: input.override }, evidence)
  if (!verdict.ok) return { problems: verdict.problems }

  const change: StatusChange = { status: input.to }
  if (LIVE_STATUSES.includes(input.to)) {
    const { privateKey } = configuredKeys()
    if (!privateKey) throw new AppError("validation_failed", "PLAYBOOK_SIGNING_KEY is not set, so nothing can go live")
    change.signature = signPayload(signingPayload(row.id, row.version, kind.signedBody(row, input.to)), privateKey)
    change.signedBy = actor
    change.publishedAt = new Date()
  }
  await kind.setStatus(row, change)

  if (input.to === "published") {
    for (const old of versions.filter((v) => v.version !== row.version && v.status === "published")) {
      await kind.setStatus(old, { status: "retired" })
      await recordPlatformAudit({
        actor,
        action: "status_changed",
        target: auditTarget(kind.name, old.id, old.version),
        details: { from: "published", to: "retired", supersededBy: row.version },
      })
    }
  }
  await recordPlatformAudit({
    actor,
    action: "status_changed",
    target,
    details: { from, to: input.to, ...(verdict.overridden ? { override: input.override?.trim() } : {}) },
  })
  return { problems: [] }
}

// Only a draft is edited in place. Anything further along gets a new draft
// version, and the live one keeps running until that draft is published.
export async function draftVersion<Row extends ArtifactRow>(kind: ArtifactKind<Row>, id: string): Promise<{ version: number; exists: boolean }> {
  const [latest] = await kind.versions(id)
  if (latest?.status === "draft") return { version: latest.version, exists: true }
  return { version: (latest?.version ?? 0) + 1, exists: false }
}
