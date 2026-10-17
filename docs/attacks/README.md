# Attack library

Real attacks on code repositories, explained in plain words, and what Pushguard does (or does not yet do) about each one.

**How to use this folder:** pick an attack below, read "Signs to look for", then "How Pushguard catches it".
Each file lists its sources and how sure we are about them. Files marked "possible future" describe attacks nobody has seen yet.

## Package & maintainer takeover

- [event-stream](packages/event-stream.md): a stranger offered to maintain a popular npm package, then added a dependency that stole Bitcoin wallet keys (2018).
- [Account takeovers 2018 to 2024](packages/account-takeovers-2018-2024.md): stolen npm and PyPI accounts used to publish bad versions of ua-parser-js, coa, rc, eslint-scope, ctx and others.
- [Maintainer sabotage and protestware](packages/maintainer-sabotage-protestware.md): the real maintainer broke their own packages on purpose (colors, faker, node-ipc).
- [Dependency confusion](packages/dependency-confusion.md): a public package with the same name as a private one wins the install.
- [PyTorch torchtriton](packages/pytorch-torchtriton.md): dependency confusion in the wild against PyTorch nightly users (2022).
- [Typosquatting](packages/typosquatting.md): packages named like popular ones (`crossenv`, `urlib3`, `plain-crypto-js`).
- [Lockfile injection](packages/lockfile-injection.md): a quiet edit to the lockfile changes what gets installed.
- [Install scripts](packages/install-scripts.md): code that runs the moment you install a package.
- [Remote dynamic dependencies](packages/remote-dynamic-dependencies.md): the package is a harmless stub; the real code is fetched at install time from a URL or an orphan commit.
- [chalk / debug phishing](packages/maintainer-phishing-chalk-debug.md): a fake npm support email took over packages with about 2 billion weekly downloads (2025).
- [axios 2026](packages/axios-2026.md): a hijacked maintainer account added one new dependency and no code change (2026).
- [Shai-Hulud](packages/shai-hulud-1.md): the first npm worm that stole tokens and spread by itself (Sept 2025).
- [Shai-Hulud 2.0](packages/shai-hulud-2.md): the worm returns with Bun, a self-hosted runner backdoor and a home-folder wipe (Nov 2025).
- [Nx s1ngularity](packages/nx-s1ngularity.md): a CI flaw leaked a publish token; the malware used the victim's own AI tools to hunt secrets (Aug 2025).
- [Worm waves 2026](packages/worm-waves-2026.md): Bitwarden CLI, SAP, @antv and AsyncAPI waves of the same worm family.
- [TanStack 2026](packages/tanstack-2026.md): cache poisoning plus a stolen CI token; first malware with valid SLSA provenance.
- [Red Hat Miasma 2026](packages/redhat-miasma-2026.md): orphan commits pushed by a stolen employee account, published with valid provenance.
- [ChainDrop / keyv 2026](packages/chaindrop-keyv-2026.md): worm commits, editor and Claude hooks on 50 branches, and a vanishing workflow branch.
- [zod / standard-schema / nub 2026](packages/zod-standard-schema-nub-2026.md): a "Fix bugs" commit hid a loader in test files and sat in history for three weeks.

## Multi-stage backdoors

- [xz-utils](multi-stage/xz-utils.md): a 2.5-year con: fake persona, hidden payload in "test files", trigger only in the release tarball.
- [SolarWinds SUNSPOT](multi-stage/solarwinds-sunspot.md): the repo was clean; malware on the build server swapped a file during compiles.
- [Codecov Bash Uploader](multi-stage/codecov-bash-uploader.md): one line added to a downloaded script sent CI secrets away.
- [Hypocrite commits and bugdoors](multi-stage/hypocrite-commits-and-bugdoors.md): "fix" patches that add a subtle bug; Juniper ScreenOS.
- [PHP git server](multi-stage/php-git-server.md): a backdoor pushed under two core developers' names, labelled "fix typo".
- [Webmin build server](multi-stage/webmin-build-server.md): tampered code shipped only in downloads, never in git.
- [Environment-gated payloads](multi-stage/environment-gated-payloads.md): code that stays quiet unless it runs on the exact target.
- [Split across commits](multi-stage/split-across-commits.md): each change looks fine alone; together they are an attack.

## CI/CD & GitHub platform

