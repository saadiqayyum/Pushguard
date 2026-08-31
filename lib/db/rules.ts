import type { Rule } from "@/schemas/rule";
import { defineCollection } from "./client";

export type RuleDoc = {
  _id: string;
  owner: string;
  ruleId: string;
  body: Rule;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export const rules = defineCollection<RuleDoc>("rules", [
  { keys: { owner: 1, enabled: 1 } },
  { keys: { owner: 1, ruleId: 1 }, options: { unique: true } },
]);

export type RuleVersionDoc = {
  _id: string;
  ruleId: string;
  body: Rule | null;
  action:
    | "created"
    | "updated"
    | "enabled"
    | "disabled"
    | "reverted"
    | "deleted";
  changedBy: string;
  changedAt: Date;
};

export const ruleVersions = defineCollection<RuleVersionDoc>("rule_versions", [
  { keys: { ruleId: 1 } },
]);

// A whole catalog pack switched off for one account.
export type DisabledPackDoc = {
  _id: string;
  owner: string;
  pack: string;
  disabledBy: string;
  disabledAt: Date;
};

export const disabledPacks =
  defineCollection<DisabledPackDoc>("disabled_packs");

export async function disabledPacksFor(owner: string): Promise<Set<string>> {
  const docs = await disabledPacks().find({ owner }).toArray();
  return new Set(docs.map((doc) => doc.pack));
}

