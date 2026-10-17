import { sql } from "drizzle-orm"
import { q } from "./client"

// A nudge on a Supabase Realtime broadcast topic. System context only.
export async function broadcast(topic: string, event: string): Promise<void> {
  await q((tx) => tx.execute(sql`select realtime.send(${JSON.stringify({ event })}::jsonb, ${event}, ${topic}, false)`))
}
