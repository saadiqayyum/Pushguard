import { AppError } from "@/lib/errors"
import { respond, userRoute } from "@/lib/route"
import { branchesFor, resolveRequester } from "@/lib/scan"
import { branchesOut } from "@/schemas/output"

// Listing branches is a read of a repository, gated like scanning one.
export const GET = userRoute("/api/scan-branches", async (request) => {
  const params = new URL(request.url).searchParams
  const installationId = Number(params.get("installationId"))
  const repo = params.get("repo") ?? ""
  if (!Number.isInteger(installationId) || !/^[^/\s]{1,100}\/[^/\s]{1,100}$/.test(repo)) {
    throw new AppError("validation_failed", "installationId and repo are required")
  }
  return respond(branchesOut, await branchesFor(await resolveRequester(), installationId, repo))
})
