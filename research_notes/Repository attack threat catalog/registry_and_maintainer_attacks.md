# Package-registry and maintainer-takeover supply-chain attacks reaching source repositories (2015 to Oct 2026)

Note on sourcing: items marked [fetched] were read from the source page this session. Items marked [search-summary] come from search-result summaries of the linked pages (not read in full). Items marked [training] come from prior knowledge with the canonical source URL; they were not re-fetched this session and should be spot-checked before publication. "Unverified" means sources conflict or there is only one weak source.

## 1. Incident catalogue: date, ecosystem, entry vector, staging, dwell time, detection

### Takeaway
The dominant entry vector moved from social takeover of abandoned packages (2018) to stolen publish credentials (2021-2025) to self-propagating worms that steal npm tokens, GitHub tokens and CI OIDC tokens and then commit to the victim's own repositories (late 2025 to 2026). From 2026 on, many incidents show up as commits, branches and workflow files in the source repository, not only as registry tarballs, which is exactly what a push/PR monitor can see.

### Cited Findings

**event-stream / flatmap-stream (npm, 2018)**
- On 9 Sept 2018 a new maintainer, who got maintainership by social engineering (offering to take over the package), added `flatmap-stream` as a direct dependency of `event-stream` 3.3.6; the malicious code was in `flatmap-stream` 0.1.1 — [npm blog, fetched](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident)
- Staging: AES-encrypted data hidden in a file disguised as a test fixture, decrypted with the importing package's npm description (read from an env var npm sets), compiled in memory, second stage decoded and written into a file the build would package; only activated inside the Copay wallet build; stole keys from wallets above 100 BTC / 1000 BCH — [npm blog, fetched](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident)
- npm was notified on 26 Nov 2018 and removed `flatmap-stream` and `event-stream@3.3.6` the same day; Copay 5.0.2 to 5.1.0 shipped it. That is about 2.5 months between the dependency being added and removal — [npm blog, fetched](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident)
- [training] The new maintainer's handle was `right9ctrl`. `flatmap-stream` 0.1.0 was clean and 0.1.1 (published later) carried the payload. Detection came from a GitHub issue (dominictarr/event-stream#116) after a deprecation warning about `crypto.createDecipher` was investigated. Original maintainer Dominic Tarr had handed over publish rights because he no longer maintained it — [GitHub issue #116](https://github.com/dominictarr/event-stream/issues/116)

