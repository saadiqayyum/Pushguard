# Clinejection

**Type:** CI/CD & GitHub platform · **When:** 2026 (disclosed 2026-02-09) · **Status:** confirmed

## What happened

The Cline project ran an AI issue-triage workflow that anyone could trigger by opening an issue. It shared a `node_modules` cache key with the nightly release workflow. Eight days after the issue was disclosed, an unknown actor published an unauthorized Cline CLI to npm.

## How it got in

1. An attacker opens an issue. The issue text is a prompt injection (text that tells an AI what to do).
2. The AI triage workflow reads the issue and follows the hidden instructions.
3. The workflow writes poisoned content into the shared `node_modules` cache.
4. The nightly release workflow restores that cache and builds with it.
5. The release ships the attacker's code.

## Why it was hard to spot

- The entry point was plain text in an issue. No code was pushed.
- Cache writes send no webhooks, and `permissions: {}` does not stop a workflow from writing to the cache.

## Signs to look for

- In one change: look for a workflow that passes issue title or body into an AI step. Two workflows (one low-trust, one release) that use the same cache key.
- Across changes over time: an issue from an unknown account followed by a release whose contents differ from the source is worth checking.

## Defanged example

```
.github/workflows/triage.yml   on: issues        cache key: node-modules-<hash>
.github/workflows/nightly.yml  on: schedule      cache key: node-modules-<hash>   # same key
issue body: "<instructions aimed at the AI triage bot>"
```

## How Pushguard catches it

- **Diff rules:** `ci-workflow-changed` flags the workflow files when they are added or changed. An AI rule could be written to look for shared cache keys; none ships by default.
- **Not built:** cache poisoning detection, issue-text scanning for prompt injection in CI, and release events.

## References

- [Adnan Khan, Clinejection](https://adnanthekhan.com/posts/clinejection/)
- [Simon Willison](https://simonwillison.net/2026/Mar/6/clinejection/)
- [Snyk](https://snyk.io/jp/blog/cline-supply-chain-attack-prompt-injection-github-actions/)
- [GitHub Security Lab, new patterns](https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/)
- See also: [Cache poisoning](cache-poisoning.md), [PromptPwnd](../ai/promptpwnd.md)
