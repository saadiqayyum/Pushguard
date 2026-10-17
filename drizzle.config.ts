import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  schemaFilter: ["app"],
  entities: { roles: { provider: "supabase" } },
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL ?? "" },
})
