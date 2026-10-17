# Detection State of the Art: Malicious Commits, Backdoors and Supply-Chain Attacks at the Repository Level

Scope: approaches usable at push/PR time on GitHub, 2018 through Oct 2026, mapped onto a monitor with a regex/glob diff rule engine, force-push forensics, identity/review/time context, a planned per-commit capability-facts store plus tree-sitter symbol graph for cross-commit source-to-sink paths, an AI investigator with tools, sandbox detonation, and out-of-band alerting.

Method note: about 16 search/fetch calls. Several items are known to the researcher but were not re-fetched this session. They sit under "Inferences" or "Gaps" and are marked "unverified recall" so the writer does not present them as sourced fact.

## 1. Malicious-commit and anomalous-contributor detection (metadata and rules)

### Takeaway
Metadata-only commit anomaly detection is cheap and keeps the flag rate low, but recall is mediocre (about 53% in the best-known industrial study). On its own it is a weak predictor of what developers want to see. It works as a triage and ranking layer feeding deeper analysis, not as a detector.

### Cited Findings
- Goyal, Ferreira, Kästner, Herbsleb (J. Software: Evolution and Process, 2017) flag commits that are exceptionally large, made at unusual times, or touch rarely changed file types, relative to the repo's or developer's own history. A browser plugin surfaces them. In a survey of 173 GitHub users, the "unusual" score was only a weak predictor of whether developers wanted to be notified, but showing the unusual characteristics changed how developers judged the commit. — [CMU PDF](https://www.cs.cmu.edu/~ckaestne/pdf/jsep17.pdf); [CPS-VO record](https://archive.cps-vo.org/node/36439)
- Anomalicious (Gonzalez, Zimmermann, Godefroid, Schaefer; ICSE-SEIP 2021, Microsoft Research) uses only commit logs and repo metadata. Its factors are changes to sensitive files, outlier change properties, and low trust in the author, combined in a rule-based decision model. On 15 malware-infected repositories it caught 53.33% of malicious commits while flagging under 1% of commits in most repos. Run on clean repos, it also surfaced anomalies unrelated to malware, i.e. benign anomalies, which are the false positives. The abstract reports no precision figure. — [arXiv 2103.03846](https://arxiv.org/abs/2103.03846v2); [ICSE 2021 page](https://2021.icse-conferences.org/details/icse-2021-Software-Engineering-in-Practice/17/Anomalicious-Automated-Detection-of-Anomalous-and-Potentially-Malicious-Commits-on-G)
- Ganz et al. trained a Git-metadata ML detector that caught 15 of 19 attacks at about 10.75% false positives. A later paper reports its implementation could not be run for comparison. — [Lily paper, related work](https://arxiv.org/html/2607.26719)
- The "hypocrite commits" study (Wu and Lu, accepted at IEEE S&P 2021, later withdrawn) showed that seemingly beneficial bug-fix patches could introduce "immature" use-after-free vulnerabilities into Linux. Maintainers banned the University of Minnesota. The researchers say the three incorrect patches were stopped in discussion and never merged. Sources disagree on whether any vulnerable code reached the tree. — [UMN open letter](https://cse.umn.edu/node/101031); [The New Stack](https://thenewstack.io/university-of-minnesota-researchers-tried-to-poison-the-linux-kernel-for-a-research-project/); [full disclosure PDF](https://www-users.cse.umn.edu/%7Ekjlu/papers/full-disclosure.pdf)

### Inferences
- Per-author baselines (size, time-of-day, file-type novelty) plus sensitive-path globs and author trust are what Pushguard's "identity/review/time context" plus glob rules already approximate. The literature says they belong in severity and ranking, not in verdicts.
- Hypocrite-style commits (a correct-looking fix with a subtle memory or logic flaw) defeat every metadata signal, because the author may be established and the change small and on-topic. Only semantic review (human or LLM) or dynamic testing reaches them.
- A low flag rate (<1%) is a hard product requirement repeated across papers. The notification-fatigue argument appears in both Goyal and Anomalicious.

### Gaps
- Anomalicious precision on clean repos was not in the abstract. The full PDF experiments section would have it.
- Unverified recall: Ohm et al., "Backstabber's Knife Collection" (DIMVA 2020) catalogued 174 malicious packages and found most trigger at install time. Duan et al., MalOSS (NDSS 2021), combined metadata, static and dynamic analysis across npm/PyPI/RubyGems. Not re-fetched this session.

## 2. Static backdoor and capability analysis on source (taint, capabilities, rule packs)

### Takeaway
Capability analysis ("this package can now reach network/exec/fs/env") is the most practical static primitive, and capability drift between versions is the strongest single signal industry uses (Socket, Capslock). Precision depends on separating capability from intent. Co-occurrence of behaviours (collect plus exfiltrate) raises detection dramatically, which argues for path/chain detection over single-API flags.

### Cited Findings
- Capslock (Google) is a Go CLI that reports which privileged operations a package can reach by following transitive calls into privileged standard-library functions. Its README suggests tracking capabilities to alert on unexpected changes, but the fetched page did not document a dedicated diff mode. A separate caveats doc covers known limits. — [google/capslock](https://github.com/google/capslock)
- Socket flags when dependency updates introduce new risky API usage (network, shell, filesystem, env), new install scripts, or obfuscated code. Its GitHub app watches manifest and lockfile changes and comments on PRs. Its co-founder's canonical red flag: a patch or minor version that adds an install script plus new network code. It claims 60+ to 70 detection markers depending on the source. — [Socket FAQ](https://socket.dev/faq); [Socket for GitHub docs](https://docs.socket.dev/docs/socket-for-github); [PortSwigger](https://portswigger.net/daily-swig/socket-new-tool-takes-a-proactive-approach-to-prevent-oss-supply-chain-attacks)
- A 2026 large-scale study of 11 npm malicious-package detectors (16 variants) found that precision and recall hinge on "ambiguity resolution", i.e. separating code capability from malicious intent. Behavioural coupling matters a great deal: detection of the collect-and-exfiltrate chain rose from 3.2% to 79.3% when co-occurring behaviours were considered. Best F1 was IntelGuard at 95.98%. GuardDog was the best conventional tool at 93.32%. Tool combinations reached 97.02% F1, with effectiveness driven by complementarity minus the false positives each tool adds. 80.3% of the malware used no evasion at all. Preinstall scripts appeared in 61.15% of malicious packages. — [arXiv 2603.27549](https://arxiv.org/abs/2603.27549); [PDF](https://arxiv.org/pdf/2603.27549)
- The same study found that anti-analysis and environment-detection code defeats code-level tools, because it uses the same APIs as legitimate system queries. It fails against syscall-level tools that watch real OS interactions. — [arXiv 2603.27549](https://arxiv.org/pdf/2603.27549)
- SocketAI (LLM workflow) outperformed CodeQL by 16% in precision and 9% in F1 on 5,115 npm packages. Static analysis served as a cheap pre-screen. — [arXiv 2403.12196](https://arxiv.org/abs/2403.12196)
- Taint-based code slicing (2025) cuts npm package code down to taint-relevant slices before LLM review, to address context-window and cost limits. — [arXiv 2512.12313](https://arxiv.org/html/2512.12313v1)
- Stringer (string-based backdoor detection) produces many false positives. Weasel, HumIDIFy and Firmalice need substantial manual effort. — [Lily paper, related work](https://arxiv.org/html/2607.26719)

### Inferences
- The 3.2% to 79.3% coupling result is direct empirical support for Pushguard's planned source-to-transform-to-sink path detection over a symbol graph. Single-capability rules (e.g. "new `fetch`") will be noisy; chains ("reads env/credential file -> encodes -> network sink") are where precision comes from.
- Capability drift per commit (a new capability in a file/module that never had it) maps onto the per-commit capability-facts store. Socket and Capslock apply the idea at package-version granularity. Applying it at commit granularity inside a first-party repo appears to be uncommon in shipped tools. No product doing exactly this turned up.
- Unverified recall, not re-fetched: Joern builds code property graphs (AST+CFG+PDG) for taint queries. CodeQL and Semgrep ship taint modes. GuardDog (Datadog) combines Semgrep rules with metadata heuristics. js-x-ray (NodeSecure) detects obfuscation and suspicious JS constructs via AST. Packj audits packages for risky capabilities and metadata. All are snapshot or package-level, not cross-commit.

### Gaps
- No public precision/recall found for Capslock-style capability diffs in a CI setting.
- No source found for Socket's exact diff logic.

## 3. Cross-commit and temporal correlation

### Takeaway
This is the least-covered area and the one most relevant to Pushguard's planned design. Empirical work in 2026 shows that per-commit static analysis misses 87% of multi-commit vulnerability chains, and even cumulative snapshot scanning catches only 27%. The best per-commit dynamic detector (Lily) caught an add-revert-re-add backdoor, but its authors and reviewers name cross-commit correlation as the open problem.

### Cited Findings
- CrossCommitVuln-Bench (AIware '26) has 15 real Python CVEs whose exploitable condition built up over several individually benign commits. Semgrep and Bandit detected 13% per-commit ("87% of chains are invisible to per-commit SAST") and 27% in cumulative mode even with the full codebase. One per-commit hit came on a commit framed as a security fix, where developers tend to suppress alerts. Another flagged only a minor hardcoded key and missed the primary flaw: 200+ unprotected endpoints. The authors say no prior dataset targeted the multi-commit pattern. — [arXiv 2604.21917](https://arxiv.org/abs/2604.21917)
- Lily, "Not In My Git Yard" (ASE 2026), runs AFL++ fuzzing plus strace syscall profiling on each commit or release. It flags inputs whose syscall profile is absent from both the new version's standard behaviour and the old version. Results: about 90% detection at commit vetting (233/260 runs) and 83% at release (828/1000). False alarms were 0.2% on 432 safe commit pairs (17/8,640 runs) and 4.3% on safe release pairs, mostly from large merges, harness changes and flakiness. Requiring both "novel" and "atypical" is essential: either alone gave about 10% and 14% false alarms. — [arXiv 2607.26719](https://arxiv.org/html/2607.26719); [ASE PDF](https://binsec.github.io/assets/publications/papers/2026-ase.pdf)
- Lily caught the PHP 2021-style add-revert-re-add multi-step injection. The authors list five evasion strategies with defenses. (1) CI bypass: run as an independent hosted service that notifies stakeholders. (2) Fuzzer obstruction: average harness coverage was only about 32%. (3) Multi-step injection. (4) Reusing common syscall types. (5) Corpus poisoning: 100 poisoned seeds roughly halved detection to about 54% for commits and 46% for releases. A hardened mode countered it at 3% and 18% false alarms. Each run takes 4 cores, 16 GiB and 10 minutes. The benchmark is mostly synthetic, and xz was motivation only, not evaluated. — [arXiv 2607.26719](https://arxiv.org/html/2607.26719)
- A third-party review of Lily notes that many tiny profile-preserving commits would require longer historical windows or cross-commit correlation on top of per-commit runs. — [Pith review](https://pith.science/paper/2607.26719)

### Inferences
- Per-commit analysis of any kind (regex, SAST, LLM-on-diff, fuzz) is structurally blind to chains whose parts are individually benign. A persistent, incrementally maintained fact store (capabilities and symbol def/use edges keyed by commit) is the only architecture in this literature that can join "commit A adds an env-reading helper" with "commit B, weeks later and by another author, pipes its output to a network call". This supports Pushguard's "derived data built at install, maintained by webhooks" rule.
- Lily's "novel and atypical relative to the previous version" rule is a useful template for static capability drift too: alert on a capability or path that is new to this module and absent from the parent.
- Lily's CI-bypass defense (run independently of the repo's CI and alert out of band) matches Pushguard's GitHub App plus out-of-band alerting design. An attacker with write access can edit workflows but not an external app.
- Force-push forensics covers the "rewrite history to hide the chain" variant. Comparing pre- and post-force-push trees is the commit-level analogue of tarball-vs-repo diffing.

### Gaps
- No published system found that does incremental taint over full git history in production (Joern/CodeQL are snapshot tools).
- No public dataset of multi-author, multi-commit backdoors beyond 15 CVEs in CrossCommitVuln-Bench (vulnerabilities, not intentional backdoors) and Rosarum (mostly synthetic).
- No public research found on dependency-graph drift over time as a detection signal at repo level, beyond Socket's version-diff alerts.

## 4. Provenance, reproducibility, review enforcement and posture (xz lessons)

### Takeaway
xz showed that the activating piece of a backdoor can live only in the release tarball (build-to-host.m4), while the payload sits in git as binary "test fixtures". Source-vs-artifact diffing and reproducible rebuilds (OSS Rebuild) address the first half. Nothing in the repo-monitor space reliably addresses opaque binary fixtures or a trusted maintainer acting in bad faith.

### Cited Findings
- Andres Freund's disclosure: the malicious line in build-to-host.m4 was absent from upstream gnulib and from the xz git repo, but present in the 5.6.0/5.6.1 release tarballs. It injected an obfuscated script that ran at the end of configure and pulled data from "test" .xz files committed to the repo. — [oss-security, 2024-03-29](https://openwall.com/lists/oss-security/2024/03/29/4.)
- The crafted test files (e.g. bad-3-corrupt_lzma2.xz) were in git. Only tarballs with the modified macro triggered the payload. — [OpenWrt list](https://lists.openwrt.org/pipermail/openwrt-adm/2024-March/002588.html); [Julien Malka](https://luj.fr/blog/how-nixos-could-have-detected-xz.html)
- Malka argues that building from the git source, as reproducible-build and Nix-style pipelines do, plus comparing against the tarball, would have exposed the mismatch. A counterpoint in the OpenWrt thread: tarball hashes give little assurance when the maintainer generates the tarball, so the real lesson is not to assume good faith. — [Malka](https://luj.fr/blog/how-nixos-could-have-detected-xz.html); [OpenWrt list](https://lists.openwrt.org/pipermail/openwrt-adm/2024-March/002585.html)
- Google OSS Rebuild (July 2025) rebuilds npm, PyPI and crates.io packages from inferred build definitions and compares them semantically, normalizing archive noise. It flags published packages containing code absent from the public repo (example: @solana/web3.js) and publishes SLSA Provenance attestations on success. It covers only popular packages and is "not an officially supported Google product". — [google/oss-rebuild](https://github.com/google/oss-rebuild); [The Hacker News](https://thehackernews.com/2025/07/google-launches-oss-rebuild-to-expose.html)
- Lily's threat model includes out-of-repo release tampering. Its release-vetting mode detected 83% of backdoors at 4.3% false alarms. — [arXiv 2607.26719](https://arxiv.org/html/2607.26719)
- Ladisa et al., SoK: Taxonomy of Attacks on Open-Source Software Supply Chains (IEEE S&P 2023): 107 attack vectors linked to 94 real incidents and mapped to 33 safeguards, validated with 17 experts and 134 developers. SAP's open-source Risk Explorer tool implements it. — [arXiv 2204.04008](https://arxiv.org/abs/2204.04008v2); [Endor Labs summary](https://www.endorlabs.com/learn/exploring-risk-understanding-software-supply-chain-attacks)

### Inferences
- For a GitHub monitor, the xz pattern breaks into three detectable pieces: (a) binary or opaque files added under test/fixture paths (glob plus entropy/size rule, and "binary file with no generator script" rule); (b) build-system files (m4, configure, CMake, Makefiles, .github/workflows, setup.py, package.json scripts) edited, especially by a recent maintainer; (c) GitHub Release assets differing from a tarball generated from the tagged tree. (c) is checkable at release-event time via the Releases API and is not covered by most PR-time tools.
- Provenance (SLSA, Sigstore/gitsign) proves who and where, not intent. xz's releases came from the legitimate maintainer account. Signing would have verified the attacker.
- Unverified recall, not re-fetched: OpenSSF Scorecard checks include Code-Review, Branch-Protection, Dangerous-Workflow, Pinned-Dependencies, Token-Permissions, Binary-Artifacts and Signed-Releases. Allstar enforces a subset as org policy. gitsign gives keyless Sigstore commit signing. SLSA v1.0 defines build-track levels. Vu et al., "LastPyMile" (FSE 2021), diffed PyPI artifacts against their GitHub sources and found widespread discrepancies. Scorecard's Binary-Artifacts check is the closest posture control to the xz fixture vector.

### Gaps
- No measured false-positive rates found for tarball-vs-repo diffing in C/autotools projects, where autogenerated files legitimately differ.
- Two-person-review enforcement fails when the reviewer is a sockpuppet or co-conspirator (xz's pressure campaign). No detection research on sockpuppet reviewers at PR time was found this session.

## 5. CI/CD and Actions-level compromise; dynamic detonation and its limits

### Takeaway
Runtime egress baselining caught tj-actions in March 2025. Syscall-level dynamic analysis beats code-level tools against environment-check evasion. But dynamic analysis is defeated by sandbox/CI fingerprinting, stalling (time bombs), payloads fetched at runtime, and low coverage of hard-to-reach triggers.

### Cited Findings
- StepSecurity Harden-Runner detected the tj-actions/changed-files compromise (CVE-2025-30066, starting about 16:00 UTC on 14 March 2025) by flagging an outbound call to gist.githubusercontent.com that was new relative to the workflow's egress baseline. The compromised action printed secrets into build logs. No remote exfiltration was evidenced. Most detail is vendor-sourced. — [StepSecurity blog](https://www.stepsecurity.io/blog/harden-runner-detection-tj-actions-changed-files-action-is-compromised); [Harden-Runner detections docs](https://docs.stepsecurity.io/github-actions/harden-runner/detections); [Security Affairs](https://securityaffairs.com/?p=175547)
- Generic sandbox evasion falls into environment checks, waiting for user interaction, detecting analysis tooling, and stalling past the sandbox run time. — [USPTO patent 10083302](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10083302)
- A real npm package ran extensive checks for sandbox, honeypot and CI environments and exited silently when it found one. Otherwise it dumped the full process environment, including CI credentials. — [OffSeq radar](https://radar.offseq.com/threat/malicious-code-in-digitalcnzzcommonmodule-npm-c4daa24369f2f6b6)
- PhantomRaven used remote dynamic dependencies fetched at install time, so registry-content scanners see only a benign stub. Earlier versions lacked the technique, an example of evasion evolving across versions. — [Sonatype](https://www.sonatype.com/blog/phantomraven-npm-malware); [CSA note](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/03/CSA_research_note_phantomraven_npm_dev_credential_theft_20260312-csa-styled.pdf)
- OSCAR (industry, 2024) notes that dynamic analyses often capture non-package noise and use simplistic test strategies that fail to trigger sophisticated behaviour. It argues that deep activation conditions also limit the attacker's own reliability. — [arXiv 2409.09356](https://arxiv.org/html/2409.09356v1)
- Lily's fuzzing reached only about 32% average coverage on older harnesses. Hidden code in unreached branches evades it. Corpus poisoning halves detection without hardening. — [arXiv 2607.26719](https://arxiv.org/html/2607.26719)

### Inferences
- Detonation in Pushguard should (a) record syscall/egress behaviour, not just output; (b) diff behaviour against the parent commit (Lily's novel-and-atypical rule); (c) report "could not trigger / timed out" as a finding, not as clean, consistent with CLAUDE.md's "a model that could not answer is reported" rule; (d) make the sandbox resemble a real CI runner (GITHUB_ACTIONS env, plausible uptime), since CI-aware malware checks for exactly that.
- Time bombs (date checks, Nth-run counters) and payloads fetched from remote config are out of reach of any bounded detonation. The static side must flag the pattern: date comparison guarding exec/network, or a remote fetch whose result is evaluated.

### Gaps
- No source found describing how OpenSSF package-analysis handles sandbox fingerprinting or stalling.
- No npm/PyPI-specific measurement of time-bomb prevalence found.

## 6. LLM-based detection: accuracy, failure modes, cost

### Takeaway
LLMs show high precision on malicious-package benchmarks (GPT-4 SocketAI: 99% precision, 97% F1) and outperform CodeQL. Evidence on comment-based prompt injection conflicts. The more robust finding is that LLMs systematically miss certain classes (race conditions, timing, complex authorization) regardless of adversarial text, and context and cost force pre-filtering or slicing.

### Cited Findings
- SocketAI (Zahan et al., arXiv 2403.12196): on 5,115 npm packages, GPT-3 reached 91% precision / 94% F1 and GPT-4 99% precision / 97% F1, beating CodeQL by 16% in precision and 9% in F1. Static pre-screening was used to cut cost. — [arXiv 2403.12196](https://arxiv.org/abs/2403.12196)
- Taint-based slicing exists because whole-package LLM review hits context-window and cost limits. — [arXiv 2512.12313](https://arxiv.org/html/2512.12313v1)
- Thornton (Feb 2026 preprint, single author, not peer reviewed): across 8 models, 100 samples and 8 comment variants including adversarial ones, comments had small, non-significant effects on detection. Baselines were 89–96% for commercial models and 53–72% for open models. Models missed race conditions, timing attacks and complex authorization logic regardless of comments. Stripping comments degraded weaker models. — [arXiv 2602.16741](https://arxiv.org/abs/2602.16741)
- Contrasting: Cloudflare research on 100 malicious Workers scripts (May 2026, secondary coverage only) found that steering LLMs to benign verdicts depended on the ratio of deceptive comments to code and on file size. Unverified primary. — [IT Brief](https://itbrief.com.au/story/cloudflare-warns-of-ai-code-review-prompt-injection); conflicts with [arXiv 2602.16741](https://arxiv.org/abs/2602.16741)
- Lily's paper does not evaluate LLMs. No head-to-head of LLMs against dynamic backdoor detection was found. — [arXiv 2607.26719](https://arxiv.org/html/2607.26719)

### Inferences
- The Cloudflare dilution result (deceptive-text ratio and file size) is exactly the long-context attack on a diff reviewer: pad the PR with benign churn and plausible comments. Mitigations consistent with the evidence: slice to the taint-relevant path (from the symbol graph) before the model sees it, cap input with a recorded "not fully read" finding, and never let the model downgrade a deterministic finding (already a Pushguard rule).
- High benchmark precision on npm malware (mostly unevasive, per the 80.3% figure) will not carry over to targeted repo backdoors, which are written to look like legitimate fixes (hypocrite commits, xz). Expect much lower recall there. No benchmark measures it.
- Multi-agent review: no published precision/recall evaluation of multi-agent malicious-commit review was found this session.

### Gaps
- No cost-per-commit figures for LLM review of diffs in published work.
- No evaluation of LLMs on xz-style or hypocrite-style intentional backdoors found.

## 7. Attack-class coverage matrix and uncovered gaps

### Takeaway
Each technique covers a slice. The joint gaps are: (1) chains split across commits and authors, partly addressable by a stateful fact store; (2) build-time-only or release-artifact-only payloads; (3) opaque binary fixtures; (4) a trusted maintainer or sockpuppet acting in bad faith; (5) evasive or time-gated runtime behaviour; (6) subtle logic and concurrency flaws that read as honest bugs.

### Cited Findings
- Per-commit SAST misses 87% of multi-commit chains, and cumulative mode misses 73%. — [arXiv 2604.21917](https://arxiv.org/abs/2604.21917)
- In xz, the activation existed only in release tarballs and the payload in binary test files. — [oss-security](https://openwall.com/lists/oss-security/2024/03/29/4.)
- Code-level tools are defeated by environment checks that use legitimate APIs. Syscall-level tools are not. — [arXiv 2603.27549](https://arxiv.org/pdf/2603.27549)
- Remote dynamic dependencies leave only a benign stub for content scanners. — [CSA](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/03/CSA_research_note_phantomraven_npm_dev_credential_theft_20260312-csa-styled.pdf)
- LLMs miss race, timing and authorization flaws irrespective of comments. — [arXiv 2602.16741](https://arxiv.org/abs/2602.16741)
- Metadata detection catches about half of known malicious commits. — [arXiv 2103.03846](https://arxiv.org/abs/2103.03846v2)
- CI-internal detectors can be bypassed by an attacker with write access, so the detector should run as an independent service that notifies out of band. — [arXiv 2607.26719](https://arxiv.org/html/2607.26719)

### Inferences
Coverage matrix (C = catches well, P = partial, - = little or none; derived from the findings above):

| Attack class | Regex/glob diff rules | Metadata/identity/time | Capability drift (per commit) | Cross-commit symbol-graph paths | LLM investigator | Syscall detonation | Provenance/rebuild |
|---|---|---|---|---|---|---|---|
| Install-script / obvious exfil (npm-style) | C | P | C | C | C | C | - |
| Workflow / Action tampering (tj-actions) | C (path globs) | P | P | - | P | C (egress baseline) | P (pinning) |
| Obfuscated payload / encoded blobs | P (entropy) | - | P | P | P | P | - |
| Split chain across commits/authors | - | P | P | C (if store complete) | P (with tool access to history) | P (Lily) | - |
| Hypocrite-style subtle bug | - | - | - | P | P (misses race/timing) | P (if fuzzable) | - |
| Build-time-only payload (m4/configure) | P (build-file globs) | P | - | - | P | P (if build is detonated) | C (rebuild diff) |
| Release asset differs from tag | - | - | - | - | - | - | C |
| Binary test fixture carrying payload | P (binary-in-test glob) | - | - | - | - | - | - |
| Time bomb / CI-aware / remote-config payload | P (pattern rules) | - | P | P | P | - (evaded) | - |
| Malicious maintainer / sockpuppet reviewer | - | P (new-maintainer, review graph) | - | - | - | - | - (signs as legit) |
| History rewrite to hide changes | - | - | - | - | - | - | - (force-push forensics: C) |

Proposed mitigations for the gaps, as inferences:
- Chains: persist capability facts and def/use edges per commit and evaluate source-to-sink reachability on every push against the whole stored graph, not the diff. Alert when a new edge completes a path, crediting all contributing commits and authors.
- Build-time payloads: treat build and CI files as sensitive regardless of author. Detonate the build (configure/install/test), not only the code. On release events, diff release assets against `git archive` of the tag.
- Binary fixtures: flag binary files added without a generator script or a provenance note. Flag any build or test script that reads fixture bytes and pipes them to a decoder, exec or the compiler. The latter is a symbol-graph path.
- Maintainer and social engineering: surface new-maintainer privilege grants, reviewer independence (has the approver ever been reviewed by anyone else?), and pressure patterns. This stays a weak, ranking-only signal. Nothing in the literature reliably detects it.
- Evasion and time bombs: static rules for date or counter comparisons guarding sinks, and for remote-fetch-then-eval. Report detonation "not triggered / timed out" as a finding.

### Gaps
- No published end-to-end system combines a cross-commit capability store, symbol-graph path detection, an LLM investigator and detonation. Each exists separately in research or product.
- No public benchmark of intentional multi-commit, multi-author backdoors for evaluating such a system.
- Okafor et al.'s SoK on supply-chain security properties (SCORED 2022) and Ohm et al.'s SoK on practical detection of supply-chain attacks (ARES 2023) were not fetched this session (unverified recall).
