# Pushguard

Org-wide push monitoring for GitHub, shipped as a multi-tenant app: one GitHub
App install per account, rules and settings in Postgres (Supabase), alerts filed
as GitHub issues and sent out-of-band, optional AI review through the owner's
own model keys or gateway.

Read `DESIGN.md` for the decisions and their rejected alternatives before
changing architecture. This file is the working rules.

## Commands

- `npm run dev` — dashboard on :3000
- `npm run typecheck` / `npm run lint` / `npm test` — all three must pass before work is done
- `npm run validate:rules` — checks `public/rules.example.yaml` against the schema
- `npm run db:generate` / `npm run db:migrate` — Drizzle migrations in `drizzle/`

## Rules

**Libraries over hand-rolled code.** If people have already solved it, use
their library: Octokit for GitHub, Auth.js for login, zod for validation,
Drizzle for Postgres, pgmq for queues, LangChain + LangGraph for models (one
code path across providers),
picomatch for globs, shadcn/ui + lucide for UI. Do not reimplement what an
established package does. The rule engine is the one exception: it is the
product.

**One way to call HTTP.** Server-side GitHub IO goes through `lib/github.ts`
(Octokit). Browser calls go through `api()` in `lib/api-client.ts`. No axios,
no scattered `fetch` calls in components or routes.

**Validate at every boundary.** Every request body, webhook payload, env var
and stored rule is parsed with a zod schema from `schemas/` before use. Env is
validated once in `lib/env.ts`; a missing variable fails the deploy, not a
request.

**Errors are typed and logged, never leaked.** Throw `AppError` with a code
from `lib/errors.ts`. Routes are wrapped with `withErrorHandler` from
`lib/route.ts`, which logs a structured JSON line with a request id and returns
`{ error: { code, message } }`. Internal errors reach the client as
"Internal error", never a stack or upstream text.

**Structured logs only.** `logger.info/warn/error(event_name, fields)` from
`lib/logger.ts`. Event names are snake_case nouns (`alert_created`,
`rule_skipped_invalid`). No `console.log`.

**Comments: two lines, above the declaration, or none.**
- Never inside a function body, an object literal, a type body, or JSX.
- No per-field docblocks on types. If a field needs a paragraph, the name is wrong.
- No multi-paragraph essays, no rejected alternatives, no changelog of what a
  previous version did wrong. `DESIGN.md` is where reasoning lives.
- Earn the two lines: a non-obvious limit, a security reason, or a constraint
  that will be broken by someone who cannot see it. Never what the next line does.

**Webhooks are the source of truth, never polling.** Installations, repos,
branches, org members, teams and repo access are built once at install and
maintained by webhooks. No refresh timers, no re-reading GitHub "to be safe",
no read-time fallback to a weaker source (code search and friends). The one
sanctioned read outside a webhook happens at sign-in: the user's own org roles
(GitHub sends no event for promotion or demotion) and the App installations they
can reach (an install whose webhook was missed is registered then, not never).

**Queues, not crons.** Every unit of async work (push evaluation, forensics,
alert dispatch, indexing, AI review, redelivery) is a pgmq message. The webhook
verifies, enqueues and acks. A `pg_net` trigger calls `/api/jobs/run` on insert.
A failed job reappears after its visibility timeout, retries are capped, and an
exhausted job files a finding. No scheduled jobs, and no `after()` for work that
must not be lost.

**Authorization mirrors GitHub.** The session is identity only; permissions are
read from tables on every request. Org owner: admin (rules, settings, keys).
Member: reads rules, plus alerts and scans on repos they can read. Outside
collaborator: only repos in `repo_access`. Personal account: admin of itself.
Every route uses `requireTenant` (read) or `requireAdmin` (write). Settings are
keyed by org, never by the login that installed the app.

**No API leaks data. Authorization is enforced twice: in the route and in the row.**
- Every table has RLS enabled and forced (`FORCE ROW LEVEL SECURITY`). No
  policy means no rows: default deny.
- The app connects as `pushguard_app`: not superuser, not owner, no
  `BYPASSRLS`. Requests run through `withUser(login, tx => ...)`, which sets
  `app.login` with `set_config(..., true)` inside the transaction; policies read
  it and join `repo_access` / `org_members`. A query outside `withUser` sees nothing.
