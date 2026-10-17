# PromptPwnd (AI agents in CI)

**Type:** AI-era attack · **When:** Dec 2025 · **Status:** reported

## What happened
Aikido found CI workflows that pasted untrusted issue titles and PR bodies into prompts for AI agents. The agents ran in GitHub Actions or GitLab CI and held powerful tokens.
The agents named were Gemini CLI, Claude Code Actions, OpenAI Codex and GitHub AI Inference. Injected text could make an agent leak secrets or edit the repo. Google patched Gemini CLI.
The claim that 5+ Fortune 500 companies were affected has not been independently confirmed.

## How it got in
1. A workflow runs an AI step on issues or PRs.
2. The prompt includes `github.event.issue.title`, the issue body or the PR body.
3. The step holds `contents: write` or secrets, or runs on `pull_request_target`.
4. An attacker opens an issue with instructions in the title or body.
5. The agent obeys and uses its token.

## Why it was hard to spot
- The workflow file looks like a normal AI helper, and the attack text arrives in an issue.
- It is the old [script injection](../ci-cd/pwn-request-and-script-injection.md) problem with a model in place of the shell.

## Signs to look for
- In one change: workflow YAML passes issue or PR text into an AI step that has write permissions, secrets or `pull_request_target`.
- Across changes over time: issue text, followed by an agent action that edits files or posts data.

## Defanged example
```yaml
on: issues
permissions: { contents: write }
steps:
  - uses: <ai-agent-action>
    with:
      prompt: "Triage this: ${{ github.event.issue.title }}"
```

## How Pushguard catches it
- Diff rules: `ci-workflow-changed`, `ci-pull-request-target` and `ci-permissions-widened` fire when the risky workflow is added or changed. That catches the setup. The attack itself comes later, through issue text.
- The exfil step (issue text, then agent action) is not watched today.
- Pushguard's own AI never holds a write token and never takes text from issues as instructions.

## References
- [eSecurity Planet](https://www.esecurityplanet.com/threats/ai-agents-create-critical-supply-chain-risk-in-github-actions/) (secondary)
- [CSO Online](https://csoonline.com/article/4101751/ai-in-ci-cd-pipelines-can-be-tricked-into-behaving-badly-2.html) (secondary)
- Note: the Aikido primary post was not opened.
