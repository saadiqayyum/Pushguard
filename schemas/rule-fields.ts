import { z } from "zod";

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const CHANGE_TYPES = ["added", "modified", "removed"] as const;

// Events a rule runs on. Absent means both.
export const CHANGE_SOURCES = ["push", "pull_request"] as const;

export const REGEX_MAX_LENGTH = 500;
export const DESCRIPTION_MAX = 500;
const GLOB_MAX_LENGTH = 256;

export const glob = z.string().min(1).max(GLOB_MAX_LENGTH);
export const kebab = z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use kebab-case: lowercase letters, digits, hyphens");

export const safeRegex = z
  .string()
  .min(1)
  .max(REGEX_MAX_LENGTH)
  .superRefine((value, ctx) => {
    try {
      new RegExp(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid regular expression",
      });
    }
  });

const hour = z.number().int().min(0).max(23);

export const hourRange = z
  .object({
    between: z.tuple([hour, hour]).optional(),
    not_between: z.tuple([hour, hour]).optional(),
  })
  .strict()
  .refine((v) => (v.between ? 1 : 0) + (v.not_between ? 1 : 0) === 1, {
    message: "Provide exactly one of between or not_between",
  });

export const whenFields = z
  .object({
    forced: z.boolean().optional(),
    sender_first_push: z.boolean().optional(),
    branch_created: z.boolean().optional(),
    branch_deleted: z.boolean().optional(),
    author_mismatch: z.boolean().optional(),
    unreviewed: z.boolean().optional(),
    pr_draft: z.boolean().optional(),
    pr_opened: z.boolean().optional(),
    hour_utc: hourRange.optional(),
  })
  .strict();

export const whenSchema = whenFields.refine((v) => Object.keys(v).length > 0, { message: "Empty when block" });
