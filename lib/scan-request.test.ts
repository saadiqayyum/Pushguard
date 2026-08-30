import assert from "node:assert/strict"
import { test } from "node:test"
import { createScanBody } from "@/schemas/api"

const ok = (body: unknown) => createScanBody.safeParse(body).success

test("an account scan needs only an installation", () => {
  assert.ok(ok({ installationId: 1 }))
  assert.ok(ok({ installationId: 1, repo: "acme/api" }))
  assert.ok(ok({ installationId: 1, repo: "acme/api", branch: "main" }))
})

test("branch names with slashes are legal, because git refs have them", () => {
  assert.ok(ok({ installationId: 1, repo: "acme/api", branch: "release/1.2" }))
  assert.ok(ok({ installationId: 1, repo: "acme/api", branch: "feat/a-b_c.d" }))
})

test("a branch without a repository is refused", () => {
  // Repositories in one account do not share branch names, so this could only
  // ever be a mistake or an attempt to smuggle a ref past the repo check.
  assert.equal(ok({ installationId: 1, branch: "main" }), false)
})

test("a branch name that could escape the ref is refused", () => {
  for (const branch of ["../../etc", "a..b", "/main", "main/", "main;rm -rf /", "ma in", "réf", ""]) {
    assert.equal(ok({ installationId: 1, repo: "acme/api", branch }), false, branch)
  }
})

test("nothing else may be sent", () => {
  assert.equal(ok({ installationId: 1, repo: "acme/api", target: "acme/other" }), false)
  assert.equal(ok({ installationId: -1 }), false)
  assert.equal(ok({ installationId: 1, repo: "notarepo" }), false)
})
