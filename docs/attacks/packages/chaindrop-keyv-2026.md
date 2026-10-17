# ChainDrop (keyv, cacheable, ecto)

**Type:** Package & maintainer takeover · **When:** 4 Aug 2026 · **Status:** confirmed

## What happened
A worm hit keyv, cacheable and ecto: 444+ packages and 1,381 versions, over 2 billion monthly installs. In the GitHub repos it worked in many small steps, and each step looked incomplete on its own. keyv v6.0.0 shipped with real SLSA provenance tied to the malicious commit.

## How it got in
1. Malicious commit `174f6a5` landed in `jaredwray/keyv`. The earliest commit was unsigned, from a `lizy168/keyv` account.
2. Other accounts made commits to cacheable and ecto.
3. The commit was deleted. PRs #2042 and #2043 were opened and closed.
4. Signed `github-actions[bot]` commits added Claude and VS Code hooks: `.vscode/tasks.json` and `.claude/settings.json`, written to up to 50 branches. These re-run the loader when a folder opens or a Claude session starts.
5. An unsigned commit replayed the package changes onto main.
6. A temporary branch `dependabot/github_actions/format/setup-formatter` carried an injected `codeql_analysis.yml` that dumped secrets. Then it was deleted.
7. `package.json` `scripts` were replaced with `preinstall: node setup.mjs`. An optional dependency pointed at an `opensearch-js` GitHub commit.
8. npm spread used stolen granular tokens with `bypass_2fa`.
9. A GitHub Release appeared about 20 minutes after the npm publish.

## Why it was hard to spot
- Each step alone looked partial or routine.
- Branch names and bot identities copied Dependabot and GitHub Actions.
- The provenance was genuine, and the token settings let the attacker skip 2FA.

## Signs to look for
- In one change: a whole `scripts` object replaced; new `.vscode/tasks.json` or `.claude/settings.json`; a new workflow dumping secrets; a git-commit dependency.
- Across changes over time: commit then delete; branch created then deleted in minutes; PRs opened and closed fast; the same files across up to 50 branches; a release after the publish.

## Defanged example
```
create  dependabot/github_actions/format/<name>  + .github/workflows/codeql_analysis.yml
delete  dependabot/github_actions/format/<name>  (minutes later)
push x50 branches  author github-actions[bot]  + .vscode/tasks.json  + .claude/settings.json
```

## How Pushguard catches it
- **Diff rules:** `js-install-hook-added`, `js-dependency-from-url`, `editor-autorun-changed`, `agent-tool-config-changed`, `ci-workflow-changed`, `ci-secret-exfiltration`.
- **Identity & review context:** `impersonated-commit` / `author_mismatch` for bot names pushed by a person, `first-push-by-account`.
- **History/forensics:** `branch_created` and `branch-deleted`; force-push forensics if history was rewritten.
- Linking the many steps together needs the facts layer (planned).

## References
- [Datadog (fetched)](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- [Elastic (title only)](https://www.elastic.co/security-labs/shai-hulud-chaindrop-npm-supply-chain)
- [Aikido (title only)](https://www.aikido.dev/blog/keyv-and-friends-compromised-in-npm-supply-chain-attack)
