import { z } from "zod"
import { asSystem, deleteOrgData } from "@/lib/db"

// Privacy requests: the same deletion uninstall runs. Usage: npm run data:delete -- <org>
const org = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,39}$/)
  .parse(process.argv[2])

asSystem(() => deleteOrgData(org))
  .then((deleted) => {
    process.stdout.write(`${JSON.stringify({ org, deleted })}\n`)
    process.exit(0)
  })
  .catch((error: Error) => {
    process.stderr.write(`deletion failed: ${error.message}\n`)
    process.exit(1)
  })
