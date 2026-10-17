# Tag repointing: tj-actions/changed-files and reviewdog

**Type:** CI/CD & GitHub platform · **When:** Nov 2024 to Mar 2025 · **Status:** confirmed

## What happened

An attacker moved the version tags of popular GitHub Actions to bad code. Every workflow that used `tj-actions/changed-files@<tag>` then ran it, and it printed the runner's secrets into the workflow log, which is public for public repos. The action is used in over 23,000 repos. It is tracked as CVE-2025-30066 (tj-actions) and CVE-2025-30154 (reviewdog).

## How it got in

1. 2024-11-28: a SpotBugs maintainer put a personal access token (PAT) into a workflow.
2. 2024-12-06: an attacker opened a PR against a `pull_request_target` workflow. The PR changed `mvnw`, a file that runs in CI, and the PAT leaked.
3. About three months later (2025-03-11), the attacker used the PAT to add a throwaway account as a member. Two minutes later a branch with a bad workflow was pushed and deleted within one second. The workflow stole all repo secrets, including a reviewdog maintainer's PAT.
4. Same day, the `v1` tag of `reviewdog/action-setup` was moved to a commit from an attacker's fork. It was moved back about 2 hours later.
5. `tj-actions/changed-files` pulled in reviewdog indirectly. The bad reviewdog code ran in its runner and leaked the `tj-bot-actions` PAT.
6. 2025-03-14: commit `0e58ed8`, dressed up as a `renovate[bot]` commit, came in through an auto-merged PR. Tags v1 to v45.0.7 were all repointed to it.
7. The real target seems to have been Coinbase `agentkit`, which ran the action with write-all permissions and leaked a write token. Coinbase reported no damage.

## Why it was hard to spot

- Consumers' own workflow files never changed. The tag that moved lived in someone else's repo.
- Pinning to a version tag gave no protection. Pinning to a full commit SHA did.
- On free plans, tag pushes did not show up in the audit log.
- Throwaway accounts were made for one step each, then deleted.
- Wiz saw no outside exfiltration. The secrets sat only in the repos' own logs.

## Signs to look for

- In one change: look for a push on `refs/tags/*` with `forced: true` where both `before` and `after` are real commits (a moved tag, not a new one). A target commit that is not on the default branch, is unsigned where older targets were signed, or claims a `*[bot]` author.
- Across changes over time: watch for a member being added, then a branch created and deleted within seconds that touched `.github/workflows/`. A tag moved, then moved back hours later.

## Defanged example

```
10:50  member.added      <throwaway-account>
10:52  push   refs/heads/<random>   adds .github/workflows/<x>.yml
10:52  delete refs/heads/<random>
18:42  push   refs/tags/v1  forced=true  before=<clean-sha> after=<fork-sha>
20:31  push   refs/tags/v1  forced=true  before=<fork-sha>  after=<clean-sha>
```

## How Pushguard catches it

- **History/forensics:** `tag-moved` (critical) fires on a push that moves an existing tag in a repo Pushguard watches. Gap: GitHub sends no tag events when more than 3 tags are pushed at once, and Pushguard has no tag-to-SHA snapshot yet, so a bulk repoint like v1 to v45 can be missed.
- **Diff rules:** `ci-action-unpinned` flags `uses:` lines that pin a tag instead of a SHA. `ci-pull-request-target` flags the SpotBugs-style entry point. `branch_created` / `branch_deleted` conditions and `branch-deleted` cover push-and-delete branches.
- **Identity & review context:** `impersonated-commit` and `author_mismatch` cover the fake `renovate[bot]` commit.
- **Not built:** consumer-side tag drift (a third-party action's tag moving in someone else's repo), runtime egress (how StepSecurity Harden-Runner actually caught it), and `member.added` alerts.

## References

- [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- [Wiz](https://threats.wiz.io/all-incidents/tj-actionschanged-files-supply-chain-attack)
- [CISA alert](https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-github-action-cve-2025-30066)
- [Phoenix Security](https://phoenix.security/?p=34970) (secondary; StepSecurity's own post was not found)
- [Inventive HQ CVE page](https://inventivehq.com/tools/security/cve-lookup/cve-2025-30066)
- [The Hacker News](https://thehackernews.com/2025/03/github-action-compromise-puts-cicd.html); [Orca](https://orca.security/resources/blog/github-action-tj-actions-changed-files-compromised/)
- [StepSecurity blog](https://www.stepsecurity.io/blog/harden-runner-detection-tj-actions-changed-files-action-is-compromised) (vendor-sourced)
- Open question per Unit 42: how the reviewdog maintainer's PAT got into SpotBugs secrets.
- See also: [TeamPCP / Trivy](teampcp-trivy.md), [Evidence erasure](evidence-erasure.md), [Pwn requests](pwn-request-and-script-injection.md)
