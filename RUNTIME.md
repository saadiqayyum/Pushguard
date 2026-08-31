# How it actually runs

Every diagram below is one real path through the code. `GH` marks a GitHub API
call; everything unmarked is Mongo or pure computation.

## 1. Install

```mermaid
flowchart TD
  A[Someone installs the App] --> B[installation webhook]
  B --> C[Write installations doc]
  C --> D[Answer 204 immediately]
  D --> E["after: background work"]
  E --> F["GH: read collaborators<br/>5 repos at a time"]
  E --> G[Queue one index job per repo]
  F --> H[(repo_access)]
  G --> I[(index_jobs)]
```

**No rules are written.** The 78-rule catalog ships as code, so detection is live
on the first push with zero database writes.

The webhook answers before doing any of this. A webhook that blocks on hundreds
of repositories gets retried by GitHub, which starts the work again.

## 2. A push

The common case is the important one: **a push that matches nothing costs zero
GitHub calls.**

```mermaid
flowchart TD
  A[push webhook] --> B[Verify signature]
  B --> C["Load rules<br/>(Mongo)"]
  C --> D["Evaluate<br/>(pure, no IO)"]
  D --> E{Anything matched?}
  E -->|no| F[204. Done.<br/>0 GH calls]
  E -->|yes| G["202, then after:"]
  G --> H{Content rule?}
  H -->|yes| I["GH x1: compare diff<br/>2 MB budget"]
  H -->|no| J[Payload already<br/>listed the files]
  I --> K{High or critical?}
  J --> K
  K -->|yes| L["GH x1: batch read<br/>up to 15 files"]
  K -->|no| M[Skip AST pass]
  L --> N["GH x1: open or<br/>comment on issue"]
  M --> N
```

Why the file read is gated twice: `ci-workflow-changed` fires whenever anyone
edits a workflow. Reading files on every one of those is most of a bill for
almost none of the signal.

### Reads per push

| Situation | GitHub calls |
|---|---|
| Nothing matched | **0** |
| Path rule matched | 1 (the issue) |
| Content rule matched | 2 (diff + issue) |
| High/critical, JS/TS present | 3 (diff + one batch + issue) |
| A rule asks `unreviewed` | +1, and only if that rule's repo and branch match |
| Force push | +1 (the erased side) |

## 3. Rules, in the order they run

Cheap and pure first. Nothing touches the network until a rule has already
matched on metadata.

```mermaid
flowchart LR
  A["repos / branches<br/>glob match"] --> B["when:<br/>forced, hour, etc"]
  B --> C["paths<br/>glob match"]
  C --> D{needs diff?}
  D -->|no| E[Match]
  D -->|yes| F["GH: fetch diff once<br/>for the whole push"]
  F --> G["added_lines regex<br/>+ unicode_risk"]
  G --> E
```

The diff is fetched **once per push**, not once per rule, and lines are
normalised once for all rules rather than once per rule.

## 4. AI rules

```mermaid
flowchart TD
  A{rule.scope} -->|changed| B["Batch read the files<br/>this rule's paths match<br/>GH x1 per rule"]
  B --> C["Triage on a cheap model"]
  C --> D{Worth a closer look?}
  D -->|no| E[Done. Most pushes<br/>stop here]
  D -->|yes| F[Deep model reads<br/>only what triage flagged]

  A -->|repository| G[Queue a session]
  G --> H[Return. Nothing<br/>runs inline]
```

Files another rule already pulled are reused, so ten rules aimed at the same
paths still cost one read per file.

## 5. A repository review session

Runs in the background, resumable, pinned to one commit.

```mermaid
flowchart TD
  A[Claim a queued session] --> B[Bring the index up to date]
  B --> C["GH x1: compare<br/>stats + hunks"]
  C --> D["GH x1: dependency<br/>advisories"]
  D --> E["Build the prompt:<br/>diff + seeds + question"]
  E --> F[Agent starts]
  F --> G{Tool call}
  G -->|read_file| H[Validate path]
  G -->|find_references| I["Index lookup<br/>0 GH calls"]
  H -->|allowed| J["GH x1: one file"]
  H -->|refused| K[Refusal recorded<br/>and filed as a finding]
  J --> F
  I --> F
  K --> F
  F --> L{Budget or<br/>time left?}
  L -->|no| M["Save progress,<br/>stay queued"]
  L -->|done| N[File one issue]
```

Two rules per invocation, 45s budget. Whatever is unfinished stays queued at the
same commit and the next trigger picks it up.

## 6. The code index

This is what makes `find_references` cost nothing at review time.

```mermaid
flowchart TD
  A[Install] --> Q[Queue a job]
  B[Push] --> C["Index the changed files,<br/>in that same invocation"]
  D[Review needs it] --> E["Build it now, then read"]
  Q --> F[("code_index:<br/>paths + identifiers")]
  C --> F
  E --> F
  G[Daily cron] -. only picks up<br/>what nobody touched .-> F
```

**No source code is stored** — paths and identifiers only. A copy of this
database is not a copy of anybody's code.

### Why indexing is cheap

```mermaid
flowchart LR
  A["GH x1: tree<br/>every path + size + hash"] --> B[Drop non-source<br/>and oversized files]
  B --> C[Drop files whose hash<br/>we already have]
  C --> D["GH: batch read<br/>40 files per call"]
```

The tree carries file **sizes**, so a 5 MB bundle is skipped without ever being
downloaded. Hashes mean an unchanged file is never re-read.

**200 files = 6 calls** (1 tree + 5 batches), not 200.

## 7. What the dashboard costs

```mermaid
flowchart LR
  A[Any dashboard page] --> B[(Mongo)]
  B --> C[Rendered]
  A -.->|"never"| D[GitHub]
```

Zero GitHub calls. Repository lists, branches, teams, alert state and comments
are all projections kept current by webhooks.

One deliberate exception: **which repositories a user may read** is asked of
GitHub on every request, because no webhook reliably says when that changed.

## 8. Where data lives

```mermaid
flowchart LR
  subgraph "Ships as code"
    R["78 rules, 16 packs"]
  end
  subgraph "Mongo"
    O[Your overrides only]
    P["Projections:<br/>repos, access, alerts"]
    I["code_index:<br/>names, never source"]
    S[Sessions and jobs]
  end
  subgraph "GitHub"
    G[The code itself]
    A["Alerts, as issues"]
  end
  R --> E[Engine]
  O --> E
```

Nothing is cached with a TTL. Projections are applied from webhook events —
GitHub says what changed, we write it. Not a copy with a guess about when it
went stale.

## Limits that bound a run

| | |
|---|---|
| Webhook payload | 1 MB |
| Diff read | 2 MB, and truncation is **reported as a finding** |
| AI rules per push | 10 |
| Files per AI rule | 10, 40k chars each, 120k total |
| Whole AI pass | 40s |
| One model review | 25s, 1 retry |
| Tool calls per repository rule | 5–120, default 40 |
| Model reviews per account per day | 200 |
| Scans | 25/day, 20 repos, 1 at a time |

Every one of these reports when it is hit. A limit that silences a detector
without saying so is a place to hide things.
