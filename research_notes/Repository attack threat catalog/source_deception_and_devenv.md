# Source-level deception and developer-environment attacks delivered through repository contents

Scope: hiding malicious code from human and machine reviewers, and getting code to run on a developer's machine when they clone, open or build a repository. Covers 2015 to October 2026. Written for defenders, with no working exploits. For each technique the notes list (a) what a single diff shows and (b) what only shows up across several commits or files ("correlation signals").

## 1. Trojan Source, invisible Unicode, confusables, and visual hiding

### Takeaway
Unicode lets an attacker make the code a reviewer sees differ from the code a compiler runs. Bidi overrides (CVE-2021-42574) and homoglyphs (CVE-2021-42694) were the 2021 wave. From 2024 to 2026 the threat moved to fully invisible code points: Unicode Tags (U+E0000 block) for prompt injection ("ASCII smuggling"), and Variation Selectors (U+FE00–FE0F, U+E0100–E01EF) plus Private Use Area characters as byte-level steganography for executable JavaScript (os-info-checker-es6, GlassWorm). Older low-tech tricks such as whitespace padding that pushes code off-screen to the right are still used on PyPI. Byte-class scanning of every added line catches most of these in a single diff. The decode-and-eval sink is often added separately, so it takes correlation to catch.

### Cited Findings
**Trojan Source (bidi, CVE-2021-42574) and homoglyphs (CVE-2021-42694)**
- Trojan Source uses Unicode control characters placed inside comments and string literals to change how code *looks* on screen without changing its logical token order. "Compilers and interpreters adhere to the logical ordering of source code, not the visual order." — [trojansource.codes](https://trojansource.codes/)
- It has three attack classes. **Early Returns**: a `return` looks like it sits inside a comment. **Commenting-Out**: a comment looks like live code. **Stretched Strings**: parts of a string literal look like code, which breaks comparisons. — [trojansource.codes](https://trojansource.codes/)
- CVE-2021-42694 is the homoglyph variant. Near-identical characters define functions that look the same as legitimate ones. These can sit in an upstream package imported into the victim's namespace and be called from victim code. — [trojansource.codes](https://trojansource.codes/)
- Recommended defenses: compilers and pipelines should error or warn on unterminated bidi controls in comments and strings and on identifiers that mix confusable scripts, and editors and repo frontends should make these characters visible. The paper is Boucher & Anderson, "Trojan Source: Invisible Vulnerabilities", USENIX Security 2023, arXiv:2111.00169. — [trojansource.codes](https://trojansource.codes/)
- GitHub added a warning banner for files containing bidirectional Unicode text on 2021-10-31, citing CVE-2021-42574. Users can dismiss it when the characters are intentional. — [GitHub changelog 2021-10-31](https://github.blog/changelog/2021-10-31-warning-about-bidirectional-unicode-text/)
- On 2025-05-01 GitHub broadened the warning to "hidden Unicode text" in general, mentioning AI risks. The changelog does not list which code points trigger it, so its coverage of Variation Selectors and PUA is undocumented. — [GitHub changelog 2025-05-01](https://github.blog/changelog/2025-05-01-github-now-provides-a-warning-about-hidden-unicode-text)
- GCC added `-Wbidi-chars`, and Atlassian and VisualSVN added bidi warnings to their UIs. — [GCC patch discussion](https://patchwork.sourceware.org/project/gcc/patch/YZROxBnxZQCTYdzl@redhat.com/); [Atlassian KB](https://support.atlassian.com/atlassian-knowledge-base/kb/bidirectional-characters-warning-in-atlassian-products/); [VisualSVN](https://visualsvn.com/support/topic/00200)

**Unicode Tags / ASCII smuggling (invisible prompt injection)**
- Riley Goodside publicized the technique in January 2024. Johann Rehberger (Embrace The Red) documented it and released the "ASCII Smuggler" tool. ASCII text is mirrored into the Unicode Tags block, which most interfaces do not render but LLMs still read. Goodside's demo hid instructions that made ChatGPT invoke DALL-E. — [promptfoo docs](https://promptfoo.dev/docs/red-team/plugins/ascii-smuggling/); [garak reference](https://reference.garak.ai/en/latest/ascii_smuggling.html); [Cisco blog](https://blogs.cisco.com/ai/understanding-and-mitigating-unicode-tag-prompt-injection)
- Rehberger later published "Sneaky Bits" (2025), which encodes bytes with invisible math operators (U+2062/U+2064 class) rather than tags. That means a tags-only filter is not enough. — [garak reference (links the post)](https://reference.garak.ai/en/stable/probes/encoding.html) (secondary summary; original post not fetched)
- Mitigation: strip the tag range before text reaches a model when the app does not need it, and diff the original text against the cleaned text. — [Cisco blog](https://blogs.cisco.com/ai/understanding-and-mitigating-unicode-tag-prompt-injection)

**Variation-selector / PUA steganography carrying executable code**
- os-info-checker-es6 (npm, Veracode, May 2025): the first versions (from about March 19, 2025) were benign. A version published on May 7 embedded a payload in a string that looks like a single `|` followed by a long run of Variation Selectors Supplement characters (U+E0100–U+E01EF). These decode to Base64 and then to a C2 stage that uses Google Calendar links to host the next URL. Four other packages depended on it. — [BleepingComputer](https://www.bleepingcomputer.com/news/security/malicious-npm-package-uses-unicode-steganography-to-evade-detection/); [Veracode](https://www.veracode.com/resources/sophisticated-npm-attack-leveraging-unicode-steganography-and-google-calendar-c2)
- GlassWorm (Open VSX / VS Code extensions, Koi Security, October 2025): payload bytes are hidden in VS1–VS16 (U+FE00–FE0F) and VS17–VS256 (U+E0100–E01EF), one code point per byte value 0–255 via offset arithmetic. The invisible string is 6,492 characters long. It decodes to Base64, then to JavaScript run with `eval()`. — [Endor Labs](https://www.endorlabs.com/learn/invisible-threats-glassworm-unicode-vscode)
- In March 2026 GlassWorm hit GitHub repos. Aikido and others reported at least 151 compromised repos between March 3 and 9, 2026, with payloads in invisible Unicode described as mainly from the **Private Use Area**. The commits were disguised as version bumps and minor cleanups, and Aikido suspected they were LLM-generated. BleepingComputer counted 433 compromised components that month across GitHub, npm, VS Code Marketplace and Open VSX. — [BleepingComputer](https://www.bleepingcomputer.com/news/security/glassworm-malware-hits-400-plus-code-repos-on-github-npm-vscode-openvsx/); [Scientific American](https://www.scientificamerican.com/article/glassworm-malware-hides-in-invisible-open-source-code); [Tom's/3dtested summary](https://www.3dtested.com/tech-industry/cyber-security/malicious-packages-using-invisible-unicode-found-in-151-github-repos-and-vs-code) (secondary; the Aikido primary post was not retrieved)
- Aikido reported on October 31, 2025 that GlassWorm had already spread to GitHub, hiding invisible-Unicode malware in AI-generated commits that looked legitimate. — [BleepingComputer (Oct 2025 coverage)](https://www.bleepingcomputer.com/news/security/self-spreading-glassworm-malware-hits-openvsx-vs-code-registries/)

**Whitespace padding / off-screen code**
- W4SP stealer campaign (PyPI, Phylum, 2022): malicious `__import__` calls were hidden in otherwise normal files. Later variants pushed the code off-screen horizontally, with 318 inserted spaces in one case. The packages had more than 5,700 downloads. — [Gigazine summary of Phylum](https://gigazine.net/gsc_news/en/20221104-pypi-packages-w4sp-stealer)
- pytoileur (PyPI, Sonatype, 2024): a Base64 payload was placed in `setup.py` after a long run of whitespace. It downloaded and ran a Windows binary and set up persistence. 264 downloads. — [CyberInsider](https://cyberinsider.com/malicious-pypi-package-promoted-on-stackoverflow-spreads-malware); [Sonatype](https://blog.sonatype.com/top-8-malicious-attacks-recently-found-on-pypi)

**Confusables reference**
- Unicode TR39 (Security Mechanisms) defines confusable detection ("skeleton" mapping), mixed-script detection and identifier restriction levels. It is the standard basis for homoglyph checks on identifiers and package names. — [Unicode TR39](https://www.unicode.org/reports/tr39/)

### Inferences
- **Single-diff signals** (cheap to compute on each added line):
  - Bidi controls U+202A–202E and U+2066–2069, especially when unbalanced within a line, comment or string.
  - Zero-width characters U+200B–200D, U+2060 and U+FEFF when they are not at byte 0.
  - Tags U+E0000–E007F.
  - Variation selectors U+FE00–FE0F and U+E0100–E01EF, especially runs longer than about 2 or following a non-emoji base.
  - PUA U+E000–F8FF, U+F0000–FFFFD and U+100000–10FFFD.
  - Invisible math operators U+2061–2064.
  - Hangul fillers U+115F, U+1160, U+3164, U+FFA0 (used as invisible identifiers in JS).
  - Mixed-script identifiers or TR39-confusable identifiers.
  - Lines longer than about 500 columns, or 100+ consecutive spaces or tabs followed by non-whitespace.
  - A high ratio of invisible to visible characters in a string literal.
- **Correlation signals:** the invisible payload string and the decoder or `eval` sink often sit in different commits or files. A benign "data" constant comes first, and a later "refactor" adds `eval(atob(...))`, a `Function(...)` call, or a `codePointAt`/`- 0xFE00` style mapping. Track per file and per repo whether a file holding a high-invisible-density string is later reachable from a dynamic-execution sink. os-info-checker-es6 also showed a "benign versions first, payload later" release pattern.
- **Naive-scanner evasion:**
  - A scanner that checks only bidi (the 2021 GitHub banner) misses VS, PUA and tags.
  - One that checks only tags misses Sneaky Bits.
  - A regex over decoded UTF-8 with `\s` treats some invisibles as non-whitespace.
  - Scanners that normalize (NFKC) or strip before matching remove the evidence.
  - A per-file size heuristic misses a 6 KB invisible string inside a big bundle.
  - Diff renderers that soft-wrap or truncate long lines hide padded code.
- For AI reviewers, tag and VS characters are a direct prompt-injection channel. A model reviewing a diff can be told to "approve". This argues for stripping or escaping them before model input and reporting their presence as a separate finding.

### Gaps
- No primary Aikido post was retrieved for the March 2026 wave. The claim that it used the "Private Use Area" comes from secondary outlets. The Koi "5th wave / MCP" post now redirects to a Palo Alto Networks product page (Koi appears to have been acquired), so its details could not be verified.
- No sourced list of exactly which code points GitHub's 2025 hidden-Unicode banner covers.
- No sourced 2024–2026 incident of misleading indentation, comment-hidden code, or minification alone used as review evasion in a source repo (as opposed to a package). These are known techniques, but no primary write-up was found in this pass.
- Rust (`text_direction_codepoint_in_literal`), Go and other language-level responses to Trojan Source were not verified in this pass.

## 2. Clone, open and build-time execution vectors

### Takeaway
A plain `git clone` does not run repo-supplied code by design. Hooks and filter-driver definitions live in local config, not in the repo. Git client bugs keep breaking that guarantee, though, most notably submodule and symlink bugs (CVE-2024-32002, CVE-2025-48384, the latter exploited in the wild per CISA). The bigger real-world vector in 2024–2026 is the IDE and toolchain layer. VS Code `tasks.json` with `runOptions.runOn: "folderOpen"` is now the main Contagious Interview delivery method, and Workspace Trust is the only gate. After a folder has been trusted once, later pulls that add tasks run without a new prompt.

### Cited Findings
**Git client CVEs**
- CVE-2024-32002 (May 2024): a crafted repo with submodules can make Git write into `.git/` instead of the submodule worktree, planting a hook that runs during the clone. It uses a directory and a symlink whose names differ only in case, so it is practical on case-insensitive filesystems (Windows, macOS). It needs a recursive clone with symlinks enabled. Fixed in 2.45.1, 2.44.1, 2.43.4, 2.42.2, 2.41.1, 2.40.2 and 2.39.4. Workaround: `core.symlinks=false`. CVE-2024-32004, a sibling bug, affects multi-user machines only. — [Rapid7](https://www.rapid7.com/db/vulnerabilities/redhat_linux-cve-2024-32002/); [Help Net Security](https://www.helpnetsecurity.com/2024/05/16/git-cve-2024-32002/); [Security Boulevard](https://securityboulevard.com/2024/06/detecting-cve-2024-32002)
- CVE-2025-48384 (July 2025): Git strips a trailing CR when reading config but does not quote it when writing. A submodule path ending in CR is checked out to the wrong location. Combined with a symlink to the submodule's hooks directory, an executable `post-checkout` hook can run. Found by David Leadbeater. Fixed in 2.43.7, 2.44.4, 2.45.4, 2.46.4, 2.47.3, 2.48.2, 2.49.1 and 2.50.1. CISA warned it was exploited. CVSS is reported as 8.0 (Wiz) and 8.1 (SecurityWeek). — [Wiz](https://www.wiz.io/vulnerability-database/cve/cve-2025-48384); [SecurityWeek](https://www.securityweek.com/organizations-warned-of-exploited-git-vulnerability/amp/)
- CVE-2022-24765 (April 2022): Git read a `.git` directory planted above the working directory by another user (for example `C:\.git\config`). Config keys such as `core.fsmonitor` execute commands, and a Git-aware shell prompt or an IDE such as VS Code running `git status` was enough to trigger it. Fixed by adding `safe.directory` (Git for Windows 2.35.2, Git 2.35.3/2.36.0). — [GitHub blog](https://github.blog/2022-04-12-git-security-vulnerability-announced?cve=title)

**Git configuration surfaces (by design)**
- Hooks in `.git/hooks` are not part of the cloned content. `core.hooksPath` is a config setting, not a tracked file. — [githooks docs](https://git-scm.com/docs/githooks)
- In `.gitattributes`, a `filter=<name>` (smudge/clean) attribute only runs a command if `filter.<name>.smudge/clean` is defined in the user's config. The attribute file is tracked, but the driver definition is not. — [gitattributes docs](https://git-scm.com/docs/gitattributes)

**VS Code tasks and Workspace Trust**
- Contagious Interview uses `.vscode/tasks.json` (GitLab, May 2026). Example indicators:
  - The task has `type: "shell"` and per-OS `osx`/`linux`/`windows` commands (`curl | bash`, `wget -qO- | sh`, `curl | cmd`).
  - `presentation` hides it: `reveal: "never"`, `echo: false`, `focus: false`, `close: true`, `panel: "dedicated"`, `showReuseMessage: false`.
  - `runOptions.runOn: "folderOpen"` and an empty `problemMatcher`.
  - Staging URLs follow a `settings/<os>` path with a `flag=` query.
  — [GitLab Security Labs](https://about.gitlab.com/blog/how-to-detect-and-prevent-contagious-interview-ide-attacks/)
- Detection: VS Code spawns task subprocesses through `node-pty` → `spawn-helper`, while the interactive terminal goes through `Code Helper`. Alerting on unusual background `spawn-helper` children such as `curl | bash` produced no false positives in GitLab's environment. The technique applies to other VS Code forks and Node-based IDEs. — [GitLab Security Labs](https://about.gitlab.com/blog/how-to-detect-and-prevent-contagious-interview-ide-attacks/)
- Once a user trusts a workspace, VS Code does not ask again for that repo, so later pulls can add malicious tasks that run without a new prompt. Later variants disguise multi-stage droppers in task config as harmless spell-check dictionaries. Payloads were staged on Vercel and led to BeaverTail and InvisibleFerret. OpenSourceMalware first documented the tasks.json technique. — [The Hacker News, Jan 2026](https://thehackernews.com/2026/01/north-korea-linked-hackers-target.html); [OpenSourceMalware](https://opensourcemalware.com/blog/contagious-interview-vscode); [NHIMG / Abstract Security](https://nhimg.org/articles/vs-code-tasks-files-let-attackers-trigger-developer-infection-chains/)
- StoatWaffle (NTT Security, 2026) is a Node.js stealer/RAT. It uses blockchain-themed decoy repos and runs automatically once the developer opens the project and grants trust. — [CSO Online](https://www.csoonline.com/article/4149274/new-stoatwaffle-malware-auto%E2%80%91executes-attacks-on-developers.html)
- Restricted Mode (an untrusted workspace) blocks tasks, debugging, some workspace settings (for example executable paths, tagged `requireTrustedWorkspace`), AI agents, the terminal, and extensions that have not opted in. Trusting a parent folder trusts every subfolder. `security.workspace.trust.startupPrompt` defaults to `never`. `--disable-workspace-trust` turns the gate off for a session. — [VS Code Workspace Trust docs](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)

### Inferences
- **Single-diff path and key signals:**
  - **Git and submodules:** `.gitmodules` additions or changes (new URL host, `path` values with control characters or trailing `\r`, paths that differ from existing directories only in case); symlinks added (mode 120000), especially ones pointing into `.git`, `hooks` or a submodule path; `.gitattributes` adding `filter=`, `diff=` or `merge=` drivers (inert alone, but a setup-script prompt can enable them); `.lfsconfig`; a submodule gitlink SHA change with no message context.
  - **VS Code:** `.vscode/tasks.json` with `runOn: folderOpen` or `reveal: never`, or a shell command containing a pipe to a shell, `curl`/`wget`/`iwr`, Base64 or a URL; `.vscode/settings.json` keys pointing at executables (`*.path`, `terminal.integrated.*`, `python.defaultInterpreterPath`, `git.path`); `.vscode/extensions.json` recommendations; `.vscode/launch.json` `preLaunchTask`.
  - **Other IDEs and toolchains:** `.idea/runConfigurations/*.xml` and `.idea/workspace.xml`; `.devcontainer/devcontainer.json` with `postCreateCommand`, `postStartCommand`, `postAttachCommand`, `initializeCommand` (which runs on the host) or `features` from a non-standard registry; `.envrc` (direnv); `Makefile` default-target changes; `package.json` `preinstall`, `install`, `postinstall` or `prepare` (`prepare` runs on install from a git URL); `setup.py`, `conftest.py`, `build.rs`, `.cargo/config.toml`, `Gradle init`, `.mvn/`, `.npmrc`, `.pre-commit-config.yaml`.
- **Correlation signals:**
  - A repo was trusted earlier and a later commit adds or changes a folder-open task. The trust-once model makes the *change* the event that matters.
  - A task or config points at a file that looks benign in the same tree (the "spell-check dictionary" disguise), so the payload body and the trigger arrive in different files or commits.
  - A `.gitmodules` URL change followed later by a gitlink SHA bump.
  - A symlink added in one commit and a same-name-different-case directory in another.
  - A README or CONTRIBUTING change that tells readers to run a setup script or set `git config` (enabling a filter or hooksPath) right after a `.gitattributes` driver is added.
- **Evasion of naive scanners:** JSONC comments and trailing commas in `.vscode` files break strict JSON parsers. Per-OS `osx`/`linux`/`windows` overrides hide the payload from a scanner that reads only the top-level `command`. The command can be split into a referenced script file. URLs can be built by string concatenation. A scanner that looks only at default-branch HEAD misses a payload that lives only in an interview-specific branch.

### Gaps
- No primary source in this pass for JetBrains run-configuration abuse, devcontainer `postCreateCommand` abuse, or direnv `.envrc` abuse in real campaigns. They are listed as surfaces (inference), not as observed incidents.
- The `task.allowAutomaticTasks` default and its interaction with trust were not confirmed. The fetched Workspace Trust page does not mention it.
- The primary GitHub advisory for CVE-2024-32002 (GHSA-8h77-4q3w-gfgv) and the Git project advisory for CVE-2025-48384 were not fetched directly. The details above come from secondary databases. The CISA KEV date for CVE-2025-48384 is unverified.
- Git LFS-specific attack tricks were not researched.

## 3. Campaigns: Contagious Interview, malicious extensions, fake PoCs

### Takeaway
Repository-delivered attacks on developers are an established, ongoing pattern. Contagious Interview (DPRK, MITRE G1052, since November 2023) moved from npm packages in interview repos to VS Code `tasks.json` auto-run by 2025–2026. GlassWorm moved from extensions (October 2025) into GitHub repos and MCP servers (March 2026), hiding payloads in invisible Unicode inside plausible, possibly LLM-written commits. Fake PoC repos aimed at researchers made up about 10% of exploit-advertising GitHub repos in a 2022 academic study.

### Cited Findings
- Contagious Interview first surfaced in November 2023. Unit 42 identified BeaverTail in late 2023, delivered as part of a fake interview task targeting US tech job-seekers. — [The Hacker News, Oct 2024](https://thehackernews.com/2024/10/beavertail-malware-resurfaces-in.html)
- Datadog (September 2024) found the npm packages passports-js, bcrypts-js and blockscan-api (323 downloads) carrying BeaverTail, attributed to "Tenacious Pungsan". Phylum (August 2024) found npm packages delivering BeaverTail plus the Python backdoor InvisibleFerret. — [Datadog Security Labs](https://securitylabs.datadoghq.com/articles/tenacious-pungsan-dprk-threat-actor-contagious-interview/); [The Hacker News](https://thehackernews.com/2024/10/beavertail-malware-resurfaces-in.html)
- Coding-assessment repos are hosted on Bitbucket, GitHub and GitLab, look like full applications, and hide the payload in a few lines. — [Atlassian](https://www.atlassian.com/blog/how-we-build/disrupting-contagious-interview?nb=1)
- GitLab's May 2026 write-up documents the tasks.json folder-open pivot (see section 2). — [GitLab Security Labs](https://about.gitlab.com/blog/how-to-detect-and-prevent-contagious-interview-ide-attacks/)
- GlassWorm, first wave (Koi Security, October 2025): malicious Open VSX extensions with a reported 35,000+ downloads (possibly inflated). The payload was invisible in editors. — [BleepingComputer](https://www.bleepingcomputer.com/news/security/self-spreading-glassworm-malware-hits-openvsx-vs-code-registries/)
  - Stage chain: Solana wallet memo polling (about every 10 seconds) for C2, with a Google Calendar event title as a fallback that decodes to a payload URL.
  - AES-encrypted stage 3, with keys passed in HTTP headers. It steals more than 70 crypto wallets plus GitHub, npm and Open VSX tokens.
  - "ZOMBI" stage 4 adds BitTorrent DHT and socket.io C2, a SOCKS proxy and HVNC.
  - Execution is throttled with a roughly two-day cooldown in `context.globalState`.
  - Its native decoders (`index_win32_*.node`, `index_linux.node`) were on VirusTotal from 2025-03-23 with zero detections until 2025-10-22.
  — [Endor Labs](https://www.endorlabs.com/learn/invisible-threats-glassworm-unicode-vscode)
- GlassWorm resurfaced on November 6, 2025 with 3 more extensions (about 10,000 downloads) and bypassed Open VSX's new defenses. — [BleepingComputer](https://bleepingcomputer.com/news/security/glassworm-malware-returns-on-openvsx-with-3-new-vscode-extensions); [Security Affairs](https://securityaffairs.com/184427/malware/glassworm-malware-has-resurfaced-on-the-open-vsx-registry.html)
- GlassWorm in March 2026: 151+ GitHub repos (March 3–9) and 433 components across ecosystems. The same Solana address links the waves. Koi reported the first malicious MCP server using invisible Unicode. — [BleepingComputer](https://www.bleepingcomputer.com/news/security/glassworm-malware-hits-400-plus-code-repos-on-github-npm-vscode-openvsx/)
- Fake PoCs: a Leiden University study of 47,313 GitHub repos advertising exploits for 2017–2021 CVEs flagged 4,893 (10.3%) as malicious. BleepingComputer frames 10.3% as an upper bound. In 2023 VulnCheck found repos from a fake firm ("High Sierra Cyber Security") claiming zero-day PoCs for Discord, Chrome and Exchange, backed by sock-puppet Twitter and GitHub accounts. — [BleepingComputer](https://www.bleepingcomputer.com/news/security/thousands-of-github-repositories-deliver-fake-poc-exploits-with-malware/); [Malwarebytes](https://www.malwarebytes.com/blog/news/2022/10/fake-proof-of-concepts-used-to-lure-security-professionals)

### Inferences
- For an org-wide push monitor, the GlassWorm GitHub wave is the most relevant pattern: a stolen token pushes a commit that looks like a version bump or cleanup and carries a high-density invisible-Unicode string plus a small decoder.
  - **Signals in one push:** invisible-class bytes plus a dynamic-execution sink (`eval`, `Function`, `vm.runIn*`, `child_process`) in JS or TS; a commit message that sounds like a bump while the diff touches executable code; an author or committer, push time or client that is unusual for that repo.
  - **Correlation:** the same push shape across many repos in an org within a short window (worm behavior); the same Solana address, Calendar URL or decoder skeleton seen across repos; a push from a token that recently pushed to many unrelated repos.
- Interview and PoC lures arrive as external repos, not pushes, but the same indicators apply to forks and to vendored code an employee commits: `.vscode/tasks.json` folder-open tasks, obfuscated `server/config` JS with `eval` of hex or Base64, and a package.json whose lifecycle scripts fetch remote code.
- Solana RPC, Google Calendar, DHT and JSON-storage services (for example jsonkeeper-like hosts) used as dead drops mean domain-reputation scanners see only reputable hosts. Look for the *pattern* (reading a memo or event title and then eval-ing it) rather than the host.

### Gaps
- The original Unit 42 Contagious Interview reports and the Microsoft write-up (Sapphire Sleet / related DPRK clusters) were not retrieved in this pass. Attribution details rely on Datadog, GitLab and secondary coverage.
- No authoritative count of Contagious Interview repos or victims for 2025–2026 was found.
- Check Point and Aqua research on malicious VS Code Marketplace extensions (2023–2024 typosquatting and impersonation of popular extensions) was not retrieved.
- No research post-dates March 2026 for GlassWorm. Its status as of October 2026 is unknown.
