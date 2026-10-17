import { z } from "zod";
import { REPO_FULL_NAME } from "@/schemas/settings";

const envSchema = z.object({
  DATABASE_URL: z.string().startsWith("postgres"),
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().includes("PRIVATE KEY"),
  GITHUB_WEBHOOK_SECRET: z.string().min(16),
  CRON_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32).optional(),
  AUTH_SECRET: z.string().min(16),
  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),
  AUTH_URL: z.string().url(),
  RUNNER_REPO: z.string().regex(REPO_FULL_NAME).optional(),
  PLATFORM_ADMINS: z
    .string()
    .max(2000)
    .default("")
    .transform((v) => v.split(",").map((login) => login.trim().toLowerCase()).filter(Boolean)),
  PLAYBOOK_SIGNING_KEY: z.string().min(40).max(200).optional(),
  PLAYBOOK_PUBLIC_KEY: z.string().min(40).max(200).optional(),
  PLATFORM_INTERNAL_ORGS: z
    .string()
    .max(2000)
    .default("")
    .transform((v) => v.split(",").map((org) => org.trim().toLowerCase()).filter(Boolean)),
  PLATFORM_AI_KEY: z.string().min(1).max(500).optional(),
  PLATFORM_AI_PROVIDER: z.enum(["anthropic", "openai", "google-genai"]).default("anthropic"),
  PLATFORM_AI_MODEL: z.string().min(1).max(100).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ");
      throw new Error(`Invalid environment: ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}
