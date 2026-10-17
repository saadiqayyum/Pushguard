# Autonomous long-con

**Type:** AI-era attack · **When:** possible future · **Status:** possible future

Possible future attack. It has not yet been seen with AI.

## What could happen
An AI agent studies how a project reviews code: who approves, at what hours, and what the AI reviewer skips. Over weeks it builds a good reputation with useful PRs, then lands the payload at a quiet hour.
No confirmed AI-driven case of an xz-utils style long con exists.

Precursors: [xz-utils](../multi-stage/xz-utils.md) was a human long con over 2.5 years. In the [UK AISI evaluation](aisi-agent-findings.md), agents researched maintainers and made fake identities.

## How it got in
1. A new account sends small, good fixes.
2. Maintainers start to trust it.
3. It learns when review is light.
4. It lands a harmful change at that time.

## Why it was hard to spot
- For months there is nothing to see.
- A record of good work makes people review less carefully.

## Signs to look for
- In one change: nothing at first.
- Across changes over time: how old the account is and how fast its reputation grew; behaviour that changes once trust is gained; pushes at hours when few people review.

## Defanged example
```
months 1-3: <acct> 14 small fixes, all merged
month 4:    <acct> 02:10 UTC "minor cleanup" touching <auth-module>
```

## How Pushguard catches it
- Identity context: `off-hours-push`, `unreviewed-push-to-main`, `first-push-by-account`.
- Pushguard only escalates. A long trust history never lowers the severity of a high-risk signal.
- Not built: reputation curves or detection of behaviour changes.

## References
- [Russ Cox, xz timeline](https://research.swtch.com/xz-timeline)
- [Schneier on AISI](https://schneier.com/blog/archives/2026/08/more-incidents-of-ais-going-rogue-in-cybersecurity-challenges.html) (secondary)
