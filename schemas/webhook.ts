import { z } from "zod";

const commitSchema = z.object({
  id: z.string(),
  message: z.string().default(""),
  author: z
    .object({
      name: z.string().optional(),
      email: z.string().nullish(),
      username: z.string().optional(),
    })
    .optional(),
  added: z.array(z.string()).default([]),
  modified: z.array(z.string()).default([]),
  removed: z.array(z.string()).default([]),
});

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
    default_branch: z.string().optional(),
    owner: z.object({ login: z.string() }),
  }),
  pusher: z.object({ name: z.string(), email: z.string().nullish() }),
  sender: z.object({ login: z.string(), type: z.string().optional() }),
  commits: z.array(commitSchema).default([]),
});

export type PushPayload = z.infer<typeof pushPayloadSchema>;

const repoRefSchema = z.object({ full_name: z.string() });

export const installationPayloadSchema = z.object({
  action: z.string(),
  installation: z.object({
    id: z.number(),
    account: z.object({ login: z.string(), type: z.string().default("User") }),
  }),
  repositories: z.array(repoRefSchema).optional(),
  sender: z.object({ login: z.string() }),
});

export type InstallationPayload = z.infer<typeof installationPayloadSchema>;

export const installationReposPayloadSchema = z.object({
  action: z.string(),
  installation: z.object({
    id: z.number(),
    account: z.object({ login: z.string(), type: z.string().default("User") }),
  }),
  repository_selection: z.string().optional(),
  repositories_added: z.array(repoRefSchema).default([]),
  repositories_removed: z.array(repoRefSchema).default([]),
});

export type InstallationReposPayload = z.infer<
  typeof installationReposPayloadSchema
>;

export const teamPayloadSchema = z.object({
  action: z.string(),
  team: z.object({ slug: z.string() }),
  organization: z.object({ login: z.string() }),
  changes: z
    .object({ slug: z.object({ from: z.string() }).optional() })
    .optional(),
});

export type TeamPayload = z.infer<typeof teamPayloadSchema>;

// `create` and `delete` fire for branches and tags. Only branches are of
// interest; a tag is not something anyone scans.
export const refPayloadSchema = z.object({
  ref: z.string(),
  ref_type: z.string(),
  repository: z.object({
    full_name: z.string(),
    default_branch: z.string().optional(),
    owner: z.object({ login: z.string() }),
  }),
});

export type RefPayload = z.infer<typeof refPayloadSchema>;

export const repositoryPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    full_name: z.string(),
    private: z.boolean().default(true),
    archived: z.boolean().default(false),
    default_branch: z.string().optional(),
    owner: z.object({ login: z.string() }),
  }),
  changes: z
    .object({
      repository: z
        .object({ name: z.object({ from: z.string() }).optional() })
        .optional(),
    })
    .optional(),
});

export type RepositoryPayload = z.infer<typeof repositoryPayloadSchema>;

// Access-changing events. Each names the smallest slice that has to be re-read.
export const memberPayloadSchema = z.object({
  action: z.string(),
  member: z.object({ login: z.string() }),
  repository: z.object({
    full_name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
});

export const membershipPayloadSchema = z.object({
  action: z.string(),
  member: z.object({ login: z.string() }),
  team: z.object({ slug: z.string() }),
  organization: z.object({ login: z.string() }),
});

export const teamRepoPayloadSchema = z.object({
  action: z.string(),
  team: z.object({ slug: z.string() }),
  organization: z.object({ login: z.string() }),
  repository: z.object({ full_name: z.string() }).optional(),
});

export const organizationPayloadSchema = z.object({
  action: z.string(),
  organization: z.object({ login: z.string() }),
  membership: z.object({ user: z.object({ login: z.string() }) }).optional(),
  changes: z
    .object({ login: z.object({ from: z.string() }).optional() })
    .optional(),
});

// Issue activity. Only alerts we filed are tracked; anything else is ignored.
export const issuePayloadSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number(),
    title: z.string().optional(),
    state: z.string().optional(),
    labels: z.array(z.object({ name: z.string() })).default([]),
    assignees: z.array(z.object({ login: z.string() })).default([]),
  }),
  repository: z.object({ full_name: z.string() }),
  sender: z.object({ login: z.string(), type: z.string().optional() }),
  comment: z
    .object({
      id: z.number(),
      body: z.string().nullish(),
      created_at: z.string().optional(),
      user: z.object({ login: z.string() }),
    })
    .optional(),
});

export type IssuePayload = z.infer<typeof issuePayloadSchema>;

export const publicPayloadSchema = z.object({
  repository: z.object({
    full_name: z.string(),
    default_branch: z.string().optional(),
    owner: z.object({ login: z.string() }),
  }),
  sender: z.object({ login: z.string(), type: z.string().optional() }),
});
