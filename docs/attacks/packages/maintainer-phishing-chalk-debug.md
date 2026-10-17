# Maintainer phishing: chalk / debug

**Type:** Package & maintainer takeover · **When:** 8 Sept 2025 · **Status:** confirmed

## What happened
A maintainer got a fake "npm support" email and typed his login and 2FA code into a lookalike site. The attacker then published bad versions of 18 popular packages, together about 2 billion downloads a week. The code stole cryptocurrency in the browser by swapping wallet addresses. It was removed within hours.

## How it got in
1. On 5 Sept 2025 the attacker registered the lookalike domain `npmjs[.]help` (defanged).
2. They sent a fake npm support email demanding a 2FA "update" within 48 hours.
3. The maintainer, Josh Junon (Qix), entered his credentials.
4. The 2FA code was captured in real time and used at once.
5. Bad versions were published. The code hooked `fetch`, XHR and wallet APIs to swap addresses.

## Why it was hard to spot
- It was the real maintainer's account.
- 2FA did not help, because the attacker phished the code and used it live.
- The payload ran in end users' browsers, not at install.

## Signs to look for
- In one change: new code that wraps `fetch` / XHR or wallet APIs; obfuscated code in a small utility package.
- Across changes over time: many packages from one maintainer published in a short burst; versions with no matching commit or tag.

## Defanged example
```
index.js (published version only):
+ <obfuscated-blob>
+ wrap(fetch); wrap(XMLHttpRequest); wrap(<wallet-api>)  // swap <address> for <attacker-address>
```

## How Pushguard catches it
- **Dependency checks:** when your repo bumps to a bad version, `dependency-just-published` and `dependency-known-malicious` can fire.
- **Diff rules:** `js-obfuscated-payload` and js-x-ray flag obfuscation, if the code is pushed to a repo you monitor.
- The phishing and the registry publish are outside Pushguard's view. Nothing catches them yet.
- Aikido is named as an early detector in several sources.

## References
- [Check Point (search-summary)](https://blog.checkpoint.com/crypto/the-great-npm-heist-september-2025/)
- [Cycode (search-summary)](https://www.cycode.com/blog/npm-debug-chalk-supply-chain-attack/)
