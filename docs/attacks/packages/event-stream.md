# event-stream / flatmap-stream

**Type:** Package & maintainer takeover · **When:** Sept to Nov 2018 · **Status:** confirmed

## What happened
A stranger offered to take over the popular npm package `event-stream`. The old maintainer had stopped working on it and handed over publish rights. The new maintainer added a small dependency, `flatmap-stream`. A later version of that dependency hid code that stole Bitcoin wallet keys. The payload only ran inside one app, the Copay wallet.

## How it got in
1. The new maintainer got publish rights by offering to take over the package (social engineering).
2. The notes say (from training, not re-checked) the maintainer made normal-looking commits first.
3. On 9 Sept 2018 they added `flatmap-stream` as a dependency of `event-stream` 3.3.6.
4. `flatmap-stream` 0.1.0 was clean. 0.1.1, published later, carried the payload (training source).
5. The payload was encrypted data in a file that looked like a test fixture.
6. The key was the importing package's npm description, read from an environment variable npm sets. Only Copay's description worked as the key.
7. Stages ran at build time, then a third inside the app. It targeted wallets above 100 BTC / 1000 BCH.

## Why it was hard to spot
- The `event-stream` diff only added a dependency. The bad code lived in another package.
- The payload was encrypted and looked like test data.
- On any machine other than the Copay build, it did nothing.
- About 2.5 months passed before npm removed it (26 Nov 2018).

## Signs to look for
- In one change: a new dependency added with no code that uses it; an encrypted or opaque blob in a "test" file; code that reads `npm_package_description` or similar package metadata.
- Across changes over time: a brand-new maintainer, then a dependency add, then a version bump. A dependency that is clean at first and turns bad in a later version.

## Defanged example
```
commit 1  (new maintainer)  "small fixes"
commit 2  (new maintainer)  package.json: + "flatmap-stream": "<range>"
--- in the dependency, later version ---
test/data.js:  module.exports = "<encrypted-blob>"
index.js:      key = process.env.<package-description-var>; run(decrypt(<blob>, key))
```

## How Pushguard catches it
- **Dependency checks:** `dependency-maintainer-changed` and `dependency-just-published` (npm) can flag the dependency when it is added, if the bad version is the one being added.
- **Identity & review context:** `first-push-by-account` flags a new account pushing.
- **Detonation:** runs install/import with no network, but the payload only fires inside the target build, so detonation would likely see nothing.
- **Facts + symbol graph across commits (planned):** would link "new maintainer" + "dependency added" + "metadata-keyed decrypt".
- Nothing built watches a dependency that turns bad later without any change in your repo.

## References
- [npm blog (fetched)](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident)
- [GitHub issue #116 (training)](https://github.com/dominictarr/event-stream/issues/116)
- [Snyk post-mortem](https://snyk.io/de/blog/a-post-mortem-of-the-malicious-event-stream-backdoor)
- [The Hacker News](https://thehackernews.com/2018/11/nodejs-event-stream-module.html?hl=en_US)
