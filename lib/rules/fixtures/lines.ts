import type { FileLines } from "@/lib/diff-lines"
import type { PushContext } from "@/lib/engine"

export type FixtureLines = string[] | Record<string, string[]>

// A bare list is what the push added to its first file; name files to say otherwise.
export function byFile(lines: FixtureLines, context: PushContext): FileLines {
  if (!Array.isArray(lines)) return new Map(Object.entries(lines))
  return new Map([[context.files[0]?.path ?? "", lines]])
}
