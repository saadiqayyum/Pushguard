# Repository settings tampering

**Type:** CI/CD & GitHub platform · **When:** ongoing; seen 2025 · **Status:** confirmed (attack class)

## What happened

Some attacks leave the code alone and change repo settings instead: who can push, what needs review, who can see the repo. Access granted this way survives a password or token reset. Examples from the notes:

- **Member added:** in the [tj-actions chain](tag-repointing-tj-actions.md), a leaked PAT added a throwaway member to SpotBugs. Two minutes later a bad workflow was pushed.
- **Visibility flip:** [Shai-Hulud](../packages/shai-hulud-1.md) cloned private org repos and republished them as public under the victim's account with a `-migration` suffix (created private first). [Nx s1ngularity](../packages/nx-s1ngularity.md) used stolen tokens to make private repos public.
- **Other levers:** branch protection or rulesets weakened or deleted, `CODEOWNERS` edited, deploy keys added (write access is the risky case), repo webhooks added, GitHub App installs, security features turned off.

## How it got in

1. The attacker gets an admin-level token or account.
2. They add a member, deploy key, webhook or App, or weaken protection.
3. They use that new access to push, or to keep access after the original token is revoked.
4. Some flip private repos public so the history is readable by anyone.

## Why it was hard to spot

- Settings changes are not in any diff.
- Several have no webhook at all: webhook creation, self-hosted runner registration, Actions secret creation. These are only in the audit log.
- `team`, `membership` and `organization` events are not sent to repo-level webhooks.
- Create-repo audit entries leave out descriptions, so look for random-looking repo names.

## Signs to look for

- In one change: look for `branch_protection_rule.deleted/edited`, `repository_ruleset.deleted/edited`, `deploy_key.created` with `read_only: false`, `repository.publicized`, a push touching `CODEOWNERS`, `security_and_analysis` changes.
- Across changes over time: watch for a member being added, then a workflow push by that identity, then protection deleted, within hours. A new repo named `*-migration` or random, then repos made public by the same member. A webhook deleted (`meta`) right after other settings changes.

## Defanged example

```
14:02  member.added             <new-account>
14:04  push  .github/workflows/<x>.yml   by <new-account>
14:10  branch_protection_rule.deleted  main
14:15  deploy_key.created       read_only=false
```

## How Pushguard catches it

- **Settings events (no rule needed):** repo made public files a critical alert; `deploy-key-added`, `protection-weakened`, `protection-deleted`; an org ruleset change sends an out-of-band meta-alert.
- **Diff rules:** `reviewers-and-ci-in-one-push` (CODEOWNERS and workflows in one push), `protection-removed`, `first-push-by-account`.
- **Not built:** `member.added` alerts, webhook creation and runner registration (audit-log only), and new repos with `-migration` or random names.

## References

- [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- [Wiz (Shai-Hulud)](https://www.wiz.io/blog/shai-hulud-npm-supply-chain-attack)
- [Semgrep](https://app.semgrep.dev/blog/2025/digging-for-secrets-sha1-hulud-the-second-coming-of-the-npm-worm); [Sumo Logic](https://www.sumologic.com/?p=62047)
- [GitHub Docs, webhook events](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- [GitHub Docs, org audit log events](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/audit-log-events-for-your-organization) (the notes' fetch of this page was truncated; some event names unconfirmed)
