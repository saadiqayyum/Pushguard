import { sql } from "drizzle-orm"
import { jobMessage, type JobMessage } from "@/schemas/job"
import { logger } from "@/lib/logger"
import { q } from "./client"

export const JOB_QUEUE = "jobs"

const MAX_JOBS_PER_SEND = 500

export type QueuedJob = { msgId: number; readCount: number; message: JobMessage }

export async function enqueueJob(message: JobMessage, delaySeconds = 0): Promise<number> {
  const rows = await q((tx) =>
    tx.execute<{ send: number }>(
      sql`select pgmq.send(${JOB_QUEUE}, ${JSON.stringify(jobMessage.parse(message))}::jsonb, ${delaySeconds}::int)`,
    ),
  )
  return Number(rows[0].send)
}

// One statement, so the insert trigger wakes the runner once rather than per job.
export async function enqueueJobs(messages: JobMessage[]): Promise<void> {
  for (let i = 0; i < messages.length; i += MAX_JOBS_PER_SEND) {
    const batch = messages
      .slice(i, i + MAX_JOBS_PER_SEND)
      .map((message) => sql`${JSON.stringify(jobMessage.parse(message))}::jsonb`)
    await q((tx) => tx.execute(sql`select pgmq.send_batch(${JOB_QUEUE}, array[${sql.join(batch, sql`, `)}])`))
  }
}

// Hides each returned message for `visibilitySeconds`. A job that is neither
// deleted nor archived in that time is handed out again.
export async function readJobs(visibilitySeconds: number, limit: number): Promise<QueuedJob[]> {
  const rows = await q((tx) =>
    tx.execute<{ msg_id: number; read_ct: number; message: unknown }>(
      sql`select msg_id, read_ct, message from pgmq.read(${JOB_QUEUE}, ${visibilitySeconds}::int, ${limit}::int)`,
    ),
  )
  const jobs: QueuedJob[] = []
  for (const row of rows) {
    const parsed = jobMessage.safeParse(row.message)
    if (parsed.success) {
      jobs.push({ msgId: Number(row.msg_id), readCount: Number(row.read_ct), message: parsed.data })
      continue
    }
    logger.error("job_message_invalid", { msgId: row.msg_id, issues: parsed.error.issues.length })
    await archiveJob(Number(row.msg_id))
  }
  return jobs
}

export async function deleteJob(msgId: number): Promise<void> {
  await q((tx) => tx.execute(sql`select pgmq.delete(${JOB_QUEUE}, ${msgId}::bigint)`))
}

export async function archiveJob(msgId: number): Promise<void> {
  await q((tx) => tx.execute(sql`select pgmq.archive(${JOB_QUEUE}, ${msgId}::bigint)`))
}

// Puts a job back after `seconds`, for a rate limit that resets later.
export async function delayJob(msgId: number, seconds: number): Promise<void> {
  await q((tx) => tx.execute(sql`select pgmq.set_vt(${JOB_QUEUE}, ${msgId}::bigint, ${seconds}::int)`))
}