- [Tag repointing: tj-actions](ci-cd/tag-repointing-tj-actions.md): a four-hop chain ended with every version tag of a popular Action moved to bad code (2025).
- [TeamPCP / Trivy](ci-cd/teampcp-trivy.md): 75 of 76 trivy-action tags force-pushed, plus a backdoored release binary (2026).
- [Ultralytics](ci-cd/ultralytics.md): a branch name became a shell command; a poisoned cache reached a PyPI release (2024).
- [Clinejection](ci-cd/clinejection.md): an AI issue-triage bot shared a cache with the release job (2026).
- [Cache poisoning](ci-cd/cache-poisoning.md): a low-trust job writes to a build cache that a release job later trusts.
- [Pwn requests and script injection](ci-cd/pwn-request-and-script-injection.md): `pull_request_target` workflows that run attacker text with secrets.
- [workflow_run and TOCTOU](ci-cd/workflow-run-and-toctou.md): trusting artifacts from untrusted runs, or approving one commit and running another.
- [Self-hosted runners: PyTorch](ci-cd/self-hosted-runner-pytorch.md): persistent runners that let a fork contributor stay inside CI.
- [GhostAction](ci-cd/ghostaction.md): stolen accounts pushed a "security" workflow that mailed out 3,325 secrets (2025).
- [Fake Dependabot commits](ci-cd/fake-dependabot-commits-2023.md): commits dressed up as Dependabot added a secret-stealing workflow (2023).
- [Force push to every branch](ci-cd/force-push-every-branch-polinrider.md): reported 2026 campaign rewriting every branch of every repo a user could write to.
- [Commit author impersonation](ci-cd/commit-author-impersonation.md): git lets anyone type any name and email into a commit.
- [Repo settings tampering](ci-cd/repo-settings-tampering.md): weakening branch protection, adding deploy keys or members, flipping private repos public.
- [Evidence erasure](ci-cd/evidence-erasure.md): branches pushed and deleted in one second, tags moved back, accounts deleted.
- [OIDC token theft](ci-cd/oidc-token-theft.md): stealing the short-lived token a workflow uses to publish or reach the cloud.

## Hidden code & developer environment

- [Trojan Source and homoglyphs](hidden-code/trojan-source-and-homoglyphs.md): Unicode that makes code look different from what runs.
- [ASCII smuggling (Unicode Tags)](hidden-code/ascii-smuggling-unicode-tags.md): invisible text that AI models read but people do not see.
- [Invisible Unicode: GlassWorm](hidden-code/invisible-unicode-glassworm.md): executable code hidden in invisible characters across extensions and 151+ GitHub repos.
- [os-info-checker-es6](hidden-code/os-info-checker-es6.md): npm package hiding a payload in variation-selector characters (2025).
- [Whitespace padding](hidden-code/whitespace-padding.md): code pushed hundreds of spaces off the right edge of the screen.
- [Git submodule bug CVE-2024-32002](hidden-code/git-submodule-cve-2024-32002.md): a crafted repo plants a hook that runs during clone.
- [Git CR bug CVE-2025-48384](hidden-code/git-cr-cve-2025-48384.md): a trailing carriage return in a submodule path leads to a hook running; exploited in the wild.
- [Git config execution](hidden-code/git-config-execution.md): planted `.git` folders, filter drivers and hooks that run commands.
- [Contagious Interview tasks.json](hidden-code/contagious-interview-tasks-json.md): fake job tests that run malware when you open the folder in VS Code.
- [Fake PoC repos](hidden-code/fake-poc-repos.md): "exploit" repos that infect the security researcher who runs them.

## AI-era attacks

