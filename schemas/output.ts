import { z } from "zod"
import { aiRuleSchema } from "@/schemas/ai-rule"
import { ruleSchema, SEVERITIES } from "@/schemas/rule"

// Response contracts. z.object strips unknown keys, so a column added to a
// table never reaches a client until a schema here names it.

const iso = z.string()
const severity = z.enum(SEVERITIES)

export const pageOut = z.object({
  number: z.number().int(),
  perPage: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
})

export const alertRowOut = z.object({
  number: z.number().int(),
  repo: z.string(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["open", "closed"]),
  severity,
  acknowledgedAt: iso.nullable(),
  acknowledgedBy: z.string().nullable(),
  assignees: z.array(z.string()),
  createdAt: iso,
})

export const alertListOut = z.object({ alerts: z.array(alertRowOut), page: pageOut })

export const bulkResultOut = z.object({
  done: z.number().int(),
  failed: z.array(z.object({ id: z.string(), reason: z.string() })),
})

export const ruleRowOut = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    ruleId: z.string(),
    kind: z.literal("pattern"),
    pack: z.string().nullable(),
    origin: z.enum(["catalog", "modified", "custom"]),
    body: ruleSchema.strip(),
    enabled: z.boolean(),
    updatedAt: iso.nullable(),
  }),
  z.object({
    id: z.string(),
    ruleId: z.string(),
    kind: z.literal("ai"),
    pack: z.null(),
    origin: z.literal("custom"),
    body: aiRuleSchema,
    enabled: z.boolean(),
    updatedAt: iso.nullable(),
  }),
])

export const rulesListOut = z.object({
  rules: z.array(ruleRowOut),
  scope: z.enum(["all", "mine"]),
  catalogActive: z.number().int(),
  packs: z.array(z.object({ id: z.string(), title: z.string(), blurb: z.string(), rules: z.number().int() })),
  page: pageOut,
})

export const importResultOut = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  total: z.number().int(),
})

export const testResultOut = z.object({
  matched: z.boolean(),
  matchedFiles: z.array(z.string()),
  matchedLines: z.array(z.string()),
  matchedMessages: z.array(z.string()),
})

export const aiRuleOut = aiRuleSchema

// The hint is the only trace of a key that ever leaves the server.
export const aiKeyOut = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.enum(["anthropic", "openai", "google-genai"]),
  keyHint: z.string(),
  model: z.string(),
  effort: z.enum(["low", "medium", "high"]),
  baseUrl: z.string().optional(),
  maxOutputTokens: z.number().nullish(),
  thinkingBudget: z.number().nullish(),
  timeoutMs: z.number().nullish(),
})

export const aiBudgetOut = z.object({
  dailyTokenBudget: z.number(),
  pushTokenBudget: z.number(),
  usage: z.object({ reviews: z.number(), inputTokens: z.number(), outputTokens: z.number() }),
})

export const mcpTokenOut = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  createdAt: iso,
  lastUsedAt: iso.nullable(),
})

// The only response that carries a token, once, at creation.
export const mcpTokenCreatedOut = mcpTokenOut.extend({ token: z.string() })

export const defaultKeyOut = z.object({ defaultKey: z.string() })

const scanFindingOut = z.object({
  ruleId: z.string(),
  severity,
  description: z.string().optional(),
  repo: z.string(),
  files: z.array(z.string()),
  lines: z.array(z.string()),
  prose: z.literal(true).optional(),
})

const filedOut = z.object({ repo: z.string(), number: z.number().int(), url: z.string() })

export const scanOut = z.object({
  id: z.string(),
  target: z.string(),
  branch: z.string().nullable(),
  scope: z.enum(["repo", "org"]),
  status: z.enum(["queued", "running", "done", "failed"]),
  repos: z.array(z.string()),
  scanned: z.array(
    z.object({
      repo: z.string(),
      branch: z.string(),
      commits: z.number().int(),
      headSha: z.string(),
      baseSha: z.string().nullable(),
      truncated: z.boolean(),
    }),
  ),
  findings: z.array(scanFindingOut),
  skippedRepos: z.number().int(),
  error: z.string().nullable(),
  needsInstall: z.boolean(),
  filed: z.array(filedOut),
  filingFailed: z.array(z.object({ repo: z.string(), reason: z.string() })),
  account: z.string(),
  createdAt: iso,
  finishedAt: iso.nullable(),
})

export const filingQueuedOut = z.object({ queued: z.literal(true) })

export const scanTargetsOut = z.array(
  z.object({
    installationId: z.number().int(),
    account: z.string(),
    accountType: z.enum(["User", "Organization"]),
    repos: z.array(z.string()),
  }),
)

export const branchesOut = z.object({ branches: z.array(z.string()), defaultBranch: z.string() })

export const nothingOut = z.null()

export const packStateOut = z.object({ pack: z.string(), enabled: z.boolean() })
