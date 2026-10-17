# @redhat-cloud-services ("Miasma")

**Type:** Package & maintainer takeover · **When:** 1 June 2026 · **Status:** confirmed

## What happened
An employee's GitHub account was compromised. The attacker pushed orphan commits to RedHatInsights repos, skipping review. GitHub Actions then built and published more than 32 packages, with valid SLSA provenance. In one package, `index.js` grew from about 200 KB to 4.29 MB.

## How it got in
1. The attacker took over an employee's GitHub account.
2. They pushed orphan commits (commits not on any normal branch history), so no pull request review happened.
3. Actions minted OIDC tokens and built from those commits.
4. Packages went out with real provenance pointing at the bad commits.

## Why it was hard to spot
- Provenance was valid, because the real workflow built it.
- There was no PR to review.
- Provenance only says "built by this workflow from this commit". It does not judge the commit.

## Signs to look for
- In one change: a file that jumps in size many times over (200 KB to 4.29 MB); a large obfuscated or bundled file.
- Across changes over time: commits that skip review from an account that normally uses PRs; releases built from commits not on the default branch.

## Defanged example
```
push  <orphan-commit>  (no PR, not on main)
  index.js   200 KB -> 4.29 MB   (+ <bundled-blob>)
release workflow -> publish <pkg>@<new> with valid provenance
```

## How Pushguard catches it
- **Identity & review context:** `unreviewed-push-to-main` (if the branch matches), `off-hours-push`, `ci-agent-shaped-push`.
- **Diff rules:** `js-obfuscated-payload`; js-x-ray skips files over 1 MB, so the 4.29 MB file would not get AST analysis.
- **AI investigator:** can be pointed at the change, but a 4 MB file exceeds read limits; that gap is filed as a finding, not as clean.
- A file-size-jump rule and a "built from unmerged commit" check are not built.

## References
- [Unit 42 (fetched)](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
