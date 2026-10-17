# Ultralytics PyPI compromise

**Type:** CI/CD & GitHub platform · **When:** December 2024 · **Status:** confirmed (cache step is likely, not confirmed)

## What happened

Bad versions of the `ultralytics` Python package (8.3.41, 8.3.42, 8.3.45, 8.3.46) were published to PyPI. They carried a cryptominer that was not in the GitHub source. v8.3.41 came out on 2024-12-04 and stayed up about 12 hours.

## How it got in

1. A `pull_request_target` workflow put the PR's branch name straight into a shell command (`run:`). A custom action in `ultralytics/actions` had reintroduced a bug that had been fixed earlier.
2. The attacker opened PRs (#18018, #18020) with a crafted branch name, which ran as a command.
3. That command downloaded a script that stole tokens and secrets and most likely poisoned the pip cache used by setup-python.
4. A later release job restored the poisoned cache while it held publish rights.
5. The project used PyPI Trusted Publishing with no protected deployment environment, so control of the workflow was enough to publish.
6. 8.3.45 and 8.3.46 were later pushed to PyPI directly with stolen credentials, skipping Actions.

## Why it was hard to spot

- The bad code never appeared as a merged commit.
- Cache writes and evictions send no webhooks.
- The direct-to-PyPI releases had no matching GitHub activity at all.

## Signs to look for

- In one change: look for a workflow that adds `pull_request_target` and puts `${{ github.event.* }}` (like `head_ref`) inside `run:`. A cache shared between a low-trust workflow and the release workflow. A publish job with no `environment:`.
- Across changes over time: watch for a PR from a never-seen fork whose branch name contains shell characters like `$(`, backticks or `;`. A release with no matching tag push or workflow run.

## Defanged example

```
branch name:  feature-$(<download-and-run> <attacker-domain>)
workflow:     on: pull_request_target
              run: echo "${{ github.head_ref }}"      # branch name becomes a command
release job:  restores cache key <shared-pip-key>     # poisoned earlier
```

## How Pushguard catches it

- **Diff rules:** `ci-pull-request-target` and `ci-workflow-changed` flag the risky workflow when it is pushed. That covers the precondition only.
- **Not built:** PR branch-name metacharacter checks (unless an AI rule is written for it), cache poisoning, and release events. A direct-to-registry publish is outside what GitHub webhooks show.

## References

- [PyPI blog](https://blog.pypi.org/posts/2024-12-11-ultralytics-attack-analysis/)
- [Yossarian (zizmor author)](https://blog.yossarian.net/2024/12/06/zizmor-ultralytics-injection). The cache vector is his conclusion from the fix PR.
- [Snyk](https://snyk.io/de/blog/ultralytics-ai-pwn-request-supply-chain-attack/)
- Gap in notes: no authoritative postmortem confirming the exact cache key. An LWN claim that PyPI blocked `pull_request_target` for Trusted Publishing is unverified.
- See also: [Cache poisoning](cache-poisoning.md), [Pwn requests and script injection](pwn-request-and-script-injection.md)
