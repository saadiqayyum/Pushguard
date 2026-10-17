# Pushguard, Design

Org-wide push monitoring for GitHub. One GitHub App install per account watches
every repository, evaluates each push and pull request against rules, and files
alerts as GitHub issues naming the pushing account. This file holds decisions
and what they replaced; `RUNTIME.md` shows what runs when; `CLAUDE.md` holds the
working rules.

## Decisions

| Area | Decision | Rejected and why |
|---|---|---|
| Runtime | One Next.js (App Router) app on Vercel | CF Worker + separate UI (two deploys); Rust (the bottleneck is network, not CPU) |
| Database | Supabase Postgres through Drizzle, migrations in `drizzle/` | MongoDB (the previous store: no row-level security, so tenant isolation lived only in application filters; no queue, so background work rode on `after()` and a cron) |
| Tenant isolation | Row-level security, forced on every `app` table. The app connects as `pushguard` (`NOINHERIT`) and each transaction switches to `pushguard_app` with `app.login` set (`withUser`) or to `pushguard_system` (`asSystem`) | Filtering in queries (one forgotten `where` leaks a tenant); `BYPASSRLS` for the system role (a table without policies would be open to it instead of closed) |
| System handle | `asSystem` only in the webhook, runner routes, `lib/jobs`, sign-in and scripts; `no-restricted-imports` enforces it | Letting routes elevate (a route bug becomes a cross-tenant read) |
| Responses | `respond(schema, data)` with a zod output schema per route; secrets live in columns no schema names and the app role cannot select | Returning rows (a new column ships to the browser by default) |
| Background work | One pgmq queue. An insert trigger wakes `/api/jobs/run` through `pg_net`; a one-minute `pg_cron` check wakes it only when a delayed job is due | `after()` on the request (work dies with the invocation and is not retried); Vercel cron drains (Hobby runs once a day); QStash / SQS (another service before there is load) |
| Webhook | Verify, dedupe on the delivery id, update projections, enqueue, answer. No GitHub or model call inside | Doing the work inline (slow and unretried; a failure loses the event) |
| Missed deliveries | The first webhook per 15 minutes queues a reconcile of the App's delivery log: redeliver failures, meta-alert after 3 attempts | Trusting delivery (GitHub does not redeliver on its own); a scheduled reconcile (the schedule is the thing we do not have) |
| Retries | 5 attempts per job; a rate limit sets the visibility timeout to the reset; exhaustion files a finding | Silent drop (a reader cannot tell "not evaluated" from "clean") |
| Auth | Auth.js with the GitHub App's own OAuth client; user token refreshed by refresh token | Supabase Auth (a second identity model); a custom OAuth exchange |
| Roles | Mirror GitHub: `org_members` (admin / member) filled at install and by `organization` webhooks, own role re-read at sign-in; `repo_access` for collaborators. `requireTenant` / `requireAdmin` resolve the org | A roles table we invent (drifts from GitHub); org membership as repository access (members could read private repos they cannot open) |
| Rule defaults | The catalog ships as code in `lib/rules/catalog/`; the database holds overrides and custom rules, keyed by org | Seeding a copy per account (a rule fix never reaches existing installs) |
| Staff rules | One concept, the rule: staff publish new or changed rules to `platform_rules`, signed with ed25519, versioned, run in shadow before publish; an org switches one off like any catalog rule. Checks (sandbox scripts) are a separate signed artifact a rule's response names by id | Playbooks as a second detection kind with their own tables, editor and per-org toggle (two words for one idea, two code paths for the same matching) |
| Rule writes | Admin only, enforced by RLS (`authz.is_admin`); every change writes `rule_versions` | Member writes (a compromised member disables a rule before attacking) |
| Alerts | GitHub issues in the repository that triggered them, mirrored to `alerts`; a public repo gets the alert without the matched lines | Own alert UI only (issues give storage, search, triage and email free); a central alerts repo (needs `administration`) |
| Dedup | Thread onto the open alert for the same rules, tracked in `alerts` | Searching issues by SHA (rate-limited and racy) |
| Out-of-band | Slack-compatible webhook sinks per org, URL sealed with `secret-box`; Discord through `/slack`. Meta-alerts go only there | Email (another service); meta-alerts as issues (the actor can close them) |
| Projections | Repos, branches, members, access, open PRs, alert state: seeded at install, maintained by webhooks | Reading GitHub per request (rate limit, latency); a TTL cache (knowingly wrong for a window) |
| Cache | None | A 60 s in-memory rule cache (removed: invalidation reached one instance, so a disabled rule kept firing elsewhere) |
| GitHub client | Octokit (`@octokit/app`) with throttling and retry plugins, all in `lib/github.ts` | Hand-rolled JWT and fetch |
| File reads | One tree call for paths, sizes and hashes, then GraphQL batches of 40 blobs | REST contents (one call per file) |
| AI rules | Their own rule kind, firing on their own `paths` | `ai` as a field on a pattern rule (it could only see what the regex already found) |
| AI review shape | `scope: changed` batch-loads and triages inside the push job; `scope: repository` is a resumable `review_session` job where an agent navigates with tools | Whole-repo review inline (does not fit one job); bulk-loading a repository |
| Model access to code | Two tools, `read_file` and `find_references`, with paths validated server-side and readers injected | A scoped GitHub token for the model (credential plus instruction channel plus an issue to publish into) |
| Reference lookup | Code index of paths and identifiers, never source; built at install, maintained by push jobs, built on demand by a review | GitHub code search (10 req/min, default branch only, lags) |
| Model client | LangChain with one static import per provider; LangGraph for the triage graph and the ReAct agent | `initChatModel` (computed `import()`; the Next bundler cannot follow it) |
| Structured output | `withStructuredOutput(..., { method: "jsonSchema" })` validated by zod | `functionCalling` (pins `tool_choice`, which Anthropic drops while thinking is on) |
| Model keys | The org's own keys, sealed at rest, decrypted at call time; per-org daily review cap | An operator fallback key (the operator pays for every tenant's loop) |
| Detonation | In Pushguard's own private runner repo (`RUNNER_REPO`) on GitHub-hosted Actions, with a monthly quota per org, dispatched with a one-time nonce; a Go detonator runs install / import / execute without network | Running payloads on our infrastructure; self-hosted runners; a runner repo per org (setup each org had to do, and a workflow each org could edit); a token in the workflow |
| Scan model | Last 50 commits of a branch read as one compare and handed to the engine as a `PushContext` | Cloning (no serverless filesystem); per-commit listing (N+1 calls) |
| Scan concurrency | Unique partial index on `owner` where `active` | Read-then-write count (two tabs both pass) |
| User-queued jobs | Only through `app.enqueue_scan` and `app.enqueue_scan_filing`, `SECURITY DEFINER`, ownership checked | Queue access for the app role (a user could forge a push job that runs as the system) |
| Filing scan findings | A separate action; access re-checked per repository at filing time | Filing on completion (a scan is a look, not a decision) |
| Limits | Per-login, per-installation and per-credential windows in `rate_limits`, counted by `app.hit_rate_limit` | Upstash / Redis (a service for a counter) |
| UI | shadcn/ui, Tailwind, lucide, neutral theme, no emojis | MUI / AntD |
| Globs | picomatch | minimatch |

