import { rulesFileSchema, type Rule } from "@/schemas/rule"
import { core } from "./core"
import { javascript } from "./javascript"
import { python } from "./python"
import { cpp, go, rust } from "./native"
import { dotnet, jvm, php, ruby } from "./managed"
import { binary, ci, container, secrets, shell } from "./pipeline"

/**
 * The rule catalog: every rule Pushguard knows, grouped into packs.
 *
 * This is a file, not a table. Rules used to be copied into the database for
 * every account at install, which meant thousands of identical documents, a
 * fix that could never reach anyone already installed, and a rule set nothing
 * could analyse without a database connection. Now the catalog ships with the
 * code and the database holds only what somebody *changed*: an override of a
 * catalog rule, or a rule they wrote themselves. See `lib/rules.ts` for how the
 * two are merged.
 *
 * A pack is a grouping label, not a scope. Nobody declares that a repository is
 * C++: the rules in an ecosystem pack are scoped by their own `paths`, so a
 * C++ rule costs one glob test on a JavaScript push and can never fire on it.
 * That is why every pack can be on by default without drowning anyone.
 */
export type PackId = (typeof PACKS)[number]["id"]

export const PACKS = [
  { id: "core", title: "Core", blurb: "Attacks that do not care what the code is written in" },
  { id: "secrets", title: "Secrets", blurb: "Credentials and keys committed to a repository" },
  { id: "ci", title: "CI", blurb: "Pipelines, which hold the credentials everything else wants" },
  { id: "binary", title: "Binaries", blurb: "Artifacts committed where no diff can show their contents" },
  { id: "shell", title: "Shell", blurb: "Download-and-run, reverse shells, and files that execute on login" },
  { id: "container", title: "Containers & infra", blurb: "Dockerfiles, compose, Kubernetes, Terraform" },
  { id: "javascript", title: "JavaScript & npm", blurb: "Install hooks, registries, lockfiles" },
  { id: "python", title: "Python", blurb: "setup.py, .pth files, and dynamic execution" },
  { id: "cpp", title: "C & C++", blurb: "Build systems that shell out before anything is compiled" },
  { id: "go", title: "Go", blurb: "go:generate, cgo, and module replacement" },
  { id: "rust", title: "Rust", blurb: "build.rs, which compiles and runs before the crate" },
  { id: "jvm", title: "JVM", blurb: "Gradle and Maven builds, which are programs" },
  { id: "dotnet", title: ".NET", blurb: "MSBuild targets and NuGet sources" },
  { id: "ruby", title: "Ruby", blurb: "Native extensions and gem sources" },
  { id: "php", title: "PHP", blurb: "The webshell surface, and encoded payloads" },
] as const

const SOURCES: Record<PackId, readonly unknown[]> = {
  core,
  secrets,
  ci,
  binary,
  shell,
  container,
  javascript,
  python,
  cpp,
  go,
  rust,
  jvm,
  dotnet,
  ruby,
  php,
}

/**
 * Parsed at module load, so a malformed catalog rule is a crash on the first
 * import rather than a rule that silently never fires. Each rule is stamped
 * with its pack here rather than repeating `pack:` on every entry, which is the
 * kind of thing that goes wrong once and stays wrong.
 */
export const catalogRules: Rule[] = rulesFileSchema.parse(
  (Object.keys(SOURCES) as PackId[]).flatMap((pack) =>
    SOURCES[pack].map((rule) => ({ ...(rule as object), pack })),
  ),
)

export const catalogById: ReadonlyMap<string, Rule> = new Map(
  catalogRules.map((rule) => [rule.id, rule]),
)

export function rulesInPack(pack: PackId): Rule[] {
  return catalogRules.filter((rule) => rule.pack === pack)
}
