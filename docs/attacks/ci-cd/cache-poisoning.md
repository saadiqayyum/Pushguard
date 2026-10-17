# GitHub Actions cache poisoning

**Type:** CI/CD & GitHub platform · **When:** research 2024; used 2024 to 2026 · **Status:** confirmed (attack class)

## What happened

GitHub Actions can save files to a cache and restore them in later runs. When a low-trust job can write a cache entry that a release job restores later, the attacker's files end up in the release. Adnan Khan published research on this in 2024 and built Cacheract, a proof of concept for "cache-native malware" that persists across runs. Real cases: [Ultralytics](ultralytics.md) (likely), [Clinejection](clinejection.md), and [TanStack](../packages/tanstack-2026.md) (poisoned pnpm cache keyed to the release workflow).

## How it got in

1. The attacker gets code running inside some workflow, often through a fork PR or an issue-triggered job.
2. While that job is still running, it writes a cache entry. (The Actions Runtime Token cannot write to the cache after the job ends.)
3. It picks a key that the release workflow will restore.
4. Since 2025-11-20, GitHub evicts cache entries right away, oldest first, once a repo is over 10 GB. Before that date, eviction ran every 24 hours. Flooding the cache now pushes out the real key, and the attacker can claim it.
5. The release job restores the poisoned cache and builds or publishes with it.

## Why it was hard to spot

- The bad change never shows up as a commit, and cache writes and evictions send no webhooks.
- `permissions: {}` does not stop a workflow from writing to the cache.

## Signs to look for

- In one change: look for cache keys shared between low-trust workflows (PR, issue, comment triggers) and release workflows. A publish job with no `environment:`.
- Across changes over time: watch for a fork PR or issue event followed by a release whose artifact differs from the tagged source.

## Defanged example

```
pr-check.yml   on: pull_request_target   actions/cache  key: deps-<os>-<lockfile-hash>
release.yml    on: push tags             actions/cache  key: deps-<os>-<lockfile-hash>
```

## How Pushguard catches it

- **Diff rules:** `ci-workflow-changed` and `ci-pull-request-target` flag the risky workflow files. An AI rule could check for shared cache keys.
- **Not built:** nothing watches the cache itself, and release artifacts are not compared to source. Pushguard does not catch the poisoning step today.

## References

- [Adnan Khan, "Monsters in your build cache"](https://adnanthekhan.com/2024/05/06/the-monsters-in-your-build-cache-github-actions-cache-poisoning/)
- [Adnan Khan, Clinejection](https://adnanthekhan.com/posts/clinejection/)
- [Adnan Khan, Angular](https://adnanthekhan.com/posts/angular-compromise-through-dev-infra/)
- [Simon Willison](https://simonwillison.net/2026/Mar/6/clinejection/)
- [GitHub Security Lab, new patterns](https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/)
- [Unit 42 (TanStack)](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/) (fetched)
