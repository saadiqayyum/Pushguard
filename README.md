# Pushguard

Org-wide push monitoring for GitHub. One GitHub App install watches every
repository in your organization, evaluates each push against your detection
rules, and opens a ticket that names the pushing account when something looks
wrong: force pushes, new install hooks, workflow tampering, obfuscated
payloads, or any file you decide to watch.

Built for the attack where a compromised teammate account force-pushes code
that executes on everyone else's machine at the next pull and install.

## How it works

Two ways in. Watching is the product; scanning is how you see what it finds
before you install anything.

```
push  ->  /api/webhook  ->  rule engine  ->  diff fetch (only if needed)
      ->  optional AI review (Claude)   ->  issue in the repo that was pushed

scan  ->  /api/scans    ->  last 50 commits per repo  ->  rule engine
      ->  findings stored, nothing filed  ->  you file them, or you do not
```

- Zero configuration to start. Installing the app seeds a working rule set and
  files alerts in the repository that triggered them, so detection is live
  before you open the dashboard.
- Rules belong to your account, not to one organization. One rule set is
  evaluated against every org you installed on; narrow an individual rule with
  its repository patterns. Every change is versioned and raises its own alert.
- Alerts are GitHub issues, filed in the repository that triggered them and
  assigned to your alert contact. Orgs preferring central triage can point
  every alert at one private repository instead. An alert is never filed into
  a **public** repository unless that repository was chosen explicitly. The
  issue body quotes the offending lines.
- High and critical alerts also @mention a user or team, which triggers
  GitHub's own email.
- Path rules cost zero GitHub API calls; the webhook payload already lists
  changed files. Content rules fetch one compare diff, capped at 50 KB.
- AI review is advisory and escalate-only. A rule match always creates a
  ticket regardless of what the AI says about the diff.
- The dashboard makes no GitHub API calls for repository, organization, team or
  branch lists. Webhooks keep them in the database; each repository costs one
  read, the first time anyone opens it, and never again.
- There is no cache and no TTL anywhere in the app. Stored GitHub data is a
  projection maintained by webhooks. GitHub says what changed, we apply it. Not a copy with a guess about when it went stale. The one exception is
  deliberate: which repositories a *user* may read is asked of GitHub on every
  request, because nothing tells us when that changes.

Multi-tenant: one deployment serves any number of organizations. Each org
installs the GitHub App; its configuration lives in the database and is
managed from the dashboard, not from environment variables.

## Scanning

Scanning reads what is already committed, instead of waiting for the next push.
It is authenticated end to end, and there is deliberately no box to type a
repository into.

- **GitHub decides what you may scan.** The picker is filled from
  `GET /user/installations/{id}/repositories` called with *your* token, which
  returns only repositories you have explicit read access to. The same call runs
  again server-side when a scan is queued, so the picker is a convenience and
  not the boundary, naming a repository in the request body gets you a 403 if
  GitHub does not list it for you.
- An installation token is never used to decide access. It sees every repository
  the app was granted, which is a superset of what any one member may read.
- **Pick a branch, or take the default.** Choosing one repository lets you scan
  any of its branches; scanning a whole account reads each repository's own
  default branch, since they do not share branch names. Listing branches is
  itself gated on the same accessible-repository check.
- Every result records what it actually read, branch, commit count and the SHA
  range, and links the compare view, so "nothing flagged" is distinguishable
  from "never looked at".
- **Nothing is filed on GitHub.** Findings live in the `scans` collection.
  Filing them as issues is a separate, deliberate action, and access is checked
  again at that moment. A scan can be days old and access can be revoked in
  between.
- Scans are private to the account that ran them. There is no shareable link.
- **A scan cannot answer every rule.** Rules keyed on the push event (`when`:
  forced, branch created, `hour_utc`) and AI-only rules are dropped before
  evaluation. A snapshot of committed code has nothing to answer them with.
  This is the honest limit of scanning, and the reason to install.
- **Limits.** 25 scans a day, 20 repositories each, one at a time per account,
  enforced by a unique partial index rather than a read-then-write check.
- **Queue.** A scan runs in the invocation that queued it (`after()`);
  `/api/cron/scans` is the recovery path for anything that invocation dropped
  and for scans stuck `running` for more than five minutes.

## Setup (operator)

