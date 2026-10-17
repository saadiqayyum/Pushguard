// npm, and the install-time execution that makes it the softest supply-chain.
const JS_SOURCE = ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.ts", "**/*.tsx", "**/*.jsx", "**/*.mts", "**/*.cts"]

const INSTALL_HOOK = '"(pre|post)?install"\\s*:|"prepare"\\s*:|"(pre|post)pack"\\s*:'

export const javascript = [
  {
    id: "js-install-hook-added",
    description: "npm lifecycle script added or changed",
    severity: "critical",
    paths: ["**/package.json"],
    added_lines: INSTALL_HOOK,
  },
  {
    id: "js-install-hook-generic-message",
    description: "An install hook changed under a commit message that says nothing",
    severity: "high",
    paths: ["**/package.json"],
    added_lines: INSTALL_HOOK,
    commit_message:
      "^([Ff]ix bugs and improve performance|[Uu]pdates?|[Ff]ix(es)?|[Mm]inor (fixes|changes|updates)|[Ii]mprovements?|[Ww]ip|[Cc]leanup|[Rr]efactor)\\.?$",
  },
  {
    id: "js-bin-entry-added",
    description: "A package bin entry added or changed, a second way to get code run",
    severity: "medium",
    paths: ["**/package.json"],
    added_lines: '"bin"\\s*:',
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
    description: "A lockfile resolving a package from somewhere other than the public npm registry",
    severity: "high",
    paths: ["**/package-lock.json", "**/npm-shrinkwrap.json", "**/yarn.lock", "**/pnpm-lock.yaml", "**/bun.lock"],
    added_lines: [
      "\"resolved\"\\s*:\\s*\"(?!https://registry\\.npmjs\\.org/)",
      "^\\s*resolved\\s+\"(?!https://registry\\.(yarnpkg\\.com|npmjs\\.org)/)",
      "\"version\"\\s*:\\s*\"(git\\+|git:|github:|https?:|file:)",
      "tarball:\\s*\\S",
      "resolution:\\s*\"[^\"]{1,214}@(git\\+|git:|github:|https?:|file:)",
    ],
  },
  {
    id: "js-dependency-from-url",
    description: "A dependency pointing at a URL, git ref, or local path instead of a version",
    severity: "high",
    paths: ["**/package.json"],
    added_lines: '"\\s*:\\s*"(git\\+|git://|https?://|file:|github:|gitlab:|bitbucket:|git@)',
  },
  {
    id: "js-patch-package",
    description: "A patch applied to an installed dependency at install time",
    severity: "high",
    paths: ["**/patches/**", "**/*.patch"],
    change_type: ["added", "modified"],
  },
] as const
