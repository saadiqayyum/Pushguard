# Autonomous CI attack bots: hackerbot-claw and prt-scan

**Type:** AI-era attack · **When:** Feb to Apr 2026 · **Status:** reported (single or AI-assisted secondary sources, unverified)

## What happened
hackerbot-claw (Feb 2026): a bot, reported to be autonomous, went after `pull_request_target` workflows in 7 major open-source repos. It got code execution and stole credentials in most of them. One account says it was LLM-powered. One attempt reportedly failed because the target repo's own AI agent spotted the injection and refused.

prt-scan (Mar to Apr 2026): one actor with 6 throwaway accounts opened 500+ malicious PRs. At least 2 npm packages were compromised across 106 versions. The finding is attributed to Wiz Research, through a CSA note that was itself written with AI help.

## How it got in
1. The bot looks for repos with risky `pull_request_target` workflows.
2. It opens PRs from throwaway accounts.
3. PR content (title, branch name, code) runs inside the privileged workflow. See [pwn requests](../ci-cd/pwn-request-and-script-injection.md).
4. The workflow leaks tokens, and the attacker uses them, for example to publish packages.

## Why it was hard to spot
- Bots work fast and hit many repos at once. Throwaway accounts have no history to judge.
- A target's AI agent refused once, so a model-side refusal sometimes works. It is no guarantee.

## Signs to look for
- In one change: a workflow that uses `pull_request_target` and checks out or runs PR code.
- Across changes over time: many similar PRs from new accounts in a short window.

## Defanged example
```
PR #<n> from <new-account-1>: title "<shell-metacharacters>"
PR #<n+1> from <new-account-2>: same shape, different repo
... 500+ PRs from 6 accounts
```

## How Pushguard catches it
- Diff rule: `ci-pull-request-target` flags the risky workflow when it is added or changed.
- Identity context: `first-push-by-account` notes new pushers.
- Not built: grouping many PRs from new accounts into one campaign.

## References
- [Bastion](https://bastion.tech/blog/hackerbot-claw-ai-agent-supply-chain-attacks-github-actions) (single secondary source, unverified)
- [CSA PDF on prt-scan](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_github-actions-prt-scan-supply-chain-2026_20260414-csa-styled.pdf) (AI-assisted secondary source)
