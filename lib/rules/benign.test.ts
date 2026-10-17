import assert from "node:assert/strict"
import { test } from "node:test"
import { confirmContentMatches, evaluateRules, ruleVariants, type PushContext } from "@/lib/engine"
import { catalogRules } from "@/lib/rules/catalog"
import { byFile, type FixtureLines } from "@/lib/rules/fixtures/lines"
import { checkRegexSafety } from "@/schemas/rule-safety"

const enabled = catalogRules.filter((rule) => rule.enabled)

const push = (paths: string[], overrides: Partial<PushContext> = {}): PushContext => ({
  repo: "acme/web",
  branch: "main",
  forced: false,
  senderFirstPush: false,
  branchCreated: false,
  branchDeleted: false,
  authorMismatch: false,
  unreviewed: false,
  hourUtc: 12,
  files: paths.map((path) => ({ path, changeType: "modified" as const })),
  commitMessages: ["Update"],
  ...overrides,
})

const fired = (context: PushContext, lines: FixtureLines) =>
  confirmContentMatches(evaluateRules(enabled, context), byFile(lines, context)).map((m) => m.rule)

const SHA = "0123456789abcdef0123456789abcdef01234567"

const BENIGN: [string, PushContext, FixtureLines][] = [
  [
    "dependency bump in package.json and its lockfile",
    push(["package.json", "package-lock.json", "yarn.lock"], { commitMessages: ["chore(deps): bump lodash from 4.17.20 to 4.17.21"] }),
    [
      '    "lodash": "^4.17.21",',
      '  "version": "1.2.4",',
      '      "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",',
      '  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#abc"',
    ],
  ],
  [
    "workflow edit with pinned actions and the env-var pattern for event text",
    push([".github/workflows/ci.yml"]),
    [
      `      - uses: actions/checkout@${SHA} # v4`,
      `      - uses: actions/setup-node@${SHA}`,
      "    runs-on: ubuntu-latest",
      "      - run: npm ci && npm test",
      "          TITLE: ${{ github.event.pull_request.title }}",
      "          ref: ${{ github.sha }}",
      "        run: echo \"$TITLE\"",
    ],
  ],
  [
    "README with emoji, accents and CJK",
    push(["README.md"]),
    ["Ship it \u{1F680} \u{1F389}", "Café, résumé, naïve, Zürich", "日本語のドキュメント", "Ünïcödé — “quotes” … done"],
  ],
  [
    "VS Code formatting settings",
    push([".vscode/settings.json"]),
    ['  "editor.formatOnSave": true,', '  "editor.defaultFormatter": "esbenp.prettier-vscode",', '  "files.eol": "\\n"'],
  ],
  [
    "Claude Code permission allowlist",
    push([".claude/settings.json"]),
    ['  "permissions": { "allow": ["Bash(npm test)", "Bash(npm run lint)"] }'],
  ],
  [
    "devcontainer installing dependencies",
    push([".devcontainer/devcontainer.json"]),
    ['  "postCreateCommand": "npm install",', '  "image": "mcr.microsoft.com/devcontainers/javascript-node:20"'],
  ],
  [
    "Git LFS and built-in diff drivers",
    push([".gitattributes"]),
    ["*.psd filter=lfs diff=lfs merge=lfs -text", "*.cs diff=csharp", "CHANGELOG.md merge=union"],
  ],
  [
    "icon-font glyph in a stylesheet",
    push(["styles/icons.css"]),
    [".icon-check::before { content: \"\"; }"],
  ],
  [
    "Elixir shell in a script",
    push(["scripts/console.sh"]),
    ["iex -S mix phx.server"],
  ],
]

for (const [name, context, lines] of BENIGN) {
  test(`benign: ${name} fires nothing critical`, () => {
    const critical = fired(context, lines).filter((rule) => rule.severity === "critical")
    assert.deepEqual(critical.map((rule) => rule.id), [])
  })
}

test("benign: LFS and built-in drivers are not reported as filters", () => {
  const [, context, lines] = BENIGN.find(([name]) => name.startsWith("Git LFS"))!
  assert.ok(!fired(context, lines).some((rule) => rule.id === "gitattributes-filter"))
})

const EMOJI_PROSE = [
  "Made with \u2764\uFE0F by the team",
  "The family: \u{1F468}\u200D\u{1F469}\u200D\u{1F467} and \u{1F469}\u{1F3FD}\u200D\u{1F4BB}",
  "Flags \u{1F1FA}\u{1F1F8} \u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F} \u{1F3F3}\uFE0F\u200D\u{1F308}",
  "Step 1\uFE0F\u20E3 then #\uFE0F\u20E3",
  "Price:\u00A010\u00A0EUR, no\u00A0break",
]

test("benign: emoji sequences and NBSP in a README fire nothing critical", () => {
  for (const line of EMOJI_PROSE) {
    const critical = fired(push(["README.md"]), [line]).filter((rule) => rule.severity === "critical")
    assert.deepEqual(critical.map((rule) => rule.id), [], line)
  }
})

const run = (from: number) => String.fromCodePoint(...Array.from({ length: 8 }, (_, i) => from + i))

test("hidden characters outside emoji still fire", () => {
  const attacks: [string, string][] = [
    ["/*\u202E } \u2066if (isAdmin)\u2069 \u2066 begin admins only */", "trojan-source"],
    [`x${run(0xe0041)}`, "trojan-source"],
    [`x${run(0xe0041)}`, "invisible-codepoint-run"],
    [`x${run(0xe000)}`, "invisible-codepoint-run"],
    [`x${run(0xe0100)}`, "trojan-source"],
    [`x${run(0xe0100)}`, "invisible-codepoint-run"],
    ["const is\u200DAdmin = true", "trojan-source"],
    ["const a\uFE0Fb = 1", "trojan-source"],
    ["\u{1F600}\u200Dx", "trojan-source"],
  ]
  for (const [line, id] of attacks) {
    assert.ok(fired(push(["src/a.ts"]), [line]).some((rule) => rule.id === id), `${id} missed ${JSON.stringify(line)}`)
  }
})

// rule-safety.test.ts checks top-level patterns; this covers the any_of groups.
test("every regex inside an any_of group passes the ReDoS check", async () => {
  for (const rule of catalogRules.filter((r) => r.any_of)) {
    for (const group of ruleVariants(rule)) {
      for (const source of [group.added_lines, group.commit_message].flat()) {
        if (!source) continue
        assert.equal((await checkRegexSafety(source)).ok, true, `${rule.id}: /${source}/ was rejected`)
      }
    }
  }
})
