import picomatch from "picomatch"
import { SOURCE_FILE } from "@/lib/source-files"

// What a model may reach, decided by us and never by the model.
// The model names a path; this says whether it gets one.
export type ToolScope = {
  installationId: number
  repo: string
  sha: string
  paths?: string[]
  exclude_paths?: string[]
  budget: number
}

export type PathVerdict = { ok: true; path: string } | { ok: false; reason: string }

// Every file under review is attacker-controlled, so a path arriving from the
// model is an argument to validate, never an instruction to follow.
export function allowPath(scope: ToolScope, raw: string): PathVerdict {
  const path = raw.trim().replace(/^\.\//, "")

  if (path === "") return { ok: false, reason: "empty path" }
  if (path.length > 1024) return { ok: false, reason: "path too long" }
  if (path.startsWith("/")) return { ok: false, reason: "absolute paths are outside the repository" }
  if (path.includes("\0")) return { ok: false, reason: "illegal character in path" }
  if (path.split("/").includes("..")) {
    return { ok: false, reason: "`..` cannot leave the repository" }
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path)) {
    return { ok: false, reason: "only paths inside this repository can be read" }
  }
  if (!SOURCE_FILE.test(path)) return { ok: false, reason: "not a source file" }

  if (scope.exclude_paths && picomatch(scope.exclude_paths, { dot: true })(path)) {
    return { ok: false, reason: "excluded by this rule's exclude_paths" }
  }
  if (scope.paths && !picomatch(scope.paths, { dot: true })(path)) {
    return { ok: false, reason: "outside this rule's paths" }
  }
  return { ok: true, path }
}
