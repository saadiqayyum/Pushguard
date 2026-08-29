# Pushguard

Org-wide push monitoring for GitHub. One GitHub App install watches every
repository in your organization, evaluates each push against your detection
rules, and opens a ticket that names the pushing account when something looks
wrong: force pushes, new install hooks, workflow tampering, obfuscated
payloads, or any file you decide to watch.

Built for the attack where a compromised teammate account force-pushes code
that executes on everyone else's machine at the next pull and install.

## How it works

```
push  ->  /api/webhook  ->  rule engine  ->  diff fetch (only if needed)
      ->  optional AI review (Claude)   ->  issue in the repo that was pushed
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
  a **public** repository unless that repository was chosen explicitly — the
  issue body quotes the offending lines.
- High and critical alerts also @mention a user or team, which triggers
  GitHub's own email.
- Path rules cost zero GitHub API calls; the webhook payload already lists
  changed files. Content rules fetch one compare diff, capped at 50 KB.
- AI review is advisory and escalate-only. A rule match always creates a
  ticket regardless of what the AI says about the diff.
- The dashboard makes no GitHub API calls for repository, organization or team
  lists. Webhooks keep them in the database; each installation costs one
  backfill request, once.

Multi-tenant: one deployment serves any number of organizations. Each org
installs the GitHub App; its configuration lives in the database and is
managed from the dashboard, not from environment variables.

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

   Subscribe to **Push** and **Team**. (`installation` and
   `installation_repositories` are delivered to every GitHub App automatically
   and have no checkbox.) The `team` event only appears once Members: Read is
   saved.

   Pushguard deliberately does not request `administration`, so it cannot
   create repositories — which is why alerts default to the repo that
   triggered them rather than a dedicated one.
3. **OAuth**: create a GitHub OAuth app for dashboard sign-in (GitHub login
   is the only auth) and set the `AUTH_*` variables. Scopes: `read:user`,
   `read:org`.
4. **Deploy** to Vercel.

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
| `paths`, `exclude_paths`, `change_type` | changed-file conditions |
| `when` | push conditions: `forced`, `branch_created`, `branch_deleted`, `hour_utc` |
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
whose contents have changed — which shows up as edits that never appear, or a
`module factory is not available` error that survives restarts.

`scripts/migrate-rules-to-owner.ts` is a one-off for databases created before
rules moved from per-org to per-account. It is idempotent and reports
`nothing to migrate` once applied.

## License

MIT
