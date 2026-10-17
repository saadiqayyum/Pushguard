import { CODE_FILES } from "./paths"

// Variation selectors, tags, zero-width and invisible operators, private use.
// Astral ranges are written as surrogate pairs: the engine compiles without the u flag.
const INVISIBLE_CLASS =
  "[\\uFE00-\\uFE0F\\u200B-\\u200D\\u2060-\\u2064\\uE000-\\uF8FF]|\\uDB40[\\uDC00-\\uDDEF]|[\\uDB80-\\uDBFF][\\uDC00-\\uDFFF]"
const INVISIBLE_RUN = `(?:${INVISIBLE_CLASS}){8}`
const PRIVATE_USE = "[\\uE000-\\uF8FF]|[\\uDB80-\\uDBFF][\\uDC00-\\uDFFF]"

// Rules that hold whatever the repository is written in.
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
    enabled: false,
  },
  {
    id: "hidden-by-padding",
    description: "A line indented far enough to push its code out of view in a diff",
    severity: "high",
    added_lines: ["^[ \\t]{200,}", "\\S[ \\t]{150,}\\S"],
  },
  {
    id: "invisible-codepoint-run",
    description: "A run of invisible code points (variation selectors, tags, private use, zero-width), the shape of an encoded payload",
    severity: "critical",
    added_lines: INVISIBLE_RUN,
  },
  {
    id: "invisible-private-use",
    description: "A Private Use Area character, which renders as nothing or a box and no Unicode check names",
    severity: "high",
    paths: ["**"],
    exclude_paths: ["**/*.css", "**/*.scss", "**/*.less", "**/*.svg", "**/*.ttf", "**/*.otf", "**/*.woff*"],
    added_lines: PRIVATE_USE,
  },
  {
    id: "long-line-added",
    description: "A source line over 500 columns, where a reviewer stops reading",
    severity: "medium",
    paths: CODE_FILES,
    exclude_paths: ["**/*.min.*", "**/dist/**", "**/vendor/**", "**/*.snap", "**/__snapshots__/**"],
    added_lines: "^.{500}",
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
    paths: [
      "**/.vscode/tasks.json",
      "**/.vscode/settings.json",
      "**/.vscode/launch.json",
      "**/*.code-workspace",
      "**/.idea/**/*.xml",
      "**/.run/*.run.xml",
      "**/.devcontainer/**",
      "**/.devcontainer.json",
      "**/.envrc",
      "**/.zed/tasks.json",
    ],
  },
  {
    id: "editor-task-runs-on-open",
    description: "An editor task set to run when the folder opens, or workspace trust switched off",
    severity: "critical",
    paths: ["**/.vscode/tasks.json", "**/.vscode/settings.json", "**/*.code-workspace"],
    added_lines: [
      '"runOn"\\s*:\\s*"folderOpen"',
      '"task\\.allowAutomaticTasks"\\s*:\\s*"on"',
      '"security\\.workspace\\.trust\\.enabled"\\s*:\\s*false',
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
    description: "A .gitattributes filter, diff or merge driver other than Git LFS or a built-in",
    severity: "high",
    paths: ["**/.gitattributes"],
    added_lines: [
      "\\bfilter=(?!lfs\\b)",
      "\\bmerge=(?!(lfs|union|binary|text)\\b)",
      "\\bdiff=(?!(lfs|ada|bash|bibtex|cpp|csharp|css|dts|elixir|fortran|fountain|golang|html|java|kotlin|markdown|matlab|objc|pascal|perl|php|python|ruby|rust|scheme|tex)\\b)",
    ],
  },
  {
    id: "gitattributes-hides-from-review",
    description: "Paths marked generated, vendored or export-ignore, which review tools collapse or skip",
    severity: "low",
    paths: ["**/.gitattributes"],
    added_lines: "linguist-generated|linguist-vendored|export-ignore",
  },
  {
    id: "gitmodules-changed",
    description: "A submodule added or repointed",
    severity: "high",
    paths: ["**/.gitmodules"],
    change_type: ["added", "modified"],
  },
  {
    id: "gitmodules-suspicious",
    description: "A submodule entry with control characters, a .git path component, or an option or ext:: URL",
    severity: "critical",
    paths: ["**/.gitmodules"],
    added_lines: [
      "^\\s*(path|url)\\s*=.*[\\x00-\\x08\\x0b-\\x1f\\x7f]",
      "^\\s*path\\s*=\\s*(\\S*/)?\\.[gG][iI][tT](/|\\s*$)",
      "^\\s*url\\s*=\\s*(-|ext::|file://)",
    ],
  },
  {
    id: "security-process-changed",
    description: "Security contact or fuzzing configuration changed",
    severity: "medium",
    paths: ["**/SECURITY.md", "**/.clusterfuzzlite/**", "**/oss-fuzz/**", "**/fuzz/build.sh"],
    change_type: ["added", "modified", "removed"],
  },
  {
    id: "version-bump-touches-code",
    description: "A commit labelled as a version bump or release that also changes source code",
    severity: "medium",
    paths: CODE_FILES,
    commit_message: [
      "^(chore|build|release)(\\([^)]{0,40}\\))?!?:\\s*(bump|release|version)",
      "^[Bb]ump (version|to v?\\d)",
      "^[Rr]elease v?\\d",
      "^v?\\d+\\.\\d+\\.\\d+$",
    ],
  },
] as const
