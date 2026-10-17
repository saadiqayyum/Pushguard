import assert from "node:assert/strict"
import { test } from "node:test"
import { neutralizeEmoji } from "./unicode"

test("emoji joiners and selectors are blanked without moving columns", () => {
  for (const emoji of ["❤️", "\u{1F468}‍\u{1F469}‍\u{1F467}", "1️⃣", "\u{1F468}‍❤️‍\u{1F468}"]) {
    const out = neutralizeEmoji(emoji, false)
    assert.equal(out.length, emoji.length)
    assert.doesNotMatch(out, /[‍️]/u, JSON.stringify(emoji))
  }
})

test("joiners and selectors that no emoji explains are kept", () => {
  for (const text of ["is‍Admin", "a️b", "1️", "\u{1F600}‍x", `x${String.fromCodePoint(0xe0041, 0xe0042)}`]) {
    assert.equal(neutralizeEmoji(text, false), text)
  }
})

test("NBSP is kept only for the confusables check", () => {
  assert.equal(neutralizeEmoji("a b", false), "a b")
  assert.equal(neutralizeEmoji("a b", true), "a b")
})