## Architecture

```
GitHub App ──webhook──> /api/webhook ──> projections + pgmq "jobs"
                                              │ insert trigger / pg_cron (due only)
                                              v
                              /api/jobs/run (bearer) ──> lib/jobs/*
                                 │            │             │
                              GitHub API   model (org key)  Slack / Discord sinks
                                 │
                       label pg-<nonce> ──> runner repo ──> /api/runner/{fetch,report}

Browser ──> /api/* (userRoute: session, per-login limit, withUser) ──> Postgres under RLS
```

## Layout

```
app/api/webhook/        GitHub events: verify, dedupe, route to lib/webhook/*
app/api/jobs/run/       queue consumer, woken by pg_net
app/api/runner/         fetch (nonce -> tarball) and report (token -> result)
app/api/*               user routes: parse, guard, call lib/, respond()
lib/db/client.ts        roles, withUser / asSystem, q()
lib/db/<entity>.ts      one table each: schema, policies, indexes, queries
lib/webhook/            per-event handlers, projections only
lib/jobs/               one handler per job type; run.ts dispatches and retries
lib/engine.ts           rule matcher; pure
lib/alerts.ts           diff confirm, x-ray, issue composition, threading, sinks
lib/scan*.ts            queue (scan.ts), run (scan-run.ts), file (scan-filing.ts)
lib/review-*.ts         AI: graph, session, agent rule, orientation, tools, scope
lib/runner/             dispatch, report sanity, findings
lib/tenant.ts           requireTenant / requireAdmin
drizzle/                migrations: roles, tables, RLS, grants, queue, wake-up
runner/  detonator/     the tenant workflow and the Go detonator
```

