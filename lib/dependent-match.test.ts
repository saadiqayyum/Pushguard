import assert from "node:assert/strict"
import { test } from "node:test"
import { matchDependents } from "@/lib/dependent-match"
import { affects, satisfies } from "@/lib/version-range"

const row = (repo: string, name: string, version: string) => ({ repo, manifestPath: "package-lock.json", ecosystem: "npm", name, version })
const entry = (name: string, spec: { versionRange?: string; versions?: string[]; withdrawnAt?: Date }) => ({
  ecosystem: "npm",
  name,
  versionRange: spec.versionRange ?? null,
  versions: spec.versions ?? [],
  withdrawnAt: spec.withdrawnAt ?? null,
  advisoryId: "GHSA-x",
  source: "ghsa" as const,
})

test("ranges are an AND of comparisons", () => {
  assert.ok(satisfies("1.2.0", ">= 1.0.0, < 1.2.3"))
  assert.ok(!satisfies("1.2.3", ">= 1.0.0, < 1.2.3"))
  assert.ok(satisfies("4.1.1", "= 4.1.1"))
  assert.ok(satisfies("0.0.1", ">= 0"))
  assert.ok(satisfies("v1.10.0", "> 1.9.9"))
})

test("withdrawn never matches, unpinned always does", () => {
  assert.ok(!affects({ versionRange: ">= 0", versions: [], withdrawnAt: new Date() }, "1.0.0"))
  assert.ok(affects({ versionRange: null, versions: ["9.9.9"], withdrawnAt: null }, ""))
})

test("dependents are grouped by repo and filtered by version", () => {
  const hits = matchDependents(
    [row("a/one", "chalk", "5.6.1"), row("a/two", "chalk", "5.6.0"), row("a/two", "debug", "4.4.2"), row("a/three", "left-pad", "1.0.0")],
    [entry("chalk", { versions: ["5.6.1"] }), entry("debug", { versionRange: ">= 0" })],
  )
  assert.deepEqual([...hits.keys()].sort(), ["a/one", "a/two"])
  assert.deepEqual(hits.get("a/two")!.map((h) => h.row.name), ["debug"])
})
