import { readFileSync } from "node:fs"
import { parse } from "yaml"
import { checkedRulesFileSchema } from "../schemas/rule-safety"

const result = checkedRulesFileSchema.safeParse(parse(readFileSync("rules.example.yaml", "utf8")))
if (!result.success) {
  for (const issue of result.error.issues) {
    console.error(`${issue.path.join(".")}: ${issue.message}`)
  }
  process.exit(1)
}
console.log(`rules.example.yaml valid (${result.data.length} rules)`)
