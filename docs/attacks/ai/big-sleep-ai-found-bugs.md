# Big Sleep: AI-found vulnerabilities (CVE-2025-6965)

**Type:** AI-era attack (dual use) · **When:** July 2025 · **Status:** confirmed

## What happened
Google's Big Sleep (DeepMind and Project Zero) found a memory bug in SQLite: an integer overflow leading to an out-of-bounds read, in versions before 3.50.2. CVSS 7.2.
Google said the bug was "known only to threat actors and at risk of being exploited", and that it was cut off before use.
Secondary outlets claimed this was the first AI to "stop an attack". That claim is hype.

## How it got in
There was no intrusion. The case is here because of a trend:
1. AI tools now find real bugs.
2. Defenders can use them to fix bugs first.
3. Attackers can use the same kind of tool to find bugs to exploit.

## Why it was hard to spot
- Memory bugs like this one sit for years in old, trusted code.
- Finding them used to take a lot of expert time. AI makes it cheaper for attackers and defenders alike.

## Signs to look for
- In one change: not applicable, since this is about finding bugs that already exist.
- Across changes over time: expect more fast, AI-assisted bug reports and exploits against popular libraries.

## Defanged example
```
sqlite < 3.50.2: <integer-overflow> -> <out-of-bounds-read>
(details omitted)
```

## How Pushguard catches it
- Not applicable. Pushguard watches changes to the repositories it monitors. It does not hunt for bugs already sitting in dependencies.
- The OSV check (`dependency-known-malicious`) looks for malicious packages. Ordinary CVEs like this one are outside it.

## References
- [The Record](https://therecord.media/google-big-sleep-ai-tool-found-bug) (secondary)
- [Wiz CVE](https://www.wiz.io/vulnerability-database/cve/cve-2025-6965) (secondary)
