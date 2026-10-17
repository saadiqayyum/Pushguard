# Plan

One build, not phases. Stays on Vercel. Rules for how it is built live in
`CLAUDE.md`; this is what gets built.

## Decisions

- Database: Supabase Postgres via Drizzle. Free tier for development; Pro (or
  Neon) before real users, because a free project pauses after 7 idle days.
- Queues: pgmq, with a `pg_net` trigger calling `/api/jobs/run` on insert. A
  one-minute `pg_cron` check wakes delayed or retried jobs when one is due; it
  makes no request while nothing is due. No GitHub Actions scheduler.
- Login: Auth.js with the GitHub App. Token refresh via the refresh token.
  Supabase Auth is not used.
- Sync: webhooks only. One GitHub read at sign-in for the user's own org role.
- Roles: org owners edit rules, settings and keys. Members and collaborators read.
- First out-of-band sink: Slack-compatible webhook (Discord accepts it via `/slack`).
- Uninstall retention: none. All org data is deleted right after the meta-alert.
- AI: LangGraph stays, for one code path across Anthropic, OpenAI and Google keys (BYOK).
- Language: backend stays TypeScript (the bottleneck is network, and RE2 would
  break existing rules). Go only for the detonator binary.
- No microVM for static scanning; isolation is for detonation only.

## Done

- [x] Cron route open when `CRON_SECRET` unset: `requireBearer`, secret required.

## Data and queues

- [x] Drizzle + Supabase client in `lib/db/client.ts`; port every `lib/db/<entity>.ts`.
- [x] Migrations: tables, indexes, RLS on tenant tables, pgmq queues, `pg_net` trigger.
- [x] One-shot script: copy Mongo data into Postgres; settings re-keyed by org.
- [x] `lib/jobs/`: push, forensics, alert, index, ai-review, redelivery handlers.
- [x] `/api/jobs/run` behind `requireBearer`; capped retries; exhausted job files a finding.
- [x] `rate_limits` table and `limit(key, max, windowSec)` in `lib/db/`; 429 with `Retry-After`.
- [x] Inbound limits on every route: user routes by login, machine routes
      (`/api/jobs/run`, runner redeem and report) by credential.
- [x] Webhook burst over the per-installation cap: enqueue anyway, file `push-flood`.
- [x] `@octokit/plugin-throttling` + `@octokit/plugin-retry` in `lib/github.ts`.
- [x] Rate-limited jobs requeued with visibility timeout set to the reset time;
      past budget, file `github-rate-limited` / `model-rate-limited`.
- [x] Per-org daily model-call cap.
- [x] Webhook: verify, dedupe on delivery id, enqueue, ack. Remove `after()` work.
- [x] Missed deliveries: on a gap or failed job, enqueue redelivery via the deliveries API; unrecoverable gap files `push-possibly-missed`.
- [x] Remove `vercel.json` cron and `/api/cron/scans` once jobs cover it.
- [ ] Remove `mongodb`; update `DESIGN.md`, `RUNTIME.md` (drop the "retried by GitHub" claim).

## Auth, roles, onboarding

- [x] `org_members` table: filled at install, maintained by `organization` and `membership` webhooks.
- [x] Own role read at sign-in; Auth.js refresh-token rotation for the 8h user token.
- [x] `requireTenant` / `requireAdmin`; every route moved to one of them.
- [x] Rules and settings keyed by org, not `installedBy`.
- [x] Onboarding states: no install (pick account, install); member of an org without
      install (ask owner); just installed (syncing); collaborator-only (their repos).
- [x] Tests: role resolution and both guards.

## Data isolation

- [x] Roles `pushguard_app` (no `BYPASSRLS`) and `pushguard_system`; tables in an
      `app` schema with no grants to `anon` / `authenticated`; Data API off for it.
- [x] RLS enabled and forced on every table; policies per table on `app.login`
      joined to `repo_access` and `org_members`; admin-only writes for rules and settings.
- [x] `withUser(login, tx)` in `lib/db/`; system handle importable only by the webhook and `lib/jobs/`.
- [x] Lint guard: no route imports the system handle (raw-row responses are prevented by `respond()`).
- [x] Output schemas for every response; secrets in columns no schema includes.
- [x] Cross-tenant tests for every tenant route; RLS policy tests against PGlite or Supabase local.
- [ ] Audit current routes for post-query filtering and raw-document responses.

## Correctness

