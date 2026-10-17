# npm and PyPI account takeovers (2018 to 2024)

**Type:** Package & maintainer takeover · **When:** 2018 to 2024 · **Status:** confirmed (some details from training)

## What happened
Attackers logged in to real maintainers' registry accounts and published bad versions of trusted packages. Nothing was pushed to GitHub. The bad code went straight to the registry.
- **eslint-scope (July 2018):** a reused password let the attacker in, and an npm token was stolen from `.npmrc` (training).
- **ua-parser-js (22 Oct 2021):** account hijacked; 0.7.29, 0.8.0 and 1.0.0 published. A `preinstall.js` checked the OS and ran a script. On Linux it skipped RU/UA/BY/KZ and installed an XMRig miner from a raw IP. The versions were live for about four hours, and Windows machines also got a credential stealer (training).
- **coa and rc (4 Nov 2021):** bad coa 2.0.3, 2.0.4, 2.1.1, 2.1.3, 3.1.3 and rc 1.2.9, 1.3.9, 2.3.9. Preinstall ran obfuscated `compile.js`, which launched `compile.bat` to fetch a password-stealing DLL.
- **ctx (PyPI, May 2022):** the maintainer's email domain had expired. The attacker re-registered it and reset the password (training; URL unverified).
- **LottieFiles lottie-player (Oct 2024):** listed as a takeover, with no further detail in the notes.

## How it got in
1. The attacker gets the publish login, here through a reused password, a stolen token or an expired email domain.
2. They publish a new version with an install script.
3. Everyone who installs runs that script.

## Why it was hard to spot
- The source repo did not change, so repo review saw nothing.
- coa had not shipped a release since 2018. People noticed only because the new versions broke React builds.
- Sources disagree on payloads: Mandiant tied ua-parser-js, coa and rc to UNC3379 (miner plus DANABOT), which partly conflicts with CERT-EU.

## Signs to look for
- In one change: a new or changed `preinstall`/`postinstall`; a script that downloads from a raw IP.
- Across changes over time: a release after long silence; versions that have no matching tag or commit.

## Defanged example
```
package.json (published only, not in git):
  "scripts": { "preinstall": "node preinstall.js" }
preinstall.js:
  if (os == <target>) run("<download from <raw-ip>> and execute")
```

## How Pushguard catches it
- **Dependency checks:** when your repo bumps to the bad version, `dependency-install-script`, `dependency-just-published` and `dependency-maintainer-changed` (npm) can fire, and `dependency-known-malicious` (OSV) once it is listed.
- **Detonation:** install runs with no network; the download fails, which can show up as odd behaviour.
- Pushguard does not watch the registry publish, so nothing catches the takeover before your repo depends on the bad version.

## References
- [CERT-EU SA2021-057 (search-summary)](https://www.cert.europa.eu/publications/security-advisories/2021-057/)
- [GHSA-pjwm-rvh2-c87w (training)](https://github.com/advisories/GHSA-pjwm-rvh2-c87w)
- [CERT-EU SA2021-062 (search-summary)](https://www.cert.europa.eu/publications/security-advisories/2021-062/)
- [BleepingComputer on coa (search-summary)](https://www.bleepingcomputer.com/news/security/popular-npm-library-coa-hijacked-breaking-react-pipelines-worldwide/)
- [Wiz UNC3379 page (search-summary)](https://threats.wiz.io/all-incidents/unc3379-npm-supply-chain-attacks)
- [ESLint postmortem (training)](https://eslint.org/blog/2018/07/postmortem-for-malicious-package-publishes/)
- [PyPI blog on ctx (training, URL unverified)](https://blog.pypi.org/posts/2022-05-24-ctx-incident/)
