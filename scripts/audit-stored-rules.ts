/**
 * Find stored rules whose regex can be made to hang the scanner.
 *
 * The safety check runs when a rule is written, which does nothing for rules
 * written before it existed. Those are still read and evaluated on every push,
 * so they need one pass. Reporting only: which rule, whose, and why. Disabling
 * somebody's detection rule is not a script's decision to make.
 *
 *   MONGODB_URI=... npx tsx scripts/audit-stored-rules.ts
 */
import { rulesCollection } from "../lib/db"
import { ruleSchema } from "../schemas/rule"
import { checkRegexSafety } from "../schemas/rule-safety"

const REGEX_FIELDS = ["added_lines", "commit_message"] as const

async function main(): Promise<void> {
  const docs = await (await rulesCollection()).find({}).toArray()
  let unsafe = 0
  let unparseable = 0

  for (const doc of docs) {
    const parsed = ruleSchema.safeParse(doc.body)
    if (!parsed.success) {
      // Already inert: getActiveRules skips these with a warning.
      unparseable += 1
      console.warn(`SKIP  ${doc.owner}/${doc.ruleId}: does not parse, already ignored at evaluation`)
      continue
    }

    for (const field of REGEX_FIELDS) {
      const source = parsed.data[field]
      if (!source) continue
      const verdict = checkRegexSafety(source)
      if (!verdict.ok) {
        unsafe += 1
        console.error(
          `UNSAFE ${doc.owner}/${doc.ruleId} [${field}] ${doc.enabled ? "enabled" : "disabled"}\n` +
            `       /${source}/\n` +
            `       ${verdict.reason}`,
        )
      }
    }
  }

  console.log(
    `\nChecked ${docs.length} stored rule${docs.length === 1 ? "" : "s"}: ` +
      `${unsafe} unsafe, ${unparseable} unparseable.`,
  )
  // Non-zero so this is usable as a CI gate.
  process.exit(unsafe > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
