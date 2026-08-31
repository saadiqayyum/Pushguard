import type { AiRule } from "@/schemas/ai-rule"
import { defineCollection } from "./client"
import { AI_USAGE_TTL_SECONDS } from "./limits"

export type AiRuleDoc = {
  _id: string
  owner: string
  ruleId: string
  body: AiRule
  enabled: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export const aiRules = defineCollection<AiRuleDoc>("ai_rules", [{ keys: { owner: 1, ruleId: 1 } }])

export type AiUsageDoc = {
  _id: string
  owner: string
  day: string
  reviews: number
  updatedAt: Date
}

export const aiUsage = defineCollection<AiUsageDoc>("ai_usage", [
  { keys: { updatedAt: 1 }, options: { expireAfterSeconds: AI_USAGE_TTL_SECONDS } },
])

// Count one review against the account's day and say whether it may run.
export async function claimAiReview(owner: string, cap: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)
  const doc = await aiUsage().findOneAndUpdate(
    { _id: `${owner}\0${day}` },
    { $inc: { reviews: 1 }, $set: { owner, day, updatedAt: new Date() } },
    { upsert: true, returnDocument: "after" },
  )
  return (doc?.reviews ?? 1) <= cap
}
