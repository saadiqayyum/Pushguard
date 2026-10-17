import { BASE64_DECODE_MIN_CHARS, LONG_BASE64_RUN_CHARS, MAX_BASE64_DECODE_CHARS, MAX_LOG_HITS } from "@/lib/ci-limits"

export type LogHit = { kind: "token" | "encoded-token" | "double-base64" | "long-base64"; line: number; sample: string }

const TOKENS: [string, RegExp][] = [
  ["github_pat_", /github_pat_[A-Za-z0-9_]{22,}/],
  ["ghp_", /ghp_[A-Za-z0-9]{36}/],
  ["ghs_", /ghs_[A-Za-z0-9]{36}/],
  ["AKIA", /AKIA[0-9A-Z]{16}/],
  ["xoxb-", /xoxb-[0-9A-Za-z-]{20,}/],
  ["npm_", /npm_[A-Za-z0-9]{36}/],
]
const TIMESTAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z /
const BASE64_RUN = new RegExp(`[A-Za-z0-9+/]{${BASE64_DECODE_MIN_CHARS},}={0,2}`, "g")
const BASE64_ONLY = /^[A-Za-z0-9+/=\s]{16,}$/
const ENV_LINE = /^[A-Za-z_][A-Za-z0-9_]*=\S/gm
const ENV_DUMP_MIN_LINES = 3

const tokenIn = (text: string) => TOKENS.find(([, pattern]) => pattern.test(text))

// The secret is never kept: a prefix and a length say what leaked without leaking it.
const redact = (prefix: string, length: number) => `${prefix}... (${length} chars)`

const looksLikeDump = (text: string) =>
  text.trimStart().startsWith('{"') || text.includes('"isSecret"') || (text.match(ENV_LINE)?.length ?? 0) >= ENV_DUMP_MIN_LINES

// Secret-dump shapes in a workflow log: a raw token GitHub did not mask, a
// token hidden in base64, base64 of base64 that unwraps to JSON or an env
// dump (the tj-actions payload), or one base64 run too long to be anything else.
export function scanLog(text: string): LogHit[] {
  const hits: LogHit[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length && hits.length < MAX_LOG_HITS; i++) {
    const line = lines[i].replace(TIMESTAMP, "")
    if (line.includes("::add-mask::")) continue
    const token = tokenIn(line)
    if (token) {
      hits.push({ kind: "token", line: i + 1, sample: redact(token[0], token[1].exec(line)![0].length) })
      continue
    }
    for (const run of line.match(BASE64_RUN) ?? []) {
      const hit = classifyBase64(run)
      if (hit) {
        hits.push({ ...hit, line: i + 1 })
        break
      }
    }
  }
  return hits
}

function classifyBase64(run: string): Omit<LogHit, "line"> | null {
  const once = Buffer.from(run.slice(0, MAX_BASE64_DECODE_CHARS), "base64").toString("latin1")
  const token = tokenIn(once)
  if (token) return { kind: "encoded-token", sample: `base64 run of ${run.length} chars hiding ${redact(token[0], token[1].exec(once)![0].length)}` }
  if (BASE64_ONLY.test(once)) {
    const twice = Buffer.from(once.replace(/\s/g, ""), "base64").toString("utf8")
    if (looksLikeDump(twice) || tokenIn(twice)) return { kind: "double-base64", sample: `base64 run of ${run.length} chars that decodes twice to a secret dump` }
  }
  if (run.length >= LONG_BASE64_RUN_CHARS) return { kind: "long-base64", sample: `base64 run of ${run.length} chars on one line` }
  return null
}