**ua-parser-js (npm, 22 Oct 2021)**
- Developer's npm account hijacked on 22 Oct 2021; malicious 0.7.29, 0.8.0, 1.0.0 published; `preinstall.js` detected the OS and ran a shell or batch script; on Linux skipped RU/UA/BY/KZ and installed an XMRig miner fetched from a raw IP — [CERT-EU SA2021-057, search-summary](https://www.cert.europa.eu/publications/security-advisories/2021-057/)
- [training] Live roughly four hours; detected by users and the maintainer (Faisal Salman) noticing spam/unknown versions; GHSA-pjwm-rvh2-c87w. Windows variant also dropped a credential stealer — [GHSA-pjwm-rvh2-c87w](https://github.com/advisories/GHSA-pjwm-rvh2-c87w)

**coa and rc (npm, 4 Nov 2021)**
- Malicious coa 2.0.3, 2.0.4, 2.1.1, 2.1.3, 3.1.3 and rc 1.2.9, 1.3.9, 2.3.9; preinstall ran obfuscated `compile.js` launching `compile.bat` to fetch a DLL (password stealer, screenshots, keylogging); techniques resembled ua-parser-js — [CERT-EU SA2021-062, search-summary](https://www.cert.europa.eu/publications/security-advisories/2021-062/)
- coa had not had a release since 2018; the sudden new versions broke React build pipelines worldwide, which is how it was noticed — [BleepingComputer, search-summary](https://www.bleepingcomputer.com/news/security/popular-npm-library-coa-hijacked-breaking-react-pipelines-worldwide/)
- Mandiant attributed ua-parser-js, coa and rc to UNC3379 (miner plus DANABOT), which partly conflicts with CERT-EU's payload description — [Wiz threat page, search-summary](https://threats.wiz.io/all-incidents/unc3379-npm-supply-chain-attacks)

**colors / faker (npm, Jan 2022) — maintainer sabotage**
- [training] The legitimate maintainer (Marak Squires) pushed commits to his own GitHub repos and published colors 1.4.1/1.4.44-liberty-2 with an infinite loop printing garbage ("LIBERTY"), and faker 6.6.6 with all code deleted. Entry vector: a trusted, long-standing maintainer; no credential compromise. Noticed within hours via broken CLIs (e.g., AWS CDK); npm reverted versions and GitHub suspended the account temporarily — [colors.js issue #285](https://github.com/Marak/colors.js/issues/285); [BleepingComputer](https://www.bleepingcomputer.com/news/security/dev-corrupts-npm-libs-colors-and-faker-breaking-thousands-of-apps/)

**node-ipc protestware (npm, March 2022)**
- [training] Maintainer (RIAEvangelist) published node-ipc 10.1.1/10.1.2 that, on hosts geolocated to Russia/Belarus, overwrote files with a heart emoji; the code was obfuscated (base64 strings) in a file named like an ordinary module. Later 11.x/9.2.2 pulled in a new dependency `peacenotwar` that dropped a text file on the desktop. Shipped transitively into Vue CLI. CVE-2022-23812 — [Snyk write-up](https://snyk.io/blog/peacenotwar-malicious-npm-node-ipc-package-vulnerability/); [GHSA-97m3-w2cp-4xx6](https://github.com/advisories/GHSA-97m3-w2cp-4xx6)

**Dependency confusion, Alex Birsan (npm/PyPI/RubyGems, published 9 Feb 2021)**
- [training] Birsan found internal package names leaked in public `package.json` files and JS bundles, published same-named packages with high version numbers on public registries, and package managers preferred the public, higher version. Payload was a benign DNS-exfil beacon (hostname, user, path) from preinstall. Reached 35+ organizations including Apple, Microsoft, PayPal, Shopify, Netflix; earned over $130k in bounties — [Birsan, Medium](https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610)

**PyTorch torchtriton (PyPI, 25-30 Dec 2022) — dependency confusion in the wild**
- Malicious `torchtriton` uploaded to PyPI with the same name as the package on PyTorch's nightly index; "Since the PyPI index takes precedence", pip installed it for pytorch-nightly Linux users between 25 and 30 Dec 2022 — [PyTorch blog, fetched](https://pytorch.org/blog/compromised-nightly-dependency/)
- Payload: a binary at `triton/runtime/triton` run on `import triton`, collecting system info, `/etc/passwd`, `$HOME/.ssh/*`, `.gitconfig`, first 1,000 files in `$HOME`, exfiltrated via encrypted DNS queries — [PyTorch blog, fetched](https://pytorch.org/blog/compromised-nightly-dependency/)
- Fix: renamed dependency to `pytorch-triton` (pytorch/pytorch#91539) and registered a dummy placeholder on PyPI — [PyTorch blog, fetched](https://pytorch.org/blog/compromised-nightly-dependency/)

**Typosquatting waves (npm/PyPI, 2017 to 2026)**
- [training] Aug 2017: `crossenv` and ~40 other npm typosquats (by user `hacktask`) stole env vars on install — [npm blog](https://blog.npmjs.org/post/163723642530/crossenv-malware-on-the-npm-registry). Sept 2017: Slovak NBU found 10 PyPI typosquats (e.g., `urlib3`) modifying `setup.py` — [Ars Technica](https://arstechnica.com/information-technology/2017/09/devs-unknowingly-use-malicious-modules-put-into-official-python-repository/).
- In the axios compromise (March 2026) the malicious dependency `plain-crypto-js` was a typosquat of `crypto-js` — [Endor Labs, search-summary](https://www.endorlabs.com/learn/npm-axios-compromise)
- Microsoft reported typosquatted npm packages used to steal cloud and CI/CD secrets in May 2026 — [Microsoft Security blog, search-summary title only](https://www.microsoft.com/en-us/security/blog/2026/05/28/typosquatted-npm-packages-used-steal-cloud-ci-cd-secrets/)

**Slopsquatting (hallucinated package names, 2024 to 2026)**
- Spracklen et al. (USENIX Security 2025): 16 models, 576,000 code samples, 19.7% of recommended packages did not exist, 205,474 unique hallucinated names; open-source models ~21.7% vs commercial ~5.2%; 43% of hallucinated names recurred on all 10 reruns of a prompt — [Endor Labs summary, search-summary](https://www.endorlabs.com/learn/hallucinated-packages-how-ai-invents-dependencies-attackers-exploit); paper: [arXiv 2406.10279, training](https://arxiv.org/abs/2406.10279)
- Term coined by Seth Larson (PSF) in April 2025; Bar Lanyado's benign placeholder `huggingface-cli` on PyPI got 30,000+ downloads in three months and ended up in an Alibaba project's README — [agentpatterns.ai, search-summary](https://agentpatterns.ai/security/slopsquatting-hallucinated-package-names/)
- As of late 2025 no confirmed in-the-wild slopsquatting malware campaign; a 2026 preprint (not peer-reviewed) measured 4.6-6.1% hallucination on newer models — [arXiv 2605.17062, search-summary](https://arxiv.org/pdf/2605.17062). Unverified whether any 2026 campaign has been confirmed.

**Lockfile injection / resolved-URL tampering**
- npm records each package's download URL (`resolved`) and `integrity` in the lockfile; whoever edits the lockfile controls what installs, regardless of `package.json`; a single changed `resolved` URL or hash hides easily among thousands of lockfile lines — [SafeDep, search-summary](https://safedep.substack.com/p/lockfile-poisoning-an-attack-vector)
- `lockfile-lint` enforces host allowlists, HTTPS and scheme checks for package-lock/yarn.lock; CVE-2025-4759: its `resolved` validation could be bypassed by extending the package name (fixed in lockfile-lint-api 5.9.2) — [npm lockfile-lint](https://npmjs.com/package/lockfile-lint); [GCVE CVE-2025-4759](https://db.gcve.eu/vuln/CVE-2025-4759)
- Yarn 4 "hardened mode" checks lockfile resolutions against the registry and turns on automatically in CI on public PRs — [deku.posstree.com, search-summary](https://deku.posstree.com/en/web/yarn-hardened-mode/)
- [training] Liran Tal (Snyk) described "lockfile injection" via PRs in 2019 — [Snyk blog](https://snyk.io/blog/why-npm-lockfiles-can-be-a-security-blindspot-for-injecting-malicious-modules/). Date unverified (one secondary source says 2022).
- Real 2026 variant: git/GitHub-commit optional dependencies pointing at orphan commits (antv wave: optional dependency to an orphan commit in antvis/G2; ChainDrop: optional dependency on an `opensearch-js` GitHub commit) — [Unit 42, fetched](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/); [Datadog, fetched](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)

**Install scripts (preinstall/postinstall, setup.py, .pth)**
- preinstall: ua-parser-js, coa, rc (2021) [CERT-EU above]; Shai-Hulud 2.0 (Nov 2025) moved to preinstall so it runs even if install fails, injecting e.g. `node setup_bun.js` — [Invicti, search-summary](https://www.invicti.com/blog/web-security/shai-hulud-2-worm-supply-chain-attack-on-npm-dependencies); ChainDrop (2026) replaced the entire `scripts` object with `preinstall: node setup.mjs` — [Datadog, fetched](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- postinstall: Shai-Hulud 1 (`node bundle.js`) — [Xygeni, search-summary](https://xygeni.io/?p=62663); Nx s1ngularity (`telemetry.js`) — [StepSecurity, search-summary](https://www.stepsecurity.io/blog/supply-chain-security-alert-popular-nx-build-system-package-compromised-with-data-stealing-malware); axios's `plain-crypto-js@4.2.1` postinstall dropped a cross-platform RAT then removed traces of the hook — [Endor Labs, search-summary](https://www.endorlabs.com/learn/npm-axios-compromise)
- Import-time instead of install-time: torchtriton ran on `import triton` — [PyTorch blog, fetched](https://pytorch.org/blog/compromised-nightly-dependency/)
- `bin` entry as second trigger: `@bitwarden/cli@2026.4.0` had both a preinstall and a `bw` bin entry — [Unit 42, fetched](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- [training] Python `.pth` files in site-packages execute on every interpreter start (documented in the `site` module); used by malware to persist beyond the install step. setup.py runs arbitrary code at sdist install — [Python docs, site](https://docs.python.org/3/library/site.html). No specific 2015-2026 .pth incident was verified this session (gap).
- Hooks outside package managers: ChainDrop wrote `.vscode/tasks.json` and `.claude/settings.json` to up to 50 branches so the loader re-runs when a folder opens or a Claude session starts — [Datadog, fetched](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)

**Maintainer phishing and account takeover**
- chalk/debug (npm, 8 Sept 2025): lookalike domain `npmjs.help` registered 5 Sept; fake npm support mail demanding a 2FA "update" within 48h; maintainer Josh Junon (Qix) entered credentials; 18 packages (~2B weekly downloads) got a browser-side crypto clipper hooking fetch/XHR and wallet APIs; removed within hours; Aikido named as an early detector in several sources — [Check Point, search-summary](https://blog.checkpoint.com/crypto/the-great-npm-heist-september-2025/); [Cycode, search-summary](https://www.cycode.com/blog/npm-debug-chalk-supply-chain-attack/)
- axios (npm, 31 Mar 2026): lead maintainer's npm account taken over; 1.14.1 and 0.30.4 published; no source change, only one new dependency `plain-crypto-js@4.2.1`; a clean decoy 4.2.0 was published the day before (30 Mar); ~3 hours exposure; attribution to DPRK from a single vendor (unverified) — [Endor Labs, search-summary](https://www.endorlabs.com/learn/npm-axios-compromise); [Datadog, search-summary](https://securitylabs.datadoghq.com/articles/axios-npm-supply-chain-compromise.md)
- [training] Other ATOs: eslint-scope (July 2018, reused password, npm token stolen from `.npmrc`) — [ESLint postmortem](https://eslint.org/blog/2018/07/postmortem-for-malicious-package-publishes/); Python `ctx` (May 2022) via an expired maintainer email domain re-registered and password reset — [PyPI blog](https://blog.pypi.org/posts/2022-05-24-ctx-incident/) (URL unverified); LottieFiles lottie-player (Oct 2024).

**Shai-Hulud (npm worm, Sept 2025)**
- First spotted ~14-15 Sept 2025 in `@ctrl/tinycolor` (2.2M weekly downloads); postinstall `node bundle.js` dumped env and ran TruffleHog for secrets; with an npm token it republished every package the victim could publish; pushed a GitHub Actions workflow to accessible repos to exfiltrate repo secrets to webhook.site; created a public `Shai-Hulud` repo with stolen secrets; re-published private org repos as public with a `-migration` suffix; assessed as downstream of the Aug 2025 Nx compromise; 180+ then ~500 packages — [Wiz, search-summary](https://www.wiz.io/de-de/blog/shai-hulud-npm-supply-chain-attack); [Truesec, search-summary](https://truesec.com/hub/blog/500-npm-packages-compromised-in-ongoing-supply-chain-attack-shai-hulud)

**Shai-Hulud 2.0 "Sha1-Hulud: The Second Coming" (npm, Nov 2025)**
- preinstall `setup_bun.js` dropper installs Bun and launches ~10 MB obfuscated `bun_environment.js` detached (Bun chosen to evade Node-focused tooling); TruffleHog for SSH/GitHub/npm/cloud creds; registers a self-hosted GitHub Actions runner named `SHA1HULUD` for persistence; wipes home directory if theft/exfil fails; ~600-800+ packages and 25,000+ GitHub repos (counts vary) — [Check Point, search-summary](https://blog.checkpoint.com/research/shai-hulud-2-0-inside-the-second-coming-the-most-aggressive-npm-supply-chain-attack-of-2025/); [Cycode](https://cycode.com/blog/shai-hulud-2-0-deep-dive-and-actionable-steps-you-should-take/); [Securelist](https://securelist.com/shai-hulud-2-0/118214/)

**Nx "s1ngularity" (npm, 26 Aug 2025) — CI workflow flaw to publish token**
- PR-title injection into an insecure `pull_request_target` workflow leaked the npm publish token; nx 20.9.0-20.12.0 and 21.5.0-21.8.0 live ~5h20m; postinstall `telemetry.js` invoked local AI CLIs (Claude Code, Gemini CLI, Amazon Q) with permission-skipping flags to hunt for secrets; stolen tokens used to make private repos public (480 more accounts, 6,700 repos per Wiz) — [BleepingComputer, search-summary](https://bleepingcomputer.com/news/security/ai-powered-malware-hit-2-180-github-accounts-in-s1ngularity-attack); [StepSecurity](https://www.stepsecurity.io/blog/supply-chain-security-alert-popular-nx-build-system-package-compromised-with-data-stealing-malware)

**2026 worm waves (Mini Shai-Hulud, Miasma, ChainDrop)** — all from [Unit 42, fetched](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/) unless noted
- 22 Apr 2026 `@bitwarden/cli@2026.4.0`: preinstall downloads Bun, credential stealer; injected `format-check.yml` workflow to dump secrets; GitHub commit-search "dead drop" as fallback C2; ~1.5h live.
- 29 Apr 2026 SAP wave (`@cap-js/*`, `mbt`): preinstall `node setup.mjs`; commits pushed to victim repos under a Claude-impersonating identity; linked to an OIDC trust-scope misconfiguration.
- 11 May 2026 TanStack wave: pwn request via `pull_request_target` plus GitHub Actions cache poisoning (poisoned pnpm cache keyed to the release workflow); OIDC token read from runner memory; 84 publishes in six minutes, 373 versions across 169 packages by end of day; first documented case of valid SLSA Build L3 provenance on malware; dead-man's switch wiped home if the stolen token was revoked. Toolchain source published to GitHub 12 May.
- 19 May 2026 @antv wave (`atool` account): 639 versions across 323 packages in ~1 hour; preinstall running bundled Bun; git optional dependency to an orphan commit in antvis/G2; versions bumped past legitimate releases.
- 1 Jun 2026 `@redhat-cloud-services` (Miasma): compromised employee GitHub account pushed orphan commits to RedHatInsights repos, bypassing review; Actions minted OIDC tokens so packages had valid SLSA provenance; 32+ packages; `index.js` grew from ~200 KB to 4.29 MB.
- 14 Jul 2026 AsyncAPI: direct pushes to unprotected `next` and `schema` release branches triggered release workflows; stole `NPM_TOKEN`/`GITHUB_TOKEN`; stage 2 from IPFS; C2 via Ethereum contract dead drop, Nostr, BitTorrent DHT; self-spread capped at four hops with a 5% canary rollout.
- 4 Aug 2026 ChainDrop (keyv, cacheable, ecto; 444+ packages / 1,381 versions, >2B monthly installs): malicious commit `174f6a5` in `jaredwray/keyv`, earliest commit unsigned from a `lizy168/keyv` account; commits to cacheable/ecto from other accounts; signed `github-actions[bot]` commits added Claude and VS Code hooks; temporary `dependabot/github_actions/format/setup-formatter` branch with injected `codeql_analysis.yml` to dump secrets, then deleted; npm propagation used stolen granular tokens with `bypass_2fa`; keyv v6.0.0 carried genuine SLSA provenance bound to the malicious commit; GitHub Release created ~20 min after npm publish — [Datadog, fetched](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/); [Elastic, title only](https://www.elastic.co/security-labs/shai-hulud-chaindrop-npm-supply-chain)

**zod / standard-schema / nub compromised push (21 Sept 2026)**
- UTC timeline: 11:56:52 `colinhacks/zod` commit `d821685` added a loader and install hooks; 12:37:19 `standard-schema/standard-schema` commit `92703a5` added loader and install hook; 12:54:48 `nubjs/nub` `da01135` replaced the existing install script and switched it to `preinstall`; 13:00:18 follow-up `d38da4f` renamed to `preinstall.js` and completed 0.9.4; 13:09:47 npm static scanning flagged `@nubjs/nub@0.9.4` High risk and blocked it before public availability — [GitHub advisory discussion #208477, fetched](https://github.com/orgs/community/discussions/208477)
- Files touched: `npm/nub/postinstall.js` -> `preinstall.js`, `packages/zod/meta.test.mjs`, `packages/mini/meta.test.mjs`, `meta.mjs`, `packages/utils/meta.mjs` (payload hidden in test/meta-named files). Loader queried a public Ethereum RPC and fixed smart contract for the delivery location, fetched JS from a remote site, ran it with install permissions, deleted temp files — [GitHub #208477, fetched](https://github.com/orgs/community/discussions/208477)
- Entry vector per zod maintainer: "a git push credential of some kind was compromised, not an npm or GitHub token"; nub's release CI was triggerable by tag creation. Advisory itself does not establish the vector (unverified) — [GitHub #208477, fetched](https://github.com/orgs/community/discussions/208477)
- Commit message "Fix bugs and improve performance"; zod and standard-schema changes never reached npm; the commit stayed in zod history ~3 weeks and was found on 11 Oct 2026 by a developer auditing before upgrading (under the v4.6.6 tag, issue #6658); after history cleanup v4.6.6 lost npm provenance and 4.6.7 was published; maintainer moved to environment-scoped, 2FA-gated staged releases — [Azeem Hassni, fetched](https://azeemhassni.com/blog/wire-zod-git-history-malware-commit-reverted/); [GitHub #208477, fetched](https://github.com/orgs/community/discussions/208477)
- Maintainer disputed the advisory framing ("NPM's malware scanning didn't prevent any malicious here" for zod) — [GitHub #208477, fetched](https://github.com/orgs/community/discussions/208477); [HN thread](https://news.ycombinator.com/item?id=50052814)

**Academic taxonomies**
- [training] Ohm et al., "Backstabber's Knife Collection" (DIMVA 2020): 174 malicious packages (npm, PyPI, RubyGems) 2015-2019; 56% trigger on install; 41% use typosquatting; median 209 days available before removal — [arXiv 2005.09535](https://arxiv.org/abs/2005.09535)
- [training] Ladisa et al., "SoK: Taxonomy of Attacks on Open-Source Software Supply Chains" (IEEE S&P 2023): attack tree of 107 vectors, including "inject into source" (commit as maintainer/contributor, takeover), "inject during build", "distribute malicious version" (dependency confusion, typosquatting, takeover of abandoned packages, expired domains) — [arXiv 2204.04008](https://arxiv.org/abs/2204.04008)

### Inferences
- Detection times collapsed from months (event-stream ~2.5 months; Ohm median 209 days for 2015-2019 packages) to hours (ua-parser-js, chalk/debug, axios, Bitwarden ~1.5h) for high-profile packages, mainly because vendor scanners now watch new versions. Quiet commits in git history did not get that speed: the zod commit sat for ~3 weeks.
- Since 2025 the repository is both target and launchpad: worms push workflows, branches, editor/agent hook files and orphan commits. A push monitor sees these directly, while registry scanners see only the result.

### Gaps
- Exact zod-commit revert time and the true entry vector (forensics pending per the advisory).
- No verified 2015-2026 in-the-wild incident using a `.pth` file was confirmed this session.
- colors/faker, node-ipc, Birsan, eslint-scope, ctx, Ohm and Ladisa details are from training, not re-fetched.
- Whether any slopsquatting malware campaign has been confirmed in 2026.

## 2. Attacks split across multiple commits or releases where each piece looked benign

### Takeaway
Multi-step staging is common: a clean dependency or decoy version first, then the malicious version; or a "trust-building" maintainer phase before the payload. Single-diff review misses these by design.

### Cited Findings
- event-stream: step 1, the new maintainer adds `flatmap-stream` (9 Sept 2018); the payload sits in `flatmap-stream` 0.1.1, not in event-stream's own diff; activation only in the Copay build — [npm blog, fetched](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident). [training] The maintainer made legitimate-looking commits first, and the later event-stream 4.0.0 removed the dependency, so the malicious version lived only in 3.3.6 — [issue #116](https://github.com/dominictarr/event-stream/issues/116)
- axios: clean decoy `plain-crypto-js@4.2.0` published 30 Mar 2026, malicious 4.2.1 the next day, then axios releases that only add the dependency; the axios diff has no code change — [Endor Labs, search-summary](https://www.endorlabs.com/learn/npm-axios-compromise)
- Shai-Hulud introduced a dormant "sleeper" dependency template — [Unit 42, fetched](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- node-ipc: [training] destructive code in 10.1.1/10.1.2, then a separate new dependency `peacenotwar` in later versions — [Snyk](https://snyk.io/blog/peacenotwar-malicious-npm-node-ipc-package-vulnerability/)
- zod/nub: two commits in nub six minutes apart: first replaces the install script and switches to preinstall, the second renames the file and bumps the version — [GitHub #208477, fetched](https://github.com/orgs/community/discussions/208477)
- ChainDrop keyv: malicious commit, then deleted; PRs #2042/#2043 opened and closed; then signed bot commits adding hooks and an unsigned commit replaying package changes onto main; a branch with an injected workflow created then deleted. Each step alone is partial — [Datadog, fetched](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- Dependency confusion: no repo change at all in the victim; the change is a public-registry publish that wins version resolution — [PyTorch blog, fetched](https://pytorch.org/blog/compromised-nightly-dependency/); [Birsan, training](https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610)
- TanStack: cache poisoning from a fork PR, then a later release workflow consumes the poisoned cache; the malicious change never appears as a merged commit — [Unit 42, fetched](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- Ohm et al. [training]: some packages were benign at first and turned malicious in a later version — [arXiv 2005.09535](https://arxiv.org/abs/2005.09535)

### Inferences
- The cross-time patterns to model: (a) new contributor/maintainer, then a dependency add, then a version bump; (b) dependency added at a version that is clean, then a lockfile/range bump to a version published days later by a new or changed publisher; (c) commit then revert/delete, which leaves history or reflog traces; (d) branch created and deleted within minutes carrying a workflow; (e) burst of patch bumps across many repos or packages under one actor.

### Gaps
- No quantitative study found of what fraction of incidents are multi-step vs single-step.

## 3. Single-change signals vs temporal/combined signals

### Takeaway
Most attacks leave at least one loud single-diff marker (new or changed install hook, new dependency with no code use, non-registry resolved URL, file-size jump, workflow file added). The temporal signals (actor novelty, publisher change, release outside normal cadence, revert-then-reapply, sibling-repo bursts) are what catch the quiet ones.

### Cited Findings
Single-change signals (each seen in a real incident):
- New or changed `preinstall`/`postinstall`, or replacement of the whole `scripts` object — ua-parser-js, coa, rc [CERT-EU](https://www.cert.europa.eu/publications/security-advisories/2021-057/); ChainDrop [Datadog, fetched](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/); nub postinstall->preinstall switch [GitHub #208477, fetched](https://github.com/orgs/community/discussions/208477)
- New dependency added with no source code change (axios: `plain-crypto-js`) — [Endor Labs](https://www.endorlabs.com/learn/npm-axios-compromise); new dependency by a new maintainer (event-stream) — [npm blog](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident)
- Dependency name that is a near-miss of a popular package (`plain-crypto-js` vs `crypto-js`) — [Endor Labs](https://www.endorlabs.com/learn/npm-axios-compromise)
- Dependency resolved from a git URL / orphan commit, or lockfile `resolved` off the registry host — [Unit 42, fetched](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/); [SafeDep](https://safedep.substack.com/p/lockfile-poisoning-an-attack-vector)
- Large obfuscated or bundled file added (Shai-Hulud 2.0 ~10 MB `bun_environment.js`; Red Hat `index.js` 200 KB -> 4.29 MB) — [Cycode](https://cycode.com/blog/shai-hulud-2-0-deep-dive-and-actionable-steps-you-should-take/); [Unit 42, fetched](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- Encrypted blob disguised as test fixture (event-stream); loader hidden in `*.test.mjs` / `meta.mjs` (zod) — [npm blog](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident); [GitHub #208477](https://github.com/orgs/community/discussions/208477)
- New GitHub Actions workflow added (Shai-Hulud 1 exfil workflow; Bitwarden `format-check.yml`; ChainDrop `codeql_analysis.yml`) or self-hosted runner registration (`SHA1HULUD`) — [Wiz](https://www.wiz.io/de-de/blog/shai-hulud-npm-supply-chain-attack); [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/); [Datadog](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- New editor/agent auto-run config: `.vscode/tasks.json`, `.claude/settings.json` — [Datadog, fetched](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- Code that reaches blockchain RPC / IPFS / Nostr for config (zod loader, AsyncAPI) — [GitHub #208477](https://github.com/orgs/community/discussions/208477); [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- Code invoking AI CLIs with permission-skipping flags (Nx) — [BleepingComputer](https://bleepingcomputer.com/news/security/ai-powered-malware-hit-2-180-github-accounts-in-s1ngularity-attack)
- Generic commit message on a large or install-affecting change ("Fix bugs and improve performance", zod) — [Azeem Hassni, fetched](https://azeemhassni.com/blog/wire-zod-git-history-malware-commit-reverted/)
- Unsigned commit on a repo where commits are usually signed; commit authored as a bot or AI-assistant identity (Claude-impersonating commits in SAP wave; `github-actions[bot]` commits in ChainDrop) — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/); [Datadog](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- Direct push to main or to an unprotected release branch (`next`, `schema`) bypassing PR review; orphan commits — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- Changes to `pull_request_target` workflows or workflows that interpolate PR titles — [BleepingComputer (Nx)](https://bleepingcomputer.com/news/security/ai-powered-malware-hit-2-180-github-accounts-in-s1ngularity-attack)

Temporal / combined signals:
- New maintainer or first-time contributor followed by a dependency add (event-stream) — [npm blog](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident)
- Release after long dormancy (coa: no release since 2018) — [BleepingComputer](https://www.bleepingcomputer.com/news/security/popular-npm-library-coa-hijacked-breaking-react-pipelines-worldwide/)
- Dependency first published within the last day or two, or decoy-then-malicious version pair (plain-crypto-js 4.2.0 -> 4.2.1) — [Endor Labs](https://www.endorlabs.com/learn/npm-axios-compromise); Unit 42 recommends 24-72h cooldowns — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- Publish with no matching tag/release/commit, or release object appearing after publish (keyv: GitHub Release ~20 min after npm publish) — [Datadog](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- Provenance present on earlier versions then missing (zod v4.6.6 lost provenance after history rewrite) — [GitHub #208477](https://github.com/orgs/community/discussions/208477)
- Burst: same actor or same file hash across many repos/branches in minutes (antv 639 versions/1h; TanStack 84 publishes/6 min; ChainDrop up to 50 branches) — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/); [Datadog](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- Commit-then-delete, branch-create-then-delete, PR opened-and-closed in minutes (ChainDrop) — [Datadog](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- Same payload across sibling repos of one owner within an hour (zod, standard-schema, nub in 63 minutes) — [GitHub #208477](https://github.com/orgs/community/discussions/208477)
- Version numbers jumped past legitimate releases (antv); Birsan used very high versions to win resolution — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/); [Birsan, training](https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610)
- Internal package name that also exists on a public registry, or multi-index config (`--extra-index-url`) — [PyTorch blog](https://pytorch.org/blog/compromised-nightly-dependency/)

### Inferences
- For a push monitor, the highest-value single-diff rules: install-hook add/change; workflow add/change (especially `pull_request_target`, self-hosted runner, secret dumps); new editor/agent auto-run files; lockfile `resolved` host off-allowlist or git/tarball URLs; dependency add without source changes; >N-fold file-size jump or minified/obfuscated blob in source; network-to-blockchain/IPFS strings.
- The temporal layer needs per-repo history: actor first-seen, signed-commit baseline, release cadence, cross-repo same-hash bursts, and revert/delete events. A lockfile-only diff from a non-bot actor deserves review on its own.

### Gaps
- No vendor published false-positive rates for these heuristics.

## 4. Existing tools and where they failed

### Takeaway
Registry-side scanners (npm's own, Socket, Aikido, etc.) now catch loud malicious publishes in minutes to hours, but provenance/trusted publishing failed against CI-token theft in 2026, and nothing watched git history for the quiet zod commit. Lockfile linting has had its own bypass.

### Cited Findings
- npm pre-publication static scanning blocked `@nubjs/nub@0.9.4` about nine minutes after the malicious commit series; it did not apply to zod because no publish happened, and the zod commit sat in history ~3 weeks until a human audit — [GitHub #208477, fetched](https://github.com/orgs/community/discussions/208477); [Azeem Hassni, fetched](https://azeemhassni.com/blog/wire-zod-git-history-malware-commit-reverted/)
- npm provenance / trusted publishing (SLSA): TanStack (May 2026) is the first documented malware with valid SLSA Build L3 provenance; Red Hat Miasma also had valid provenance; Unit 42: "provenance verification is necessary but no longer sufficient" — [Unit 42, fetched](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/). Keyv v6.0.0 had genuine provenance bound to the malicious commit; "a compromised workflow can produce a valid attestation for malicious content"; token-based propagation produces no provenance at all — [Datadog, fetched](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
- 2FA: ChainDrop used granular npm tokens with `bypass_2fa` — [Datadog, fetched](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/); chalk/debug phishing captured 2FA in real time — [Check Point](https://blog.checkpoint.com/crypto/the-great-npm-heist-september-2025/)
- Bun runtime used to evade Node-tuned behavioural tooling — [Check Point, search-summary](https://blog.checkpoint.com/research/shai-hulud-2-0-inside-the-second-coming-the-most-aggressive-npm-supply-chain-attack-of-2025/)
- lockfile-lint `resolved` bypass, CVE-2025-4759 — [GCVE](https://db.gcve.eu/vuln/CVE-2025-4759)
- Lockfiles alone did not help in the zod case; a post titled "Your Lockfile Didn't Save You, Luck Did" — [DEV Community, title only](https://dev.to/ashraf_chowdury09/zod-got-backdoored-your-lockfile-didnt-save-you-luck-did-e4l)
- Vendor detection: Aikido is named as an early detector in chalk/debug — [Cycode/Check Point, search-summary](https://www.cycode.com/blog/npm-debug-chalk-supply-chain-attack/); Aikido also reported keyv/ChainDrop — [Aikido, title only](https://www.aikido.dev/blog/keyv-and-friends-compromised-in-npm-supply-chain-attack)
- [training] Socket flags install scripts, network/filesystem access, obfuscation, new maintainers and typosquats in a PR comment — [socket.dev](https://socket.dev); DataDog GuardDog runs Semgrep/YARA heuristics on PyPI/npm packages (install hooks, exfil, typosquats) — [GuardDog](https://github.com/DataDog/guarddog); OSV's malicious-packages feed (OpenSSF) publishes MAL- advisories consumed by osv-scanner/Dependabot — [ossf/malicious-packages](https://github.com/ossf/malicious-packages); OpenSSF Scorecard scores repo practices (branch protection, Token-Permissions, Dangerous-Workflow for `pull_request_target`, Signed-Releases, Pinned-Dependencies), not package contents — [Scorecard checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md)
- Unit 42's recommended mitigations: 24-72h cooldowns, `ignore-scripts=true`, `npm ci` with lockfiles, private registry proxy, scoped packages against dependency confusion, CI egress filtering, SBOMs — [Unit 42, fetched](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- PyTorch's fix for dependency confusion was a rename plus registering a placeholder on PyPI — [PyTorch blog, fetched](https://pytorch.org/blog/compromised-nightly-dependency/)

### Inferences
- Scorecard's Dangerous-Workflow and Branch-Protection checks would have flagged the preconditions of Nx, TanStack and AsyncAPI (pull_request_target, unprotected release branches) but do not detect an attack in progress.
- OSV/GuardDog/Socket are reactive to published packages; none of them watches the source repo for a malicious commit that has not been published. That is the gap a push/PR monitor fills, plus correlation across sibling repos.
- Provenance should be treated as "built by this workflow from this commit", so a monitor must judge the commit itself; provenance going missing on a release that previously had it is a strong signal.

### Gaps
- No published measurements comparing Socket, GuardDog, OSV and Scorecard detection latency across these incidents were found.
- Whether Scorecard or Socket specifically flagged the zod/standard-schema commits was not found.
