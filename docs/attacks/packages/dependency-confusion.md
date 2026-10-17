# Dependency confusion

**Type:** Package & maintainer takeover · **When:** published 9 Feb 2021 · **Status:** confirmed (research; real-world case in [pytorch-torchtriton.md](pytorch-torchtriton.md))

## What happened
Alex Birsan found the names of companies' private (internal) packages. He published packages with the same names on public registries, with very high version numbers. Package managers picked the public package because its version was higher. His harmless test code ran inside 35+ organizations, including Apple, Microsoft, PayPal, Shopify and Netflix. He earned over $130k in bug bounties. (Source is from training, not re-checked.)

## How it got in
1. Internal package names leaked in public `package.json` files and JavaScript bundles.
2. He registered the same names on npm, PyPI and RubyGems.
3. He used very high version numbers so they would "win".
4. The victim's tools installed the public package instead of the private one.
5. A preinstall script sent a small DNS beacon (hostname, user, path).

## Why it was hard to spot
- The victim's repo does not change at all.
- The "change" is a publish on a public registry that wins version resolution.

## Signs to look for
- In one change: config that mixes a private and a public index (for example `--extra-index-url`); a dependency name that is internal but unscoped.
- Across changes over time: an internal package name that suddenly also exists on a public registry; a version far above your own releases.

## Defanged example
```
requirements / config:
  --extra-index-url https://<private-index>
  <internal-package-name>        # also exists publicly at version 9999.0.0
```

## How Pushguard catches it
- **Dependency checks:** only if your repo adds or bumps the package in a push; `dependency-known-malicious` (OSV) fires once it is listed.
- **Diff rules:** `py-requirements-from-url` and `js-npmrc-changed` flag changes to index and registry config.
- The attack itself is a public-registry publish. Pushguard has no registry-side view, so nothing catches it yet.
- Mitigations from the notes: scoped packages, a private registry proxy, and registering placeholder names.

## References
- [Birsan, Medium (training)](https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610)
- [PyTorch blog (fetched)](https://pytorch.org/blog/compromised-nightly-dependency/)
- [Unit 42 mitigations (fetched)](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
