# OIDC token theft and cloud pivot

**Type:** CI/CD & GitHub platform · **When:** 2026 · **Status:** reported (no dedicated incident write-up in the notes)

## What happened (or: What could happen)

An OIDC token is a short-lived login token that GitHub Actions can mint for a job. Cloud providers and registries such as npm Trusted Publishing accept it in place of a stored password. An attacker who reads it can act as the workflow, for example to publish packages or reach cloud accounts.

The notes found no full incident write-up for OIDC theft into a cloud account. They do record two 2026 cases where OIDC played a part:

- **[TanStack](../packages/tanstack-2026.md) (May 2026):** the OIDC token was read from runner memory. The malware shipped with valid SLSA Build L3 provenance, the first documented case.
- **[Red Hat Miasma](../packages/redhat-miasma-2026.md) (June 2026):** orphan commits pushed with a compromised employee account made Actions mint OIDC tokens, so the packages had valid provenance.
- The 2026 SAP wave was also linked to an OIDC trust-scope misconfiguration.

## How it got in

1. A workflow has `id-token: write`, so it can mint OIDC tokens.
2. The attacker gets code into that workflow (pwn request, cache poisoning, or a direct push).
3. The code reads the token from the runner while the job runs.
4. The token is used to publish or to log in to the cloud as the workflow.

## Why it was hard to spot

- Tokens are minted at run time, and repo webhooks cannot see them being stolen.
- The result has valid provenance and comes from the real workflow and commit.

## Signs to look for

- In one change: look for a workflow diff that adds `id-token: write`. A publish job with no protected `environment:`.
- Across changes over time: watch for a release that has provenance but whose commit was never reviewed or is an orphan. Check cloud-side logs (CloudTrail-type) for the workflow identity doing something new. This last point is the notes' own inference and has no source.

## Defanged example

```yaml
permissions:
  id-token: write        # added in this push
jobs:
  publish:
    # no environment: gate
    steps:
      - run: <step that could read runner memory>
```

## How Pushguard catches it

- **Diff rules:** `ci-permissions-widened` and `ci-workflow-changed` flag the permission change. `unreviewed-push-to-main` flags orphan or direct pushes.
- **Not built:** OIDC theft itself is not visible to Pushguard. Nothing checks cloud logs or runtime memory.

## References

- [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/) (fetched; TanStack, Red Hat, SAP)
- Gap in notes: no primary-source incident for OIDC theft or cloud pivot was found.
