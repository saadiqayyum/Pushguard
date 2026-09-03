import { aiRulesFileSchema, type AiRule } from "@/schemas/ai-rule"

// Example AI rules, to start from rather than to run.
const EXAMPLES = [
  {
    id: "example-credential-exfiltration",
    description: "Code that reads secrets and sends them somewhere",
    severity: "critical",
    prompt:
      "Does this code read credentials, tokens, environment variables or key material and send them anywhere: a network call, a log, a file, an analytics event, or a third-party SDK? Reading a secret to use it for its intended purpose is normal; moving it somewhere it was not already going is not. Say where it goes.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: ["**/*.js", "**/*.mjs", "**/*.ts", "**/*.tsx", "**/*.py", "**/*.rb", "**/*.go"],
  },
  {
    id: "example-remote-control",
    description: "A channel that takes instructions from outside",
    severity: "critical",
    prompt:
      "Does this code establish a channel that receives commands or code from somewhere external and acts on them: polling a remote endpoint for work, opening a socket that accepts input, downloading and executing, or evaluating a response body? A client calling an API it was written to call is normal. A component that fetches something and runs it is not.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: ["**/*.js", "**/*.mjs", "**/*.ts", "**/*.py", "**/*.rb", "**/*.go", "**/*.rs"],
  },
  {
    id: "example-logic-bomb",
    description: "Behaviour that only happens on a date, a host, or a user",
    severity: "critical",
    prompt:
      "Does this code behave differently based on a date, a hostname, a username, an environment name, or a specific account, in a way that is not ordinary configuration? A feature flag or a staging check is normal. Code that waits for a date, or acts only on one machine or one user, is a logic bomb.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: ["**/*.js", "**/*.ts", "**/*.py", "**/*.rb", "**/*.go", "**/*.java", "**/*.cs"],
  },
  {
    id: "example-auth-bypass",
    description: "A check that can be skipped, or a path around one",
    severity: "critical",
    prompt:
      "Does this change weaken or bypass an authentication or authorisation check: a condition that now short-circuits, a role comparison that always passes, a route that stopped requiring a session, a token verification that no longer verifies, or a hardcoded account? Say which check and how it is bypassed.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: ["**/auth/**", "**/middleware/**", "**/*auth*.*", "**/*permission*.*", "**/*session*.*"],
  },
  {
    id: "example-destructive-operation",
    description: "Code that deletes, truncates, or overwrites at scale",
    severity: "high",
    prompt:
      "Does this code delete, truncate, drop or overwrite data or files in a way that could not be undone, and without a guard limiting what it touches? A migration or a documented cleanup job is normal. An unbounded delete, a recursive remove of a path built from input, or a drop with no condition is not.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: ["**/*.js", "**/*.ts", "**/*.py", "**/*.rb", "**/*.go", "**/*.sql", "**/migrations/**"],
  },
  {
    id: "example-hidden-behaviour",
    description: "Code written to be hard to read",
    severity: "high",
    prompt:
      "Is any of this code deliberately obscured: string concatenation that assembles an identifier at runtime, encoded literals that decode to code or URLs, indirection with no purpose, or names chosen to look ordinary while doing something else? A minified bundle, a vendored dependency and a generated file are none of these. Say what the code actually does.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: ["**/*.js", "**/*.mjs", "**/*.ts", "**/*.py", "**/*.php", "**/*.rb"],
  },
  {
    id: "example-build-tampering",
    description: "A build or install step that does more than build",
    severity: "critical",
    prompt:
      "Does this build, install or packaging step do anything besides build the project: fetch from the network, run a shell command, write outside the build directory, or read credentials? These files run on developer machines and in CI with real access, and almost nobody reads them in review.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: [
      "**/package.json",
      "**/setup.py",
      "**/Makefile",
      "**/CMakeLists.txt",
      "**/build.gradle*",
      "**/build.rs",
      "**/*.gemspec",
      "**/Dockerfile*",
    ],
  },
  {
    id: "example-dependency-swap",
    description: "A dependency repointed at something that is not the registry",
    severity: "critical",
    prompt:
      "Does this change where a dependency comes from: a registry URL, a git or path source, a version resolved from somewhere unexpected, or a name close to a well-known package but not it? Say which dependency and where it now comes from.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: [
      "**/package.json",
      "**/*lock*",
      "**/requirements*.txt",
      "**/go.mod",
      "**/Cargo.toml",
      "**/Gemfile",
      "**/composer.json",
      "**/*.csproj",
    ],
  },
  {
    id: "example-ci-secret-access",
    description: "A pipeline step reaching for more than it needs",
    severity: "critical",
    prompt:
      "Does this workflow give a step access to secrets, tokens or write permissions it does not need for what it does, run code from a fork in a trusted context, or send anything to a host that is not part of the build? Say which step and what it can reach.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: [".github/workflows/**", "**/.gitlab-ci.yml", "**/Jenkinsfile", "**/.circleci/**"],
  },
  {
    id: "example-prompt-injection-surface",
    description: "Untrusted text reaching a model without a boundary",
    severity: "high",
    prompt:
      "Does this code put text it did not author into a model prompt without marking it as untrusted: user input, a fetched page, a file, or a database row concatenated into a system prompt or instruction? Say where the untrusted text enters and what it could make the model do.",
    scope: "changed",
    on: ["pull_request", "push"],
    paths: ["**/*.js", "**/*.ts", "**/*.tsx", "**/*.py"],
  },
] as const

// Parsed at module load, so a malformed example is a crash on the first import
// rather than a broken template somebody discovers halfway through editing it.
export const aiExamples: AiRule[] = aiRulesFileSchema.parse(
  EXAMPLES.map((example) => ({ ...example, enabled: true })),
)

// One group, so the picker has something to head the list with.
export const AI_EXAMPLE_PACKS = [
  {
    id: "ai-examples",
    title: "AI rules",
    blurb: "Answered by a model. Nothing here runs until you save it",
  },
]
