# TanStack (2026)

**Type:** Package & maintainer takeover · **When:** 11 May 2026 · **Status:** confirmed

## What happened
Attackers poisoned TanStack's build cache from a fork pull request. A later release workflow used the poisoned cache and published malware. The malware carried valid SLSA Build L3 provenance, the first documented case. (Provenance is a signed record of which workflow built a package from which commit.) There were 84 publishes in six minutes and 373 versions across 169 packages by end of day.

## How it got in
1. A "pwn request": a `pull_request_target` workflow ran fork code with the base repo's rights.
2. That run poisoned the GitHub Actions cache: a pnpm cache keyed to the release workflow.
3. The release workflow restored the poisoned cache.
4. The attacker read the OIDC token from runner memory. (An OIDC token is a short-lived login the runner gets to prove who it is.)
5. Packages were published with real provenance.
6. A dead-man's switch wiped the home directory if the stolen token was revoked.
7. The toolchain source was posted to GitHub on 12 May.

## Why it was hard to spot
- The bad change never appeared as a merged commit.
- Cache writes send no webhooks.
- Provenance was valid. Unit 42: "provenance verification is necessary but no longer sufficient".

## Signs to look for
- In one change: a workflow using `pull_request_target`; cache keys shared between low-trust and release workflows; a release job with `id-token: write`.
- Across changes over time: a fork PR, then a release soon after; many publishes in minutes.

## Defanged example
```
fork PR -> pull_request_target job writes cache key "<pnpm-store-key>"
later:  release job restores "<pnpm-store-key>"  -> runs <poisoned file>
        reads <oidc-token> from runner memory -> publish x84 in 6 min
```

## How Pushguard catches it
- **Diff rules:** `ci-pull-request-target` and `ci-permissions-widened` flag the risky setup when the workflow is added or changed.
- Cache poisoning, OIDC theft and the publish burst are not visible to Pushguard. Nothing catches the attack in progress yet.
- See [cache poisoning](../ci-cd/cache-poisoning.md) and [pwn requests](../ci-cd/pwn-request-and-script-injection.md).

## References
- [Unit 42 (fetched)](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
