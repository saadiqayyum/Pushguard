/**
 * Rules that hold whatever the repository is written in.
 *
 * Nothing here tests a file extension, because none of these attacks are a
 * property of a language. A force push rewrites C++ history exactly as it
 * rewrites TypeScript history; a bidi override reorders a Go comment as
 * happily as a JavaScript one; an account that has never pushed here before is
 * the same fact in every repository. Anything that needs a `paths` glob to make
 * sense belongs in an ecosystem pack, not in this one.
 */
export const core = [
  {
    id: "force-push",
    description: "Any force push to any branch",
    severity: "critical",
    when: { forced: true },
  },
  {
    id: "trojan-source",
    description: "Source that renders differently than it executes: bidi overrides, invisible characters",
    severity: "critical",
    unicode_risk: "controls",
  },
  {
    id: "homoglyph-identifier",
    description: "A character from another script sitting inside an otherwise Latin identifier",
    severity: "high",
    unicode_risk: "confusables",
    // Off by default. Any codebase that legitimately writes identifiers or
    // content in a non-Latin script trips this constantly, and that is a
    // reasonable thing to do.
    enabled: false,
  },
  {
    id: "hidden-by-padding",
    description: "A line indented far enough to push its code out of view in a diff",
    severity: "high",
    // Deliberately no trailing \S: with padding heavier than the 2000-character
    // scan cap the whole slice is whitespace, and requiring code after it would
    // miss the heaviest padding, which is the case that matters most.
    added_lines: "^[ \\t]{200,}",
  },
  {
    id: "impersonated-commit",
    description: "A commit claiming another account's authorship reached a branch without review",
    severity: "critical",
    when: { author_mismatch: true, unreviewed: true },
  },
  {
    id: "fake-merge-commit",
    description: "A commit says it merged a pull request, and no pull request contains it",
    severity: "critical",
    commit_message: "^Merge pull request #\\d+",
    when: { unreviewed: true },
  },
  {
    id: "unreviewed-push-to-main",
    description: "Code reached a protected branch without a pull request",
    severity: "high",
    branches: ["main", "master", "release/*", "develop"],
    when: { unreviewed: true },
    // Off by default: plenty of teams push straight to main and mean to.
    enabled: false,
  },
  {
    id: "first-push-by-account",
    description: "An account pushed to this repository for the first time",
    severity: "medium",
    when: { sender_first_push: true },
  },
  {
    id: "branch-deleted",
    description: "Branch deleted on a protected-pattern name",
    severity: "medium",
    branches: ["main", "master", "release/*"],
    when: { branch_deleted: true },
  },
  {
    id: "off-hours-push",
    description: "Push outside 04:00-18:00 UTC working window",
    severity: "low",
    branches: ["main", "master"],
    when: { hour_utc: { not_between: [4, 18] } },
  },
  {
    id: "protection-removed",
    description: "Workflow, CODEOWNERS, or hook config deleted",
    severity: "critical",
    paths: [
      ".github/workflows/**",
      "CODEOWNERS",
      ".github/CODEOWNERS",
      "docs/CODEOWNERS",
      ".husky/**",
      ".pre-commit-config.yaml",
    ],
    change_type: ["removed"],
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
    id: "env-file-committed",
    description: "Dotenv file pushed to the repo",
    severity: "critical",
    paths: ["**/.env", "**/.env.*"],
    exclude_paths: ["**/.env.example", "**/.env.sample", "**/.env.template"],
    change_type: ["added", "modified"],
  },
  {
    id: "editor-autorun-changed",
    description: "Editor config that runs commands on open was modified",
    severity: "high",
    // Opening a checkout should not execute anything. These files make it.
    paths: [
      ".vscode/tasks.json",
      ".vscode/settings.json",
      ".vscode/launch.json",
      ".idea/**/*.xml",
      ".devcontainer/**",
    ],
  },
  {
    id: "git-hooks-added",
    description: "A git hook or hooks path that runs on ordinary git commands",
    severity: "critical",
    paths: [".githooks/**", ".husky/**", "**/.git/hooks/**"],
    change_type: ["added", "modified"],
  },
  {
    id: "gitattributes-filter",
    description: "A .gitattributes filter, which runs a command on checkout",
    severity: "high",
    // `filter=` drives clean/smudge commands: code execution on `git checkout`,
    // configured from a file in the repository itself.
    paths: ["**/.gitattributes"],
    added_lines: "filter=",
  },
] as const
