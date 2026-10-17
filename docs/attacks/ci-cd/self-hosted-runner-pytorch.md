# Self-hosted runner abuse: PyTorch and SHA1HULUD

**Type:** CI/CD & GitHub platform · **When:** Jan 2024 (PyTorch research); Nov 2025 (Sha1-Hulud) · **Status:** confirmed

## What happened

A self-hosted runner is a machine the repo owner provides to run GitHub Actions jobs. When it is not wiped between jobs, one job can leave files and processes behind for the next.

- **PyTorch (research, Stawinski and Khan, Jan 2024):** the researchers showed they could take over PyTorch's CI, which could have led to malicious GitHub and AWS releases. The technique first hit `actions/runner-images` ($20k bounty) and was shown at DEF CON 32.
- **Sha1-Hulud 2.0 (Nov 2025):** the worm registered each infected machine as a self-hosted runner named `SHA1HULUD`, attached to a new repo. On Linux it lived in a hidden directory and ran under nohup. See [Shai-Hulud 2](../packages/shai-hulud-2.md).

## How it got in

PyTorch:
1. The researchers got a small fork PR merged, which made them a "contributor".
2. Later PRs from contributors ran without approval on non-ephemeral self-hosted runners.
3. They installed their own runner on the machine for persistence.
4. They read write-scoped `GITHUB_TOKEN`s from `.git/config`, left there by `actions/checkout`.

Sha1-Hulud:
1. Malware on a developer machine gets a runner registration token.
2. It registers the machine as `SHA1HULUD` and commits `.github/workflows/discussion.yaml`.
3. Anyone who opens a Discussion can then run commands on that machine.

## Why it was hard to spot

- Runner registration has no webhook. It appears only in the audit log (`org.register_self_hosted_runner`).
- A one-line typo fix is enough to become a "contributor".

## Signs to look for

- In one change: look for a workflow adding `runs-on: self-hosted`, especially on a public repo. A workflow on `discussion` that feeds text into `run:`.
- Across changes over time: watch for a first-time contributor whose later PRs run without approval. `workflow_job` payloads naming an unknown runner like `SHA1HULUD`.

## Defanged example

```yaml
on: discussion
jobs:
  run:
    runs-on: self-hosted
    steps:
      - run: ${{ github.event.discussion.body }}   # body runs on the runner
```

## How Pushguard catches it

- **Diff rules:** `ci-self-hosted-runner` flags `runs-on: self-hosted`. `ci-workflow-changed` flags the new workflow. `first-push-by-account` adds context.
- **Not built:** runner registration (audit-log only), unknown runner names in job events, and the "first merged PR makes you trusted" chain.

## References

- [SecurityWeek](https://www.securityweek.com/new-class-of-ci-cd-attacks-could-have-led-to-pytorch-supply-chain-compromise/)
- [DevClass](https://devclass.com/2024/01/15/spotlight-on-github-self-hosted-runners-again-as-researcher-demonstrates-attack-on-pytorch-code)
- [DEF CON 32 listing](https://infocondb.org/con/def-con/def-con-32/grand-theft-actions-abusing-self-hosted-github-runners-at-scale)
- [Sysdig](https://www.sysdig.com/blog/return-of-the-shai-hulud-worm-affects-over-25-000-github-repositories); [Sumo Logic](https://www.sumologic.com/?p=62047)
- [Semgrep](https://app.semgrep.dev/blog/2025/digging-for-secrets-sha1-hulud-the-second-coming-of-the-npm-worm)
- [GitHub Docs, org audit log events](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/audit-log-events-for-your-organization)
