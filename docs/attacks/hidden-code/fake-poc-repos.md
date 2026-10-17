# Fake proof-of-concept exploit repos

**Type:** Developer environment · **When:** 2017 to 2023 · **Status:** confirmed

## What happened

Security researchers look for "proof of concept" (PoC) code that shows a bug can be exploited. Attackers publish fake PoC repos that infect whoever runs them. A Leiden University study of 47,313 GitHub repos advertising exploits for 2017-2021 CVEs flagged 4,893 (10.3%) as malicious. In 2023 VulnCheck found repos from a fake company ("High Sierra Cyber Security") claiming zero-day PoCs for Discord, Chrome and Exchange, backed by fake Twitter and GitHub accounts.

## How it got in

1. A new CVE gets attention.
2. The attacker posts a repo claiming a working exploit.
3. Fake accounts promote it.
4. A researcher clones and runs it.
5. The "exploit" runs malware on the researcher's machine.

## Why it was hard to spot

- Researchers expect exploit code to look strange.
- Fake companies and accounts add credibility.

## Signs to look for

- In one change: if such code is committed to your repos: obfuscated code with `eval` of hex or Base64; scripts that download and run remote code; `.vscode/tasks.json` auto-run tasks.
- Across changes over time: new accounts and a fake org promoting the same repo.

## Defanged example

```
poc.py
+ # exploit for CVE-<id>
+ run(decode("<encoded-blob>"))   # actually fetches <attacker-domain>/payload
```

## How Pushguard catches it

- Diff rules: `py-obfuscated-payload`, `js-obfuscated-payload` and `shell-pipe-to-interpreter` match if such code is pushed into a monitored org.
- Repos a person clones from outside the org are never seen by Pushguard.

## References

- [BleepingComputer](https://www.bleepingcomputer.com/news/security/thousands-of-github-repositories-deliver-fake-poc-exploits-with-malware/)
- [Malwarebytes](https://www.malwarebytes.com/blog/news/2022/10/fake-proof-of-concepts-used-to-lure-security-professionals)

BleepingComputer treats the 10.3% figure as an upper bound.