## Rule schema

`public/rules.example.yaml` is the spec by example; `schemas/rule.ts` is the
contract. All present conditions AND together; rules OR together; a rule needs
at least one of `paths`, `all_of`, `when`, `added_lines`, `commit_message`,
`unicode_risk`, `any_of`, `advanced`.

| Field | Meaning |
|---|---|
| `id`, `description`, `pack`, `severity`, `enabled` | identity and action |
| `on` | `push`, `pull_request`, or both (default) |
| `repos`, `branches` | globs; on a PR `branches` matches the base |
| `paths`, `exclude_paths`, `change_type` | changed-file match |
| `all_of` | 2-5 glob groups, each matched by some file in the same change |
| `when` | `forced`, `sender_first_push`, `branch_created`, `branch_deleted`, `author_mismatch`, `unreviewed`, `pr_draft`, `pr_opened`, `hour_utc` |
| `added_lines`, `commit_message` | regex, 500 chars max, checked for catastrophic backtracking on write |
| `unicode_risk` | `controls` or `confusables` in added lines |
| `advanced` | a tree (`all` / `any` / `not`, depth 4, 30 leaves) over facts, attack paths, threat indicators, push context, files, lines and other rules, optionally `within` N commits or days |
| `responses` | `investigate` (a fixed focus id), `detonate` (phases, optional published check), `meta_alert`, `snapshot_tags` |

Path and `when` rules need no GitHub read; the payload lists files. Content
rules cost one compare, only after their paths matched. An invalid stored rule
is logged and skipped.

A rule is when plus then. Pattern-only rules take the engine's fast path
unchanged. A rule with `advanced` conditions is skipped by the engine and
evaluated after it on pushes by `lib/rules/advanced`, which runs the pattern
part through the same engine and then the tree; pull requests and scans skip
it. Responses run for any rule that fired on a push, capped per push
(`rules-capped`). A staff rule version in shadow runs beside the live one and
only records `rule_shadow_hits`; a row whose signature (over body and status)
does not verify never loads.

## Access is GitHub's decision

Org membership is not repository access. Which repositories a user may read is
`repo_access`, seeded from `GET /collaborators` (GitHub's own flattening of org
role, team grants and direct collaboration) and kept current by `member`,
`membership`, `team` and `organization` events. Grants are a set of reasons, so
losing a team does not revoke someone who is also a direct collaborator. RLS
functions (`authz.can_read`, `authz.is_member`, `authz.is_admin`) read these
tables; routes cannot widen them.

The risk, stated plainly: a projection can be wrong where a live read could not.
GitHub emits no event for some access changes, and none for owner promotion or
demotion, which is re-read at the next sign-in. Missed deliveries are recovered
by reconciliation; changes GitHub never announces are not.

## Projections, not a cache

GitHub says what changed and we apply it. Every `push` also corrects the record
it touches, so a missed `create` heals on the next push.