- Webhooks, queue handlers, runner and MCP endpoints and sign-in use
  `asSystem`, only from `app/api/webhook`, `app/api/jobs`, `app/api/runner`,
  `app/api/mcp`, `app/admin`, `app/api/admin`, `lib/jobs/`, `lib/auth.ts` and
  `scripts/`. The staff console (`app/admin`, `app/api/admin`) edits global,
  org-less tables, behind `requirePlatformAdmin`/`adminRoute` (allowlist, fresh
  session, 404 to everyone else, every write in `platform_audit`). A route handling a
  user request never gets the system handle; a user can only ask for system work
  through a security-definer
  function that checks ownership (`app.enqueue_scan`, `app.enqueue_scan_filing`).
- Tables live in the `app` schema. Supabase's Data API, `anon` and
  `authenticated` get no grants on it; the anon key reads nothing.
- Filter in SQL, never after the query. A list endpoint never fetches rows to
  drop them in JavaScript.
- Responses are built through an explicit zod output schema in `schemas/`. A raw
  row never reaches `NextResponse.json`.
- Someone else's row and a missing row both answer 404. An id never reveals that
  it exists.
- Secrets (model keys, sink URLs, nonces, tokens) live in columns that no
  response schema includes. A key comes back only as its hint.
- Every route that reads tenant data has a cross-tenant test: user B gets 404 or
  an empty list for user A's rows. RLS policies have their own tests against a
  real Postgres.

**Every input has a limit.** Payload bytes, diff bytes, string lengths, array
counts, regex length, page size, timeouts, retries: all capped with a named
constant next to the schema or call that enforces it. Nothing unbounded
reaches the database, GitHub, or a model. Pagination is mandatory on every
list endpoint.

**Rate limits, both directions.** Limits are named constants in a `limits.ts`.
- Inbound: every route is limited, keyed by login for user routes and by
  credential for machine routes, counted in Postgres in the same request (one
  upsert, fixed window). Over the limit: `AppError("rate_limited")` with a
  `Retry-After` header. No in-memory counters; serverless instances do not share
  memory.
- Webhooks are never rate-limited by dropping. A dropped push is silence. A burst
  past the per-installation cap is still enqueued, processed in order, and files
  a `push-flood` finding, because flooding is how an attacker buries one push.
- Outbound GitHub calls go through `@octokit/plugin-throttling` and
  `@octokit/plugin-retry` in `lib/github.ts`, which honor `Retry-After` and
  secondary limits. Retries are capped.
- A rate-limited job is not failed: it goes back on the queue with its
  visibility timeout set to the reset time. Delayed past its budget, it files a
  finding (`github-rate-limited`, `model-rate-limited`), never a silent skip.
- Model calls have a per-org daily cap, because BYOK spend is the owner's money.

**No duplication.** Logic that appears twice becomes one helper in `lib/`.
Before writing a function, search for an existing one. Shared shapes live in
`schemas/`; shared UI pieces live in `components/`.

**One way to reach the database.** Postgres through Drizzle. `lib/db/<entity>.ts`
owns one table: its Drizzle definition with that table's indexes, and its
queries. Schema changes are Drizzle migrations in `drizzle/`, never edits to a
live database. Only `lib/db/` imports the driver or `drizzle-orm`. The client is
cached on `globalThis`. Every tenant table has row-level security as a second
wall; routes still check.

**Tools and agents never reach IO directly.** Anything a model can invoke takes
injected readers. It declares what it needs; the caller supplies an
already-scoped reader, so the repo, the SHA and the allowlist are not
parameters the model can reach.

**Constants live in a constants file, not in the logic.** Caps, budgets, TTLs
and limits go in `lib/db/limits.ts`, `lib/source-files.ts`, or a `limits.ts`
beside the module. A constant used by two modules is shared, never copied.

**Do not wrap a one-liner in a helper.** `parts.join("\0")` is the code. A
named function around it is one more thing to read and one more place to be
wrong. Helpers earn their name by removing a real repetition.

**Split a file before it gets big.** Past ~250 lines, look for the second
concern and move it out. A 1000-line module is a directory that was never made.

**No polluting a file.** A file has one concern. A new concern gets a new
file, not a block appended to an unrelated module. Routes stay thin; logic
does not accumulate in route handlers or components.

