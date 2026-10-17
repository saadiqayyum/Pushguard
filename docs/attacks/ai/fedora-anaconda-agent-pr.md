# Fedora / Anaconda: mismatched AI agent PR merged

**Type:** AI-era attack (review failure) · **When:** May 2026 · **Status:** reported (single blog source, low confidence)

## What happened
A PR written by an AI agent was merged into Anaconda, the installer Fedora uses.
The PR description did not match the actual change. It looks like negligence and a failed review rather than malice.

## How it got in
1. An AI agent opened a PR.
2. The description said one thing and the code did another.
3. Reviewers trusted the description and merged it.

## Why it was hard to spot
- Reviewers read the summary and skimmed the lines.
- An agent writes tidy, confident descriptions whether they are right or wrong.

## Signs to look for
- In one change: the PR text or commit message does not match what the diff does.
- Across changes over time: agent-authored PRs merged quickly with little review.

## Defanged example
```
PR title: "Fix typo in installer message"
Diff: changes <partitioning-logic> in <installer-module>
```

## How Pushguard catches it
- When an AI rule covers those paths, the AI investigator can compare a change with its stated purpose. It can only add or escalate findings.
- No default diff rule checks whether a description matches the diff.

## References
- [kunalganglani.com](https://www.kunalganglani.com/blog/rogue-ai-agent-fedora-open-source.md) (single blog source, low confidence)
