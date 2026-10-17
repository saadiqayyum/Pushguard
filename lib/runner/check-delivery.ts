import { checkScriptVersion, type RunnerJobDoc } from "@/lib/db"
import { logger } from "@/lib/logger"
import { configuredKeys } from "@/lib/platform/signing"
import { verifyCheckScript } from "@/lib/platform/verify"

export type CheckDelivery = { headers: Record<string, string>; prefix: Uint8Array | null }

// The script travels ahead of the tarball in the same body, its length and
// signature in a header. The detonator verifies it again before running it.
export async function checkDelivery(job: Pick<RunnerJobDoc, "id" | "phases" | "checkScriptId" | "checkScriptVersion">): Promise<CheckDelivery> {
  const headers: Record<string, string> = {}
  if (job.phases) headers["x-pushguard-phases"] = job.phases.join(",")
  if (!job.checkScriptId || !job.checkScriptVersion) return { headers, prefix: null }
  const row = await checkScriptVersion(job.checkScriptId, job.checkScriptVersion)
  const publicKey = configuredKeys().publicKey
  if (!row || !publicKey || !verifyCheckScript(row, publicKey)) {
    logger.error("check_script_unverified", { jobId: job.id, id: job.checkScriptId, version: job.checkScriptVersion })
    return { headers, prefix: null }
  }
  const prefix = new TextEncoder().encode(row.body)
  const meta = { id: row.id, version: row.version, language: row.language, sha256: row.sha256, signature: row.signature, bytes: prefix.byteLength }
  headers["x-pushguard-check"] = Buffer.from(JSON.stringify(meta)).toString("base64url")
  return { headers, prefix }
}

export function prepend(prefix: Uint8Array | null, stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  if (!prefix) return stream
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  writer
    .write(prefix)
    .then(() => {
      writer.releaseLock()
      return stream.pipeTo(writable)
    })
    .catch((error: unknown) => logger.warn("runner_stream_failed", { error: String(error) }))
  return readable
}
