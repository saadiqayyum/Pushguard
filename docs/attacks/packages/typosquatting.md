# Typosquatting

**Type:** Package & maintainer takeover · **When:** 2017 to 2026 · **Status:** confirmed

## What happened
Attackers publish packages whose names are one small typo away from popular ones. A developer mistypes, or a malicious change adds the lookalike on purpose.
- **Aug 2017:** `crossenv` and about 40 other npm typosquats (user `hacktask`) stole environment variables on install (training).
- **Sept 2017:** Slovakia's NBU found 10 PyPI typosquats, such as `urlib3`, that modified `setup.py` (training).
- **March 2026:** in the [axios compromise](axios-2026.md), the bad dependency `plain-crypto-js` was a typosquat of `crypto-js`.
- **May 2026:** Microsoft reported typosquatted npm packages stealing cloud and CI/CD secrets (only the title was seen).
- Ohm et al. (2020) found 41% of 174 malicious packages used typosquatting (training).

## How it got in
1. The attacker registers a near-miss name.
2. They add an install script or import-time code.
3. A developer, or a hijacked release, adds the package.
4. The code runs on install.

## Why it was hard to spot
- The name looks right at a glance.
- In axios the only change was one new dependency line.

## Signs to look for
- In one change: a new dependency whose name is close to a popular one; a new dependency with no code using it.
- Across changes over time: a dependency first published a day or two ago.

## Defanged example
```
package.json:
- "crypto-lib": "<range>"
+ "crypt0-lib": "<range>"     # one character off
```

## How Pushguard catches it
- **Dependency checks:** `dependency-just-published`, `dependency-install-script` and `dependency-maintainer-changed` (npm), plus `dependency-known-malicious` (OSV).
- There is no name-similarity check. A typosquat that is old and has no install script is not caught yet.
- See also [slopsquatting](../ai/slopsquatting.md), where an AI invents the name.

## References
- [npm blog on crossenv (training)](https://blog.npmjs.org/post/163723642530/crossenv-malware-on-the-npm-registry)
- [Ars Technica (training)](https://arstechnica.com/information-technology/2017/09/devs-unknowingly-use-malicious-modules-put-into-official-python-repository/)
- [Endor Labs on axios (search-summary)](https://www.endorlabs.com/learn/npm-axios-compromise)
- [Microsoft Security blog (search-summary, title only)](https://www.microsoft.com/en-us/security/blog/2026/05/28/typosquatted-npm-packages-used-steal-cloud-ci-cd-secrets/)
- [Ohm et al. (training)](https://arxiv.org/abs/2005.09535)
- [Unicode TR39 confusables](https://www.unicode.org/reports/tr39/)
