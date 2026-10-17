import assert from "node:assert/strict"
import { test } from "node:test"
import { cachedMaliciousHits, npmSignals, osvSignals } from "@/lib/dependencies"

const dep = { name: "left-pad", version: "1.4.0", ecosystem: "npm", manifest: "package-lock.json" }
const now = new Date("2026-10-17T12:00:00Z")

test("install scripts, fresh publish and a new publisher are each flagged", () => {
  const ids = npmSignals(
    dep,
    {
      time: { "1.3.0": "2025-01-01T00:00:00Z", "1.4.0": "2026-10-16T12:00:00Z" },
      versions: {
        "1.3.0": { _npmUser: { name: "alice" } },
        "1.4.0": { scripts: { postinstall: "node x.js" }, _npmUser: { name: "mallory" } },
      },
    },
    now,
  ).map((s) => s.id)
  assert.deepEqual(ids.sort(), ["dependency-install-script", "dependency-just-published", "dependency-maintainer-changed"])
})

test("an old version by the same publisher with no scripts is quiet", () => {
  const signals = npmSignals(
    dep,
    {
      time: { "1.3.0": "2025-01-01T00:00:00Z", "1.4.0": "2025-06-01T00:00:00Z" },
      versions: { "1.3.0": { _npmUser: { name: "alice" } }, "1.4.0": { scripts: { test: "x" }, _npmUser: { name: "alice" } } },
    },
    now,
  )
  assert.equal(signals.length, 0)
})

test("only MAL- advisories count as malicious", () => {
  const signals = osvSignals([dep, { ...dep, name: "b" }], [{ vulns: [{ id: "GHSA-x" }] }, { vulns: [{ id: "MAL-2026-1" }] }])
  assert.equal(signals.length, 1)
  assert.equal(signals[0].dependency.name, "b")
  assert.equal(signals[0].severity, "critical")
})

test("a cached entry settles a dependency unless it is a stale OSV hit", () => {
  const keyed = { dep: { ...dep, name: "chalk", version: "5.6.1" }, ecosystem: "npm", name: "chalk" }
  const entry = (source: "osv" | "ghsa", fetchedAt: string) => ({
    id: "x", ecosystem: "npm", name: "chalk", versionRange: null, versions: ["5.6.1"], source, advisoryId: "MAL-1",
    summary: "", publishedAt: null, withdrawnAt: null, fetchedAt: new Date(fetchedAt),
  })
  assert.equal(cachedMaliciousHits(keyed, [entry("osv", "2026-10-17T00:00:00Z")], now).length, 1)
  assert.equal(cachedMaliciousHits(keyed, [entry("osv", "2026-10-10T00:00:00Z")], now).length, 0)
  assert.equal(cachedMaliciousHits(keyed, [entry("ghsa", "2020-01-01T00:00:00Z")], now).length, 1)
  assert.equal(cachedMaliciousHits({ ...keyed, dep: { ...keyed.dep, version: "5.6.0" } }, [entry("ghsa", "2020-01-01T00:00:00Z")], now).length, 0)
})
