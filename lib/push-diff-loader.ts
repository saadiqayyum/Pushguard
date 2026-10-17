import { fetchCompareFiles } from "@/lib/github"
import { toPushDiff, type PushDiff } from "@/lib/push-diff"

// One compare per job: the first caller fetches, every later one shares it.
export function pushDiffLoader(installationId: number, repo: string, base: string, head: string): () => Promise<PushDiff> {
  let pending: Promise<PushDiff> | null = null
  return () => {
    pending ??= fetchCompareFiles(installationId, repo, base, head).then((compared) => toPushDiff(base, head, compared))
    return pending
  }
}
