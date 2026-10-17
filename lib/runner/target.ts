import {
  MAX_LABEL_DESCRIPTION,
  MAX_LABEL_NAME,
  RUNNER_DESCRIPTION_PREFIX,
  RUNNER_LABEL_PREFIX,
} from "@/lib/runner/limits"
import type { RunnerKind } from "@/schemas/runner"

export const runnerLabelName = (nonce: string) => `${RUNNER_LABEL_PREFIX}${nonce}`

// Null when either part would be cut by GitHub: a truncated name loses the nonce.
export function runnerLabel(nonce: string, kind: RunnerKind, endpoint: string): { name: string; description: string } | null {
  const name = runnerLabelName(nonce)
  const description = `${RUNNER_DESCRIPTION_PREFIX}${kind} ${endpoint}`
  return name.length <= MAX_LABEL_NAME && description.length <= MAX_LABEL_DESCRIPTION ? { name, description } : null
}