- [x] Push with 20+ commits: read files from compare; truncated compare files a finding.
- [x] Uninstall: meta-alert first, then delete all org data. Suspend: meta-alert, deactivate.

## Alerts

- [x] Out-of-band sinks per org, URL sealed with `secret-box`.
- [x] Meta-alerts: uninstall, suspend, repo removed, alert closed by the triggering account, delivery gap.

## Detection

- [x] AI-agent pack: CLAUDE.md, AGENTS.md, .cursorrules, copilot-instructions,
      .windsurfrules, MCP configs, prompt-injection strings; `unicode_risk` escalates to critical.
- [x] Dependency pack (`dependency_added`): OSV malicious, npm metadata, deps.dev.
- [x] Tag repointed to a new SHA: critical.
- [x] Persistence events: `deploy_key`, branch protection / ruleset changed. Repo webhook added has no App event.
- [ ] New workflow on a non-default branch run via `workflow_run`. Needs the Actions permission; deferred.
- [ ] Unsigned commit from an account that always signs. Needs a per-push commit read, which breaks the zero-calls-on-no-match rule; deferred.
- [x] Agent-shaped push: no PR + off-hours + token push + workflow touched, from existing `when` conditions.
- [x] Attack corpus fixtures: zod d821685, GhostAction, Shai-Hulud.
- [ ] "Would Pushguard have caught zod?" post, driven by the corpus.

## AI

- [ ] Park `scope: repository`.

## Tenant runner (scanners and detonation)

Never in the monitored repo, never on a self-hosted runner.

- [x] Runner repo: Pushguard-hosted `RUNNER_REPO` only, with a monthly quota
      per org. Workflow: `contents: read` for the detonator download only,
      no secrets, triggered by a `pg-<nonce>` label (Issues write, no Contents write).
- [x] Two one-time credentials per job: `fetch_nonce` (redeemed once for the
      tarball via the archive API, burned before any payload runs) and
      `report_token` (one POST, bound to the job id). Both hashed, short TTL.
- [ ] Workflow verifies the detonator binary by sha256 / cosign before running it.
- [x] Scanners: Semgrep, GuardDog (`npm verify`, `github_action verify`),
      gitleaks, YARA; SARIF mapped to findings. js-x-ray stays in-process.
- [x] Gate: scanners and detonation run only on a rule hit (install hook,
      lockfile, new dependency, setup.py, workflow change).
- [x] Go detonator (static binary): root supervisor; payload in `isolate` as an
      unprivileged uid, cgroup v2 limits.
  - [x] Scrub CI tells: unset `CI`, `GITHUB_*`, `RUNNER_*`; realistic hostname,
        user, cwd `/home/<user>/projects/<repo>`; curated env.
  - [x] Staged home with decoy `~/.ssh`, `~/.gitconfig`, `~/.npmrc` carrying canaries.
  - [x] Deps pre-fetched outside with `--ignore-scripts`; install / import /
        execute run inside with no network. strace records attempted hosts and DNS.
  - [ ] Wired mode later: veth from the box netns to a proxy with a registry allowlist.
  - [ ] Timers patched against sleep-based evasion; long budget.
  - [x] Collect hosts, processes, env reads, out-of-project writes (fs diff),
        canary touches; diff behavior against the parent commit.
  - [ ] Check `ossf/package-analysis` Go packages before writing syscall/pcap parsing.
  - [x] Findings: `detonation-timed-out`, `detonation-unavailable`,
        `queue-exceeded`, `install-exceeded-budget`; every skipped phase says why.
  - [x] Server-side sanity checks on reports: phase order, durations, heartbeat.
- [ ] Second backend, same binary: disposable VM per detonation (VPS or
      Firecracker snapshot) for self-host and paid, which can fake `/proc/uptime`.

## Housekeeping

- [ ] `push-guard` is taken on PyPI: decide the published package and CLI names.

## Later, only with users

- Pricing: free and self-host; hosted around $10–15/dev/mo; enterprise left to Arnica.
- Go single-binary distribution for self-host.
- Docker Compose self-host (dropped for now: staying on Vercel).

## Known gaps

- GitHub sends no webhook for owner promotion or demotion; role updates at next sign-in.
- Vercel Hobby forbids commercial use.
- No blocking; pair with GitHub rulesets.
- Careful malware can detect a GitHub runner sandbox (fresh `/proc/uptime`);
  only the VM backend fixes it. "Nothing observed" is weak evidence.
- Actions runner: 2,000 private minutes/mo on the tenant's free plan.
