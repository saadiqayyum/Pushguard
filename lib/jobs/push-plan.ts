// Which stages a push needs, decided from the payload and the rules before any
// GitHub call. Each consumer that reads content shares the one compare.
export type PushNeeds = {
  canCompare: boolean
  commitsCapped: boolean
  contentRules: boolean
  indicatorLines: boolean
  pins: boolean
  dependencies: boolean
  intel: boolean
  forensics: boolean
}

export type PushPlan = { compare: boolean; forensics: boolean; intel: boolean; pins: boolean; dependencies: boolean; indicatorLines: boolean }

export function planPush(needs: PushNeeds): PushPlan {
  const reads = needs.contentRules || needs.indicatorLines || needs.pins || needs.dependencies || needs.intel || needs.forensics
  return {
    compare: needs.canCompare && (needs.commitsCapped || reads),
    forensics: needs.forensics,
    intel: needs.intel,
    pins: needs.canCompare && needs.pins,
    dependencies: needs.canCompare && needs.dependencies,
    indicatorLines: needs.canCompare && needs.indicatorLines,
  }
}

export type ReviewDecision = "reviewed" | "defer" | "ask_github"

// A merge's pull_request webhook can land after its push. A push that looks
// like a merge waits for it once; anything else asks GitHub.
export function reviewDecision(input: { stored: boolean; deferred: boolean; looksMerged: boolean }): ReviewDecision {
  if (input.stored) return "reviewed"
  return input.looksMerged && !input.deferred ? "defer" : "ask_github"
}

const MERGE_MESSAGE = /^Merge pull request #\d+ |\(#\d+\)\s*$/

// GitHub's merge button writes one of these as the head commit's first line.
export function looksMerged(headMessage: string | undefined): boolean {
  return MERGE_MESSAGE.test((headMessage ?? "").split("\n")[0])
}
