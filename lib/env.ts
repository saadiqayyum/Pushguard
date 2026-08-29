import { z } from "zod"

const envSchema = z.object({
  MONGODB_URI: z.string().startsWith("mongodb"),
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().includes("PRIVATE KEY"),
  GITHUB_WEBHOOK_SECRET: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(16),
  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env)
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
      throw new Error(`Invalid environment: ${missing}`)
    }
    cached = parsed.data
  }
  return cached
}
