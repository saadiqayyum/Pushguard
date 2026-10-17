import { addedLinesByFile } from "@/lib/diff-lines"
import { confirmContentMatches, evaluateRules } from "@/lib/engine"
import { respond, userRoute } from "@/lib/route"
import { testRuleBody } from "@/schemas/api"
import { testResultOut } from "@/schemas/output"

export const POST = userRoute("/api/rules/test", async (request) => {
  const { rule, sample } = testRuleBody.parse(await request.json())

  const matches = evaluateRules([rule], {
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

  if (matches.length === 0) {
    return respond(testResultOut, { matched: false, matchedFiles: [], matchedLines: [], matchedMessages: [] })
  }

  const paths = sample.files.map((file) => file.path)
  const addedLines = sample.diff ? addedLinesByFile(sample.diff, paths.length > 0 ? paths : [""]) : null
  const [confirmed] = confirmContentMatches(matches, addedLines)
  const match = confirmed ?? matches[0]

  return respond(testResultOut, {
    matched: Boolean(confirmed),
    matchedFiles: match.matchedFiles.filter(Boolean),
    matchedLines: (confirmed?.matchedLines ?? []).slice(0, 50),
    matchedMessages: match.matchedMessages,
  })
})
