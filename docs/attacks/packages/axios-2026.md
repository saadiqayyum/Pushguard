# axios (2026)

**Type:** Package & maintainer takeover · **When:** 30 to 31 March 2026 · **Status:** confirmed (attribution unverified)

## What happened
The lead maintainer's npm account was taken over. The attacker published axios 1.14.1 and 0.30.4. Neither version changed any source code. Each one added a single new dependency, `plain-crypto-js@4.2.1`, a typosquat of `crypto-js`. Its postinstall script dropped a cross-platform remote-access tool and then deleted the traces of the hook. The bad versions were up for about 3 hours. One vendor attributes the attack to North Korea, which is unverified.

## How it got in
1. On 30 March the attacker published a clean decoy, `plain-crypto-js@4.2.0`.
2. On 31 March they published the bad `plain-crypto-js@4.2.1`.
3. Using the hijacked maintainer account, they published axios versions that only add this dependency.
4. Installing axios ran the postinstall in the dependency.

## Why it was hard to spot
- The axios diff was one dependency line and no code.
- The decoy version made the dependency look like it had a history.
- The hook removed itself after running.

## Signs to look for
- In one change: a new dependency with no code using it; a name close to a popular package.
- Across changes over time: a dependency first published a day ago; a clean version followed by a bad one the next day.

## Defanged example
```
day 1  publish  <lookalike-pkg>@4.2.0   (clean)
day 2  publish  <lookalike-pkg>@4.2.1   (postinstall -> <encoded-blob>)
day 2  publish  axios@<new>             package.json: + "<lookalike-pkg>": "^4.2.0"
```

## How Pushguard catches it
- **Dependency checks:** when your repo picks up the new dependency, `dependency-just-published` (under 72 h) and `dependency-install-script` (npm) fire; `dependency-known-malicious` once OSV lists it.
- **Detonation:** install runs with no network.
- There is no typosquat-name check. The registry publish is not visible. See [typosquatting](typosquatting.md) and [split across commits](../multi-stage/split-across-commits.md).

## References
- [Endor Labs (search-summary)](https://www.endorlabs.com/learn/npm-axios-compromise)
- [Datadog (search-summary)](https://securitylabs.datadoghq.com/articles/axios-npm-supply-chain-compromise.md)
