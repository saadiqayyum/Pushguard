# TeamPCP: Trivy and KICS action tags

**Type:** CI/CD & GitHub platform · **When:** March 2026 · **Status:** confirmed

## What happened

Attackers force-pushed almost every version tag of `aquasecurity/trivy-action` to bad commits. They also published a backdoored Trivy v0.69.4 binary to GitHub Releases and container registries. The same campaign force-pushed 35 tags in `checkmarx/kics-github-action`. This repeated the [tj-actions](tag-repointing-tj-actions.md) pattern a year later.

Sources disagree on the count: Phoenix Security says 75 of 76 trivy-action tags; CSA says 76 of 77, and adds that all 7 `setup-trivy` tags were overwritten too.

## How it got in

1. Late February 2026: an earlier intrusion took place.
2. Credential rotation after that intrusion missed one valid token.
3. 2026-03-19: the leftover token was used to force-push the action tags to malicious commits.
4. A backdoored release binary (v0.69.4) went out through GitHub Releases and container registries.

## Why it was hard to spot

- Workflows that pin `trivy-action@<tag>` did not change. The tag moved under them.
- A release asset is a binary, so no diff shows what is inside it. The token was valid, and the pushes looked normal.

## Signs to look for

- In one change: look for `forced: true` on `refs/tags/*` with a real `before` commit. Replacement commits with no GPG signature where the originals were web-signed (one guide suggests checking this).
- Across changes over time: watch for many tags moved in one burst. A release published with no matching tag push or workflow run. Pushes from a token that should have been revoked after an earlier incident.

## Defanged example

```
push refs/tags/0.20.0  forced=true  before=<signed-sha>  after=<unsigned-sha>
push refs/tags/0.19.0  forced=true  before=<signed-sha>  after=<unsigned-sha>
... (dozens more within minutes)
release v<x.y.z>  asset: <binary>  (no tag push, no workflow run)
```

## How Pushguard catches it

- **History/forensics:** `tag-moved` (critical) when a tag in a watched repo moves. Gap: GitHub sends no tag events when more than 3 tags are pushed at once, and there is no tag-to-SHA snapshot yet, so a bulk repoint like this one can be invisible.
- **Diff rules:** `ci-action-unpinned` flags consumers that pin a tag instead of a commit SHA.
- **Not built:** release events and release-asset swaps; consumer-side tag drift; checks for tokens left over after rotation.

## References

- [Phoenix Security](https://phoenix.security/trivy-supply-chain-attack-team-pcp/)
- [CSA research note](https://labs.cloudsecurityalliance.org/research/csa-research-note-teampcp-cicd-supply-chain-20260325/)
- [BleepingComputer](https://www.bleepingcomputer.com/news/security/trivy-vulnerability-scanner-breach-pushed-infostealer-via-github-actions/amp/)
