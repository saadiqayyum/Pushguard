# Pwn requests and script injection

**Type:** CI/CD & GitHub platform · **When:** ongoing; real cases 2024 to 2026 · **Status:** confirmed (attack class)

## What happened

A `pull_request_target` workflow runs with the base repo's secrets and a write token, even for a PR from a stranger's fork. It also skips PR approval gates. A "pwn request" is what happens when such a workflow checks out or runs the fork's code. Script injection is the related bug: attacker-controlled text such as a PR title, branch name, or issue or discussion body is pasted into a `run:` shell step with `${{ ... }}`, and the shell runs it as a command.

Real cases: SpotBugs ([tj-actions chain](tag-repointing-tj-actions.md)), [Ultralytics](ultralytics.md) (branch name), [Nx s1ngularity](../packages/nx-s1ngularity.md) (PR title), the [Sha1-Hulud 2.0](../packages/shai-hulud-2.md) `discussion.yaml` backdoor (discussion body), and AI triage prompts in [Clinejection](clinejection.md). GitHub had published guidance on this more than four years before Nx.

## How it got in

1. A repo has a workflow on `pull_request_target`, `issue_comment`, `discussion` or `workflow_run`.
2. The workflow puts untrusted text into a shell command, or runs fork code.
3. An attacker opens a PR (or issue, or discussion) with a crafted title, branch name or body.
4. The command runs with the repo's secrets and token.
5. In the Nx case, the bad workflow had already been reverted on main. A fork PR aimed at an old branch that still had it triggered it anyway. The repo also still had the old read/write default `GITHUB_TOKEN`. GitHub changed that default for new repos in Feb 2023 but did not update old ones.

## Why it was hard to spot

- The workflow looks like a normal helper, such as a title check or a labeler.
- The attack arrives as a PR or issue, so there is no push to inspect.
- Hardcoded username allowlists give a false sense of safety.

## Signs to look for

- In one change: look for a workflow diff adding `pull_request_target`, `workflow_run` or `issue_comment`, plus `${{ github.event.pull_request.title }}`, `head_ref`, `issue.title`, `comment.body` or `discussion.body` inside `run:`. Checkout of the PR head in a privileged job.
- Across changes over time: watch for a PR from a new fork with shell characters (`$(`, backticks, `;`) in the title or branch name. A risky workflow still alive on old branches after it was removed from main.

## Defanged example

```yaml
on: pull_request_target
jobs:
  check:
    steps:
      - run: echo "Title: ${{ github.event.pull_request.title }}"   # title runs as shell
```
```
PR title:  fix typo $(<fetch-and-run> <attacker-domain>)
```

## How Pushguard catches it

- **Diff rules:** `ci-pull-request-target` and `ci-workflow-changed` flag the workflow when it is pushed. `ci-permissions-widened` flags broader token permissions.
- **Not built:** checks on PR titles and branch names for shell characters (an AI rule could do it). Workflows on non-default branches run through `workflow_run` are not seen (a known gap), which matters for the Nx old-branch case.

## References

- [GitHub Security Lab, new patterns](https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/)
- [Nx postmortem](https://nx.dev/blog/s1ngularity-postmortem)
- [Snyk (Ultralytics)](https://snyk.io/de/blog/ultralytics-ai-pwn-request-supply-chain-attack/)
- [Unit 42 (SpotBugs)](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- [Semgrep (Sha1-Hulud discussion backdoor)](https://app.semgrep.dev/blog/2025/digging-for-secrets-sha1-hulud-the-second-coming-of-the-npm-worm)
- [Datadog](https://securitylabs.datadoghq.com/articles/case-for-github-actions-security/)
- See also: [Autonomous CI attack bots](../ai/autonomous-ci-attack-bots-2026.md), [PromptPwnd](../ai/promptpwnd.md)
