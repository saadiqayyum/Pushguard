import assert from "node:assert/strict"
import { test } from "node:test"
import { fillDays } from "@/lib/overview"

test("missing days count zero and the series ends today", () => {
  const days = fillDays([{ day: "2026-10-15", n: 3 }], 3, new Date("2026-10-17T23:00:00Z"))
  assert.deepEqual(days, [
    { day: "2026-10-15", n: 3 },
    { day: "2026-10-16", n: 0 },
    { day: "2026-10-17", n: 0 },
  ])
})
