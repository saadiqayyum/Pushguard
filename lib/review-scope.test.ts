import assert from "node:assert/strict"
import { test } from "node:test"
import { allowPath, type ToolScope } from "@/lib/review-scope"

const scope = (extra: Partial<ToolScope> = {}): ToolScope => ({
  installationId: 1,
  repo: "acme/api",
  sha: "abc123",
  budget: 40,
  ...extra,
})

test("escapes out of the repository are refused", () => {
  // The model reads attacker-controlled files, so a path it names is an
  // argument to check, never an instruction to follow.
  for (const path of [
    "../../etc/passwd.ts",
    "/etc/passwd.ts",
    "src/../../secrets.ts",
    "file:///etc/passwd.ts",
    "https://evil.tld/payload.ts",
  ]) {
    assert.equal(allowPath(scope(), path).ok, false, `${path} must be refused`)
  }
})

test("a rule cannot read outside its own paths", () => {
  const s = scope({ paths: ["src/**/*.ts"], exclude_paths: ["src/**/*.test.ts"] })
  assert.equal(allowPath(s, "src/loader.ts").ok, true)
  assert.equal(allowPath(s, "infra/deploy.ts").ok, false)
  assert.equal(allowPath(s, "src/loader.test.ts").ok, false)
})

test("only source files are readable", () => {
  assert.equal(allowPath(scope(), "package-lock.json").ok, false)
  assert.equal(allowPath(scope(), "logo.png").ok, false)
  assert.equal(allowPath(scope(), "src/main.go").ok, true)
})

test("a leading ./ is normalised rather than refused", () => {
  const verdict = allowPath(scope(), "./src/index.ts")
  assert.equal(verdict.ok, true)
  assert.equal(verdict.ok && verdict.path, "src/index.ts")
})

test("junk is refused without throwing", () => {
  for (const path of ["", "   ", "a".repeat(2000) + ".ts", "src/\0evil.ts"]) {
    assert.equal(allowPath(scope(), path).ok, false)
  }
})

test("a dotfile inside scope is still readable", () => {
  // `dot: true` on the matcher: .github workflows are exactly what a security
  // rule wants to look at.
  const s = scope({ paths: [".github/**"] })
  assert.equal(allowPath(s, ".github/workflows/release.yml").ok, true)
})
