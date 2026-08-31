import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync, readdirSync } from "node:fs"
import { reviewTools } from "@/lib/review-tools"
import type { ToolScope } from "@/lib/review-scope"

const scope = (over: Partial<ToolScope> = {}): ToolScope => ({
  installationId: 1,
  repo: "acme/api",
  sha: "abc123",
  budget: 3,
  ...over,
})

const readers = (files: Record<string, string> = {}, refs: string[] = []) => {
  const calls: string[] = []
  return {
    calls,
    readers: {
      readBlob: async (path: string) => {
        calls.push(path)
        return files[path] ?? null
      },
      findRefs: async () => refs,
    },
  }
}

const call = async (t: unknown, args: unknown): Promise<string> =>
  String(await (t as { invoke: (a: unknown) => Promise<unknown> }).invoke(args))

test("a refused path never reaches the reader and is recorded", async () => {
  const { calls, readers: r } = readers({ "src/a.ts": "const a = 1" })
  const { tools, trace } = reviewTools(scope({ paths: ["src/**"] }), r)

  const out = await call(tools[0], { path: "../../etc/passwd.ts" })
  assert.match(out, /^Refused:/)
  assert.deepEqual(calls, [], "a rejected path must not cause a fetch")
  assert.equal(trace.refused.length, 1)
})

test("the same file is fetched once however often it is asked for", async () => {
  const { calls, readers: r } = readers({ "src/a.ts": "const a = 1" })
  const { tools } = reviewTools(scope(), r)

  await call(tools[0], { path: "src/a.ts" })
  await call(tools[0], { path: "src/a.ts" })
  assert.deepEqual(calls, ["src/a.ts"], "models repeat calls; the second must be free")
})

test("the budget stops the loop and says so", async () => {
  const { readers: r } = readers({ "src/a.ts": "x" })
  const { tools, trace } = reviewTools(scope({ budget: 2 }), r)

  await call(tools[0], { path: "src/a.ts" })
  await call(tools[0], { path: "src/a.ts" })
  const third = await call(tools[0], { path: "src/a.ts" })
  assert.match(third, /Budget of 2 tool calls is spent/)
  assert.ok(trace.calls > 2)
})

test("a file too large to show is returned cut, and marked as cut", async () => {
  const { readers: r } = readers({ "src/big.ts": "y".repeat(60_000) })
  const { tools, trace } = reviewTools(scope(), r)

  const out = await call(tools[0], { path: "src/big.ts" })
  assert.match(out, /partly unread/)
  assert.deepEqual(trace.truncated, ["src/big.ts"])
})

test("find_references cannot leak a path outside the rule's scope", async () => {
  // The index covers the whole repository; a rule scoped to src/ must not learn
  // about matches elsewhere through it.
  const { readers: r } = readers({}, ["src/a.ts", "infra/secrets.ts"])
  const { tools } = reviewTools(scope({ paths: ["src/**"] }), r)

  const out = await call(tools[1], { symbol: "token" })
  assert.ok(out.includes("src/a.ts"))
  assert.ok(!out.includes("infra/secrets.ts"))
})

test("an unreadable file reports that, rather than looking empty", async () => {
  const { readers: r } = readers({})
  const { tools, trace } = reviewTools(scope(), r)

  const out = await call(tools[0], { path: "src/gone.ts" })
  assert.match(out, /could not be read/)
  assert.deepEqual(trace.reads, [])
})

test("the tool layer reaches neither the database nor GitHub directly", () => {
  // The tools run on behalf of a model reading attacker-controlled files. They
  // take injected readers so the module cannot grow a query or a credential by
  // someone adding one import, and so this half stays testable at all.
  for (const file of ["lib/review-tools.ts", "lib/review-scope.ts"]) {
    const source = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("import"))
      .join("\n")
    for (const forbidden of ["@/lib/db", "@/lib/github", "mongodb", "octokit"]) {
      assert.ok(!source.includes(forbidden), `${file} must not import ${forbidden}`)
    }
  }
})

test("only lib/db speaks to the driver", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.name === "node_modules" || e.name === ".next"
        ? []
        : e.isDirectory()
          ? walk(`${dir}/${e.name}`)
          : e.name.endsWith(".ts") || e.name.endsWith(".tsx")
            ? [`${dir}/${e.name}`]
            : [],
    )
  for (const file of [...walk("lib"), ...walk("app"), ...walk("components")]) {
    // Test files talk about these strings; they do not use them.
    if (file.startsWith("lib/db/") || /\.test\.[cm]?tsx?$/.test(file)) continue
    const source = readFileSync(file, "utf8")
    assert.ok(!source.includes("new MongoClient"), `${file} must not open its own client`)
    assert.ok(!/(?<![.\w])\.collection\(/.test(source), `${file} must go through an entity accessor`)
  }
})
