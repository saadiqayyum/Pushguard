# Sandbox-tuned time bombs

**Type:** AI-era attack · **When:** possible future · **Status:** possible future

Possible future attack. It has not yet been seen tuned against AI sandboxes.

## What could happen
The code stays quiet unless conditions are right: a date, an env var, the absence of CI, a hostname, a user count. In a test sandbox it does nothing. On a real machine it fires.

Precursors (real, though not AI-specific): SUNBURST waited 12 to 14 days and checked its host. xz checked for `sshd` and other conditions. event-stream decrypted its payload only inside one app. A real npm package checked for a sandbox, a honeypot or CI and exited quietly when it found one. See [environment-gated payloads](../multi-stage/environment-gated-payloads.md).

## How it got in
1. The attacker adds a check such as "if date > X and not CI".
2. The bad code sits behind that check.
3. Tests and sandboxes never take that branch.

## Why it was hard to spot
- The dangerous branch never runs during testing.
- Environment checks use ordinary system APIs.

## Signs to look for
- In one change: date, env or hostname checks next to network or exec calls.
- Across changes over time: a dormant branch that tests never reach.

## Defanged example
```js
if (Date.now() > <future-date> && !process.env.CI) {
  <fetch-and-run from <attacker-domain>>
}
```

## How Pushguard catches it
- Detonation runs install, import and execute with no network. A sandbox-aware payload can evade it, so "nothing observed" is weak evidence. Timeouts file `detonation-timed-out`.
- Diff rules flag exec and network sinks (for example `shell-pipe-to-interpreter`, `environment-serialized`).
- Not built: a rule for time or env gates guarding sinks, or coverage diffs.

## References
- [OffSeq radar (sandbox-aware npm package)](https://radar.offseq.com/threat/malicious-code-in-digitalcnzzcommonmodule-npm-c4daa24369f2f6b6)
- [arXiv 2603.27549](https://arxiv.org/pdf/2603.27549) (environment checks defeat code-level tools)
