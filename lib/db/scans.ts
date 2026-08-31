import type { ErrorCode } from "@/lib/errors";
import type { Severity } from "@/schemas/rule";
import { defineCollection } from "./client";

export type ScanFinding = {
  ruleId: string;
  severity: Severity;
  description?: string;
  repo: string;
  files: string[];
  lines: string[];
  // Lines are sentences, not quoted source: wrap them, do not format as code.
  prose?: true;
};

// What a scan read, per repository. "No findings" and "not scanned" differ.
export type ScanRepo = {
  repo: string;
  branch: string;
  commits: number;
  headSha: string;
  baseSha: string | null;
  truncated: boolean;
};

export type ScanStatus = "queued" | "running" | "done" | "failed";

export type ScanDoc = {
  _id: string;
  owner: string;
  target: string;
  branch?: string;
  scope: "repo" | "org";
  // The stored key this scan was told to bill AI rules to. Absent runs none.
  aiKey?: string;
  status: ScanStatus;
  active?: true;
  installationId: number;
  account: string;
  repos: string[];
  scanned: ScanRepo[];
  findings: ScanFinding[];
  skippedRepos: number;
  error?: string;
  errorCode?: ErrorCode;
  filed: { repo: string; number: number; url: string }[];
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
};

export const scans = defineCollection<ScanDoc>("scans", [
  { keys: { owner: 1, createdAt: -1 } },
  { keys: { status: 1, createdAt: 1 } },
  {
    keys: { owner: 1 },
    options: { unique: true, partialFilterExpression: { active: true } },
  },
]);

export function serializeScan(doc: ScanDoc) {
  return {
    id: doc._id,
    target: doc.target,
    branch: doc.branch ?? null,
    scope: doc.scope,
    status: doc.status,
    repos: doc.repos,
    scanned: doc.scanned ?? [],
    findings: doc.findings,
    skippedRepos: doc.skippedRepos,
    error: doc.error ?? null,
    needsInstall: doc.errorCode === "install_required",
    filed: doc.filed,
    account: doc.account,
    createdAt: doc.createdAt.toISOString(),
    finishedAt: doc.finishedAt?.toISOString() ?? null,
  };
}

export type ScanView = ReturnType<typeof serializeScan>;
