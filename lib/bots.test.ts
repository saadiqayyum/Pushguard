import { test } from "node:test"
import assert from "node:assert/strict"
import { botAllowed } from "./bots"

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
const BINGBOT = "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"
const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot"
const CLAUDEBOT = "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"

const cases: [string, string, boolean][] = [
  ["GitHub-Hookshot/abc123", "/api/webhook", true],
  ["PostgreSQL pg_net", "/api/jobs/run", true],
  ["python-requests/2.32", "/api/runner/fetch", true],
  ["Claude-User", "/api/mcp", true],
  [GPTBOT, "/api/auth/callback/github", true],
  [GPTBOT, "/", false],
  [GPTBOT, "/research", false],
  [CLAUDEBOT, "/how-to-use", false],
  ["Mozilla/5.0 (compatible; GoogleOther)", "/", false],
  ["Scrapy/2.11 (+https://scrapy.org)", "/research/catalog", false],
  [GPTBOT, "/robots.txt", true],
  [GOOGLEBOT, "/", true],
  [GOOGLEBOT, "/research", true],
  [GOOGLEBOT, "/research/packages/event-stream", true],
  [GOOGLEBOT, "/how-to-use", true],
  [GOOGLEBOT, "/terms", true],
  [GOOGLEBOT, "/privacy", true],
  [GPTBOT, "/privacy", false],
  [GOOGLEBOT, "/_next/static/chunks/app.js", true],
  [GOOGLEBOT, "/sitemap.xml", true],
  [GOOGLEBOT, "/api/alerts", false],
  [GOOGLEBOT, "/dashboard", false],
  [GOOGLEBOT, "/admin", false],
  [GOOGLEBOT, "/researcher", false],
  [BINGBOT, "/dashboard/alerts", false],
  ["SomeRandomCrawler/1.0", "/install/pending", false],
  [CHROME, "/", true],
  [CHROME, "/dashboard", true],
  [CHROME, "/api/alerts", true],
  [CHROME, "/admin", true],
  ["curl/8.7.1", "/api/alerts", true],
  ["", "/api/alerts", true],
]

for (const [ua, path, expected] of cases) {
  test(`${expected ? "allows" : "blocks"} ${ua.slice(0, 40) || "(no UA)"} on ${path}`, () => {
    assert.equal(botAllowed(ua, path), expected)
  })
}
