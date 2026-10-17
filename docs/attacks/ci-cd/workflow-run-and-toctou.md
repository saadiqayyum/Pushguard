# workflow_run artifact poisoning and IssueOps TOCTOU

**Type:** CI/CD & GitHub platform · **When:** ongoing · **Status:** confirmed (attack class; no named incident in the notes)

## What happened

GitHub Security Lab's guidance describes two related tricks.

- **Artifact poisoning:** a privileged `workflow_run` workflow uses files (artifacts) or outputs made by an unprivileged PR run. The attacker controls the PR run and therefore those files. Checking who owns the repo does not help.
- **TOCTOU** ("time of check, time of use"): a maintainer approves or labels a PR, which starts the workflow. The attacker pushes new commits after the approval, and the workflow runs the new code. `head.ref` (branch name) can change; `head.sha` (exact commit) cannot.

## How it got in

1. A repo uses a two-step flow: an unprivileged PR job, then a privileged `workflow_run` job. Or a comment/label gate ("IssueOps").
2. Artifact case: the attacker's PR job writes a poisoned artifact. The privileged job downloads it and trusts it.
3. TOCTOU case: a maintainer labels or comments to approve. The attacker quickly pushes a new commit. The privileged job checks out the branch by name and gets the new commit.
4. Actor, date and repo checks on `issue_comment` do not stop this.

## Why it was hard to spot

- Each workflow looks safe on its own. The risk sits in the handoff between them.
- The approval is genuine, but it was given for an earlier commit.

## Signs to look for

- In one change: look for a `workflow_run` workflow that downloads artifacts and uses them in shell steps or with secrets. A label or comment gate that checks out by branch name, not by SHA.
- Across changes over time: watch for a PR approved or labeled, then new commits pushed to it minutes later, then a privileged run.

## Defanged example

```
pr-build.yml   on: pull_request         uploads artifact "result"
deploy.yml     on: workflow_run         downloads "result", runs ./<file-from-artifact>
timeline:      label "ok-to-test" at 10:00 -> push <new-sha> at 10:01 -> privileged run at 10:02
```

## How Pushguard catches it

- **Diff rules:** `ci-workflow-changed` flags the workflow files when they change. An AI rule could check for artifacts flowing into privileged steps.
- **Not built:** correlation of approval time against later pushes. Workflows on non-default branches run through `workflow_run` are not seen (a known gap).

## References

- [GitHub Security Lab, new patterns](https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/)
- See also: [Pwn requests and script injection](pwn-request-and-script-injection.md)
