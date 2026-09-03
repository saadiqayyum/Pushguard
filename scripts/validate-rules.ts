import { readFileSync } from "node:fs"
import { parse } from "yaml"
import { checkedRulesFileSchema } from "../schemas/rule-safety"

async function main(): Promise<void> {
  const result = await checkedRulesFileSchema.safeParseAsync(
    parse(readFileSync("public/rules.example.yaml", "utf8")),
  )
  if (!result.success) {
    for (const issue of result.error.issues) {
      console.error(`${issue.path.join(".")}: ${issue.message}`)
    }
    process.exit(1)
  }
  console.log(`public/rules.example.yaml valid (${result.data.length} rules)`)
  process.exit(0)
}

void main()
