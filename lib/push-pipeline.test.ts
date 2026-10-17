import assert from "node:assert/strict"
import { test } from "node:test"
import { freshVerdict } from "@/lib/action-pins"
import { needsReviewJob, widenReview } from "@/lib/ai-review-range"
import { dependenciesFromPatches } from "@/lib/dependency-diff"
import { metered, withGitHubMeter } from "@/lib/github-meter"
import { looksMerged, planPush, reviewDecision, type PushNeeds } from "@/lib/jobs/push-plan"
import { toPushDiff } from "@/lib/push-diff"
import type { PendingReview } from "@/schemas/ai-review"

const none: PushNeeds = {
  canCompare: true,
  commitsCapped: false,
  contentRules: false,
  indicatorLines: false,
  pins: false,
  dependencies: false,
  intel: false,
  forensics: false,
}

test("a path-only push plans no compare", () => {
  assert.equal(planPush(none).compare, false)
})

test("any content reader, or a capped commit list, plans one compare", () => {
  for (const key of ["contentRules", "indicatorLines", "pins", "dependencies", "intel", "forensics", "commitsCapped"] as const) {
    assert.equal(planPush({ ...none, [key]: true }).compare, true, key)
  }
})

test("no base means no compare and no diff readers", () => {
  const plan = planPush({ ...none, canCompare: false, pins: true, dependencies: true, indicatorLines: true })
  assert.deepEqual([plan.compare, plan.pins, plan.dependencies, plan.indicatorLines], [false, false, false, false])
})

test("reviewed check: stored merge wins, a merge-looking push waits once, else GitHub", () => {
  assert.equal(reviewDecision({ stored: true, deferred: false, looksMerged: false }), "reviewed")
  assert.equal(reviewDecision({ stored: false, deferred: false, looksMerged: true }), "defer")
  assert.equal(reviewDecision({ stored: false, deferred: true, looksMerged: true }), "ask_github")
  assert.equal(reviewDecision({ stored: false, deferred: false, looksMerged: false }), "ask_github")
})

test("looksMerged recognises merge and squash messages", () => {
  assert.equal(looksMerged("Merge pull request #12 from a/b\n\nbody"), true)
  assert.equal(looksMerged("Fix the thing (#34)"), true)
  assert.equal(looksMerged("Fix the thing"), false)
  assert.equal(looksMerged(undefined), false)
})

test("dependencies from a package-lock patch: upgrade and new package", () => {
  const patch = [
    "@@ -10,7 +10,12 @@",
    '     "node_modules/left-pad": {',
    '-      "version": "1.0.0",',
    '+      "version": "1.3.0",',
    '       "resolved": "https://registry.npmjs.org/left-pad/-/left-pad.tgz",',
    "     },",
    '+    "node_modules/@evil/pkg": {',
    '+      "version": "0.0.1",',
    "+    },",
  ].join("\n")
  const { added, unread } = dependenciesFromPatches([{ path: "package-lock.json", patch }, { path: "package.json", patch: "@@ -1 +1 @@\n-a\n+b" }])
  assert.deepEqual(unread, [])
  assert.deepEqual(
    added.map((d) => [d.name, d.version, d.previous]),
    [["left-pad", "1.3.0", "1.0.0"], ["@evil/pkg", "0.0.1", undefined]],
  )
})

test("dependencies from yarn.lock and go.sum patches", () => {
  const yarn = '@@ -1,3 +1,3 @@\n lodash@^4.17.0:\n-  version "4.17.20"\n+  version "4.17.21"\n   resolved "x"'
  const go = "@@ -1 +1,2 @@\n golang.org/x/net v0.1.0 h1:a\n+golang.org/x/text v0.3.0 h1:b"
  const { added } = dependenciesFromPatches([{ path: "yarn.lock", patch: yarn }, { path: "go.sum", patch: go }])
  assert.deepEqual(added.map((d) => `${d.ecosystem}:${d.name}@${d.version}`), ["npm:lodash@4.17.21", "Go:golang.org/x/text@v0.3.0"])
})

