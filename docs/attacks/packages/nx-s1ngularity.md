# Nx "s1ngularity"

**Type:** Package & maintainer takeover · **When:** 26 Aug 2025 · **Status:** confirmed

## What happened
A flaw in a GitHub Actions workflow leaked Nx's npm publish token. Bad Nx versions (20.9.0 to 20.12.0 and 21.5.0 to 21.8.0) were live for about 5 h 20 min. Their postinstall used the victim's own AI coding tools to hunt for secrets. Stolen data went into public repos in victims' own accounts. Later, stolen tokens were used to make private repos public (480 more accounts and 6,700 repos per Wiz).

## How it got in
1. A PR-title check workflow ran on `pull_request_target` and echoed the PR title into a shell (script injection).
2. The workflow was added on 2025-08-21 and then reverted. An old branch still had it, and a fork PR aimed at that branch triggered it.
3. The injected code got a publish workflow to send the npm token to webhook[.]site.
4. The repo still had the old read/write default `GITHUB_TOKEN`. GitHub changed the default for new repos in Feb 2023, not old ones.
5. The bad versions' postinstall (`telemetry.js`) stole wallets, tokens and SSH keys.
6. It ran local Claude Code, Gemini CLI and Amazon Q with permission-skipping flags to find more files.
7. Results went to public `s1ngularity-repository` repos.

## Why it was hard to spot
- The vulnerable workflow had been reverted on main, but lived on in an old branch.
- AI CLIs reading files looks like normal developer use.
- Nx noticed because the bad versions had no npm provenance.

## Signs to look for
- In one change: a workflow on `pull_request_target` that puts `github.event.pull_request.title` into `run:`; postinstall code that starts `claude`, `gemini` or `q` with skip-permission flags.
- Across changes over time: a fork PR to a stale branch; versions without provenance after versions with it; private repos made public.

## Defanged example
```
.github/workflows/<pr-title-check>.yml:
  on: pull_request_target
  run: echo "${{ github.event.pull_request.title }}"
PR title: <text that closes the quote and runs a command>
telemetry.js: spawn("<ai-cli>", ["<skip-permissions-flag>", "<find secrets>"])
```

## How Pushguard catches it
- **Diff rules:** `ci-pull-request-target`, `ci-workflow-changed`, `ci-permissions-widened`, `js-install-hook-added`.
- **Settings events:** a repo made public files a critical alert.
- **AI investigator:** can read postinstall code calling AI CLIs and escalate.
- A missing-provenance check and the registry publish are not built.
- See [pwn requests and script injection](../ci-cd/pwn-request-and-script-injection.md).

## References
- [Nx postmortem](https://nx.dev/blog/s1ngularity-postmortem)
- [BleepingComputer (search-summary)](https://bleepingcomputer.com/news/security/ai-powered-malware-hit-2-180-github-accounts-in-s1ngularity-attack)
- [StepSecurity (search-summary)](https://www.stepsecurity.io/blog/supply-chain-security-alert-popular-nx-build-system-package-compromised-with-data-stealing-malware)
- [Wiz](https://www.wiz.io/blog/s1ngularity-supply-chain-attack); [Wiz aftermath](https://wiz.io/blog/s1ngularitys-aftermath)
