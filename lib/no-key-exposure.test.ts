import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { hint, seal } from "@/lib/secret-box"

process.env.ENCRYPTION_KEY ??= "0".repeat(64)

/**
 * A stored model key must never reach a browser. These assert that
 * structurally rather than by review: a stored key is one careless `...doc`
 * away from being serialised into a page's props, and nothing about that
 * failure is visible when it happens.
 */
function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) filesUnder(path, out)
    else if (/\.tsx?$/.test(path) && !path.includes(".test.")) out.push(path)
  }
  return out
}

test("no API route or page returns a stored key", () => {
  // `entry.key` / `doc.aiKeys[n].key` is the ciphertext. Reading it is only
  // ever correct in lib/ai.ts, which decrypts for one call and returns a
  // verdict, never the key.
  const offenders: string[] = []

  for (const path of [...filesUnder("app"), ...filesUnder("components")]) {
    const source = readFileSync(path, "utf8")
    // Only files that touch the key list can leak one. `key={...}` on a React
    // element and `mode.key` holding a PublicAiKey are not key material, so a
    // bare `.key` match would flag every list in the codebase.
    if (!source.includes("aiKeys")) continue
    // Writing is fine (seal). Reading the sealed field is what must not happen
    // anywhere a response or a page's props are built.
    // Comments talking about the ciphertext are not reading it, so strip them
    // first; otherwise documenting the guarantee trips the check for it.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
    const reads = code.match(/\baiKeys[^\n]*\.key\b|\bentry\.key\b|\bciphertext\b/g) ?? []
    const writes = code.match(/seal\(/g) ?? []
    if (reads.length > writes.length) offenders.push(path)
  }
  assert.deepEqual(offenders, [], `these read a stored key: ${offenders.join(", ")}`)
})

test("no client component can even name the stored key field", () => {
  for (const path of filesUnder("components")) {
    const source = readFileSync(path, "utf8")
    if (!source.startsWith('"use client"')) continue
    assert.ok(
      !/\bciphertext\b|\baiKeys\[\d*\]\.key\b/.test(source),
      `${path} references stored key material`,
    )
  }
})

test("the display read excludes the ciphertext at the database", () => {
  // The projection is what makes this structural: the ciphertext is not in the
  // process, so it cannot be leaked by a later refactor that spreads the doc.
  // Read across lib/db rather than one file, so splitting the module does not
  // quietly turn this guard into a test of a file that no longer holds it.
  const source = readdirSync("lib/db")
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(`lib/db/${name}`, "utf8"))
    .join("\n")
  assert.ok(source.includes('projection: { "aiKeys.key": 0 }'))
})

test("the masked hint contains no real key material", () => {
  const key = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWx"
  const masked = hint(key)
  assert.equal(masked, "••••UvWx")
  // Only the last four survive. Everything identifying is gone.
  assert.ok(!masked.includes("sk-proj"))
  assert.ok(!key.slice(0, -4).split("").some((c) => masked.includes(c) && c !== "U"))
})

test("what is stored is unreadable without the encryption key", () => {
  const key = "sk-ant-api03-secret-value-here-000000"
  const stored = JSON.stringify(seal(key))
  assert.ok(!stored.includes(key))
  assert.ok(!stored.includes("sk-ant"))
})
