import { z } from "zod"

const MAX_VERSION_CHARS = 40
const MAX_NEXT_CHARS = 500

export const termsAcceptBody = z.object({ version: z.string().max(MAX_VERSION_CHARS) }).strict()

export const termsAcceptOut = z.object({ version: z.string() })

export const signInForm = z.object({
  next: z.string().max(MAX_NEXT_CHARS).nullable(),
  switching: z.boolean(),
})

export const sessionOut = z.object({ signedIn: z.boolean(), login: z.string().optional() })