**Readable, divided code.** Pure logic (engine, sanitizers, paging) stays
free of IO so it can be unit-tested with `node:test`. Non-trivial logic gets a
test in `lib/*.test.ts`.

**Security is not simplified away.**
- Webhooks: verify the signature before parsing anything. Dedupe on the
  delivery id.
- Machine endpoints authenticate with `requireBearer` (constant-time compare).
  The secret is required; an unset secret never means open.
- Runner endpoints take one-time, short-lived, hashed nonces bound to one job.
  Nothing long-lived enters a runner.
- Uninstall, an alert closed by the account that triggered it, and a delivery
  gap each raise an out-of-band meta-alert. Uninstall sends that meta-alert
  first, then deletes all of the org's data at once (owner's decision; the
  GitHub issues already filed stay in the org's repositories).
- AI: file and diff content is attacker-controlled. It is fenced, tag-escaped,
  and the verdict comes back through `withStructuredOutput(..., { method:
  "jsonSchema" })` validated by zod. Do not use the default `functionCalling`
  method: it pins `tool_choice`, which Anthropic cannot do while thinking is
  on, so LangChain silently drops the pin and the call becomes best-effort. A
  verdict that fails validation is a finding, never a clean result.
  AI output can annotate or escalate an alert, never suppress or downgrade one.
- A model that could not answer is reported, never treated as a clean result.
  Timeouts, rate limits, truncation and partial indexes each file a finding, for
  the same reason `diff-not-fully-read` does: a reader cannot tell "we did not
  look" from "nothing found".
- Anything rendered into a GitHub issue from untrusted input has mentions
  neutralized and is wrapped in code formatting.
- Rules are validated for regex safety; an invalid stored rule is logged and
  skipped, never allowed to crash the engine.
- Model keys are encrypted at rest and decrypted only at call time.

**UI.** shadcn/ui components, lucide icons, Tailwind, neutral theme. No
emojis anywhere in the product. Minimal and calm; every page has a clear
empty state and error state.
- One primary content per page (a table or list). Stats, usage and counters
  live on the Overview page, never appended under a table.
- Settings are never inline forms on a page: a button in the page header opens
  a Dialog (or Sheet for long forms); the page shows at most a read-only summary.
- Copy is labels, headings, values, errors and terse empty states ("No alerts").
  No sentence that narrates the UI, explains a feature or reassures.
- One shell and one page container for every page, marketing and dashboard; one
  source of theme tokens in `app/globals.css`; no hard-coded colors.
- No layout shift: skeletons match the final layout, buttons keep their width
  while busy, nothing above the fold appears after hydration.
- Numbers use the UI font with `tabular-nums`; monospace only for code-like
  values (paths, SHAs, URLs, rule ids).
- Every page works at 360px with no horizontal scroll, in light and dark.
- Fluid layout: sizes in rem, %, ch, fr, clamp() or min(), never px literals.
  No fixed-width page wrappers; tables use the available width and drop
  low-priority columns on small screens instead of forcing a min-width.
- Writing (product copy, docs, research): no em dashes or en dashes as
  punctuation; periods, commas, colons, parentheses instead. No AI patterns:
  "not X, but Y", rule-of-three rhythm, rhetorical questions, "delve",
  "seamless", "robust", "leverage", "landscape", closing restatements. Plain,
  specific sentences of varied length.

**Never commit or push.** The assistant leaves every change in the working
tree; the owner reviews and commits. No `git commit`, no `git push`, no
`git stash`, even when asked to "finish up".

## Layout

- `app/api/*` — route handlers, thin: parse, guard, call `lib/`, respond
- `app/dashboard/*` — signed-in pages; `app/(marketing)` — public pages
- `lib/` — all logic
- `lib/db/client.ts` — cached Drizzle client
- `lib/db/<entity>.ts` — one table each: definition, indexes, queries.
  `lib/db/index.ts` is the barrel; `lib/db/schema.ts` lists tables for drizzle-kit
- `drizzle/` — migrations, including pgmq queues, `pg_net` triggers and RLS
- `lib/jobs/` — one handler per queue message type
- `schemas/` — zod contracts shared by API, UI and engine
- `lib/rules/catalog/` — shipped default rules; `public/rules.example.yaml` —
  pattern-rule schema by example, and served at `/rules.example.yaml`
- `lib/rules/ai-examples.ts` — AI rule examples offered in the dashboard

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
