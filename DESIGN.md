# Pushguard, Design

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
| Tenancy | Multi-tenant: `installations` collection registered by the GitHub App's installation webhook; alerts are filed in the repository that triggered them, no per-org target to configure | Env-based single tenant (owner wants to ship to multiple users); a configurable alerts repo (a setting nobody needs yet; the finding belongs with the code) |
| GitHub client | Octokit (`@octokit/app`): app JWT, installation token caching, typed endpoints; `@octokit/webhooks-methods` for signature verify | Hand-rolled JWT signing + fetch wrapper (replaced; official libraries own this) |
| Claude client | Plain fetch to `ANTHROPIC_BASE_URL` (owner's Orkest LLM gateway; falls back to api.anthropic.com), forced tool-use JSON | `@anthropic-ai/sdk` (owner declined the dependency at this stage; one endpoint does not need an SDK) |
| Client HTTP | One `api()` helper in `lib/api-client.ts` | axios, scattered fetch calls |
| Globs | picomatch | minimatch (larger, slower) |
| Dedup | Search open issues by commit SHA before creating | DB dedup table (issues are already durable and queryable) |
| Cache | **None.** GitHub data is a webhook-maintained projection; our own data is read every time | 60s in-memory rule cache (removed: invalidation reached only the instance that handled the write, so a rule disabled because it was misfiring kept firing elsewhere for a minute); Redis/KV (a cache we do not want, hosted) |
| UI | shadcn/ui + Tailwind, neutral theme, no emojis | Raw Tailwind only (rebuilds table/dialog/form poorly); MUI/AntD (runtime deps, heavy, off-aesthetic) |
| Public pages | `app/(marketing)/` route group with its own token set scoped to `.site`; dashboard moved off `/` to `/dashboard` | A separate marketing site (two deploys, and the landing page's whole point is that it runs a real scan) |
| Scan model | Recent history read as one compare across the last 50 commits of the default branch, handed to the existing engine as a `PushContext` | Cloning (bandwidth, no serverless filesystem); per-commit file listing (N+1 GitHub calls per repo) |
| Scan queue | `scans` collection + `after()` on the invocation that queued it; cron is recovery only | SQS/QStash/Upstash (a service to run and pay for before there is load to justify it) |
| Scan concurrency | Unique partial index on `{owner}` where `active: true` | Read-then-write count check (two tabs both pass it) |
| Guest identity | httpOnly UUID cookie, quota counted against the cookie **and** the IP | Nothing (a free GitHub proxy); accounts (defeats the point of a guest scan) |
| Guest scan credentials | Optional `GITHUB_SCAN_TOKEN`, anonymous Octokit as the fallback | An App installation token (scoped to that installation's repos, useless for arbitrary public code) |
| Filing findings | Explicit second action, gated on membership **and** the installation covering the repo | Filing on scan completion (a scan is a look, not a decision) |
| Install + sign-in | GitHub App "Request user authorization during installation" + Setup URL into a route handler that calls `signIn` | A custom OAuth code exchange (re-implements what Auth.js already owns) |

## Architecture

```
GitHub App (org install: push, installation, installation_repositories and
team webhooks; permissions: contents:read, issues:write, members:read)
        |
        v
Vercel - one Next.js app
  /api/webhook     ingest -> engine -> waitUntil(AI + issue)
  /api/scans*      enqueue -> after(runScan) -> findings; file on request
  /api/cron/scans  drain the queue, requeue scans stuck > 5 min
  /api/rules*      dashboard backend (OAuth + org-member guard)
  marketing        landing (live scan) / how-to-use / about / scan/[id]
  dashboard        alerts / scans / rules
        |
        +-- Neon Postgres  (rules, rule_versions, installations)
        +-- GitHub API     (compare diffs, issues, membership)
        +-- Claude API     (Haiku, flagged pushes only)
```

No servers, no queues, no email service. Cost: $0 + AI pennies.

## File tree

```
app/
  (marketing)/
    page.tsx              landing; the hero is a live guest scan
    how-to-use/page.tsx   the seven-step walkthrough
    about/page.tsx        why it exists and what it refuses to do
    scan/[id]/page.tsx    a scan result, shareable, no account needed
  dashboard/
    page.tsx              alerts feed (reads GitHub issues)
    scans/page.tsx        scan history + new scan
    rules/page.tsx        rules table + builder form + dry-run panel
  api/
    webhook/route.ts      POST  GitHub push events
    rules/route.ts        GET list, POST create
    rules/[id]/route.ts   PATCH update/disable
    rules/test/route.ts   POST dry-run rule against sample
    alerts/route.ts       GET proxy of security-alerts issues
    scans/route.ts        POST queue a scan (guest or member)
    scans/[id]/route.ts   GET status + findings (the poll target)
    scans/[id]/file/      POST file the findings as GitHub issues
    cron/scans/route.ts   GET drain the queue (CRON_SECRET)
    install/complete/     GET App Setup URL -> signIn -> dashboard
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
  scan.ts        scan lifecycle: quota, queue, run, file findings
  scan-target.ts pure URL/remote/path -> {owner, repo}; unit-tested
  install-url.ts the one place the GitHub App install link is built
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
  org-switcher.tsx, install-prompt.tsx
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
| `all_of` | glob[][], optional | each group matched by a file in the same push |
| `when` | object, optional | payload conditions: `forced`, `sender_first_push`, `branch_created`, `branch_deleted`, `hour_utc` |
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
push_actors    _id `${repo}\0${sender}`, repo, sender, firstSeenAt, pushes
               one upsert per push; upsertedCount === 1 is "first push"
               index (repo, firstSeenAt)
scans          _id uuid pk, owner (a login, or guest:<uuid>), guest bool, ip,
               target, scope, status, active (present only while queued or
               running), installationId?, repos[], findings[], filed[],
               createdAt / startedAt / finishedAt
               index (owner, createdAt), (ip, createdAt), (status, createdAt)
               unique (owner) where active:true   -- one live scan per owner
               TTL 30d on createdAt where guest:true
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
GITHUB_SCAN_TOKEN         optional; read-only public token for guest scans
CRON_SECRET               optional; required once set
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
- Real queue for scans (QStash/SQS): when one scan exceeds the 60s function
  cap, or scans/hour goes past roughly 1000
- Deeper scans (full history, every branch): today's window is 50 commits on
  the default branch, which costs one compare call per repository
- Deep AST scanning: bolt Semgrep onto flagged pushes, never grow the engine

## Scanning

A scan answers "what would Pushguard say about this repository?" without waiting
for the next push. Three GitHub reads per repository, metadata, the commit
window, one compare across it, produce a `PushContext` the existing engine
already knows how to evaluate.

A scan cannot answer every rule, and says so rather than guessing: `when` rules
describe the push event, and an AI-only rule needs a paid read of the diff a
scan deliberately skips. Both are dropped by `scannableRules`. The force-push
rule. The reason the product exists, is exactly the one a scan cannot see,
because a force push destroys the evidence. That is the argument for installing,
made by the product rather than by the copy.

### Authorization

The first version took a repository name in a text box and gated scanning on
`memberScopes`, org membership from `GET /user/orgs`. That was wrong twice
over. Org membership is not repository access, so any member of an installed
org could read diffs from private repositories they cannot open on GitHub; and
a free-text box makes *us* decide what may be read, which is not a decision we
have the information to make.

Both are replaced by one rule: **GitHub decides.**
`GET /user/installations/{id}/repositories`, called with the user's own token,
returns exactly the repositories they have explicit read access to inside an
installation. The picker renders that list; `enqueueScan` fetches it again and
rejects anything not in it. `fileScanFindings` fetches it a third time, because
findings outlive the access that produced them.

There is no unauthenticated path. Reading still happens with the installation
token. It is the only credential that can fetch a diff. But only for
repositories already narrowed by the check above.

Branch selection runs through the same gate. `/api/scan-branches` re-fetches the
accessible list before it will enumerate a repository's refs, and the branch name
is validated as a git ref (slashes allowed, `..` and leading or trailing slashes
refused) before it reaches `GET /commits?sha=`. A branch is only accepted
alongside a single repository: an account-wide scan reads each repository's own
default, because branch names are not shared across repositories.

### The alerts feed

Same rule, same reason. The feed was `requireMember(org)` plus a search on the
installation token, which returns every repository the app was granted. So a
member could read alert titles, repository names and issue links from private
repositories they cannot open on GitHub. It now searches with the reader's own
token, so GitHub returns only what they can already see.

Filtering the installation-token results afterwards would have been the obvious
patch and the wrong one: `total_count` comes back from GitHub before any
filtering, so the feed would have promised "25 of 100" above three rows.

One search still runs on an installation token, `findOpenAlertBySha`, the
webhook's dedup check. It has no user in the request, is scoped to one
repository the installation owns, and returns a boolean, so there is no access
to narrow.

## Guard rails, restated

Every user-facing read of GitHub data goes through the caller's own token:
scanning (`listUserInstallationRepos`), filing findings (the same call, again,
at write time) and the alerts feed (`listAlertIssues`). Installation tokens are
used only where no reader is present. The webhook path, or after the set of
repositories has already been narrowed by one of those checks.

## Push-behaviour rules

Everything that reads a diff is a crowded market, secret scanning, Socket,
Semgrep, CodeQL all do it, several of them better. The axis nothing else covers
is the **act of pushing**: who, when, forced, and what was touched together.

Two primitives serve it.

`all_of` takes groups of globs and requires each group to be matched by some
file in the *same* push. `paths` asks "did this touch any of these?"; `all_of`
asks "did one push touch all of these areas?". Which is the difference between
a routine CI edit and a CI edit in the push that also rewrote who reviews it.
It costs nothing extra: the changed-file list is already in the payload, and
scans can answer it too.

`when.sender_first_push` is the first stateful signal in the product. The
engine stays pure, so the webhook answers it before evaluation and hands it in
as a boolean, the same way `forced` arrives. One upsert into `push_actors`
records the push and reports whether it inserted; the unique `_id` means two
racing pushes cannot both be called the first. Branch deletions are skipped. They carry no commits, and letting one consume the "first push" would make the
account's next real push look routine.

Neither rule is loud on its own. A first push is not suspicious; it is context
for everything else in the feed, which is why it is `medium` and not `high`.

## Webhook-first, and why there is no cache

Two different things get confused under "caching", and only one of them is here.

A **cache** stores a copy and guesses when it went stale. A TTL, a
revalidation, a window during which the app is knowingly wrong. There is none
of that in this app any more. The one that existed, a 60-second rule cache, was
removed: invalidation only reached the serverless instance that handled the
write, so a rule someone disabled *because it was firing wrongly* kept firing
everywhere else for up to a minute. It saved one indexed Mongo query.

A **projection** is different. GitHub tells us what changed, and we apply it.
There is no expiry because there is no guess: the stored branch list is not a
copy of GitHub's; it is the current state as GitHub last reported it.

| Data | First read | Kept current by |
|---|---|---|
| Installation repos | one backfill per install | `installation`, `installation_repositories`, `repository` |
| Teams | one backfill per install | `team` |
| Branches | install backfill | `create`, `delete`, `push` |
| Default branch, visibility | same read, or free from any push | `repository`, `public`, `push` |
| **Who can read what** | `GET /collaborators` per repo at install | `member`, `membership`, `team`, `organization` |
| Alert state, assignment, acknowledgement | written when we file | `issues`, `issue_comment` |
| Push actors |, | `push` |

Every `push` self-heals the record it touches, so a missed `create` or a
repository that predates the subscription corrects itself on the next push
rather than needing a resync job.

### No GitHub call answers a request

Every endpoint the browser can reach is served from MongoDB. Two GitHub calls
survive on the write path, and both *are* the action rather than a lookup:
reading a repository in order to scan it, and creating the issue when someone
files findings. There is no scanning without reading.

Access. Which repositories a user may read, is the hard one, and it is a
projection like the rest. It is seeded from `GET /collaborators`, which is
GitHub's own flattening of org role, team grants and direct collaboration, so
this app never reimplements that model. Grants are stored as a set of reasons
rather than a boolean, because access overlaps: losing a team must not revoke
someone who is also a direct collaborator.

**The risk this buys, stated plainly.** Asking GitHub on every request could
never be wrong. A projection can: GitHub does not emit an event for every way
access can change, and a delivery can fail. A miss leaves someone with access
they should have lost, and it does not expire on its own. Which is why
`reconcileAccess` re-reads the collaborator lists on the cron rather than
trusting the event stream forever.

### Issue operations, and which ones mean something

The `issues` event carries twenty actions. Three change what we store, two end
the record, and the rest only prove somebody looked.

| Action | Effect |
|---|---|
| `closed` / `reopened` | state |
| `assigned` / `unassigned` | the assignee list |
| `edited` | title |
| `deleted` / `transferred` | the row is dropped. It points at nothing |
| `unlabeled` removing `pushguard` | the row is dropped. No longer ours |
| anything else, by a person | acknowledgement only |

`deleted` and `transferred` are checked *before* the label filter, because by
the time they arrive the label may already be gone with the issue.

Two things are deliberately not acknowledgement: `opened`, which is this app
filing the alert, and anything sent by a Bot, which is this app acting on its
own ticket. Otherwise every alert would look attended the moment it was
created.

Acknowledgement and assignment answer different questions and both are kept.
"Somebody glanced at this" is not "somebody owns this", and an unassigned
critical is the one worth putting at the top of a feed.

### The one event that is not a heuristic

`public`. A private repository made public, files a critical alert with no
rule involved. Every other detection is a judgement a rule can tune or turn
off. This one is not: the code was private, someone made it public, and the
whole history is now readable by anyone, including any credential ever
committed to it. Making it private again does not un-publish what was fetched
or indexed in between, and GitHub sends no inverse event, so there is nothing
to wait for.
