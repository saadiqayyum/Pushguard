# CI/CD and GitHub-Platform Attacks Against Source Repositories (2018 – Oct 2026)

Scope: attacks that abuse GitHub Actions, repository settings and identity to inject code, steal secrets, or persist. Defensive framing: entry vector, observable events, and detection signals. No exploit steps.

## 1. tj-actions/changed-files and reviewdog/action-setup (March 2025)

### Takeaway
This was a four-hop chain. A PAT leaked through a `pull_request_target` workflow in SpotBugs. That PAT compromised reviewdog, and reviewdog leaked the tj-actions bot PAT. The bot PAT was then used to repoint every tj-actions tag to a commit that dumped runner secrets into public workflow logs. The decisive observable on the victim side was the tag being moved: a push event on `refs/tags/*` with `forced: true`. On free plans, tag pushes did not show up in the audit log, so a webhook stream was the only place to see them.

### Cited Findings
- **Chain origin (SpotBugs):**
  - On 2024-11-28, a SpotBugs maintainer put their PAT into a workflow in spotbugs/sonar-findbugs.
  - On 2024-12-06, an attacker opened a PR against a `pull_request_target` workflow. The PR modified `mvnw`, which runs during CI, and that leaked the PAT. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- **Dormancy, then a member add and a push-and-delete branch:**
  - On 2025-03-11 at 10:50:16 UTC, a disposable account (`jurkaofavak`) was added as a member of spotbugs/spotbugs with the leaked PAT.
  - At 10:52:22–23, a branch with a malicious workflow was pushed and deleted within one second. That workflow encrypted all repo secrets and uploaded them as an artifact, and the secrets included a reviewdog maintainer's PAT.
  - About three months passed between the leak and its use. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- **reviewdog tag repoint:**
  - On 2025-03-11 at 18:42:09, the `v1` tag of reviewdog/action-setup was moved to malicious commit b833eecd. That commit came from an attacker-owned fork.
  - At 20:31:49, the tag was force-pushed back to the clean commit 3f401fe1, a window of about 2 hours.
  - Tag pushes on free-tier plans were not recorded in the audit log.
  - Commits from deleted forks stay reachable through the fork network ("dangling/impostor commits"). — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- **reviewdog to tj-actions:**
  - tj-actions/changed-files used tj-actions/eslint-changed-files, which pulled in reviewdog/action-setup as a composite action. The malicious reviewdog code ran in the tj-actions runner and leaked a PAT for `tj-bot-actions`.
  - Malicious commit 0e58ed8 was disguised as a `renovate[bot]` commit and merged through an auto-merged PR.
  - On 2025-03-14 at 16:57 UTC, all tags were replaced. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- **Tag range:** tags v1 through v45.0.7 were repointed to 0e58ed8 on 2025-03-14/15, so pinning to a version tag gave no protection. The fix is v46.0.1. — [Inventive HQ CVE page](https://inventivehq.com/tools/security/cve-lookup/cve-2025-30066); [Phoenix Security](https://phoenix.security/?p=34970)
- **Secret exposure mechanism:**
  - The payload dumped credentials from runner memory and printed them to the workflow log as double-base64. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/); [Wiz](https://threats.wiz.io/all-incidents/tj-actionschanged-files-supply-chain-attack)
  - Wiz saw no external exfiltration. The secrets were readable only in the repos' own logs, which are public for public repos. — [Wiz](https://threats.wiz.io/all-incidents/tj-actionschanged-files-supply-chain-attack)
- **Real target was Coinbase agentkit:**
  - On 2025-03-07, Coinbase added tj-actions/changed-files@v39 to agentkit.
  - On 2025-03-14 at 15:10, the agentkit workflow, running with write-all permissions, leaked a write token.
  - Commit 6e6023c, impersonating `github-actions[bot]`, specifically targeted agentkit. Coinbase reported no damage. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- **Identities:** the disposable accounts (iLrmKCu86tjwp8, 2ft2dKo28UazTZ, mmvojwip, jurkaofavak) were created for single stages and then deleted. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- **Official tracking:**
  - CVE-2025-30066 (tj-actions) and CVE-2025-30154 (reviewdog). CISA added 30066 to KEV on 2025-03-26 and advised rotating any secret seen in logs. — [CISA](https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-github-action-cve-2025-30066)
  - GitHub removed the action from the Marketplace on 2025-03-15. — [Phoenix Security](https://phoenix.security/?p=34970)
- **Detection:** StepSecurity Harden-Runner caught it from an unexpected outbound endpoint during the workflow (runtime egress, not repo events). — [Phoenix Security](https://phoenix.security/?p=34970)
- **Same pattern, 2026 (TeamPCP / Trivy):**
  - On 2026-03-19, 75 of 76 tags in aquasecurity/trivy-action were force-pushed to malicious commits. CSA reports 76 of 77 and says all 7 setup-trivy tags were also overwritten.
  - A backdoored Trivy v0.69.4 binary was published to GitHub Releases and container registries.
  - Root cause was incomplete rotation: a leftover valid token from a late-February intrusion.
  - The same campaign force-pushed 35 tags in checkmarx/kics-github-action. — [Phoenix Security](https://phoenix.security/trivy-supply-chain-attack-team-pcp/); [CSA research note](https://labs.cloudsecurityalliance.org/research/csa-research-note-teampcp-cicd-supply-chain-20260325/); [BleepingComputer](https://www.bleepingcomputer.com/news/security/trivy-vulnerability-scanner-breach-pushed-infostealer-via-github-actions/amp/)
  - One guide suggests checking for missing GPG signatures on replacement commits where the originals were web-signed. — [Phoenix Security](https://phoenix.security/trivy-supply-chain-attack-team-pcp/)

### Inferences
- **What a monitor on the action's own repo would have seen:**
  - `push` with `ref: refs/tags/vN`, `forced: true`, and `before` and `after` both non-zero (a moved tag, not a new one).
  - Many such pushes in one burst. Note that GitHub does not create tag events when more than 3 tags are pushed at once (section 5), so a bulk repoint can be partly or fully invisible to webhooks. That is a key blind spot exactly for this attack.
  - An `after` commit that is not reachable from the default branch (it came from a fork), unsigned where earlier tag targets were signed, and authored as a `*[bot]` identity that does not match the pusher.
- **What a monitor on a consumer repo would have seen:**
  - Nothing at the repo-event level. The consumer's workflow file never changed.
  - Detection needs either SHA pinning (so a moved tag has no effect), resolving `uses:` tags to SHAs and diffing over time, or runtime and log scanning.
- **Correlations that would have flagged SpotBugs early:** a `member` added, then within minutes a `create` and `delete` of the same branch whose push touches `.github/workflows/`.

### Gaps
- How the reviewdog maintainer's PAT originally got into SpotBugs secrets is unresolved (Unit 42 lists it as an open question).
- I did not find StepSecurity's primary post in this session. The detection details come from secondary coverage.

## 2. Ultralytics (December 2024)

### Takeaway
A `pull_request_target` workflow expanded an attacker-controlled branch name into a shell command (script injection). The injected code poisoned the Actions/pip cache, and a later release job restored the poisoned cache while holding publish rights. Trusted Publishing with no protected deployment environment meant that compromising the workflow was enough to publish to PyPI. Later releases were pushed to PyPI directly with stolen credentials, bypassing Actions.

### Cited Findings
- **Entry:** a branch name was interpolated into a `run:` step of a `pull_request_target` workflow. The result downloaded a script that exfiltrated tokens and secrets and poisoned the pip cache used by setup-python. A custom action in ultralytics/actions had reintroduced a previously fixed issue. — [Snyk](https://snyk.io/de/blog/ultralytics-ai-pwn-request-supply-chain-attack/)
- **Cache vector:**
  - Yossarian (zizmor author) concludes the vector was a poisoned cache introduced after the injection, based on the fix PR that removed pip caching.
  - Ultralytics used PyPI Trusted Publishing without a configured deployment environment, so compromising the workflow was enough to trigger a publish. — [Yossarian blog](https://blog.yossarian.net/2024/12/06/zizmor-ultralytics-injection)
- **Releases:**
  - v8.3.41 was published 2024-12-04 and stayed up about 12 hours, followed by 8.3.42.
  - 8.3.45 and 8.3.46 were published directly to PyPI, bypassing Actions.
  - The payload was a cryptominer. — [Snyk](https://snyk.io/de/blog/ultralytics-ai-pwn-request-supply-chain-attack/)
- **Exact cache mechanism:** sources describe it as likely rather than confirmed. — [Yossarian](https://blog.yossarian.net/2024/12/06/zizmor-ultralytics-injection); [Snyk](https://snyk.io/de/blog/ultralytics-ai-pwn-request-supply-chain-attack/)
- **Cache poisoning research (Adnan Khan):**
  - Cacheract is a proof of concept for "cache-native malware" that persists across runs.
  - On 2025-11-20, GitHub began evicting cache entries immediately once a repo exceeds 10 GB, using LRU order. Before that, eviction ran every 24 hours. Flooding the cache can therefore evict legitimate keys so an attacker can claim them. — [Adnan Khan, Clinejection](https://adnanthekhan.com/posts/clinejection/); [Simon Willison](https://simonwillison.net/2026/Mar/6/clinejection/)
  - The Actions Runtime Token cannot write to the cache after a job concludes, so poisoning must happen while the job is running. — [Adnan Khan, Angular](https://adnanthekhan.com/posts/angular-compromise-through-dev-infra/)
  - Original 2024 research — [Adnan Khan, "Monsters in your build cache"](https://adnanthekhan.com/2024/05/06/the-monsters-in-your-build-cache-github-actions-cache-poisoning/)
- **Clinejection (2026):**
  - An AI issue-triage workflow that anyone could trigger by opening an issue (a prompt-injection entry point) shared a `node_modules` cache key with the nightly release workflow.
  - Disclosed 2026-02-09. Eight days later, an unknown actor used it to publish an unauthorized Cline CLI to npm. — [Snyk](https://snyk.io/jp/blog/cline-supply-chain-attack-prompt-injection-github-actions/); [Simon Willison](https://simonwillison.net/2026/Mar/6/clinejection/)
- **GitHub Security Lab on cache poisoning:** `permissions: {}` does not stop a workflow from writing to the cache. — [GitHub Security Lab, new patterns](https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/)

### Inferences
- **Repo-event observability is weak for this class:**
  - The trigger is a fork PR (`pull_request` event, `opened`/`synchronize`) with a suspicious `head.ref`, meaning shell metacharacters such as `$(`, backticks or `;` in the branch name.
  - Cache writes and evictions emit no webhooks.
  - The poisoned release shows up only as a `release` event, `workflow_run` completion of the release workflow, or `package`/`registry_package` publication.
- **Static signals per change:**
  - A workflow-file diff adding `pull_request_target`, `issue_comment` or `workflow_run` together with `${{ github.event.* }}` interpolation into `run:`.
  - Cache keys shared between low-trust and release workflows.
  - A publish job with no `environment:`.
- **Signals visible only when correlated:**
  - A PR from a never-seen fork whose branch name contains metacharacters.
  - A release published without a matching tag push or workflow run (a direct-to-registry publish like 8.3.45/46). That needs registry-side data and is not visible in GitHub webhooks.

### Gaps
- I found no authoritative PyPI or Ultralytics postmortem in this session confirming the exact cache key used.
- An LWN comment claims PyPI has blocked `pull_request_target` for Trusted Publishing. It is unverified, so I excluded it.

## 3. GhostAction, Shai-Hulud, force-push-to-every-branch, Nx s1ngularity and other 2025–2026 campaigns

### Takeaway
The dominant 2025–2026 pattern is a stolen developer identity (PAT, OAuth/GitHub App token or local machine) used to push workflow files directly under the victim's name, or to force-push payloads onto every branch. These pushes are fully visible in `push` webhooks:
- new files under `.github/workflows/` with secret-dumping content;
- the same commit message and file across many repos in a short window;
- `forced: true` across many refs.

Repo visibility flips (`repository.publicized`) and new repos under the victim's account (Shai-Hulud "-migration") are also visible, but only at org or account scope.

### Cited Findings
- **GhostAction (GitGuardian, Sept 2025):**
  - On 2025-09-02, compromised maintainer account Grommash9 (FastUUID) pushed a commit "Add Github Actions Security workflow" adding `.github/workflows/github_actions_security.yml`.
  - Triggers were `push` and `workflow_dispatch`. A curl POST sent secrets to `bold-dhawan.45-139-104-115.plesk.page`. Later waves used `carte-avantage.com` and `objective-hopper...plesk.page`.
  - The attacker read secret names from the repo's legitimate workflows and hardcoded them, for example PYPI_API_TOKEN and CF_API_TOKEN.
  - The same commits went to at least 5 other public repos and about 10 private repos on the same date. — [GitGuardian](https://blog.gitguardian.com/ghostaction-campaign-3-325-secrets-stolen/)
  - Scale: 327 users, 817 repos, 3,325 secrets (mostly DockerHub, GitHub and npm tokens), and 24 packages at risk.
  - A second wave of about 500 commits on 2025-09-09 hit 14 new repos.
  - GitGuardian filed alert issues in 573 repos. The initial access vector is unknown. — [GitGuardian](https://blog.gitguardian.com/ghostaction-campaign-3-325-secrets-stolen/); [StepSecurity](https://www.stepsecurity.io/blog/ghostaction-campaign-over-3-000-secrets-stolen-through-malicious-github-workflows)
  - Unconfirmed: a reported October 2026 variant used two compromised maintainer accounts to inject `security-audit.yml` into 345 repos, searching the working tree and git history for cloud credentials (attributed to StepSecurity). I could not verify it against a primary source. — [LetsDataScience](https://letsdatascience.com/news/ghostaction-injects-credential-stealing-github-workflows-95439117)
- **Shai-Hulud v1 (Sept 2025):**
  - Pushed a workflow into accessible repos that sent repo secrets to an external webhook. When that webhook was deactivated, the secrets still sat in the workflow logs.
  - 64 more repos had a `shai-hulud` branch created.
  - A migration script (`/tmp/migrate-repos.sh`) cloned private org repos and republished them as public repos under the attacker-controlled (victim) account with a `-migration` suffix. It created them private first.
  - Wiz first saw 36 users with secrets exposed and 8 users whose private repos were force-migrated to public. Wiz links it to s1ngularity. — [Wiz](https://www.wiz.io/blog/shai-hulud-npm-supply-chain-attack)
- **Sha1-Hulud 2.0 (Nov 2025):**
  - Registers the infected machine as a self-hosted runner named `SHA1HULUD`, attached to a newly created repo via a registration token. On Linux it lives in a hidden directory and runs under nohup. — [Sysdig](https://www.sysdig.com/blog/return-of-the-shai-hulud-worm-affects-over-25-000-github-repositories); [Sumo Logic](https://www.sumologic.com/?p=62047)
  - Commits `.github/workflows/discussion.yaml`, a command-injection backdoor that lets anyone opening a Discussion run code on that runner. — [Semgrep](https://app.semgrep.dev/blog/2025/digging-for-secrets-sha1-hulud-the-second-coming-of-the-npm-worm)
  - A second "Code Formatter" workflow serializes secrets to JSON and uploads them as artifacts. Exfiltration repos number in the thousands. — [Cycode](https://cycode.com/blog/shai-hulud-2-0-deep-dive-and-actionable-steps-you-should-take/)
  - Repo description is "Sha1-Hulud: The Second Coming". Create-repo audit logs omit descriptions, so look for random-looking repo names. — [Semgrep](https://app.semgrep.dev/blog/2025/digging-for-secrets-sha1-hulud-the-second-coming-of-the-npm-worm); [Sumo Logic](https://www.sumologic.com/?p=62047)
  - A later "Mini Shai-Hulud" reportedly gained entry through PR-workflow misconfigurations. — [Cloudsmith](https://cloudsmith.com/blog/evolution-of-shai-hulud-worms); [Akamai](https://www.akamai.com/de/blog/security-research/mini-shai-hulud-worm-returns-goes-public)
- **Nx s1ngularity (Aug 2025):**
  - A PR-title validation workflow on `pull_request_target` echoed the unsanitized PR title (script injection).
  - The vulnerable workflow was added 2025-08-21 and reverted, but a fork PR targeting an outdated branch that still had it triggered it anyway.
  - The injected code got a publish workflow to run and exfiltrate the npm token to webhook[.]site.
  - The repo still had the legacy read/write default `GITHUB_TOKEN` permission. GitHub changed that default for new repos in Feb 2023 but did not update existing repos. — [Nx postmortem](https://nx.dev/blog/s1ngularity-postmortem)
  - npm provenance does not block installing unsigned packages. Missing provenance is how Nx detected the bad versions. — [Nx postmortem](https://nx.dev/blog/s1ngularity-postmortem)
- **GitHub Community #208082 (2026-09-17), reported but unverified:**
  - Malicious commits were force-pushed to every branch of every repo the account could write to: personal, org and forked OSS repos.
  - Each commit was appended to the last legitimate commit and modified config files (.gitignore, vite, postcss, tailwind, eslint) with obfuscated JS that imports `child_process`, `http` and `zlib` via `createRequire`.
  - It persisted through password change, PAT and SSH key revocation and a laptop reformat.
  - The security log showed repeated `oauth_access.create` and `oauth_access.regenerate` for the "Copilot Chat App" GitHub App after every revocation, without a knowingly approved device code.
  - The discussion was closed with no GitHub confirmation. A third party reported receiving similar commits. — [GitHub Discussion #208082](https://github.com/orgs/community/discussions/208082)
- **GitHub Community #198490 (June–Sept 2026), same family:**
  - Force pushes of `main` to every branch on every repo in an org, injecting `config.bat`, `temp_auto_push.bat` and `temp_interactive_push.bat`, with BeaverTail-style code in `eslint.config.mjs`.
  - A commenter named the campaign "PolinRider".
  - The first victim was a non-developer org member. Replies attribute it to compromised developer machines. — [GitHub Discussion #198490](https://github.com/orgs/community/discussions/198490)
- **Fake Dependabot commits (July 8–11, 2023):**
  - Stolen PATs, likely taken from developer machines after a malicious package install, were used to push commits whose committer looked like `dependabot[bot]`.
  - The commits added a workflow that exfiltrated secrets and changed .js files to skim form passwords. Hundreds of repos were hit, mostly Indonesian accounts.
  - PAT use did not show up in the account's audit log. — [The Hacker News](https://thehackernews.com/2023/09/github-repositories-hit-by-password.html); [SecurityWeek](https://www.securityweek.com/stolen-github-credentials-used-to-push-fake-dependabot-commits/)

### Inferences
- **Per-push signals common to these campaigns:**
  - A new or changed file under `.github/workflows/` that references `secrets.*` en masse or uses `toJSON(secrets)`, has `curl`/`wget` POSTs, `workflow_dispatch` plus `push` triggers, a `discussion` trigger feeding `run:`, or `runs-on: self-hosted`.
  - Commit author name or email claiming a bot (`dependabot[bot]`, `renovate[bot]`, `github-actions[bot]`) while the `pusher` is a human account.
  - `forced: true` on non-default refs.
  - Changed build-config files (eslint/vite/tailwind/postcss configs, `.gitignore`) carrying long obfuscated lines.
- **Fleet-level signals that appear only when correlated across repos:**
  - The same `head_commit.message` or same file hash pushed to N repos by one pusher within minutes (GhostAction).
  - One pusher producing `forced: true` on every branch of every repo (PolinRider / #208082).
  - New repos by a member with random names or `-migration` suffix, plus `repository.publicized` on existing private repos (Shai-Hulud).

### Gaps
- Primary StepSecurity details for the October 2026 GhostAction variant were not found.
- The Copilot Chat App token-minting claim in #208082 is unverified.
- I found no GitHub staff explanation.

## 4. Attack classes: vector, observable events and detection signals

### Takeaway
Most classes leave a repo-side trace in either (a) the diff of a workflow or config file in a `push`, or (b) a settings webhook (`branch_protection_rule`, `repository_ruleset`, `deploy_key`, `member`, `repository`, `meta`). Runtime-only classes (cache poisoning, OIDC theft, memory dumping, consumer-side tag repoint) are invisible to webhooks and need static workflow analysis plus correlation.

### Cited Findings
- **Pwn requests (`pull_request_target`):** runs in the base repo context with secrets and a write token, and bypasses PR approval gates. It is dangerous when it checks out or runs fork code. Hardcoded username allowlists are also unsafe. — [GitHub Security Lab](https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/)
  - Real cases: SpotBugs ([Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)), Ultralytics ([Snyk](https://snyk.io/de/blog/ultralytics-ai-pwn-request-supply-chain-attack/)), Nx ([Nx](https://nx.dev/blog/s1ngularity-postmortem)).
  - GitHub had published guidance on this more than four years before Nx. — [Datadog](https://securitylabs.datadoghq.com/articles/case-for-github-actions-security/)
- **`workflow_run` escalation and artifact poisoning:** a privileged `workflow_run` consumes artifacts or outputs from an unprivileged PR run. Repo-owner checks do not help. Treat artifacts as untrusted. — [GitHub Security Lab](https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/)
- **Script injection via untrusted input:**
  - `head.ref` (branch name) is attacker-controlled. — [GitHub Security Lab](https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/)
  - PR titles (Nx) and branch names (Ultralytics) were the real-world sinks. — [Nx](https://nx.dev/blog/s1ngularity-postmortem); [Snyk](https://snyk.io/de/blog/ultralytics-ai-pwn-request-supply-chain-attack/)
  - Discussion bodies were used by the Sha1-Hulud backdoor. — [Semgrep](https://app.semgrep.dev/blog/2025/digging-for-secrets-sha1-hulud-the-second-coming-of-the-npm-worm)
  - AI triage prompts were used in Clinejection. — [Adnan Khan](https://adnanthekhan.com/posts/clinejection/)
- **TOCTOU / IssueOps:** approving or labeling a PR and then pushing new commits. Mutable `head.ref` versus immutable `head.sha`. Actor, date and repo checks on `issue_comment` are ineffective. Label gates with a SHA are the mitigation. — [GitHub Security Lab](https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/)
- **Cache poisoning:** see section 2. — [Adnan Khan](https://adnanthekhan.com/2024/05/06/the-monsters-in-your-build-cache-github-actions-cache-poisoning/)
- **Self-hosted runner abuse and persistence:**
  - PyTorch (Stawinski and Khan, Jan 2024): a small merged fork PR made the attacker a "contributor" whose later PRs ran without approval on non-ephemeral self-hosted runners.
  - The researchers installed their own runner for persistence and read write-scoped GITHUB_TOKENs from `.git/config` (left there by actions/checkout).
  - Impact included malicious GitHub and AWS releases. The technique first hit actions/runner-images ($20k bounty), and was presented at DEF CON 32. — [SecurityWeek](https://www.securityweek.com/new-class-of-ci-cd-attacks-could-have-led-to-pytorch-supply-chain-compromise/); [DevClass](https://devclass.com/2024/01/15/spotlight-on-github-self-hosted-runners-again-as-researcher-demonstrates-attack-on-pytorch-code); [DEF CON 32 listing](https://infocondb.org/con/def-con/def-con-32/grand-theft-actions-abusing-self-hosted-github-runners-at-scale)
  - The Sha1-Hulud `SHA1HULUD` runner is section 3.
- **GITHUB_TOKEN over-permission:** Nx had legacy read/write defaults ([Nx](https://nx.dev/blog/s1ngularity-postmortem)). Coinbase agentkit ran write-all ([Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)).
- **Unpinned third-party actions and tag rewriting:** tj-actions, reviewdog, trivy-action and kics-github-action (section 1). Pinning to a full commit SHA is the consensus mitigation. — [Phoenix Security](https://phoenix.security/trivy-supply-chain-attack-team-pcp/)
- **Release-asset swap:** a backdoored Trivy v0.69.4 binary was published to GitHub Releases. — [Phoenix Security](https://phoenix.security/trivy-supply-chain-attack-team-pcp/)
- **Force-push history rewrite and evidence erasure:**
  - The reviewdog tag was restored about 2 hours later. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
  - The SpotBugs branch was pushed and deleted in 1 second. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
  - Attacker accounts were deleted afterward, possibly hiding their activity. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- **Commit author impersonation:**
  - Git author and committer fields are free text and can be spoofed.
  - The "Verified" badge only checks signatures that exist; unsigned commits are not flagged unless the impersonated user enables vigilant mode, which marks their unsigned commits "Unverified".
  - Avatars come from Gravatar via the email hash, and timestamps can be set to anything. — [GitHub changelog](https://github.blog/changelog/label/code/); [Checkmarx](https://checkmarx.com/blog/unverified-commits-are-you-unknowingly-trusting-attackers-code.md); [Ramimac Commit Autopsy](https://ramimac.me/commit-autopsy/)
  - Real cases: renovate and github-actions bot impersonation in tj-actions ([Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)) and fake Dependabot in 2023 ([The Hacker News](https://thehackernews.com/2023/09/github-repositories-hit-by-password.html)).
- **Visibility flips:** Shai-Hulud force-published private repos as public `-migration` copies. — [Wiz](https://www.wiz.io/blog/shai-hulud-npm-supply-chain-attack)
- **Collaborator and member additions:** SpotBugs added a disposable member with a leaked PAT, then pushed a workflow 2 minutes later. — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- **PAT/OAuth/App token leakage and abuse:**
  - A PAT pasted into a workflow (SpotBugs). — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
  - A leftover service-account token after incomplete rotation (Trivy). — [Phoenix Security](https://phoenix.security/trivy-supply-chain-attack-team-pcp/)
  - PATs stolen from developer machines (Dependabot 2023). — [SecurityWeek](https://www.securityweek.com/stolen-github-credentials-used-to-push-fake-dependabot-commits/)
  - GitHub App or OAuth token re-minting suspected in #208082. — [Discussion #208082](https://github.com/orgs/community/discussions/208082)
- **OIDC token theft and cloud pivot:** I found no incident write-up in this session. See Gaps.

### Inferences (class → webhook signal; S = visible per single event, C = needs correlation or state)
- **Pwn request / injection setup:** `push` diff of `.github/workflows/*` adding `pull_request_target`, `workflow_run` or `issue_comment`, plus `${{ github.event.(pull_request.title|head_ref|issue.title|comment.body|discussion.body) }}` inside `run:` (S, static analysis). Exploitation shows as a `pull_request` from a new fork with metacharacters in title or branch (C).
- **Malicious workflow push (GhostAction, Dependabot, Shai-Hulud):** `push` adding a workflow with secret enumeration and outbound HTTP (S). The same commit across many repos by one pusher (C).
- **Tag rewrite:** `push` with `refs/tags/*`, `forced: true`, both `before` and `after` non-zero (S). Silent when more than 3 tags are pushed at once, so it needs a periodic tag-to-SHA snapshot diff (C/state). `create` and `delete` also skip bursts of more than 3 tags.
- **Force-push rewrite / evidence erasure:** `push.forced: true` (S). Branch `create` followed by `delete` within seconds (C). A force push that removes a commit that just ran a workflow (C: `workflow_run` head_sha no longer reachable).
- **Branch protection and ruleset weakening:** `branch_protection_rule.deleted/edited`, `branch_protection_configuration.disabled`, `repository_ruleset.deleted/edited` (S).
- **CODEOWNERS edits:** `push` touching `CODEOWNERS`, `.github/CODEOWNERS` or `docs/CODEOWNERS` (S).
- **Deploy key added:** `deploy_key.created`, with `key.read_only: false` the high-risk case (S).
- **Repo webhook added:** no `hook` created event in the list I fetched. Only `meta` fires when a hook is deleted. Additions need the audit log (`hook.create`, `hook.config_changed`).
- **Visibility flip:** `repository.publicized` or `public` (S). New repo named `*-migration` or random-looking via `repository.created` at org scope (S/C).
- **Collaborator added:** `member.added` (repo), `organization.member_added`, `membership.added`, `team.added_to_repository` (S). The classic temporal chain: `member.added`, then a workflow push, then `branch_protection_rule.deleted` within hours (C).
- **GitHub App abuse:** `installation.created`, `new_permissions_accepted`, `installation_repositories.added` (app-only events, S). User-level OAuth grants are not delivered to repo or org webhooks.
- **Self-hosted runner persistence:** no runner webhook. Indirect signals are a workflow diff adding `runs-on: self-hosted` (S) and `workflow_job` payloads naming an unknown runner (for example `SHA1HULUD`, C). Registration itself needs the audit log (`org.register_self_hosted_runner`).
- **Release swap:** `release.edited/published` with asset changes and no matching tag push or workflow run (C). `package.published` (S).
- **Bot impersonation:** commit `author.name` or `email` claims `*[bot]` while `pusher.name` is not the bot (S). Unsigned commit where the history is signed (C, needs commit verification via the API).
- **Secret scanning:** `secret_scanning_alert.created/publicly_leaked` (S). Useful after a log dump in a public repo.
- **Security settings disabled:** `security_and_analysis` with `changes` (S).

### Gaps
- No primary-source incident found for OIDC theft or cloud pivot. GitHub OIDC tokens are minted at run time (needs `id-token: write`), and their theft is invisible to repo webhooks. Only the workflow diff granting `id-token: write`, or cloud-side CloudTrail-type logs, would show it. This is inference, not sourced.
- I did not find a write-up of Renovate impersonation as a standalone campaign beyond its use in tj-actions.

## 5. What a webhook-based monitor can and cannot see; how defenders compensate

### Takeaway
Webhooks cover pushes (with `forced`, `created`, `deleted`), branch protection and rulesets, deploy keys, members and teams (org scope), visibility changes, releases and packages, workflow runs and jobs, app installs, and webhook deletion (`meta`). Several events have hard gaps:
- bulk tag operations (more than 3 tags) produce no events;
- `team`, `membership` and `organization` events are not available on repo webhooks;
- installation events are app-only;
- there is no event for self-hosted runner registration, Actions secret creation, webhook creation, or (in the events I could confirm) org role or Actions policy changes. These live only in the audit log (and git events only in streaming or API exports, kept 7 days).

`sender` can be the `ghost` user, and PAT use may not appear in the user's audit log.

### Cited Findings
- **Event inventory and key fields** — [GitHub Docs, webhook events](https://docs.github.com/en/webhooks/webhook-events-and-payloads):
  - `push`: before, after, ref, created, deleted, forced, pusher, commits, head_commit
  - `create` / `delete`: ref, ref_type, pusher_type
  - `branch_protection_rule`: created, deleted, edited
  - `branch_protection_configuration`: enabled, disabled
  - `repository_ruleset`: created, deleted, edited
  - `deploy_key`: created, deleted
  - `member`: added, edited, removed
  - `membership`: added, removed
  - `team`: added_to_repository, created, deleted, edited, removed_from_repository
  - `organization`: member_added, member_invited, member_removed, renamed, deleted
  - `repository`: archived, created, deleted, edited, privatized, publicized, renamed, transferred, unarchived
  - `public`
  - `workflow_run`: requested, in_progress, completed
  - `workflow_job`: queued, waiting, in_progress, completed
  - `release`: created, deleted, edited, prereleased, published, released, unpublished
  - `package`: published, updated
  - `installation`: created, deleted, new_permissions_accepted, suspend, unsuspend
  - `installation_repositories`: added, removed
  - `personal_access_token_request`: approved, cancelled, created, denied
  - `security_and_analysis`: changes
  - `meta`: fires on webhook deletion
  - `secret_scanning_alert`: includes publicly_leaked and validated
  - `custom_property_values`
- **Scope limits:** `team`, `membership` and `organization` are org, business or app only, not repo webhooks (`team_add` is the exception). `workflow_dispatch`, `github_app_authorization`, `installation` and `installation_repositories` are app-only. `personal_access_token_request` is org or app only. — [GitHub Docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- **Delivery caveats:** — [GitHub Docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
  - Payloads over 25 MB are not delivered.
  - No `push` events when more than 5,000 branches are pushed at once. No tag events when more than 3 tags are pushed at once. No `create`/`delete` when more than 3 tags are created or deleted at once.
  - `sender` may be `ghost`.
- **No self-hosted runner webhook event** on the events reference page. — [GitHub Docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- **Audit-log-only actions confirmed** — [GitHub Docs, org audit log events](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/audit-log-events-for-your-organization):
  - `org.register_self_hosted_runner`, `org.remove_self_hosted_runner`
  - `org.create_actions_secret`, `org.remove_actions_secret`, `environment.create/update/remove_actions_secret`
  - `environment.add/update/remove_protection_rule`
  - `hook.create`, `hook.config_changed`, `hook.events_changed`, `hook.active_changed`, `hook.destroy`
  - `oauth_application.*`, `org.oauth_app_access_*`, `integration.*`, `integration_installation.*`
  - `git.clone`, `git.fetch`, `git.push`: not in the web UI; on Enterprise Cloud available only via REST API, streaming or export, with 7-day retention.
- **Audit log gaps in practice:**
  - Tag pushes were not in the audit log on free plans (reviewdog). — [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
  - Stolen-PAT activity did not show in the victim account's audit log (Dependabot 2023). — [SecurityWeek](https://www.securityweek.com/stolen-github-credentials-used-to-push-fake-dependabot-commits/)
  - Create-repo audit entries omit descriptions (Sha1-Hulud hunting). — [Sumo Logic](https://www.sumologic.com/?p=62047)
- **Enterprise audit-log streaming** delivers audit and Git events at least once (duplicates possible), from the time streaming is enabled. — [GitHub Docs, streaming](https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/streaming-the-audit-log-for-your-enterprise)

### Inferences
- **Compensations for a webhook-only monitor:**
  1. Subscribe at org or app level, not repo level, to get `member`, `organization`, `membership`, `team`, `repository` and `installation*`.
  2. Snapshot and diff state on a schedule, and when the triggering event arrives: tag-to-SHA maps (catches bulk repoints that emit nothing), branch protection and rulesets, deploy keys, webhooks (`GET /repos/{r}/hooks`), self-hosted runners (`GET /orgs/{o}/actions/runners` to catch unknown names like `SHA1HULUD`), Actions permissions and default workflow permissions, and collaborators and org roles.
  3. Pull the org audit log via REST or streaming where the plan allows it, for runner registration, secret creation, `hook.create`, org role changes and OAuth/App grants.
  4. Statically analyze every workflow-file diff in `push`.
  5. Correlate by pusher across repos and within time windows.
- **High-value temporal combinations (C):**
  - `member.added` or `installation.created`, then a workflow push by that identity, then `branch_protection_rule.deleted`, `repository_ruleset.edited` or `deploy_key.created`, within hours.
  - One pusher, many repos, an identical new workflow file within minutes (GhostAction).
  - One pusher, every branch, `forced: true` (PolinRider / #208082).
  - Branch `create`, then a workflow run, then branch `delete` within seconds (SpotBugs).
  - `repository.created` (random or `-migration` name), then `repository.publicized` by the same member (Shai-Hulud).
  - Tag `forced: true`, then a tag forced back to its prior SHA within hours (reviewdog restore).
  - `meta` (hook deleted) right after other settings changes (anti-forensics).
- **Per-event signals (S) worth alerting on alone:**
  - `forced: true` on any `refs/tags/*` or on the default branch.
  - `branch_protection_configuration.disabled`.
  - `repository.publicized`.
  - `deploy_key.created` with write access.
  - A workflow diff with `toJSON(secrets)`, `runs-on: self-hosted` on a public repo, or `pull_request_target` combined with checkout of the PR head.
  - Commit claims a `*[bot]` author while the pusher is human.
  - `CODEOWNERS` changed.

### Gaps
- My fetch of the org audit-log reference was truncated, so I could not confirm exact names for org role changes (`org.update_member`), Actions policy changes, repo-level runner or secret events, `protected_branch.policy_override` or repo visibility audit actions. Verify these against the full page.
- I could not confirm from GitHub docs whether a webhook exists for org custom-role assignment or Actions settings changes. None appeared in the events list I fetched, which suggests none exists, but I have no explicit statement.
- No CISA advisory beyond CVE-2025-30066 was reviewed. I did not fetch Legit Security, Synacktiv or GitHub's "Keeping your GitHub Actions secure" part 1–3 pages in this session. The Security Lab "new patterns" page was used instead.
