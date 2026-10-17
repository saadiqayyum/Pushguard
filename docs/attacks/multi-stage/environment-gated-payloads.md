# Environment-gated payloads and time bombs

**Type:** Multi-stage backdoor (attack class) · **When:** 2018 to 2026 · **Status:** confirmed

## What happened

Many backdoors stay asleep unless they are on the exact target. They check the date, the machine, the process name, or whether they are inside a test sandbox. If anything looks off, they do nothing, so testers and scanners see clean code.

Real examples from the notes:
- SUNBURST waited until its DLL was 12 to 14 days old, needed the real Orion process, and quit if it saw security tools or test domains.
- xz only ran on x86-64 Linux in a Debian or RPM build, when run as `/usr/sbin/sshd`, with `TERM` unset, `LANG` set, and no debugger.
- event-stream's payload was encrypted with a key taken from the npm package description. Only the Copay wallet's description ("A Secure Bitcoin Wallet") produced the right key.
- An npm package (digitalcnzz common module) checked for sandboxes, honeypots and CI, and quietly exited if it found one. Otherwise it dumped all environment variables, including CI secrets.

## How it got in

1. The attacker adds the payload, often encoded.
2. They add "gates": checks on date, hostname, process name, CI variables, or debuggers.
3. In tests and sandboxes the gates fail, so nothing happens.
4. On the real target the gates pass and the payload runs.

## Why it was hard to spot

- Dynamic analysis (running the code to watch it) sees nothing if the gate fails.
- The checks use normal system calls that real software also uses.
- Time bombs can wait longer than any test run.

## Signs to look for

- In one change: checks on hostname, domain, process name (`argv[0]`), CI variables, `TERM`/`LANG`/`LD_*`, or debugger presence, placed next to network or exec calls; comparisons against hashed constants; date math against file timestamps.
- Across changes over time: a branch that tests never run, sitting near a dangerous call; gates added later around code that already existed.

## Defanged example

```
if (hash(process_name) == <hash> && days_since(<file mtime>) > 12
    && !env.CI && !debugger_present()) {
    run(<decoded payload>)
}
```

## How Pushguard catches it

- Diff rules: `environment-serialized` catches dumping the environment; `js-obfuscated-payload` and `py-obfuscated-payload` catch encoded payloads. There is no dedicated "gate" rule yet.
- AI investigator: can flag gate-shaped logic next to sinks.
- Detonation: runs install/import/execute, but a gated payload can stay quiet. Pushguard treats "nothing observed" as weak evidence and files timeouts as findings.
- Facts + symbol graph across commits (planned): link a gate to the sink it guards.

## References

- [Microsoft, Solorigate](https://www.microsoft.com/en-us/security/blog/2020/12/18/analyzing-solorigate-the-compromised-dll-file-that-started-a-sophisticated-cyberattack-and-how-microsoft-defender-helps-protect/)
- [Andres Freund, xz](https://www.openwall.com/lists/oss-security/2024/03/29/4)
- [Snyk, event-stream post-mortem](https://snyk.io/de/blog/a-post-mortem-of-the-malicious-event-stream-backdoor)
- [OffSeq radar, digitalcnzz npm package](https://radar.offseq.com/threat/malicious-code-in-digitalcnzzcommonmodule-npm-c4daa24369f2f6b6)
- [arXiv 2603.27549, npm detector study](https://arxiv.org/pdf/2603.27549)
- [USPTO patent 10083302, sandbox evasion classes](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10083302)

See also: [xz-utils](xz-utils.md), [SolarWinds](solarwinds-sunspot.md), [event-stream](../packages/event-stream.md), [Possible future: sandbox-tuned time bombs](../ai/future-sandbox-tuned-time-bombs.md).
