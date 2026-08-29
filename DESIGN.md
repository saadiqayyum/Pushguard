# Pushguard — Design

Org-wide push monitoring for GitHub. Detects force pushes and suspicious code
changes across every repo in an organization, opens tickets, identifies the
pushing account, and notifies the team. One GitHub App install covers all
repos, current and future.

## Decisions

| Area | Decision | Rejected and why |
|---|---|---|
| Runtime | Next.js (App Router) on Vercel, single app | CF Worker + separate UI (two deploys, no benefit at this volume); Rust (bottleneck is network, not CPU; contributor friction) |
| Rule defaults | `lib/default-rules.ts`, seeded on install (webhook + self-register fallback), only when the org has zero rules | Manual seed script (an org that skips it detects nothing); reading rules.example.yaml at runtime (serverless filesystem is not dependable) |
| Rules storage | MongoDB Atlas (rule body as document) | Git-based rules repo (owner must know git, PR merge delay); Postgres (owner rejected migration/seeding workflow; indexes now created idempotently in code) |
| Alerts storage | GitHub issues in the repo that triggered them; optional single-repo override for central triage | Own alerts table (duplicates what issues give free: storage, search, triage UI, email notifications); mandatory dedicated repo (needs `administration:write` to create, which no org will grant a monitoring app) |
| Repo/team pickers | `repos` and `teams` cached on the installation doc, maintained by the installation, installation_repositories and team webhooks; one backfill call per install | Listing repos/teams from GitHub on each dashboard render (rate limit, latency, avoidable) |
| Notification | GitHub issue + `@mention` of team | Resend/SMTP (extra service; GitHub already emails on mention) |
| AI analysis | Claude Haiku, second stage, escalate-only | Writing own malware scanner (unwinnable); AI as first filter (cost, latency) |
| Auth | Auth.js, GitHub OAuth only; user's org list captured at login; per-request guard = membership of the target org | RBAC/roles table (org membership is the ACL); email/password (no reason to exist for a GitHub tool) |
| Tenancy | Multi-tenant: `installations` collection registered by the GitHub App's installation webhook; per-org alertsRepo/alertMention picked from cached repo/team lists in the dashboard | Env-based single tenant (owner wants to ship to multiple users); free-text repo/mention fields (typos fail silently — a bad @mention renders as plain text and emails nobody) |
| GitHub client | Octokit (`@octokit/app`): app JWT, installation token caching, typed endpoints; `@octokit/webhooks-methods` for signature verify | Hand-rolled JWT signing + fetch wrapper (replaced; official libraries own this) |
| Claude client | Plain fetch to `ANTHROPIC_BASE_URL` (owner's Orkest LLM gateway; falls back to api.anthropic.com), forced tool-use JSON | `@anthropic-ai/sdk` (owner declined the dependency at this stage; one endpoint does not need an SDK) |
| Client HTTP | One `api()` helper in `lib/api-client.ts` | axios, scattered fetch calls |
| Globs | picomatch | minimatch (larger, slower) |
| Dedup | Search open issues by commit SHA before creating | DB dedup table (issues are already durable and queryable) |
| Cache | Module-scope memory, 60s TTL | Redis/KV (loss of cache = one cheap DB query) |
| UI | shadcn/ui + Tailwind, neutral theme, no emojis | Raw Tailwind only (rebuilds table/dialog/form poorly); MUI/AntD (runtime deps, heavy, off-aesthetic) |

## Architecture

```
GitHub App (org install: push, installation, installation_repositories and
team webhooks; permissions: contents:read, issues:write, members:read)
        |
        v
Vercel - one Next.js app
  /api/webhook     ingest -> engine -> waitUntil(AI + issue)
  /api/rules*      dashboard backend (OAuth + org-member guard)
  dashboard        alerts / rules / settings
        |
        +-- Neon Postgres  (rules, rule_versions, installations)
        +-- GitHub API     (compare diffs, issues, membership)
        +-- Claude API     (Haiku, flagged pushes only)
```

No servers, no queues, no email service. Cost: $0 + AI pennies.

## File tree

```
app/
  (dashboard)/
    page.tsx              alerts feed (reads GitHub issues)
    rules/page.tsx        rules table + builder form + dry-run panel
    settings/page.tsx     config checklist (env, app install, webhook)
  api/
    webhook/route.ts      POST  GitHub push events
    rules/route.ts        GET list, POST create
    rules/[id]/route.ts   PATCH update/disable
    rules/test/route.ts   POST dry-run rule against sample
    alerts/route.ts       GET proxy of security-alerts issues
    health/route.ts       GET uptime
lib/
  github.ts      Octokit-based GitHub client (installation auth, compare,
                 issues, user orgs); errors normalized to AppError
  ai.ts          Claude analysis via @anthropic-ai/sdk (optional gateway
                 base URL); fail-open
  engine.ts      rule matcher - pure functions, zero IO, unit-tested
  rules.ts       active rules from DB, per-org memory cache 60s
  alerts.ts      ticket composition: dedup, diff, AI stage, issue creation
  rule-notify.ts rule changes raise their own alert issues
  auth.ts        Auth.js (GitHub OAuth only) + requireUser/requireMember
  tenant.ts      org resolution: session orgs x installations x cookie
  api-client.ts  the one client-side fetch helper
  logger.ts      structured JSON lines to stdout
  errors.ts      AppError + error codes
  route.ts       withErrorHandler route wrapper
  env.ts         zod-validated env, fails at boot
  db/index.ts    Mongo client, typed collections, idempotent indexes
schemas/
  rule.ts        zod rule schema (the contract; UI, API, engine all use it)
  webhook.ts     partial zod parse of push/installation payloads
  api.ts         request/response bodies
components/
  ui/            shadcn primitives
  rules-view.tsx rules table + create dialog
  rule-form.tsx  builder with define/test tabs and dry-run
  org-switcher.tsx, org-settings-form.tsx, install-prompt.tsx
scripts/validate-rules.ts  checks rules.example.yaml against the schema
```

Rules: `engine.ts` stays pure and unit-tested. GitHub IO goes through
Octokit in `lib/github.ts`, browser IO through `lib/api-client.ts`. No
comments narrating code; comments only for non-obvious constraints.

## Rule schema

See `rules.example.yaml` for the spec-by-example and `schemas/rule.ts` for
the enforced contract. Summary:

| Field | Type | Meaning |
|---|---|---|
| `id` | kebab-case string | unique per org |
| `description` | string, optional | shown in ticket |
| `severity` | low / medium / high / critical | drives action |
| `enabled` | bool, default true | soft delete = disable |
| `repos` | glob[], optional | default all repos |
| `branches` | glob[], optional | default all branches |
| `paths` | glob[], optional | changed-file match |
| `exclude_paths` | glob[], optional | carve-outs |
| `change_type` | subset of added/modified/removed | default all three |
| `when` | object, optional | payload conditions: `forced`, `branch_created`, `branch_deleted`, `hour_utc` |
| `added_lines` | regex ≤500 chars, optional | matched against `+` lines of diff |
| `ai` | prompt string, optional | Claude analyzes the diff with this question |

Semantics: all present fields AND together; rules OR together; a rule must
have at least one condition. `paths`/`when` rules need zero GitHub reads
(webhook payload carries changed-file lists). `added_lines`/`ai` rules
trigger one compare-API call, only when their `paths` already matched.

Severity to action: critical/high = issue + team mention (mention emails),
medium = issue, low = issue without labels for digest triage.

## Webhook flow

```
1. verify X-Hub-Signature-256 (timing-safe)         -> 401 on fail
2. event allowlist: push only                        -> 204 ignore others
3. payload size cap (1 MB)                           -> 413
4. ignore own pushes and configured bot accounts     -> 204
5. zod-parse needed fields only
6. load rules (DB, cached)                           -> match when/paths
7. content rules matched by path? fetch compare diff (cap 50 KB, mark truncated)
8. run added_lines regexes
9. no matches -> 204. matches -> respond 202, then in waitUntil:
   a. AI stage for matched ai-rules (failure degrades: ticket notes
      "analysis unavailable"; AI may escalate/annotate, never suppress)
   b. dedup: search open issues for head SHA -> skip if found
   c. create issue: repo, ref, sender.login, pusher.email, before/after
      SHAs, matched rule ids, matched files, AI verdict, @team mention
```

Idempotency: `X-GitHub-Delivery` logged; SHA dedup makes redeliveries safe.

## Rule integrity

Dashboard access = org membership, so a compromised account could disable
rules before attacking. Counter: every rule create/update/disable writes a
`rule_versions` row AND opens a notification issue mentioning the owner.
Rule changes are themselves alerts.

## API contracts

All responses: success `{ data }`, failure `{ error: { code, message } }`.
Error codes: `unauthorized`, `forbidden`, `invalid_signature`,
`validation_failed`, `not_found`, `rate_limited`, `upstream_github`,
`upstream_ai`, `internal`.

| Route | Method | Guard | Body / notes |
|---|---|---|---|
| `/api/webhook` | POST | HMAC + allowlist + size cap | GitHub payload; replies 202/204 fast |
| `/api/rules` | GET | session + org member | list rules for org |
| `/api/rules` | POST | session + org member + zod | `{ rule }` -> created |
| `/api/rules/[id]` | PATCH | session + org member + zod | partial rule or `{ enabled }` |
| `/api/rules/test` | POST | session + org member + zod | `{ rule, sample: { payload?, diff? } }` -> `{ matched, matchedFiles }` |
| `/api/alerts` | GET | session + org member | proxied issue list |
| `/api/health` | GET | none | `{ ok: true }` |

## Database

```
installations  id uuid pk, org text unique, github_install_id text,
               settings jsonb, created_at
rules          id uuid pk, org text, body jsonb (zod-validated),
               enabled bool, created_by text, created_at, updated_at
               index (org, enabled)
rule_versions  id uuid pk, rule_id fk, body jsonb, action
               (created|updated|disabled), changed_by text, changed_at
```

Hard deletes never happen. `rule_versions` is insert-only audit history.

## Environment

```
DATABASE_URL              Neon
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
GITHUB_ORG                the org this deployment guards
ALERTS_REPO               e.g. org/security-alerts
ALERT_MENTION             e.g. @org/security-team
ANTHROPIC_API_KEY
AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
```

`lib/env.ts` zod-validates all of these at boot; misconfiguration fails the
deploy, not a 3 a.m. request.

## Guards summary

- HMAC signature, timing-safe compare, before any parsing
- Event and size caps at the door
- Regex patterns compile-checked and length-capped at write time (ReDoS)
- Invalid rule rows logged and skipped, never crash the engine
- Diff and AI input capped and truncation-flagged
- AI is escalate-only; a regex match always tickets regardless of AI output
- Diff content is attacker-controlled: AI prompt treats it as data, verdict
  is advisory, nothing auto-closes
- Sanitized errors to clients; structured logs with requestId server-side
- Prevention still first: org ruleset blocking force pushes + org-wide 2FA
  + `npm config set ignore-scripts true` remain the recommended baseline;
  Pushguard is the detection layer

## Out of scope v1 (with triggers to add)

- Alerts table / analytics: add Postgres tables when issue search gets clumsy
- Multi-org SaaS billing: `installations` table already keyed by org
- Rate limiting on APIs: Upstash Redis if public abuse appears
- Deep AST scanning: bolt Semgrep onto flagged pushes, never grow the engine