| Data | Seeded | Kept current by |
|---|---|---|
| Installation repos | install payload | `installation`, `installation_repositories`, `repository` |
| Branches, default branch, visibility | `sync_repos` | `create`, `delete`, `push`, `repository`, `public` |
| Org members and roles | `sync_org_members`, sign-in | `organization` |
| Repository access | `sync_repos` | `member`, `membership`, `team`, `organization` |
| Open pull requests | `sync_repos` | `pull_request` |
| Alert state | written when filed | `issues`, `issue_comment` |
| Code index | `index` job per repo | push jobs; built on demand by a review |

Uninstall sends the meta-alert, then `deleteOrgData` removes every org row in one transaction (owner decision: privacy over keeping evidence); suspend deactivates and purges projections. Jobs queued for a deleted org are dropped. The terms version is the `updated` date of `content/legal/terms.md`; accepting it covers the Privacy Policy too.

## Issue events

| Action | Effect |
|---|---|
| `closed` / `reopened` | state; closed by the account that triggered it is a meta-alert |
| `assigned` / `unassigned`, `edited` | assignees, title |
| `deleted` / `transferred` | row dropped, meta-alert (checked before the label filter) |
| `unlabeled` removing `pushguard` | row dropped, meta-alert |
| anything else, by a person | acknowledgement |

`opened` and anything from a Bot are not acknowledgement: that is this app
acting on its own ticket.

## Events that are not heuristics

`public` (a private repository made public) files a critical alert with no rule
involved: the history is now readable by anyone, and making it private again
does not un-publish it. `deploy_key` created, branch protection or ruleset
edited or deleted file `deploy-key-added`, `protection-weakened` or
`protection-deleted`: these are how access survives a credential rotation, and
none shows in a push.

## Push behaviour

Diff scanning is a crowded market. The axis nothing else covers is the act of
pushing: who, when, forced, and what was touched together. `all_of` asks whether
one push touched all of several areas; `when.sender_first_push` is recorded in
the webhook with one insert into `push_actors` (a retried job would otherwise
see the sender as known). Neither is loud alone; both are context.

Force pushes compare `after...before`, new tip as base, orphaned tip as head,
and subtract surviving lines, which separates "removed from history" from
"rebased".

## Scanning

A scan answers "what would Pushguard say about this repository?" without waiting
for a push. It cannot answer `when` rules (they describe a push event) and drops
them via `scannableRules`; the force-push rule, the reason the product exists, is
exactly the one a scan cannot see. Targets come from `repo_access`; the queue
call re-checks it, and filing re-checks it per repository because findings
outlive access. Reading uses the installation token, only for repositories
already narrowed that way.

## Blind spots are findings

A reader cannot tell "we did not look" from "nothing found", so every gap files
a finding: `diff-not-fully-read`, `ai-rule-did-not-run`, `repo-index-incomplete`,
`file-not-fully-read`, `ai-rule-left-its-scope`, `change-not-evaluated`,
`github-rate-limited`, `dependency-not-checked`, `detonation-unavailable`,
`detonation-timed-out`, `detonation-report-suspect`, and `delivery_missed` as a
meta-alert. AI output can annotate or escalate an alert, never suppress one.

## Environment

`.env.example` documents every variable; `lib/env.ts` validates them at first
use. `DATABASE_URL` (the `pushguard` role, transaction pooler), the `GITHUB_*`
App settings, `AUTH_*`, `CRON_SECRET` (bearer for `/api/jobs/run`, also stored
in Vault as `jobs_run_secret` beside `jobs_run_url`), optional `ENCRYPTION_KEY`
(required before an org can store a model key or sink). `DATABASE_ADMIN_URL` is
for migrations only.

## Known gaps

- No blocking: pair with GitHub rulesets and org-wide 2FA.
- New workflows on non-default branches run through `workflow_run` are not seen
  (needs the Actions permission).
- A careful payload can detect a GitHub-hosted runner; "nothing observed" from
  detonation is weak evidence.
