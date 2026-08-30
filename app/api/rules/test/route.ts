import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { evaluateRule, matchAddedLines } from "@/lib/engine"
import { withErrorHandler } from "@/lib/route"
import { testRuleBody } from "@/schemas/api"

export const POST = withErrorHandler("/api/rules/test", async (request) => {
  await requireUser()
  const { rule, sample } = testRuleBody.parse(await request.json())

  const match = evaluateRule(rule, {
    repo: sample.repo,
    branch: sample.branch,
    forced: sample.forced,
    senderFirstPush: sample.senderFirstPush,
    branchCreated: sample.branchCreated,
    branchDeleted: sample.branchDeleted,
    authorMismatch: sample.authorMismatch,
    unreviewed: sample.unreviewed,
    hourUtc: new Date().getUTCHours(),
    files: sample.files,
    commitMessages: sample.commitMessages,
  })

  if (!match) {
    return NextResponse.json({
      data: { matched: false, matchedFiles: [], matchedLines: [], matchedMessages: [] },
    })
  }

  const addedLines = sample.diff
    ? sample.diff
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
        .map((line) => line.slice(1))
    : []
  const matchedLines = rule.added_lines ? matchAddedLines(rule, addedLines) : []
  const contentSatisfied = !rule.added_lines || !sample.diff || matchedLines.length > 0

  return NextResponse.json({
    data: {
      matched: contentSatisfied,
      matchedFiles: match.matchedFiles,
      matchedLines: matchedLines.slice(0, 50),
      matchedMessages: match.matchedMessages,
    },
  })
})
