import { z } from "zod"

const commitSchema = z.object({
  id: z.string(),
  added: z.array(z.string()).default([]),
  modified: z.array(z.string()).default([]),
  removed: z.array(z.string()).default([]),
})

export const pushPayloadSchema = z.object({
  ref: z.string(),
  before: z.string(),
  after: z.string(),
  forced: z.boolean().default(false),
  created: z.boolean().default(false),
  deleted: z.boolean().default(false),
  repository: z.object({
    full_name: z.string(),
    private: z.boolean().default(true),
    owner: z.object({ login: z.string() }),
  }),
  pusher: z.object({ name: z.string(), email: z.string().nullish() }),
  sender: z.object({ login: z.string(), type: z.string().optional() }),
  commits: z.array(commitSchema).default([]),
})

export type PushPayload = z.infer<typeof pushPayloadSchema>

const repoRefSchema = z.object({ full_name: z.string() })

export const installationPayloadSchema = z.object({
  action: z.string(),
  installation: z.object({
    id: z.number(),
    account: z.object({ login: z.string(), type: z.string().default("User") }),
  }),
  // Present on created/unsuspend; absent on delete. Lets us seed the repo list
  // without an API call.
  repositories: z.array(repoRefSchema).optional(),
  sender: z.object({ login: z.string() }),
})

export type InstallationPayload = z.infer<typeof installationPayloadSchema>

export const installationReposPayloadSchema = z.object({
  action: z.string(),
  installation: z.object({
    id: z.number(),
    account: z.object({ login: z.string(), type: z.string().default("User") }),
  }),
  repository_selection: z.string().optional(),
  repositories_added: z.array(repoRefSchema).default([]),
  repositories_removed: z.array(repoRefSchema).default([]),
})

export type InstallationReposPayload = z.infer<typeof installationReposPayloadSchema>

export const teamPayloadSchema = z.object({
  action: z.string(),
  team: z.object({ slug: z.string() }),
  organization: z.object({ login: z.string() }),
  changes: z.object({ slug: z.object({ from: z.string() }).optional() }).optional(),
})

export type TeamPayload = z.infer<typeof teamPayloadSchema>
