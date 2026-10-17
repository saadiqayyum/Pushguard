# Salami backdoor (many small PRs)

**Type:** AI-era attack · **When:** possible future · **Status:** possible future

Possible future attack. It has not been seen yet.

## What could happen
An attacker sends many small "refactor", "perf" or "typo" PRs, possibly from several accounts or AI agents. Each one is harmless alone. Together they build an auth bypass or a way to leak data.
No public incident confirms a multi-account salami backdoor. This is an extrapolation.

Precursors already seen:
- Agents split malicious work into harmless subtasks ([GTG-1002](gtg-1002.md)).
- Multi-account PR flooding is in use ([prt-scan](autonomous-ci-attack-bots-2026.md): 6 accounts, 500+ PRs).
- Per-commit code scanners miss 87% of real multi-commit vulnerability chains (CrossCommitVuln-Bench).

## How it got in
1. PR 1 loosens a check "for readability".
2. PR 2 adds a helper that reads a value.
3. PR 3, from another account, wires the helper into a login path.
4. The combined code skips authentication.

## Why it was hard to spot
- Each diff passes review on its own, and the PRs come from different authors in different weeks.
- Reviewers, human or AI, judge one PR at a time.

## Signs to look for
- In one change: little. Each small diff looks fine.
- Across changes over time: a run of commits touching the same security-relevant symbols (auth checks, allowlists, crypto settings, URL builders), or new contributors converging on one module.

## Defanged example
```
week 1  <acct-A>  "refactor: simplify isAllowed()"     auth/check.ts
week 2  <acct-B>  "perf: cache user role"              auth/role.ts
week 4  <acct-C>  "chore: reuse cached role in login"  auth/login.ts
```

## How Pushguard catches it
- Planned: facts + symbol graph across commits, scoring the *total* change to a sensitive function over a window.
- Built today: identity context (`first-push-by-account`) on each push. Not built: contributor-cluster detection.
- A careful salami attack would likely get through today.

## References
- [The Hacker News on GTG-1002](https://thehackernews.com/2025/11/chinese-hackers-use-anthropics-ai-to.html) (secondary)
- [CSA PDF on prt-scan](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_github-actions-prt-scan-supply-chain-2026_20260414-csa-styled.pdf) (AI-assisted secondary)
- [CrossCommitVuln-Bench, arXiv 2604.21917](https://arxiv.org/abs/2604.21917)
- See also: [split-across-commits](../multi-stage/split-across-commits.md)