1. **Database**: create a free [MongoDB Atlas](https://www.mongodb.com/atlas)
   cluster and set `MONGODB_URI` (database name in the URI path). No
   migrations; indexes are created automatically on first connection.
2. **GitHub App**: create a public GitHub App, webhook URL
   `https://<your-app>/api/webhook`, then fill the `GITHUB_*` variables from
   `.env.example`.

   | Permission | Level | Why |
   |---|---|---|
   | Repository → Metadata | Read | required; also lists installed repos |
   | Repository → Contents | Read | compare diff for content rules |
   | Repository → Issues | **Read & write** | create alerts, dedupe by commit SHA |
   | Organization → Members | Read | team list for the mention picker |

   Subscribe to **Push**, **Create**, **Delete**, **Repository**, **Public**,
   **Member**, **Membership**, **Organization**, **Team**, **Issues** and
   **Issue comment**. (`installation` and `installation_repositories` are
   delivered to every GitHub App automatically and have no checkbox.)

   | Event | What it maintains |
   |---|---|
   | Push | branches, default branch, push history, and the detection itself |
   | Create / Delete | branch list |
   | Repository | default branch, renames, deletions, new repositories |
   | Public | **files a critical alert**. A private repository went public |
   | Member / Membership / Organization / Team | who can read what |
   | Issues / Issue comment | alert state, and whether anyone has looked at it |

   Without these the dashboard still works, but it serves whatever it last
   heard. Every request is answered from the database; GitHub is only ever
   called by a webhook, by the reconciliation cron, or by a scan actually
   reading code. (`installation` and
   `installation_repositories` are delivered to every GitHub App automatically
   and have no checkbox.) The `team` event only appears once Members: Read is
   saved.

   Pushguard deliberately does not request `administration`, so it cannot
   create repositories. Which is why alerts default to the repo that
   triggered them rather than a dedicated one.
3. **Sign-in**: use the **same GitHub App**, not a separate OAuth App. Put its
   Client ID and secret in `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`. On the App:

   | Setting | Value |
   |---|---|
   | Request user authorization (OAuth) during installation | on |
   | Callback URL **#1** | `https://<your-app>/api/install/complete` |
   | Callback URL **#2** | `https://<your-app>/api/auth/callback/github` |
   | Expire user authorization tokens | **off** |
   | Setup URL | greyed out, expected |

   Order matters: GitHub redirects post-install to the *first* callback URL,
   while Auth.js sends its own `redirect_uri` and always gets the second. One
   app means the install screen collects the sign-in consent too, so installing
   and signing in are a single screen. Expiring tokens would break scanning
   after 8 hours, since scans are authorised with the user's own token.
4. **Deploy** to Vercel. `vercel.json` registers the scan-queue cron; set
   `CRON_SECRET` so nothing else can call it.

## Setup (each organization)

1. Install the GitHub App on the organization, all repositories. The
   installation registers itself through the webhook and seeds default rules.
2. Sign in to the dashboard with GitHub. You see every org you belong to that
   has the app installed; the switcher in the header changes which one you are
   looking at, and **All organizations** merges the alert feed.
3. Optional, in Settings: pick a single repository to collect every alert
   instead of filing them in place, and choose who gets mentioned and assigned.
   Both are dropdowns of what the app can actually see, so neither can be a
   typo.

## Rules

See `rules.example.yaml` for the full schema by example, and
`lib/default-rules.ts` for the set every new installation gets. A rule
combines:

| Field | Meaning |
|---|---|
| `repos`, `branches` | glob scoping, empty = all; `acme/*` binds a rule to one org |
| `all_of` | groups of globs, each of which must be matched by a file in the **same** push |
| `paths`, `exclude_paths`, `change_type` | changed-file conditions |
| `when` | push conditions: `forced`, `sender_first_push`, `branch_created`, `branch_deleted`, `hour_utc` |
| `added_lines` | regex against added diff lines (case-sensitive, no flags) |
| `ai` | a question Claude answers about the diff |
| `severity` | low, medium, high, critical; high+ mentions your alert contact |

All conditions on a rule must hold; each rule is evaluated independently.

Content rules (`added_lines`, `ai`) need a diff. On a branch's first push
there is no previous commit to compare against, so the rule is reported
without diff confirmation rather than silently dropped.

## Prevention first

Pushguard is a detection layer. Turn on prevention too:

1. An org ruleset blocking force pushes on default branches.
2. Mandatory two-factor authentication for all members.
3. `npm config set ignore-scripts true` on developer machines.

## Development

```
npm install
npm run dev          # dashboard on localhost:3000
npm run typecheck
npm run lint
npm test             # engine, rule defaults, alert routing, paging
npm run validate:rules
```

Behind a CDN in development? Make sure it is not caching `/_next/*`. Turbopack
reuses chunk filenames across rebuilds, so a cached chunk is served for a URL
whose contents have changed. Which shows up as edits that never appear, or a
`module factory is not available` error that survives restarts.

`scripts/migrate-rules-to-owner.ts` is a one-off for databases created before
rules moved from per-org to per-account. It is idempotent and reports
`nothing to migrate` once applied.

## License

MIT
