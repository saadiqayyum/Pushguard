import assert from "node:assert/strict"
import { test } from "node:test"
import { deflateRawSync } from "node:zlib"
import { isWorkflowFile, parseUses, pinChanges, reachabilityOf } from "@/lib/action-pins"
import { patchLines } from "@/lib/diff-lines"
import { findChain, type ChainEvent } from "@/lib/chain"
import { scanLog } from "@/lib/log-secrets"
import { diffTags } from "@/lib/tag-diff"
import { readZip } from "@/lib/zip"

const SHA_A = "a".repeat(40)
const SHA_B = "b".repeat(40)

test("uses lines parse remote actions and skip local and docker ones", () => {
  assert.deepEqual(parseUses(`      - uses: tj-actions/changed-files@${SHA_A} # v45`), {
    repo: "tj-actions/changed-files",
    path: "",
    ref: SHA_A,
    pinned: true,
  })
  assert.deepEqual(parseUses(`  uses: "github/codeql-action/init@v3"`), { repo: "github/codeql-action", path: "/init", ref: "v3", pinned: false })
  assert.equal(parseUses("  - uses: ./.github/actions/local"), null)
  assert.equal(parseUses("  - uses: docker://alpine:3"), null)
  assert.equal(parseUses("  run: echo uses: a/b@c"), null)
})

test("workflow and action files are recognised", () => {
  assert.ok(isWorkflowFile(".github/workflows/ci.yml"))
  assert.ok(isWorkflowFile("action.yaml"))
  assert.ok(isWorkflowFile("tools/setup/action.yml"))
  assert.ok(!isWorkflowFile("src/workflow.yml"))
})

test("a changed or new pinned SHA is checked; an unchanged one is not", () => {
  const removed = [`- uses: a/b@${SHA_A}`, `- uses: c/d@${SHA_A}`]
  const added = [`- uses: a/b@${SHA_B}`, `  - uses: c/d@${SHA_A}`, `- uses: e/f@${SHA_B}`, `- uses: e/f@${SHA_B}`]
  const { checks, downgrades } = pinChanges(removed, added)
  assert.deepEqual(checks.map((c) => c.repo), ["a/b", "e/f"])
  assert.equal(downgrades.length, 0)
})

test("replacing a SHA pin with a tag is a downgrade, adding a tag pin is not", () => {
  const { checks, downgrades } = pinChanges([`- uses: a/b@${SHA_A}`], ["- uses: a/b@v1", "- uses: x/y@v2"])
  assert.equal(checks.length, 0)
  assert.equal(downgrades.length, 1)
  assert.equal(downgrades[0].to.ref, "v1")
})

test("patch lines split into added and removed, ignoring file headers", () => {
  const { added, removed } = patchLines("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n context")
  assert.deepEqual(added, ["new"])
  assert.deepEqual(removed, ["old"])
})

test("compare status decides reachability; a tag rescues a side-branch commit", () => {
  assert.equal(reachabilityOf("behind", false), "reachable")
  assert.equal(reachabilityOf("identical", false), "reachable")
  assert.equal(reachabilityOf("diverged", false), "unreachable")
  assert.equal(reachabilityOf("ahead", false), "unreachable")
  assert.equal(reachabilityOf(null, false), "unreachable")
  assert.equal(reachabilityOf("diverged", true), "reachable")
})

test("a first snapshot records only; moved tags group by new target", () => {
  assert.deepEqual(diffTags(new Map(), [{ tag: "v1", sha: SHA_A }]), { first: true, groups: [] })
  const stored = new Map([["v1", "1".repeat(40)], ["v2", "2".repeat(40)], ["v3", "3".repeat(40)], ["v4", SHA_B]])
  const current = [
    { tag: "v1", sha: SHA_A },
    { tag: "v2", sha: SHA_A },
    { tag: "v3", sha: SHA_B },
    { tag: "v4", sha: SHA_B },
    { tag: "v5", sha: SHA_A },
  ]
  const { first, groups } = diffTags(stored, current)
  assert.equal(first, false)
  assert.deepEqual(groups.map((g) => [g.sha, g.tags.map((t) => t.tag)]), [[SHA_A, ["v1", "v2"]], [SHA_B, ["v3"]]])
})

const b64 = (text: string) => Buffer.from(text).toString("base64")

