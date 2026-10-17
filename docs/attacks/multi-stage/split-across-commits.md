# Attacks split across many commits

**Type:** Multi-stage backdoor (attack class) · **When:** 2018 to 2026 · **Status:** confirmed

## What happened

Attackers break a backdoor into pieces and land them one at a time. Each commit or release looks fine when read alone, and the danger appears only once the last piece is in. A tool that reviews one change at a time cannot see it.

Real shapes from the notes:
- Decoy, then malicious: axios's added dependency had a clean version one day, then a malicious one the next. event-stream first added a clean dependency, then the payload came in a later version of that dependency.
- Add, revert, re-add: in the PHP git server case, the attacker reverted the revert.
- Groundwork first: xz added a runtime hook a year before the payload.
- Push, then delete: in ChainDrop, a commit was made then deleted, and a branch with a workflow was made then deleted.

## How it got in

1. Commit A adds something harmless: a helper that reads a value, a data file, or a dependency.
2. Later, maybe from another account, commit B adds a transform (decode, decrypt).
3. Later still, commit C sends the result to a sink (shell, eval, network).
4. Each review sees one small, reasonable change.

## Why it was hard to spot

- A 2026 benchmark (CrossCommitVuln-Bench, 15 real Python CVEs) found Semgrep and Bandit caught only 13% of such chains per commit, and 27% even when scanning the full codebase.
- Lily, a per-commit fuzzing tool, caught a PHP-style add-revert-re-add attack, but its authors say many tiny commits still need cross-commit correlation.

## Signs to look for

- In one change: often nothing strong.
- Across changes over time: new contributor, then a dependency add, then a version bump; a dependency added at a clean version, then bumped to a version published days later; commit then revert; branch created and deleted within minutes carrying a workflow; the same security-relevant function touched by several small changes.

## Defanged example

```
week 1  utils/config.js   + function readSetting() { return <env value> }
week 3  utils/format.js   + function pack(x) { return <encode>(x) }
week 6  utils/report.js   + send(<attacker-domain>, pack(readSetting()))
```

## How Pushguard catches it

- History/forensics: force-push forensics shows lines removed from history; `branch-deleted` catches short-lived branches.
- Identity & review context: `first-push-by-account` and `unreviewed-push-to-main` add weight.
- Facts + symbol graph across commits (planned): store source, transform and sink facts per commit and alert when a new commit completes the path. This is the main defense and it is not built yet.
- AI investigator: can look at history with tools, but only within one review.

## References

- [arXiv 2604.21917, CrossCommitVuln-Bench](https://arxiv.org/abs/2604.21917)
- [arXiv 2607.26719, Lily](https://arxiv.org/html/2607.26719)
- [Pith review of Lily](https://pith.science/paper/2607.26719)
- [GitHub advisory discussion #208477 (zod/nub)](https://github.com/orgs/community/discussions/208477) (fetched)
- [Datadog, ChainDrop](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/) (fetched)
- [Endor Labs, axios](https://www.endorlabs.com/learn/npm-axios-compromise) (search-summary)

See also: [PHP git server](php-git-server.md), [xz-utils](xz-utils.md), [Possible future: salami backdoor](../ai/future-salami-backdoor.md).
