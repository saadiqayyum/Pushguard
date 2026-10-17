# zod / standard-schema / nub compromised push

**Type:** Package & maintainer takeover · **When:** 21 Sept 2026 (found 11 Oct 2026) · **Status:** confirmed (entry vector unverified)

## What happened
In about one hour, the same kind of loader was pushed into three related repos. Only nub reached a publish, and npm's scanner blocked it. The zod commit was never published, but it sat in zod's history for about 3 weeks until a developer found it while checking the code before an upgrade.

## How it got in
Timeline (UTC, 21 Sept 2026):
1. 11:56:52 `colinhacks/zod` commit `d821685` added a loader and install hooks.
2. 12:37:19 `standard-schema/standard-schema` commit `92703a5` added a loader and install hook.
3. 12:54:48 `nubjs/nub` `da01135` replaced the install script and switched it to `preinstall`.
4. 13:00:18 follow-up `d38da4f` renamed it to `preinstall.js` and completed 0.9.4.
5. 13:09:47 npm flagged `@nubjs/nub@0.9.4` High risk and blocked it.

The loader read a fixed smart contract through a public Ethereum RPC to find where to download from, fetched JavaScript, ran it with install rights, and deleted temp files.

## Why it was hard to spot
- The payload sat in test- and meta-named files: `packages/zod/meta.test.mjs`, `packages/mini/meta.test.mjs`, `meta.mjs`, `packages/utils/meta.mjs`.
- The commit message was "Fix bugs and improve performance".
- No publish happened for zod, so registry scanners never looked.
- Entry vector: the zod maintainer said "a git push credential of some kind was compromised, not an npm or GitHub token". The advisory does not confirm this. nub's release CI could be triggered by creating a tag.
- The maintainer disputed the advisory framing ("NPM's malware scanning didn't prevent any malicious here" for zod).

## Signs to look for
- In one change: install hooks added; postinstall switched to preinstall; loader code in `*.test.mjs` files; code calling blockchain RPC; a generic message on an install-affecting change.
- Across changes over time: the same payload across sibling repos of one owner within an hour; provenance lost after history cleanup (v4.6.6 lost it; 4.6.7 was published).

## Defanged example
```
11:56  repo-a  "Fix bugs and improve performance"  + packages/<x>/meta.test.mjs
12:37  repo-b  + meta.mjs, + install hook
12:54  repo-c  postinstall.js -> preinstall.js
meta.test.mjs:  url = call(<eth-rpc>, <contract>); run(fetch(url)); delete(<temp>)
```

## How Pushguard catches it
- **Diff rules:** `js-install-hook-added`; js-x-ray on the loader files.
- **Detonation:** install with no network; the RPC call fails, which is visible.
- **AI investigator:** can flag a loader hidden in a test file under a generic message.
- Cross-repo correlation is not built. After the fact, force-push forensics shows what a history cleanup removed.
- After the incident the maintainer moved to environment-scoped, 2FA-gated staged releases.

## References
- [GitHub advisory discussion #208477 (fetched)](https://github.com/orgs/community/discussions/208477)
- [Azeem Hassni (fetched)](https://azeemhassni.com/blog/wire-zod-git-history-malware-commit-reverted/)
- [HN thread](https://news.ycombinator.com/item?id=50052814)
- [DEV Community (title only)](https://dev.to/ashraf_chowdury09/zod-got-backdoored-your-lockfile-didnt-save-you-luck-did-e4l)
