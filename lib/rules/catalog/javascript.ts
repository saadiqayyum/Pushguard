// npm, and the install-time execution that makes it the softest supply-chain.
const JS_SOURCE = ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.ts", "**/*.tsx", "**/*.jsx", "**/*.mts", "**/*.cts"]

export const javascript = [
  {
    id: "js-install-hook-added",
    description: "npm lifecycle script added or changed",
    severity: "critical",
    paths: ["**/package.json"],
    added_lines: '"(pre|post)install"|"prepare"\\s*:|"(pre|post)pack"\\s*:',
  },
  {
    id: "js-obfuscated-payload",
    description: "Long base64 blob or dynamic code execution added",
    severity: "high",
    paths: JS_SOURCE,
    added_lines: "eval\\(|new Function\\(|child_process|[A-Za-z0-9+/]{200,}={0,2}",
  },
  {
    id: "js-npmrc-changed",
    description: "npm registry or auth configuration changed",
    severity: "critical",
    paths: ["**/.npmrc", "**/.yarnrc", "**/.yarnrc.yml", "**/bunfig.toml"],
  },
  {
    id: "js-lockfile-only-change",
    description: "A lockfile changed with no matching manifest change",
    severity: "high",
    paths: ["**/package-lock.json", "**/yarn.lock", "**/pnpm-lock.yaml", "**/bun.lockb"],
    added_lines: "\"resolved\"\\s*:\\s*\"(?!https://registry\\.npmjs\\.org/)",
    enabled: false,
  },
  {
    id: "js-dependency-from-url",
    description: "A dependency pointing at a URL, git ref, or local path instead of a version",
    severity: "high",
    paths: ["**/package.json"],
    added_lines: '"\\s*:\\s*"(git\\+|https?://|file:|github:|git@)',
  },
  {
    id: "js-patch-package",
    description: "A patch applied to an installed dependency at install time",
    severity: "high",
    paths: ["**/patches/**", "**/*.patch"],
    change_type: ["added", "modified"],
  },
] as const
