import assert from "node:assert/strict"
import { test } from "node:test"
import { planRedeliveries } from "@/lib/delivery-plan"

const attempt = (guid: string, statusCode: number, minute: number, id = minute) => ({
  id,
  guid,
  deliveredAt: new Date(Date.UTC(2026, 9, 17, 12, minute)),
  redelivery: minute > 0,
  statusCode,
  event: "push",
  installationId: 1,
})

test("a failure we never recorded is redelivered; a success or a recorded one is not", () => {
  const plan = planRedeliveries(
    [attempt("a", 500, 0), attempt("b", 200, 1), attempt("c", 502, 2), attempt("d", 0, 3), attempt("d", 200, 4)],
    new Set(["c"]),
  )
  assert.deepEqual(plan.redeliver.map((d) => d.guid), ["a"])
  assert.equal(plan.abandoned.length, 0)
})

test("the latest attempt is redelivered, and a guid out of attempts is abandoned", () => {
  const plan = planRedeliveries(
    [attempt("a", 500, 0), attempt("a", 504, 5), attempt("b", 500, 1), attempt("b", 500, 2), attempt("b", 500, 3)],
    new Set(),
  )
  assert.equal(plan.redeliver[0].id, 5)
  assert.deepEqual(plan.abandoned.map((d) => d.guid), ["b"])
})
