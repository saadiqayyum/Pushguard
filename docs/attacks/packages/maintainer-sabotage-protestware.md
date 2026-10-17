# Maintainer sabotage and protestware (colors/faker, node-ipc)

**Type:** Package & maintainer takeover · **When:** Jan and March 2022 · **Status:** confirmed (details from training)

## What happened
The real, long-trusted maintainers broke their own packages on purpose. No account was stolen.
- **colors / faker (Jan 2022):** Marak Squires pushed commits to his own repos. colors 1.4.1 / 1.4.44-liberty-2 ran an infinite loop printing "LIBERTY". faker 6.6.6 had all code deleted. Apps like AWS CDK broke within hours.
- **node-ipc (March 2022):** versions 10.1.1 and 10.1.2 overwrote files with a heart emoji on machines located in Russia or Belarus. The code was base64-obfuscated in a file named like a normal module. Later 11.x / 9.2.2 pulled in a new dependency, `peacenotwar`, that dropped a text file on the desktop. It reached Vue CLI through dependencies. CVE-2022-23812.

## How it got in
1. A trusted maintainer writes the change themselves.
2. They push it to their own repo and publish it.
3. Downstream projects pull it in through normal version ranges.

## Why it was hard to spot
- Every identity check passes: it is the real owner.
- node-ipc hid the code in base64 and only acted on certain locations.
- node-ipc split the work: destructive code first, then a separate new dependency later.

## Signs to look for
- In one change: code that checks location, then writes or deletes files; base64 strings in a plain module; a commit that deletes almost all code.
- Across changes over time: a sudden change in a maintainer's behaviour; a new dependency added in a later version after an earlier odd release.

## Defanged example
```
lib/<ordinary-name>.js:
  const x = decode("<base64-blob>")
  if (geo(<lookup>) in <target-countries>) overwrite(<files>, "<emoji>")
```

## How Pushguard catches it
- **Diff rules:** `js-obfuscated-payload` and js-x-ray can flag the base64-hidden code if your org owns the repo.
- **Dependency checks:** when your repo adds a new dependency like `peacenotwar`, `dependency-just-published` (npm) may fire.
- **AI investigator:** can read a "location check then write files" change and escalate.
- Identity signals do not help: the maintainer is genuine. If the package is upstream and you only bump a version range, nothing in your repo changes and nothing catches it yet.

## References
- [colors.js issue #285 (training)](https://github.com/Marak/colors.js/issues/285)
- [BleepingComputer (training)](https://www.bleepingcomputer.com/news/security/dev-corrupts-npm-libs-colors-and-faker-breaking-thousands-of-apps/)
- [Snyk on node-ipc / peacenotwar (training)](https://snyk.io/blog/peacenotwar-malicious-npm-node-ipc-package-vulnerability/)
- [GHSA-97m3-w2cp-4xx6 (training)](https://github.com/advisories/GHSA-97m3-w2cp-4xx6)
