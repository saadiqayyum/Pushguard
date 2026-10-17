import { z } from "zod"

export const MAX_INDICATOR_BRANCHES = 20
const MAX_BRANCH_GLOB = 100

export const indicatorBranchesBody = z
  .object({ branches: z.array(z.string().trim().min(1).max(MAX_BRANCH_GLOB)).max(MAX_INDICATOR_BRANCHES) })
  .strict()

export const indicatorBranchesOut = z.object({ branches: z.array(z.string()) })

export const REPO_FULL_NAME = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/


