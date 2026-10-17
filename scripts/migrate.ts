import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

// drizzle-kit migrate exits 1 without printing the failing statement, so
// migrations run through the library's migrator, which reports it.
const url = process.env.DATABASE_ADMIN_URL
if (!url) {
  process.stderr.write("DATABASE_ADMIN_URL is required\n")
  process.exit(1)
}

const client = postgres(url, { max: 1, onnotice: () => {} })
migrate(drizzle(client), { migrationsFolder: "./drizzle" })
  .then(() => process.stdout.write("migrations applied\n"))
  .catch((error: Error & { cause?: { message?: string } }) => {
    process.stderr.write(`migration failed: ${error.cause?.message ?? error.message}\n${(error as { query?: string }).query?.slice(0, 300) ?? ""}\n`)
    process.exitCode = 1
  })
  .finally(() => client.end())