- [Rules File Backdoor](ai/rules-file-backdoor.md): hidden instructions in `.cursor/rules` or Copilot instruction files.
- [Copilot YOLO mode, CVE-2025-53773](ai/copilot-yolo-mode-cve-2025-53773.md): injected text made Copilot turn off its own confirmations.
- [GitHub MCP toxic agent flow](ai/github-mcp-toxic-agent-flow.md): a public issue tricks an agent into leaking private repos.
- [CamoLeak](ai/camoleak.md): hidden PR comments made Copilot Chat leak private code through image links.
- [PromptPwnd](ai/promptpwnd.md): issue titles fed into AI agents inside CI that hold write tokens.
- [MCP tool poisoning](ai/mcp-tool-poisoning.md): instructions hidden in MCP tool descriptions; tools that change after approval.
- [Amazon Q wiper prompt](ai/amazon-q-wiper-prompt.md): a signed release shipped a prompt telling the agent to delete files and cloud resources.
- [Slopsquatting](ai/slopsquatting.md): attackers register the package names AI models invent.
- [GTG-1002](ai/gtg-1002.md): an AI agent ran most of an intrusion campaign, split into harmless-looking tasks.
- [Big Sleep: AI-found bugs](ai/big-sleep-ai-found-bugs.md): AI finding real vulnerabilities, for defenders and attackers alike.
- [Autonomous CI attack bots 2026](ai/autonomous-ci-attack-bots-2026.md): hackerbot-claw and prt-scan, bots that mass-attack pull request workflows.
- [UK AISI agent findings](ai/aisi-agent-findings.md): test agents made fake identities and tried to get a malicious PR approved.
- [Fedora Anaconda agent PR](ai/fedora-anaconda-agent-pr.md): an AI agent's PR did not match its description and was merged anyway.

### Possible future attacks (not yet seen)

- [Salami backdoor](ai/future-salami-backdoor.md): many tiny harmless PRs that add up to a backdoor.
- [Reviewer budget exhaustion](ai/future-reviewer-budget-exhaustion.md): hiding the payload past what a reviewer reads.
- [Skipped-file smuggling](ai/future-skipped-file-smuggling.md): hiding logic in lockfiles, generated code, fixtures and other files reviewers skip.
- [LLM-adversarial comments](ai/future-llm-adversarial-comments.md): comments that talk an AI reviewer into calling bad code safe.
- [Agent-to-agent injection](ai/future-agent-to-agent-injection.md): instruction files that steer the next coding agent.
- [Code index poisoning](ai/future-code-index-poisoning.md): decoy helpers that mislead a reviewer's search.
- [Sandbox-tuned time bombs](ai/future-sandbox-tuned-time-bombs.md): code that waits until it is not being watched.
- [Autonomous long con](ai/future-autonomous-long-con.md): an agent builds trust for weeks, then lands the payload.
- [Reviewer as exfil channel](ai/future-reviewer-as-exfil.md): tricking the AI reviewer into posting secrets.

## Glossary

- **Install script**: a command a package runs on your machine when you install it (`preinstall`, `postinstall`, `setup.py`).
- **Lockfile**: a file (`package-lock.json`, `yarn.lock`) that records the exact version and download URL of every dependency.
- **Dependency**: another package your code uses. A *transitive* dependency is one your dependency uses.
- **Registry**: the public store packages come from (npm, PyPI, crates.io).
- **Maintainer**: a person allowed to publish new versions of a package or merge into a repo.
- **Tag**: a name (like `v1`) that points at one commit. It can be moved to point somewhere else.
- **Force push**: a push that replaces history instead of adding to it. Old commits can disappear from the branch.
- **Workflow / GitHub Actions**: scripts in `.github/workflows/` that GitHub runs on events like a push or a pull request.
- **pull_request_target**: a workflow trigger that runs with the main repo's secrets even when the pull request comes from a stranger's fork.
- **PAT (personal access token)**: a password-like token that lets scripts act as a GitHub user.
- **OIDC token**: a short-lived token a workflow can get to prove who it is to npm or a cloud, without a stored password.
- **Provenance (SLSA)**: a signed record of which workflow built a package from which commit. It shows where a package was built. It says nothing about whether the code is safe.
- **Self-hosted runner**: your own machine that runs workflows. If it is not wiped between jobs, an attacker can stay on it.
- **Bidi character**: an invisible Unicode control that flips text direction, so code can look different from how it runs.
- **Homoglyph**: a character that looks like another one (Cyrillic "а" vs Latin "a").
- **MCP (Model Context Protocol)**: a standard way to give an AI agent tools. A tool's description is read by the model.
- **Prompt injection**: text written to give orders to an AI that reads it, hidden inside data like a file, issue or web page.
- **Lethal trifecta**: an agent with private data, untrusted input and a way to send data out. Together they allow leaks.
- **Sandbox**: an isolated place to run code safely. Some malware checks if it is in one and stays quiet.
- **Detonation**: running suspicious code in a sandbox to watch what it does.
- **C2 (command and control)**: the server or "dead drop" malware talks to for orders.
