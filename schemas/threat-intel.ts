import { z } from "zod"

export const INDICATOR_KINDS = ["domain", "ip", "url", "wallet", "file_name", "package", "string"] as const
export type IndicatorKind = (typeof INDICATOR_KINDS)[number]

export const MAX_SEED_ACTORS = 500
export const MAX_SEED_INDICATORS = 5_000
const MAX_REFERENCES = 10

const slug = z.string().regex(/^[a-z0-9-]+$/).max(64)
const reference = z.string().url().startsWith("https://").max(500)

// Every indicator names the public report it came from; one without is rejected.
export const threatIntelSeed = z.object({
  actors: z
    .array(
      z.object({
        id: slug,
        name: z.string().min(1).max(100),
        aliases: z.array(z.string().max(100)).max(20),
        mitreId: z.string().regex(/^G\d{4}$/).nullable(),
        summary: z.string().max(300),
        references: z.array(reference).min(1).max(MAX_REFERENCES),
      }),
    )
    .max(MAX_SEED_ACTORS),
  indicators: z
    .array(
      z.object({
        actorId: slug.nullable(),
        campaign: z.string().min(1).max(100),
        kind: z.enum(INDICATOR_KINDS),
        value: z.string().min(3).max(500),
        firstSeen: z.iso.date().nullable(),
        references: z.array(reference).min(1).max(MAX_REFERENCES),
      }),
    )
    .max(MAX_SEED_INDICATORS),
})

export type ThreatIntelSeed = z.infer<typeof threatIntelSeed>

const PACKAGE_SPEC = /^([A-Za-z.]+):(@?[^@\s]+)@([^@\s]+)$/

// "npm:@scope/name@1.2.3" -> ecosystem, name, version.
export const packageIndicator = z
  .string()
  .regex(PACKAGE_SPEC)
  .transform((value) => {
    const [, ecosystem, name, version] = PACKAGE_SPEC.exec(value)!
    return { ecosystem, name, version }
  })
