import assert from "node:assert/strict"
import { test } from "node:test"
import { MAX_PER_PAGE, parsePaging } from "@/lib/paging"

test("defaults to the first page", () => {
  assert.deepEqual(parsePaging(new URLSearchParams()), { page: 1, perPage: 25, skip: 0 })
})

test("skip follows page and perPage", () => {
  assert.equal(parsePaging(new URLSearchParams("page=3&perPage=10")).skip, 20)
})

test("perPage is capped so a caller cannot ask for everything", () => {
  assert.equal(parsePaging(new URLSearchParams("perPage=100000")).perPage, MAX_PER_PAGE)
})

test("junk, negative and zero values fall back to the defaults", () => {
  for (const query of ["page=0", "page=-4", "page=abc", "page=", "page=NaN", "perPage=-1"]) {
    const { page, perPage, skip } = parsePaging(new URLSearchParams(query))
    assert.ok(page >= 1 && perPage >= 1 && skip >= 0, `${query} produced ${page}/${perPage}/${skip}`)
  }
})

test("accepts a plain searchParams object", () => {
  assert.equal(parsePaging({ page: "2", perPage: "5" }).skip, 5)
})
