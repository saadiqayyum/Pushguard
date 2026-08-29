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

- Every installation starts with a working default rule set; rules are then
  managed from the dashboard, with a dry-run tester. Every rule change is
  versioned and raises its own notification.
- Alerts are GitHub issues filed in the repository that triggered them, so
  there is nothing to configure. Orgs that prefer central triage can point
  every alert at one private repo instead. Alerts are never filed into a
  public repo unless that repo was picked explicitly. High and critical
  alerts mention a team, which triggers GitHub's own email.
- Path rules cost zero GitHub API calls; the webhook payload already lists
  changed files. Content rules fetch one compare diff, capped at 50 KB.
- AI review is advisory and escalate-only. A rule match always creates a
  ticket regardless of what the AI says about the diff.

Multi-tenant: one deployment serves any number of organizations. Each org
installs the GitHub App; its configuration lives in the database and is
managed from the dashboard, not from environment variables.

## Setup (operator)

1. **Database**: create a free [MongoDB Atlas](https://www.mongodb.com/atlas)
   cluster and set `MONGODB_URI` (database name in the URI path). No
   migrations; indexes are created automatically on first connection.
2. **GitHub App**: create a public GitHub App with permissions
   contents:read, issues:write, members:read, subscribed to the push,
   installation, installation_repositories and team events, webhook URL
   `https://<your-app>/api/webhook`. Fill the `GITHUB_*` variables from
   `.env.example`. The last two events keep the repository and team pickers
   populated without the dashboard ever calling GitHub.
3. **OAuth**: create a GitHub OAuth app for dashboard sign-in (GitHub login
   is the only auth) and set the `AUTH_*` variables.
4. **Deploy** to Vercel.

## Setup (each organization)

1. Install the GitHub App on the organization, all repositories. The
   installation registers itself through the webhook.
2. Sign in to the dashboard with GitHub. You see every org you belong to
   that has the app installed.
3. In settings, point the org at a private alerts repository and optionally
   a team to mention. Create rules in the dashboard, with dry-run testing.

## Rules

See `rules.example.yaml` for the full schema by example. A rule combines:

| Field | Meaning |
|---|---|
| `repos`, `branches` | glob scoping, empty = all |
| `paths`, `exclude_paths`, `change_type` | changed-file conditions |
| `when` | push conditions: `forced`, `branch_created`, `branch_deleted`, `hour_utc` |
| `added_lines` | regex against added diff lines |
| `ai` | a question Claude answers about the diff |
| `severity` | low, medium, high, critical; high+ mentions your team |

All conditions on a rule must hold; each rule is evaluated independently.

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
npm run validate:rules
```

## License

MIT
