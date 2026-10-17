# Commit author impersonation

**Type:** CI/CD & GitHub platform · **When:** ongoing; seen 2021 to 2026 · **Status:** confirmed (attack class)

## What happened

The author and committer fields on a git commit are free text, so anyone can type someone else's name and email. GitHub shows the Gravatar avatar for that email, and the timestamp can be set to any value. The "Verified" badge only checks signatures that exist. Unsigned commits are not flagged unless the impersonated user turns on vigilant mode, which marks their unsigned commits "Unverified".

Real cases: fake `renovate[bot]` and `github-actions[bot]` commits in the [tj-actions chain](tag-repointing-tj-actions.md); [fake Dependabot commits](fake-dependabot-commits-2023.md) in 2023; signed `github-actions[bot]` commits in ChainDrop; Claude-impersonating commits in the 2026 SAP wave; and the PHP git server, where commits were forged as two core developers.

## How it got in

1. The attacker has push access, through a stolen token, a compromised server or a bot account's token.
2. They set the commit author to a trusted person or a bot.
3. They push, and the commit appears under the trusted name and avatar.

## Why it was hard to spot

- Reviewers trust names and avatars. Bot commits get skimmed.
- Most people do not use vigilant mode, so missing signatures are not called out.

## Signs to look for

- In one change: check whether the author name or email claims `*[bot]` while the pusher is a human. Author is not the pusher. No signature where that person normally signs.
- Across changes over time: look for unsigned commits in a history that is usually signed. A commit message that does not match what the diff does.

## Defanged example

```
commit <sha>
Author:     <trusted-maintainer> <<their-email>>
Committer:  <trusted-maintainer> <<their-email>>
Pusher:     <different-account>
Signature:  none   (their previous 200 commits: signed)
```

## How Pushguard catches it

- **Identity & review context:** `impersonated-commit` (another account's authorship reached a branch without review), `fake-merge-commit` (claims a PR merge that no PR contains), and the `author_mismatch` condition. `unreviewed-push-to-main` adds context.
- **Not built:** a per-repo signed-commit baseline ("this person always signs").

## References

- [GitHub changelog](https://github.blog/changelog/label/code/)
- [Checkmarx](https://checkmarx.com/blog/unverified-commits-are-you-unknowingly-trusting-attackers-code.md)
- [Ramimac Commit Autopsy](https://ramimac.me/commit-autopsy/)
- [Unit 42 (tj-actions)](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- [Datadog (ChainDrop)](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/) (fetched); [Unit 42 (SAP wave)](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/) (fetched)
- [The Hacker News (fake Dependabot)](https://thehackernews.com/2023/09/github-repositories-hit-by-password.html)
- See also: [PHP git server](../multi-stage/php-git-server.md)
