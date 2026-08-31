# AI review — how it works

Two pipelines answer AI rules. Which one runs is decided by the rule's `scope`.

```
push ──┬─ pattern engine (lib/engine.ts)          unchanged, synchronous
       ├─ scope: changed     → lib/ai-rules.ts    inline, bulk-load + cached prefix
       └─ scope: repository  → review session     queued, agent navigates with tools

scan ──┬─ pattern engine
       └─ scope: repository  → review session     queued, seeded from scan findings
```

## scope: changed

`lib/ai-rules.ts`. Fires on the rule's own `paths`, not on a pattern hit.

Reads whole files at the pushed SHA, compacts them, sends them. One `runReview`
per rule through the two-stage graph in `lib/review-graph.ts`: cheap triage model
over everything, expensive model only over what triage flagged.

Caps: 10 rules/push, 10 files/rule, 40k chars/file, 120k total/rule, 40 context
filenames, 25s per review, 40s for the whole pass, 1 retry.

## scope: repository

`lib/review-session.ts`. Queued, never inline — a tree walk plus an agent loop
does not fit in the webhook that discovered the push.

A session pins one SHA and holds paths and progress, **never source**. Each rule
runs as a `createReactAgent` with two tools. 2 rules per invocation, 45s budget;
unfinished work stays queued at the same SHA and the next tick resumes.

### The tools

`lib/review-tools.ts`, validated by `lib/review-scope.ts`.

The model never holds a credential. It emits a path; our code decides whether it
gets one. Every file under review is attacker-controlled, so an injected
instruction can only produce a rejected argument.

| | |
|---|---|
| `read_file(path)` | one file at the session's SHA |
| `find_references(symbol)` | files mentioning a name, from our own index, **zero GitHub calls** |

`allowPath` rejects `..`, absolute paths, URL schemes, NUL bytes, non-source
files, and anything outside the rule's own `paths`/`exclude_paths`. Refusals are
recorded and filed as `ai-rule-left-its-scope` — that is where injection surfaces.

Readers are injected (`ToolReaders`), which keeps Octokit out of the module and
makes the whole layer testable.

### Orientation

`lib/diff-context.ts` renders per-file stats, budgeted hunks, and dependency
advisories before the agent reads anything. The diff is the map; whole files are
read through tools only where it matters. Every changed file is named even when
its hunks do not fit, so nothing is silently absent.

## The code index

`lib/code-index.ts` + `lib/db/code-index.ts`. Paths and identifiers only, never
source — a copy of the database is not a copy of anybody's code.

Three things keep it current, **none of them a schedule** (Vercel Hobby = one
cron/day):

- install / repo added → queues a full index
- push → indexes its own changed files, in its own invocation
- a review reaching an unindexed repo → `ensureIndexed` indexes it, then reads

Blob-SHA diffing means unchanged files are never re-read. `find_references`
answers mentions, **not call sites** — it narrows 3,000 files to 9 for the model
to read properly. It is not a call graph.

GitHub reads use one tree call (which carries sizes, so oversized files are
skipped without being fetched) plus GraphQL batches of ~40 files. 200 files = 6
calls, not 200.

## Cost controls

| Control | Where |
|---|---|
| 200 model reviews/account/day | `claimAiReview`, claimed on **both** paths |
| 50 AI rules/account | `POST /api/ai-rules` |
| 5–120 tool calls/rule | `budget` on the rule schema |
| Rate-limit floor | indexer stops at 1000 remaining; the queue is the backoff |

## Blind spots are findings, never silence

The rule this codebase follows: "we did not look" must be reported, because a
reader cannot tell it from "nothing found".

`diff-not-fully-read` · `ai-rule-did-not-run` · `repo-index-incomplete` ·
`file-not-fully-read` · `ai-rule-left-its-scope` · `dependency-known-advisory`

## Tests

157 pass. Covered: path validation, tool budget/caching/refusal/truncation
recording, diff-context budgeting, compaction (padding, indentation, Trojan
Source), tokenizer, rule scoping and budget arithmetic, and a guard that model
summaries are sanitised on **every** path before reaching a GitHub issue.

Not covered: the agent loop against a live model. First real run is where the
prompt and the 40-call budget get tuned — `review_session_rule_done` logs calls,
reads, refusals, truncations and findings per rule for exactly that.

## Known gaps

- The agent's own tool-call turns are not prompt-cached; only the changed-scope
  path benefits from the stable-prefix design.
- `find_references` indexes the **default branch only**. A feature-branch review
  reads its own files at its own SHA, but reference lookups may lag.
- Tree API truncation on very large repos is surfaced as a finding, not solved.
