import { z } from "zod"
import { CONTRIBUTOR_SOURCES, CONTRIBUTOR_TEXT_MAX, CONTRIBUTOR_TITLE_MAX, CONTRIBUTOR_URL_MAX, CONTRIBUTOR_URLS_MAX } from "./limits"

export const DOC_PATH = /^docs\/attacks\/[a-z0-9_-]+(\/[a-z0-9_-]+)*\.md$/

export const contributorInput = z
  .object({
    source: z.enum(CONTRIBUTOR_SOURCES),
    title: z.string().min(1).max(CONTRIBUTOR_TITLE_MAX),
    text: z.string().min(1).max(CONTRIBUTOR_TEXT_MAX),
    urls: z.array(z.string().url().max(CONTRIBUTOR_URL_MAX)).max(CONTRIBUTOR_URLS_MAX),
    docPath: z.string().max(200).regex(DOC_PATH).optional(),
    requestedBy: z.string().min(1).max(100),
  })
  .strict()

export type ContributorInput = z.infer<typeof contributorInput>
