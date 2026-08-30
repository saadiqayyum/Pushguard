import { NextResponse } from "next/server"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { branchesFor, resolveRequester } from "@/lib/scan"

// Listing branches is a read of a repository, so it is gated the same way as
// scanning one: GitHub has to list that repository for this user first.
export const GET = withErrorHandler("/api/scan-branches", async (request) => {
  const params = new URL(request.url).searchParams
  const installationId = Number(params.get("installationId"))
  const repo = params.get("repo") ?? ""
  if (!Number.isInteger(installationId) || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new AppError("validation_failed", "installationId and repo are required")
  }

  const requester = await resolveRequester()
  return NextResponse.json({ data: await branchesFor(requester, installationId, repo) })
})
