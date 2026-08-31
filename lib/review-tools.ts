import { tool } from "@langchain/core/tools"
import { z } from "zod"
import { compact } from "@/lib/compact"
import { allowPath, type ToolScope } from "@/lib/review-scope"
import { logger } from "@/lib/logger"

const MAX_FILE_CHARS = 40_000
const MAX_REFERENCE_RESULTS = 40

export type ToolTrace = {
  calls: number
  reads: string[]
  // Paths the model asked for and was refused. A rule reaching outside its own
  // scope is itself worth reporting.
  refused: { path: string; reason: string }[]
  // Files handed back shortened. A review that read half a file has a blind
  // spot in it, and saying so is the difference from having read it all.
  truncated: string[]
}

// The tools one repository-scope run may call, bound to one repo at one commit.
// The model never holds a credential: it names a path and we do the reading.
// The readers are injected rather than imported: it keeps Octokit out of this
// module, so the half that decides what a model may reach stays testable.
export type ToolReaders = {
  readBlob: (path: string) => Promise<string | null>
  findRefs: (symbol: string, limit: number) => Promise<string[]>
}

export function reviewTools(scope: ToolScope, readers: ToolReaders) {
  const trace: ToolTrace = { calls: 0, reads: [], refused: [], truncated: [] }
  const cache = new Map<string, string | null>()

  const spend = (): string | null => {
    trace.calls++
    if (trace.calls > scope.budget) {
      return `Budget of ${scope.budget} tool calls is spent. Report what you already have.`
    }
    return null
  }

  const readFile = tool(
    async ({ path }: { path: string }) => {
      const over = spend()
      if (over) return over

      const verdict = allowPath(scope, path)
      if (!verdict.ok) {
        trace.refused.push({ path, reason: verdict.reason })
        logger.warn("review_tool_path_refused", { repo: scope.repo, path, reason: verdict.reason })
        return `Refused: ${verdict.reason}.`
      }

      const cached = cache.get(verdict.path)
      if (cached !== undefined) return cached ?? "File could not be read."

      const source = await readers.readBlob(verdict.path)
      cache.set(verdict.path, source)
      if (source === null) return "File could not be read: binary, missing, or too large."

      trace.reads.push(verdict.path)
      const { text, truncated } = compact(source)
      // Both ways of losing content are recorded: a line the compactor cut and
      // a file the size cap cut are the same blind spot to whoever reads the
      // verdict, and only one of them used to be reported.
      if (truncated > 0) trace.truncated.push(verdict.path)
      if (text.length <= MAX_FILE_CHARS) {
        return truncated > 0
          ? `${text}\n\n[${truncated} very long line(s) were cut. This file is partly unread.]`
          : text
      }
      if (truncated === 0) trace.truncated.push(verdict.path)
      return `${text.slice(0, MAX_FILE_CHARS)}\n\n[Cut at ${MAX_FILE_CHARS} characters; ${text.length - MAX_FILE_CHARS} more were not shown. This file is partly unread.]`
    },
    {
      name: "read_file",
      description:
        "Read one file from this repository at the commit under review. Give a repository-relative path such as src/index.ts.",
      schema: z.object({ path: z.string().describe("Repository-relative path.") }),
    },
  )

  const findRefs = tool(
    async ({ symbol }: { symbol: string }) => {
      const over = spend()
      if (over) return over

      const hits = await readers.findRefs(symbol, MAX_REFERENCE_RESULTS)
      const allowed = hits.filter((path) => allowPath(scope, path).ok)
      if (allowed.length === 0) return `No indexed file mentions ${symbol}.`
      return [
        `Files mentioning ${symbol} (a mention, not necessarily a call):`,
        ...allowed.map((path) => `- ${path}`),
      ].join("\n")
    },
    {
      name: "find_references",
      description:
        "List files in this repository that mention a name. Use it to follow a symbol before reading files. Returns mentions, not resolved call sites.",
      schema: z.object({ symbol: z.string().describe("An identifier, at least 3 characters.") }),
    },
  )

  return { tools: [readFile, findRefs], trace }
}
