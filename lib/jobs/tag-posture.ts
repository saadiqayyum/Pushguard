import { activeInstallation } from "@/lib/db"
import { ownerOf, toFinding } from "@/lib/finding"
import { fileFindingOnce } from "@/lib/findings-alert"
import { publishesAction, tagsProtected } from "@/lib/github-refs"
import { logger } from "@/lib/logger"
import type { JobMessage } from "@/schemas/job"

const TAGS_MUTABLE = {
  id: "tags-mutable",
  severity: "medium" as const,
  description: "This repository publishes an action or releases, and nothing stops its tags being moved",
}

// Run at install, on a ruleset change, on a release and when a root action.yml
// lands. Never on a timer: those events are the only ways the answer changes.
export async function checkTagPosture({ repo }: Extract<JobMessage, { type: "tag_posture" }>): Promise<void> {
  const installation = await activeInstallation(ownerOf(repo))
  if (!installation) return
  const { installationId } = installation
  if (!(await publishesAction(installationId, repo)) || (await tagsProtected(installationId, repo))) return
  await fileFindingOnce(installationId, repo, toFinding(TAGS_MUTABLE, repo, [], [
    "Anyone who can push here can repoint every version tag at once, and consumers pinning a tag run the new commit. Add a tag ruleset that blocks update and deletion.",
  ], { prose: true }), `Tags in \`${repo}\` can be moved.`)
  logger.info("tags_mutable", { repo })
}