test("dependencies the patch cannot settle are listed for the dependency graph", () => {
  const { unread } = dependenciesFromPatches([
    { path: "big/package-lock.json" },
    { path: "py/Pipfile.lock", patch: "@@ -1 +1 @@\n-a\n+b" },
    { path: "web/package.json", patch: "@@ -1 +1 @@\n-a\n+b" },
  ])
  assert.deepEqual(unread, ["big/package-lock.json", "py/Pipfile.lock", "web/package.json"])
})

const review = (before: string, after: string, paths: [string, "added" | "modified" | "removed"][], unreviewed: boolean | null): PendingReview => ({
  installationId: 1,
  event: { repo: "o/r", private: true, branch: "main", sender: "a", senderEmail: null, before, after, forced: false },
  files: paths.map(([path, changeType]) => ({ path, changeType })),
  truncated: false,
  context: { senderFirstPush: false, branchCreated: false, authorMismatch: false, unreviewed, hourUtc: 3, commitMessages: [after] },
  alert: null,
})

test("widening a pending review keeps the oldest before and the newest after", () => {
  const first = review("a", "b", [["x.js", "added"], ["y.js", "modified"]], false)
  const second = { ...review("b", "c", [["x.js", "modified"], ["z.js", "removed"]], null), alert: { target: "o/r", number: 7, redact: false } }
  const wide = widenReview(first, second)
  assert.deepEqual([wide.event.before, wide.event.after], ["a", "c"])
  assert.deepEqual(wide.files, [{ path: "y.js", changeType: "modified" }, { path: "x.js", changeType: "modified" }, { path: "z.js", changeType: "removed" }])
  assert.equal(wide.context.unreviewed, null)
  assert.deepEqual(wide.context.commitMessages, ["b", "c"])
  assert.equal(wide.alert?.number, 7)
  assert.equal(widenReview(wide, review("c", "d", [], false)).alert?.number, 7)
})

test("a pending review is queued when new or when its job went stale", () => {
  const now = new Date("2026-01-01T00:10:00Z")
  assert.equal(needsReviewJob(null, now, 600), true)
  assert.equal(needsReviewJob(new Date("2026-01-01T00:09:00Z"), now, 600), false)
  assert.equal(needsReviewJob(new Date("2026-01-01T00:00:00Z"), now, 599), true)
})

test("the GitHub meter counts every call and holds concurrency", async () => {
  let inFlight = 0
  let peak = 0
  const call = () =>
    metered("/repos/{owner}/{repo}", async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
    })
  const calls = await withGitHubMeter(2, async (meter) => {
    await Promise.all(Array.from({ length: 6 }, call))
    await metered("/app/installations/{installation_id}/access_tokens", async () => undefined)
    return meter.calls
  })
  assert.equal(calls, 7)
  assert.equal(peak, 2)
})

test("cached pin verdicts expire on their own TTL", () => {
  const ttl = { reachable: 168, unreachable: 1 }
  const now = new Date("2026-01-02T00:00:00Z")
  assert.equal(freshVerdict({ reachable: true, checkedAt: new Date("2026-01-01T00:00:00Z") }, now, ttl), "reachable")
  assert.equal(freshVerdict({ reachable: false, checkedAt: new Date("2026-01-01T23:30:00Z") }, now, ttl), "unreachable")
  assert.equal(freshVerdict({ reachable: false, checkedAt: new Date("2026-01-01T22:00:00Z") }, now, ttl), null)
  assert.equal(freshVerdict(null, now, ttl), null)
})

test("a push diff reports files GitHub sent no patch for as unread", () => {
  const diff = toPushDiff("a", "b", {
    truncated: false,
    files: [
      { path: "x.js", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-old\n+++new" },
      { path: "big.js", status: "modified", additions: 5000, deletions: 0 },
      { path: "logo.png", status: "added", additions: 0, deletions: 0 },
    ],
  })
  assert.deepEqual(diff.addedLines.get("x.js"), ["++new"])
  assert.deepEqual(diff.removedLines.get("x.js"), ["old"])
  assert.deepEqual(diff.unread, ["big.js"])
  assert.equal(diff.truncated, false)
})
