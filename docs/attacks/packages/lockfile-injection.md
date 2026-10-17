# Lockfile injection

**Type:** Package & maintainer takeover · **When:** described 2019 (date unverified) to 2026 · **Status:** confirmed (attack class)

## What happened
A lockfile records the exact download address (`resolved`) and hash (`integrity`) of every package. Whoever edits the lockfile controls what gets installed, no matter what `package.json` says. One changed URL or hash hides easily among thousands of lines.

## How it got in
1. An attacker opens a pull request, or pushes with a stolen token.
2. They change one `resolved` URL to point at their own server, or swap a hash.
3. Reviewers skip the lockfile because it is huge and machine-made.
4. The next `npm ci` installs the attacker's package.

## Why it was hard to spot
- Lockfiles are long and reviewers trust them.
- `package.json` stays the same.
- The tool `lockfile-lint` had its own bypass (CVE-2025-4759): its `resolved` check could be fooled by extending the package name. Fixed in lockfile-lint-api 5.9.2.

## Signs to look for
- In one change: a lockfile changed with no matching `package.json` change; a `resolved` host that is not the registry; a hash change with no version change; git or tarball URLs.
- Across changes over time: a lockfile-only change from a person, not a bot.

## Defanged example
```
package-lock.json:
  "node_modules/<pkg>": {
-   "resolved": "https://registry.npmjs.org/<pkg>/-/<pkg>-1.2.3.tgz",
+   "resolved": "https://<attacker-domain>/<pkg>-1.2.3.tgz",
-   "integrity": "sha512-<old-hash>"
+   "integrity": "sha512-<new-hash>"
```

## How Pushguard catches it
- **Diff rules:** `js-lockfile-only-change` flags a lockfile change without a manifest change. `js-dependency-from-url` flags URL, git and path dependencies.
- **Dependency checks:** run on added dependencies, not on a swapped URL for an existing one.
- A deterministic lockfile parser with a registry-host allowlist and hash-drift check is not built yet.
- Real 2026 variants used git-commit dependencies; see [remote dynamic dependencies](remote-dynamic-dependencies.md).

## References
- [SafeDep (search-summary)](https://safedep.substack.com/p/lockfile-poisoning-an-attack-vector)
- [lockfile-lint](https://npmjs.com/package/lockfile-lint); [GCVE CVE-2025-4759](https://db.gcve.eu/vuln/CVE-2025-4759)
- [Yarn hardened mode (search-summary)](https://deku.posstree.com/en/web/yarn-hardened-mode/)
- [Snyk, Liran Tal (training; date unverified, one source says 2022)](https://snyk.io/blog/why-npm-lockfiles-can-be-a-security-blindspot-for-injecting-malicious-modules/)
