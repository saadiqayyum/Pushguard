import assert from "node:assert/strict"
import { test } from "node:test"
import { deliveryUrl, slackBody } from "@/lib/sinks"

test("only https Slack and Discord webhook hosts are deliverable", () => {
  assert.equal(deliveryUrl("https://hooks.slack.com/services/T/B/x"), "https://hooks.slack.com/services/T/B/x")
  assert.equal(deliveryUrl("https://discord.com/api/webhooks/1/abc"), "https://discord.com/api/webhooks/1/abc/slack")
  for (const bad of [
    "http://hooks.slack.com/services/T/B/x",
    "https://hooks.slack.com:8443/services/T/B/x",
    "https://user@hooks.slack.com/services/T/B/x",
    "https://hooks.slack.com.evil.test/x",
    "https://169.254.169.254/latest/meta-data",
    "not a url",
  ]) {
    assert.equal(deliveryUrl(bad), null, bad)
  }
})

test("pushed text cannot mention people or inject links", () => {
  const { text } = slackBody({
    severity: "critical",
    title: "acme/web: <!channel> @here",
    lines: ["by @mallory <https://evil.test|click>"],
  })
  assert.equal(text.includes("<!channel>"), false)
  assert.equal(text.includes("@here"), false)
  assert.equal(text.includes("<https://evil.test"), false)
})

test("long messages are capped", () => {
  const { text } = slackBody({ severity: "high", title: "t", lines: Array(50).fill("x".repeat(1000)) })
  assert.ok(text.split("\n").length <= 11)
  assert.ok(text.length < 4_000)
})
