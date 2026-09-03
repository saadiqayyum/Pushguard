export { defineCollection, ensureIndexes, indexesReady, rawDb } from "./client"
export * from "./limits"
export * from "./rules"
export * from "./installations"
export * from "./access"
export * from "./alerts"
export * from "./repos"
export * from "./scans"
export * from "./ai"
export * from "./code-index"
export * from "./review-sessions"
export * from "./pull-requests"

import * as rulesEntity from "./rules"
import * as installationsEntity from "./installations"
import * as accessEntity from "./access"
import * as alertsEntity from "./alerts"
import * as reposEntity from "./repos"
import * as scansEntity from "./scans"
import * as aiEntity from "./ai"
import * as codeIndexEntity from "./code-index"
import * as reviewSessionEntity from "./review-sessions"
import * as pullRequestEntity from "./pull-requests"

// Namespaced so a collection never collides with a local named `repos` or `scans`.
export const db = {
  rules: rulesEntity.rules,
  ruleVersions: rulesEntity.ruleVersions,
  disabledPacks: rulesEntity.disabledPacks,
  installations: installationsEntity.installations,
  repoAccess: accessEntity.repoAccess,
  alerts: alertsEntity.alerts,
  repos: reposEntity.repos,
  pushActors: reposEntity.pushActors,
  scans: scansEntity.scans,
  aiRules: aiEntity.aiRules,
  aiUsage: aiEntity.aiUsage,
  codeIndex: codeIndexEntity.codeIndex,
  indexJobs: codeIndexEntity.indexJobs,
  reviewSessions: reviewSessionEntity.reviewSessions,
  pullRequests: pullRequestEntity.pullRequests,
}
