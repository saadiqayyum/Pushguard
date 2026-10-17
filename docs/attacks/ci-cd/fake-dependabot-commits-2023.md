# Fake Dependabot commits

**Type:** CI/CD & GitHub platform · **When:** July 8 to 11, 2023 · **Status:** confirmed

## What happened

Attackers pushed commits to hundreds of repos, mostly owned by Indonesian accounts. Each commit was made to look like it came from `dependabot[bot]`, GitHub's dependency bot. The commits added a workflow that stole secrets and edited `.js` files to capture passwords typed into web forms.

## How it got in

1. Attackers stole personal access tokens (PATs), likely from developer machines after a malicious package install.
2. They set the committer name to look like `dependabot[bot]`, which git allows for any name, and pushed.
3. The commits added a secret-stealing workflow and edited JavaScript to skim form passwords.

## Why it was hard to spot

- People trust bot commits and rarely read them.
- The PAT use did not show up in the account's audit log.

## Signs to look for

- In one change: look for a commit whose author or committer claims `*[bot]` while the pusher is a human account. A new workflow that sends secrets out. JavaScript changes that read form fields and send them somewhere.
- Across changes over time: watch for unsigned "bot" commits in a repo where real bot commits are signed. The same change across many repos.

## Defanged example

```
commit <sha>
Author:    dependabot[bot] <<lookalike-bot-email>>
Pusher:    <human-account>
  A  .github/workflows/<name>.yml        # posts secrets to <attacker-domain>
  M  src/<login-form>.js                 # adds a password skimmer
```

## How Pushguard catches it

- **Identity & review context:** `impersonated-commit` and the `author_mismatch` condition catch a bot name pushed by a human.
- **Diff rules:** `ci-secret-exfiltration`, `ci-workflow-changed`, `js-obfuscated-payload` (if the skimmer is obfuscated).
- **Not built:** cross-repo burst correlation as a dedicated detector.

## References

- [The Hacker News](https://thehackernews.com/2023/09/github-repositories-hit-by-password.html)
- [SecurityWeek](https://www.securityweek.com/stolen-github-credentials-used-to-push-fake-dependabot-commits/)
- See also: [Commit author impersonation](commit-author-impersonation.md)
