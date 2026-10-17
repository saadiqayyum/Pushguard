import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { AppError } from "@/lib/errors"
import { DOC_PATH } from "./input"
import { CONTRIBUTOR_TEXT_MAX } from "./limits"

const ROOT = "docs/attacks"

// Bundled with the console routes by outputFileTracingIncludes in next.config.ts.
export async function listAttackDocs(): Promise<string[]> {
  const entries = await readdir(path.join(/* turbopackIgnore: true */ process.cwd(), ROOT), { recursive: true }).catch(() => [] as string[])
  return entries
    .map((entry) => `${ROOT}/${entry.split(path.sep).join("/")}`)
    .filter((p) => DOC_PATH.test(p) && !p.endsWith("/README.md"))
    .sort()
}

// Only a path from the listing is read, so a request cannot walk out of the folder.
export async function readAttackDoc(docPath: string): Promise<string> {
  if (!(await listAttackDocs()).includes(docPath)) throw new AppError("not_found", "Not found")
  const text = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), docPath), "utf8")
  if (text.length > CONTRIBUTOR_TEXT_MAX) throw new AppError("validation_failed", `${docPath} is longer than ${CONTRIBUTOR_TEXT_MAX} characters`)
  return text
}