test("log scan flags unmasked tokens with only prefix and length", () => {
  const fake = "ghp" + "_" + "x".repeat(36)
  const [hit] = scanLog(`2025-03-14T10:00:00.0000000Z token is ${fake}`)
  assert.equal(hit.kind, "token")
  assert.equal(hit.sample, "ghp_... (40 chars)")
  assert.ok(!hit.sample.includes("xxxx"))
})

test("log scan flags double base64 that unwraps to a secret dump", () => {
  const dump = JSON.stringify({ FAKE_NAME: { value: "not-a-secret", isSecret: true } })
  const [hit] = scanLog(`echo ${b64(b64(dump))}`)
  assert.equal(hit.kind, "double-base64")
  assert.ok(!hit.sample.includes("not-a-secret"))
  assert.equal(scanLog(`echo ${b64(b64("FAKE_A=1\nFAKE_B=2\nFAKE_C=3"))}`)[0]?.kind, "double-base64")
})

test("log scan flags base64-hidden tokens and very long runs, not ordinary output", () => {
  assert.equal(scanLog(b64(`aws_access_key_id = ${"AKIA" + "Z".repeat(16)}`))[0]?.kind, "encoded-token")
  assert.equal(scanLog("A".repeat(2_500))[0]?.kind, "long-base64")
  assert.deepEqual(scanLog(`checkout ${SHA_A}\nnpm ci\n::add-mask::${"ghp" + "_" + "y".repeat(36)}\nDone in 3.2s`), [])
})

const zipOf = (files: Record<string, string>) => {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text))
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(text.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(text.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(files).length, 8)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

test("zip reader inflates entries and stops at the byte cap", () => {
  const zip = zipOf({ "build/1_Set up job.txt": "hello", "build/2_Run tests.txt": "z".repeat(1_000) })
  const all = readZip(zip, { maxEntries: 10, maxBytes: 10_000 })
  assert.deepEqual(all.entries.map((e) => [e.name, e.text.length]), [["build/1_Set up job.txt", 5], ["build/2_Run tests.txt", 1_000]])
  assert.equal(all.truncated, false)
  const capped = readZip(zip, { maxEntries: 10, maxBytes: 100 })
  assert.deepEqual(capped.entries.map((e) => e.name), ["build/1_Set up job.txt"])
  assert.equal(capped.truncated, true)
  assert.equal(readZip(zip, { maxEntries: 1, maxBytes: 10_000 }).truncated, true)
  assert.throws(() => readZip(Buffer.from("not a zip at all, just text padding"), { maxEntries: 1, maxBytes: 1 }))
})

const event = (kind: ChainEvent["kind"], minutes: number, login: string | null = "mallory"): ChainEvent => ({
  kind,
  repo: "acme/action",
  login,
  detail: kind,
  at: new Date(Date.UTC(2025, 2, 11, 10, 0) + minutes * 60_000),
})

test("the chain needs member, flash and tag in order, by one login, within a day", () => {
  assert.ok(findChain([event("member_added", 0), event("branch_flash", 2), event("tag_moved", 8 * 60, null)]))
  assert.equal(findChain([event("member_added", 0), event("branch_flash", 2, "eve"), event("tag_moved", 60, null)]), null)
  assert.equal(findChain([event("member_added", 0), event("branch_flash", 2), event("tag_moved", 25 * 60, null)]), null)
  assert.equal(findChain([event("branch_flash", 0), event("member_added", 2), event("tag_moved", 60, null)]), null)
  assert.equal(findChain([event("member_added", 0), event("tag_moved", 30, null), event("branch_flash", 60)]), null)
})

test("a floating tag moved onto a newly published release is routine; anything else is not", async () => {
  const { isRoutineRelease } = await import("@/lib/tag-diff")
  const stored = new Map([["v1", "a".repeat(40)], ["v1.4.1", "a".repeat(40)]])
  const sha = "b".repeat(40)
  const group = { sha, tags: [{ tag: "v1", from: "a".repeat(40) }] }
  assert.equal(isRoutineRelease(group, [{ tag: "v1", sha }, { tag: "v1.4.2", sha }], stored), true)
  assert.equal(isRoutineRelease(group, [{ tag: "v1", sha }], stored), false)
  assert.equal(isRoutineRelease({ sha, tags: [{ tag: "v1.4.1", from: "a".repeat(40) }] }, [{ tag: "v1.4.1", sha }, { tag: "v1.4.2", sha }], stored), false)
  assert.equal(isRoutineRelease(group, [{ tag: "v1", sha }, { tag: "v1.4.1", sha }], stored), false)
})
