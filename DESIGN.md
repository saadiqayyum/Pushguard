# Pushguard, Design

Org-wide push monitoring for GitHub. Detects force pushes and suspicious code
changes across every repo in an organization, opens tickets, identifies the
pushing account, and notifies the team. One GitHub App install covers all
repos, current and future.

## Decisions

| Area                 | Decision                                                                                                                                                                             | Rejected and why                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime              | Next.js (App Router) on Vercel, single app                                                                                                                                           | CF Worker + separate UI (two deploys, no benefit at this volume); Rust (bottleneck is network, not CPU; contributor friction)                                                                                                |
| Rule defaults        | The catalog ships as code in `lib/rules/catalog/`; the database holds only overrides                                                                                                 | Seeding a copy per account on install (one identical document per rule per account, and an improvement to a rule could never reach anybody already installed)                                                                |
| Rules storage        | MongoDB Atlas (rule body as document)                                                                                                                                                | Git-based rules repo (owner must know git, PR merge delay); Postgres (owner rejected migration/seeding workflow; indexes now created idempotently in code)                                                                   |
| Alerts storage       | GitHub issues in the repo that triggered them; optional single-repo override for central triage                                                                                      | Own alerts table (duplicates what issues give free: storage, search, triage UI, email notifications); mandatory dedicated repo (needs `administration:write` to create, which no org will grant a monitoring app)            |
| Repo/team pickers    | `repos` and `teams` cached on the installation doc, maintained by the installation, installation_repositories and team webhooks; one backfill call per install                       | Listing repos/teams from GitHub on each dashboard render (rate limit, latency, avoidable)                                                                                                                                    |
| Notification         | GitHub issue + `@mention` of team                                                                                                                                                    | Resend/SMTP (extra service; GitHub already emails on mention)                                                                                                                                                                |
| AI rules             | Their own kind of rule, firing on their own `paths`                                                                                                                                  | `ai` as a _field_ on a pattern rule (it only ran once the regex had already matched, so the model could never find what the pattern missed, which is the only reason to pay for it)                                          |
| AI review shape      | `scope: changed` bulk-loads and triages; `scope: repository` is a background session where the model navigates via tools                                                             | Running whole-repository review inline on the push (a tree walk plus an agent loop does not fit a 60s invocation); bulk-loading a whole repository (mostly re-reading unchanged code)                                        |
| Model access to code | Two tools, `read_file` and `find_references`, with paths validated server-side                                                                                                       | Handing the model a scoped GitHub token (every file it reads is attacker-controlled, so a credential plus an instruction channel plus an issue to publish into is an exfiltration path)                                      |
| Reference lookup     | A code index of paths and identifiers, built at install, maintained by the push webhook                                                                                              | GitHub code search (10 req/min, default branch only, lags reality); building a real call graph (a parser per language, which is a project, not a feature)                                                                    |
| Auth | Auth.js, GitHub OAuth only; user's org list captured at login; dashboard reachable by members and by collaborators found in `repo_access`; rules and model keys need membership | RBAC/roles table (org membership is the ACL); email/password (no reason to exist for a GitHub tool) |
| Tenancy              | Multi-tenant: `installations` collection registered by the GitHub App's installation webhook; alerts are filed in the repository that triggered them, no per-org target to configure | Env-based single tenant (owner wants to ship to multiple users); a configurable alerts repo (a setting nobody needs yet; the finding belongs with the code)                                                                  |
| GitHub client        | Octokit (`@octokit/app`): app JWT, installation token caching, typed endpoints; `@octokit/webhooks-methods` for signature verify                                                     | Hand-rolled JWT signing + fetch wrapper (replaced; official libraries own this)                                                                                                                                              |
| Model client | LangChain, one static import per provider and a switch | `initChatModel` (resolves the provider package through a computed `import()`, which a bundler cannot follow: on Next every model call failed with "Cannot find module as expression is too dynamic" before a request was made) |
| Structured output    | `withStructuredOutput(..., { method: "jsonSchema" })`                                                                                                                                | The default `functionCalling` method (it pins `tool_choice`, which Anthropic cannot do while thinking is on, so LangChain silently drops the pin and the call degrades to best-effort)                                       |
| Client HTTP          | One `api()` helper in `lib/api-client.ts`                                                                                                                                            | axios, scattered fetch calls                                                                                                                                                                                                 |
| Globs                | picomatch                                                                                                                                                                            | minimatch (larger, slower)                                                                                                                                                                                                   |
| Dedup                | Search open issues by commit SHA before creating                                                                                                                                     | DB dedup table (issues are already durable and queryable)                                                                                                                                                                    |
| Cache                | **None.** GitHub data is a webhook-maintained projection; our own data is read every time                                                                                            | 60s in-memory rule cache (removed: invalidation reached only the instance that handled the write, so a rule disabled because it was misfiring kept firing elsewhere for a minute); Redis/KV (a cache we do not want, hosted) |
| File reads           | One tree call for paths, sizes and hashes, then GraphQL batches of ~40 blobs                                                                                                         | The REST contents endpoint (one HTTP call per file, which made reading 200 files cost 200 calls)                                                                                                                             |
| Background work      | Mongo job queues drained inline by whatever triggered them, cron as mop-up                                                                                                           | Relying on the schedule (Vercel Hobby allows one cron run a day, so an index maintained by cron would be a day behind the code)                                                                                              |
| UI                   | shadcn/ui + Tailwind, neutral theme, no emojis                                                                                                                                       | Raw Tailwind only (rebuilds table/dialog/form poorly); MUI/AntD (runtime deps, heavy, off-aesthetic)                                                                                                                         |
| Public pages         | `app/(marketing)/` route group with its own token set scoped to `.site`; dashboard moved off `/` to `/dashboard`                                                                     | A separate marketing site (two deploys, and the landing page's whole point is that it runs a real scan)                                                                                                                      |
| Scan model           | Recent history read as one compare across the last 50 commits of the default branch, handed to the existing engine as a `PushContext`                                                | Cloning (bandwidth, no serverless filesystem); per-commit file listing (N+1 GitHub calls per repo)                                                                                                                           |
| Scan queue           | `scans` collection + `after()` on the invocation that queued it; cron is recovery only                                                                                               | SQS/QStash/Upstash (a service to run and pay for before there is load to justify it)                                                                                                                                         |
| Scan concurrency     | Unique partial index on `{owner}` where `active: true`                                                                                                                               | Read-then-write count check (two tabs both pass it)                                                                                                                                                                          |

| Filing findings | Explicit second action, gated on membership **and** the installation covering the repo | Filing on scan completion (a scan is a look, not a decision) |
| Install + sign-in | GitHub App "Request user authorization during installation" + Setup URL into a route handler that calls `signIn` | A custom OAuth code exchange (re-implements what Auth.js already owns) |

## Architecture

```
GitHub App (multi-tenant; permissions: metadata:read, contents:read,
issues:write, pull_requests:read, members:read)
        |
        v
Vercel - one Next.js app
  /api/webhook     verify -> engine -> after(alert + index + AI session)
  /api/scans*      enqueue -> after(runScan) -> findings; file on request
  /api/cron/scans  mop-up: stuck scans, index jobs, review sessions, access
  /api/rules*      dashboard backend (OAuth + membership guard)
  /api/ai*         model keys and AI rules
        |
        +-- MongoDB Atlas  (rules, projections, queues, code index)
        +-- GitHub API     (compare diffs, blob batches, issues)
        +-- A model        (the account's own key; no operator fallback)
```

No servers, no queues to run, no email service — GitHub emails on mention.

See `RUNTIME.md` for what runs when and how many API calls each path costs.

## File tree

```
app/
  (marketing)/          landing, how-to-use, about
  dashboard/            alerts / scans / rules / ai
  api/
    webhook/            GitHub events; the detection entry point
    rules/ ai-rules/    rule CRUD; ai/ manages model keys
    scans/              queue, poll, file findings
    cron/scans/         mop-up (CRON_SECRET)
    install/complete/   App Setup URL -> signIn -> dashboard
lib/
  engine.ts             rule matcher; pure, zero IO, unit-tested
  rules.ts              catalog + this account's overrides
  alerts.ts             dedup, diff, AST pass, issue composition
  scan.ts               scan lifecycle: quota, queue, run, file
  github.ts             the only GitHub client (tree, blob batches, issues)
  ai-rules.ts           scope: changed — bulk load and triage
  review-graph.ts       the two-stage triage/deep graph
  review-session.ts     scope: repository — the agent, resumable
  review-tools.ts       read_file / find_references; injected readers
  review-scope.ts       path validation; pure, the security boundary
  code-index.ts         index build and maintenance
  tokens.ts             identifier extraction; no grammar, no parser
  compact.ts            shrink source before a model is billed for it
  diff-context.ts       what a review sees before it reads anything
  db/client.ts          cached client, defineCollection, index registry
  db/<entity>.ts        one entity each: type, collection, indexes, queries
schemas/                zod contracts shared by API, UI and engine
lib/rules/catalog/      the 78 shipped rules
lib/rules/ai-examples.ts  AI rules offered in the dashboard
public/rules.example.yaml pattern-rule schema by example
```

Rules: `engine.ts` stays pure and unit-tested. GitHub IO goes through
Octokit in `lib/github.ts`, browser IO through `lib/api-client.ts`. No
comments narrating code; comments only for non-obvious constraints.

## Rule schema

See `public/rules.example.yaml` for the spec-by-example and `schemas/rule.ts` for
the enforced contract. Summary:

| Field           | Type                             | Meaning                                                                                           |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `id`            | kebab-case string                | unique per org                                                                                    |
| `description`   | string, optional                 | shown in ticket                                                                                   |
| `severity`      | low / medium / high / critical   | drives action                                                                                     |
| `enabled`       | bool, default true               | soft delete = disable                                                                             |
| `repos`         | glob[], optional                 | default all repos                                                                                 |
| `branches`      | glob[], optional                 | default all branches                                                                              |
| `paths`         | glob[], optional                 | changed-file match                                                                                |
| `exclude_paths` | glob[], optional                 | carve-outs                                                                                        |
| `change_type`   | subset of added/modified/removed | default all three                                                                                 |
| `all_of`        | glob[][], optional               | each group matched by a file in the same push                                                     |
| `when`          | object, optional                 | payload conditions: `forced`, `sender_first_push`, `branch_created`, `branch_deleted`, `hour_utc` |
| `added_lines`   | regex ≤500 chars, optional       | matched against `+` lines of diff                                                                 |
| `ai`            | prompt string, optional          | Claude analyzes the diff with this question                                                       |

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

| Route             | Method | Guard                       | Body / notes                                                           |
| ----------------- | ------ | --------------------------- | ---------------------------------------------------------------------- |
| `/api/webhook`    | POST   | HMAC + allowlist + size cap | GitHub payload; replies 202/204 fast                                   |
| `/api/rules`      | GET    | session + org member        | list rules for org                                                     |
| `/api/rules`      | POST   | session + org member + zod  | `{ rule }` -> created                                                  |
| `/api/rules/[id]` | PATCH  | session + org member + zod  | partial rule or `{ enabled }`                                          |
| `/api/rules/test` | POST   | session + org member + zod  | `{ rule, sample: { payload?, diff? } }` -> `{ matched, matchedFiles }` |
| `/api/alerts`     | GET    | session + org member        | proxied issue list                                                     |
| `/api/health`     | GET    | none                        | `{ ok: true }`                                                         |

## Database

MongoDB. One file per entity in `lib/db/`, each owning its type, its collection
declaration and its own indexes. Indexes are created idempotently on first
connection; there are no migrations.

| Collection                       | Holds                                                    |
| -------------------------------- | -------------------------------------------------------- |
| `installations`                  | one per account, plus encrypted model keys               |
| `rules`                          | overrides only — the catalog itself ships as code        |
| `rule_versions`                  | insert-only audit history                                |
| `ai_rules`                       | rules a model answers                                    |
| `ai_usage`                       | per-account daily review count, TTL 48h                  |
| `alerts`                         | mirror of filed issues, so the feed costs no GitHub call |
| `repos`                          | branch lists and default branch                          |
| `repo_access`                    | who can read what, as a projection                       |
| `push_actors`                    | first-push detection, one upsert per push                |
| `scans`                          | scan results; findings are held, not filed               |
| `code_index`                     | paths and identifiers per file, **never source**         |
| `index_jobs` / `review_sessions` | background work queues                                   |

Hard deletes happen only for projections the app can no longer maintain (a
repository removed from the installation). Scans, rules and filed alerts are the
account's own history and survive.

## Environment

```
MONGODB_URI
GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET
AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
ENCRYPTION_KEY            optional; required before an account can store a model key
CRON_SECRET               optional; required once set
```

There is no `GITHUB_ORG`, `ALERTS_REPO` or `ALERT_MENTION`: this is
multi-tenant, and those are per-account settings in the database.

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
  - `npm config set ignore-scripts true` remain the recommended baseline;
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
a free-text box makes _us_ decide what may be read, which is not a decision we
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
file in the _same_ push. `paths` asks "did this touch any of these?"; `all_of`
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
write, so a rule someone disabled _because it was firing wrongly_ kept firing
everywhere else for up to a minute. It saved one indexed Mongo query.

A **projection** is different. GitHub tells us what changed, and we apply it.
There is no expiry because there is no guess: the stored branch list is not a
copy of GitHub's; it is the current state as GitHub last reported it.

| Data                                     | First read                               | Kept current by                                           |
| ---------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Installation repos                       | one backfill per install                 | `installation`, `installation_repositories`, `repository` |
| Teams                                    | one backfill per install                 | `team`                                                    |
| Branches                                 | install backfill                         | `create`, `delete`, `push`                                |
| Default branch, visibility               | same read, or free from any push         | `repository`, `public`, `push`                            |
| **Who can read what**                    | `GET /collaborators` per repo at install | `member`, `membership`, `team`, `organization`            |
| Alert state, assignment, acknowledgement | written when we file                     | `issues`, `issue_comment`                                 |
| Push actors                              | ,                                        | `push`                                                    |

Every `push` self-heals the record it touches, so a missed `create` or a
repository that predates the subscription corrects itself on the next push
rather than needing a resync job.

### No GitHub call answers a request

Every endpoint the browser can reach is served from MongoDB. Two GitHub calls
survive on the write path, and both _are_ the action rather than a lookup:
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

### Pull requests

Open pull requests are a projection like the rest: `pull_requests` is seeded
per repository at install, upserted by the `pull_request` webhook, and a closed
or merged one is deleted. The tab reads it through the same `repo_access` gate
as alerts. The GitHub App must subscribe to the `pull_request` event.

Rules run on pushes unless `on` includes `pull_request`. On a pull request,
`branches` matches the base, the branch the rule guards, and the shipped rules
all bind to main. A pull request is evaluated as a whole, `base.sha...head.sha`, on opened, reopened, synchronize
and ready_for_review, and the alert threads on repeat rather than filing again.
The alert is an issue as always; the pull request gets one comment pointing at
it, on first filing only. Dedup by commit is per source: the branch push and
the pull request carrying the same head are two events. The default keeps
existing rules push-only, otherwise every commit would fire twice.

### Issue operations, and which ones mean something

The `issues` event carries twenty actions. Three change what we store, two end
the record, and the rest only prove somebody looked.

| Action                           | Effect                                   |
| -------------------------------- | ---------------------------------------- |
| `closed` / `reopened`            | state                                    |
| `assigned` / `unassigned`        | the assignee list                        |
| `edited`                         | title                                    |
| `deleted` / `transferred`        | the row is dropped. It points at nothing |
| `unlabeled` removing `pushguard` | the row is dropped. No longer ours       |
| anything else, by a person       | acknowledgement only                     |

`deleted` and `transferred` are checked _before_ the label filter, because by
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
