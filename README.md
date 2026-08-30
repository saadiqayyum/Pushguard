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
  assigned to your alert contact, public or private. A **public** repository
  gets the alert but not the evidence: the rule, severity, files and commits
  are named, and the matched lines are withheld with a pointer to the
  dashboard. Quoting them would turn an alert about a committed secret into a
  durable, search-indexed copy of it, somewhere far easier to find than the
  commit. A private repository quotes the offending lines in full.
- High and critical alerts also @mention a user or team, which triggers
  GitHub's own email.
- **Force pushes are read from the side nobody else can see.** A rewrite makes
  the old tip unreachable, so a checkout, and every scanner that reads one, only
  ever gets the survivors. Pushguard compares in both directions and runs your
  content rules against the difference, which answers what the force push
  *removed* rather than only that one happened. A secret committed and then
  force-pushed away is still leaked, and this is what reports it. Details in
  [Force-push forensics](#force-push-forensics).
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

## Force-push forensics

A force push is the only push that removes evidence instead of adding it. Once
it lands, the old tip is unreachable: `git clone` gets the surviving side, and
so does every scanner that reads a checkout. The erased commit is still fully
published, in every clone taken before the rewrite, and invisible to all of
them.

Being webhook-driven is what makes the other side readable. The push payload
carries `before`, and GitHub serves orphaned commits by SHA until it collects
them, so Pushguard compares twice:

```
compare/after...before  ->  orphaned commits + the diff that was erased
compare/before...after  ->  the surviving diff
rules run against (erased lines - surviving lines)
```

The set difference is what makes it usable. A rebase or an amend leaves
identical content on both sides, so it produces nothing at all; only content
that left the branch is reported. That also means:

- **Only `added_lines` rules apply.** A rebase rewrites every path on the
  branch, so path rules would fire on every rebase in the org. `when` rules are
  dropped for the same reason a scan drops them: the orphaned side is a diff,
  not a push event.
- **It runs on the webhook, never from the cron.** GitHub garbage-collects
  unreachable objects; asking later gets a 404, which is logged and dropped
  rather than failing the alert.
- **It files even when the visible push matched nothing.** That is the case it
  exists for: an attacker rewriting history to bury a commit leaves a surviving
  side that is clean by construction.
- Costs two extra compare calls, and only on a force push where you have at
  least one content rule.

The alert names the erased commits and their authors, quotes the matched lines,
and links the orphaned range so it can be read before GitHub collects it.

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
   | Repository → Pull requests | Read | answer whether a commit reached a branch through review |
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
3. Optional, in Settings: choose who gets mentioned and assigned. It is a
   dropdown of what the app can actually see, so it cannot be a typo.

   Alerts are always filed in the repository that triggered them. Collecting
   every alert into one repository instead is not implemented; this section
   previously described it as a setting, and there was no such field.

## Rules

Pushguard ships a catalog of 76 rules in `lib/rules/catalog/`, grouped into 15
packs. It is a file, not a table.

Rules used to be copied into the database for every account at install. That
meant one identical document per rule per account, an improvement to a rule that
could never reach anybody already installed, and a rule set nothing could read
without a database connection. Now the catalog ships with the code and the
database holds only what somebody **changed**: an override of a catalog rule, or
a rule they wrote themselves. Detection is live on the first push with no write
at all.

**A pack is a grouping label, not a scope.** Nobody declares that a repository is
C++. The rules in an ecosystem pack are scoped by their own `paths`, so a C++
rule costs one glob test on a JavaScript push and can never fire on it. That is
why every pack is on by default without drowning anyone.

| Pack | |
|---|---|
| `core` | Attacks that do not care what the code is written in |
| `secrets` | Credentials and keys committed to a repository |
| `ci` | Pipelines, which hold the credentials everything else wants |
| `binary` | Artifacts committed where no diff can show their contents |
| `shell` | Download-and-run, reverse shells, files that execute on login |
| `container` | Dockerfiles, compose, Kubernetes, Terraform |
| `javascript` `python` `cpp` `go` `rust` `jvm` `dotnet` `ruby` `php` | Per ecosystem: install-time execution, build systems that shell out, dynamic evaluation |

The rules page lists only what an account wrote or changed. All 76 catalog
rules run regardless; putting every one of them in the table buried the handful
that were actually yours. **Browse catalog** opens a searchable picker instead,
and choosing a rule opens the rule form filled in from it.

A picker rather than a filter on the same table, because the filter was a search
param and the pager did not carry it: page two of the catalog silently fell back
to the account's own rules and rendered empty. A dialog has no pages to fall out
of step with.

Overrides win by id, whole. A rule is small, and a stored *patch* would have to
be re-applied against a catalog entry that has since changed, which is how a
rule ends up meaning something nobody chose. Undoing an override restores the
shipped rule; there is deliberately no way to delete a catalog rule outright,
because disabling it says the same thing and survives.

`rules.example.yaml` documents the format. A rule combines:

| Field | Meaning |
|---|---|
| `repos`, `branches` | glob scoping, empty = all; `acme/*` binds a rule to one org |
| `all_of` | groups of globs, each of which must be matched by a file in the **same** push |
| `paths`, `exclude_paths`, `change_type` | changed-file conditions |
| `when` | push conditions: `forced`, `sender_first_push`, `branch_created`, `branch_deleted`, `hour_utc`, `author_mismatch`, `unreviewed` |
| `added_lines` | regex against added diff lines (case-sensitive, no flags) |
| `commit_message` | regex against each commit's subject line; costs no API call |
| `ai` | a question Claude answers about the diff |
| `severity` | low, medium, high, critical; high+ mentions your alert contact |

All conditions on a rule must hold; each rule is evaluated independently.

Content rules (`added_lines`, `ai`) need a diff. On a branch's first push
there is no previous commit to compare against, so the rule is reported
without diff confirmation rather than silently dropped.

## Unsafe rules

A rule's regex is written by a user and run against text an attacker controls,
which makes catastrophic backtracking a detector bypass rather than a
performance bug. `(\w+\s?)+=` takes over thirty seconds on a sixty-character
line, well inside the 2000-character scan cap. Push that line and the
invocation evaluating the push never finishes: nothing is assessed, nothing is
filed, and the log simply stops. Anything else in the same push goes unseen.

Every regex is checked for that when a rule is **written**, and not when it is
read. `getActiveRules` parses the whole rule set on every push and
`default-rules.ts` parses at module load, and the analysis costs hundreds of
milliseconds on a complicated pattern; paying it there would put a second on
every webhook and every cold start. Rules are written rarely and read
constantly.

Covered by the same check: the dashboard, `PATCH`, YAML import, and
`npm run validate:rules`.

`recheck` does the analysis. `redos-detector` was tried first and cannot: it
reports "inconclusive" as unsafe, so it rejected two of the rules Pushguard
itself ships while saying nothing different about the pattern that actually
hangs. A pattern that cannot be *verified* safe is rejected too, with a
different message. An over-strict answer costs somebody a rewrite and tells
them so; an over-permissive one leaves a silent hole.

Rules stored before this existed are not re-checked on read, for the same cost
reason. `npm run audit:rules` reports them and exits non-zero, so it can gate
CI. It only reports: disabling somebody's detection rule is not a script's
decision. The script needs a database, so it reads `.env` when there is one and
otherwise takes the environment as given, which is what CI provides.

## Trojan Source

Source that renders differently than it executes. A bidi override closes a
comment to the eye and not to the compiler; an invisible character splits an
identifier into two symbols that look identical. The reviewer approves what
they were shown, and the machine runs something else.

Detected with `unicode_risk`, which is not a regex, because this is not a regex
problem. The characters involved are catalogued by Unicode and change with each
release, and a hand-written character class fails in both directions at once:
it misses variation selectors and Mongolian separators, and it flags every file
that legitimately contains Arabic or Hebrew text. `anti-trojan-source` works
from Unicode character data, so control characters are flagged and letters
never are.

- `unicode_risk: controls` catches the Trojan Source family: bidi overrides and
  isolates, zero-width characters, soft hyphens, variation selectors.
- `unicode_risk: confusables` adds homoglyphs. Off by default, because a
  codebase that legitimately writes non-Latin identifiers or content trips it.

**The default rule has no path scoping, on purpose.** The attack is in the text
encoding, not in a language: a bidi override reorders a Python comment, a Go
string and a YAML key exactly as well as it reorders JavaScript. Restricting it
to the extensions we happened to think of is how it gets missed.

Findings name the character rather than quoting it, `U+202E RIGHT-TO-LEFT
OVERRIDE (Cf (Format)) at column 28`. Quoting is useless by definition: the
character is invisible or reorders what follows, so pasting it into the issue
reproduces the illusion in the alert instead of exposing it. Matched lines are
stripped of these characters before they reach an issue body for the same
reason.

## Hiding in plain sight

Padding a line with hundreds of spaces pushes its code off the right-hand side
of a diff. A reviewer sees a blank-looking line and scrolls past, and the same
padding used to push the payload past the 2000-character scan cap, so the
content rules missed it too. One edit defeated the reviewer and the detector at
once.

Every content match is now tested against both the raw line and a squeezed one,
with runs of whitespace collapsed and zero-width characters removed. The union
can only ever match more, so a rule that deliberately tests indentation still
works. Findings are squeezed before the 300-character display cap as well: a
padded line used to be cut to 300 characters of whitespace and then trimmed to
nothing, so the evidence rendered as an empty bullet.

`hidden-by-padding` matches the technique itself, whatever is being hidden. It
does not require code after the padding: with padding heavier than the cap the
whole slice is whitespace, and requiring a non-space character would miss the
worst case.

## Review bypass and identity

Two things a push claims about itself, and neither is verified by git.

**Who wrote it.** `user.name` and `user.email` are local config. A commit can
name anyone, and GitHub will render that account's name and avatar next to it,
because it links commits to accounts by author email. `sender.login` on the
push is different: it is the account GitHub authenticated, and it cannot be set
from a working copy. `when: { author_mismatch: true }` is the gap between the
two.

On its own that gap is ordinary. Merging a pull request pushes somebody else's
commits under your credential, so most mismatches in any repository are
routine. It is worth a ticket when paired with the second thing.

**Whether anyone reviewed it.** `when: { unreviewed: true }` asks GitHub which
pull requests contain the pushed commit. Nothing back means it went straight at
the branch, whatever the message says. A commit reading
`Merge pull request #15 from ...` is just a string: it can be written by hand,
it renders in the pull request timeline as though the code was reviewed, and a
single-parent commit was never a merge at all.

- **Costs one GitHub call, and only when asked.** A rule must both test
  `unreviewed` and already admit this repo and branch through its own `repos`
  and `branches` globs. A rule aimed at `main` puts no call on feature-branch
  pushes.
- **An unanswerable question stays unanswered.** The lookup returns null, never
  true, on any failure, including the 403 from an installation that has not
  accepted the Pull requests permission. Otherwise writing the rule would open a
  critical ticket for every push in the organization.
- **Needs Pull requests: Read.** Adding it to the App means every existing
  installation must accept the permission change before these rules can fire.
  Until they do, `unreviewed` stays null and the rules are silent rather than
  wrong.

Three defaults use them. `impersonated-commit` and `fake-merge-commit` are on;
`unreviewed-push-to-main` ships disabled, because pushing straight to main is a
thing plenty of teams do on purpose.

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
npm test             # engine, rule defaults, alert routing, paging, regex safety
npm run validate:rules   # rules.example.yaml parses and no regex can hang
npm run audit:rules      # same check against the rules already in the database
```

Behind a CDN in development? Make sure it is not caching `/_next/*`. Turbopack
reuses chunk filenames across rebuilds, so a cached chunk is served for a URL
whose contents have changed. Which shows up as edits that never appear, or a
`module factory is not available` error that survives restarts.

`scripts/migrate-rules-to-owner.ts` is a one-off for databases created before
rules moved from per-org to per-account. It is idempotent and reports
`nothing to migrate` once applied.

`npm run migrate:catalog` is the one-off for databases created while rules were
still seeded. It reports by default and only deletes copies byte-identical to
their catalog entry. Anything that differs is printed field by field and kept:
a stored rule that no longer matches is either a deliberate edit or an untouched
copy of an older catalog, and nothing in the database separates them, so the
choice is yours rather than a script's.

## License

MIT
