# Pushguard

Org-wide push monitoring for GitHub, shipped as a multi-tenant app: one GitHub
App install per account, rules and settings in MongoDB, alerts filed as GitHub
issues, optional AI review through the owner's own model keys or gateway.

Read `DESIGN.md` for the decisions and their rejected alternatives before
changing architecture. This file is the working rules.

## Commands

- `npm run dev` — dashboard on :3000
- `npm run typecheck` / `npm run lint` / `npm test` — all three must pass before work is done
- `npm run validate:rules` — checks `public/rules.example.yaml` against the schema

## Rules

**Libraries over hand-rolled code.** If people have already solved it, use
their library: Octokit for GitHub, Auth.js for login, zod for validation,
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

**Derived data is built at install and maintained by webhooks.** No read-time
fallback to a weaker source (GitHub code search and friends), and no reliance on
the cron: the schedule is once a day on this plan. Whatever needs the data
builds it on demand if it is missing.

**Every input has a limit.** Payload bytes, diff bytes, string lengths, array
counts, regex length, page size, timeouts, retries: all capped with a named
constant next to the schema or call that enforces it. Nothing unbounded
reaches the database, GitHub, or a model. Pagination is mandatory on every
list endpoint.

**No duplication.** Logic that appears twice becomes one helper in `lib/`.
Before writing a function, search for an existing one. Shared shapes live in
`schemas/`; shared UI pieces live in `components/`.

**One way to reach the database.** `lib/db/<entity>.ts` owns one entity: its
type, its `defineCollection(...)` declaration with that collection's indexes,
and its queries. No central index list, no per-collection wrapper functions.
Accessors are synchronous: `db.scans().findOne(...)`, never
`(await scansCollection()).findOne(...)`. Only `lib/db/` may touch the driver,
`new MongoClient` or `.collection(`. The client is cached on `globalThis`.

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
- Webhooks: verify the signature before parsing anything.
- AI: file and diff content is attacker-controlled. It is fenced, tag-escaped,
  and the verdict comes back through `withStructuredOutput(..., { method:
  "jsonSchema" })` validated by zod. Do not use the default `functionCalling`
  method: it pins `tool_choice`, which Anthropic cannot do while thinking is
  on, so LangChain silently drops the pin and the call becomes best-effort.
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

**Never commit or push.** The assistant leaves every change in the working
tree; the owner reviews and commits. No `git commit`, no `git push`, no
`git stash`, even when asked to "finish up".

## Layout

- `app/api/*` — route handlers, thin: parse, guard, call `lib/`, respond
- `app/dashboard/*` — signed-in pages; `app/(marketing)` — public pages
- `lib/` — all logic
- `lib/db/client.ts` — cached client, `defineCollection`, index registry
- `lib/db/<entity>.ts` — one entity each: type, collection, its indexes, its
  queries. `lib/db/index.ts` is a barrel plus the `db` namespace. Indexes are
  created idempotently on first connection (no migrations)
- `schemas/` — zod contracts shared by API, UI and engine
- `lib/rules/catalog/` — shipped default rules; `public/rules.example.yaml` —
  pattern-rule schema by example, and served at `/rules.example.yaml`
- `lib/rules/ai-examples.ts` — AI rule examples offered in the dashboard
