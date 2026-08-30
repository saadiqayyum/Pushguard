import { rulesFileSchema, type Rule } from "@/schemas/rule"

// Every new installation starts with these. Bundled as a module rather than
// read from rules.example.yaml at runtime: serverless filesystems are not a
// dependable place to look for repo files, and this has to work on the very
// first webhook. rules.example.yaml stays as the documented format reference;
// default-rules.test.ts fails if the two drift apart.
//
// Org-specific examples from the YAML (repos scoped to acme/*) are deliberately
// left out. They would match nothing and only clutter a new account's list.
const DEFAULTS = [
  {
    id: "force-push",
    description: "Any force push to any branch",
    severity: "critical",
    when: { forced: true },
  },
  {
    id: "install-hook-added",
    description: "npm lifecycle script added or changed",
    severity: "critical",
    paths: ["**/package.json"],
    added_lines: '"(pre|post)install"|"prepare"\\s*:',
  },
  {
    id: "workflow-changed",
    description: "GitHub Actions workflow created or modified",
    severity: "high",
    paths: [".github/workflows/**"],
    change_type: ["added", "modified"],
  },
  {
    id: "protection-removed",
    description: "Workflow, CODEOWNERS, or hook config deleted",
    severity: "critical",
    paths: [".github/workflows/**", "CODEOWNERS", ".github/CODEOWNERS", ".husky/**"],
    change_type: ["removed"],
  },
  {
    id: "editor-autorun-changed",
    description: "VS Code tasks or settings modified",
    severity: "high",
    paths: [".vscode/tasks.json", ".vscode/settings.json"],
  },
  {
    id: "env-file-committed",
    description: "Dotenv file pushed to the repo",
    severity: "critical",
    paths: ["**/.env", "**/.env.*"],
    exclude_paths: ["**/.env.example", "**/.env.sample"],
    change_type: ["added", "modified"],
  },
  {
    id: "obfuscated-payload",
    description: "Long base64 blob or dynamic code execution added",
    severity: "high",
    added_lines: "eval\\(|new Function\\(|child_process|[A-Za-z0-9+/]{200,}={0,2}",
    paths: ["**/*.js", "**/*.ts", "**/*.mjs", "**/*.cjs"],
    // The one default that asks a model anything. It is attached to an existing
    // rule rather than shipped as a tenth: the regex above already decides
    // whether a ticket is filed, so this adds judgement to tickets that were
    // going to exist anyway and cannot add noise of its own. It is also the
    // rule that most needs judgement, minified bundles and vendored code trip
    // it constantly, and only reading the diff tells those from a payload.
    ai: "Is this obfuscated or dynamically executed code a deliberate attempt to hide behaviour, or an ordinary build artifact such as a minified bundle, a source map, or a vendored dependency? Say what the code actually does if you can tell.",
  },
  {
    id: "first-push-by-account",
    description: "An account pushed to this repository for the first time",
    severity: "medium",
    when: { sender_first_push: true },
  },
  {
    id: "reviewers-and-ci-in-one-push",
    description: "One push changed both the review rules and the CI that runs with your secrets",
    severity: "critical",
    all_of: [
      ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS", ".github/**/CODEOWNERS"],
      [".github/workflows/**"],
    ],
  },
  {
    id: "branch-deleted",
    description: "Branch deleted on a protected-pattern name",
    severity: "medium",
    branches: ["main", "release/*"],
    when: { branch_deleted: true },
  },
  {
    id: "off-hours-push",
    description: "Push outside 04:00-18:00 UTC working window",
    severity: "low",
    branches: ["main"],
    when: { hour_utc: { not_between: [4, 18] } },
  },
]

// Parsed at module load: a malformed default is a build-time-visible crash on
// the first import, not a silently broken install months later.
export const defaultRules: Rule[] = rulesFileSchema.parse(DEFAULTS)
