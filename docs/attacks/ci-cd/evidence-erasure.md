# Evidence erasure: push-and-delete, tag restore, deleted accounts

**Type:** CI/CD & GitHub platform · **When:** seen 2025 · **Status:** confirmed (attack class)

## What happened

Attackers cleaned up after each step. In the [tj-actions chain](tag-repointing-tj-actions.md):

- A SpotBugs branch carrying a secret-stealing workflow was pushed and deleted within one second.
- The reviewdog `v1` tag was moved to bad code, then force-pushed back to the clean commit about 2 hours later.
- Throwaway accounts were made for one step each, then deleted.
- The bad reviewdog commit came from a fork. Commits from deleted forks stay reachable through the fork network ("dangling" or "impostor" commits).

## How it got in

1. The attacker pushes a branch or moves a tag. A workflow runs with it.
2. As soon as the run starts, they delete the branch or move the tag back.
3. They delete the accounts they used.
4. The only trace left is a workflow run whose commit is no longer on any branch.

## Why it was hard to spot

- Anyone checking later sees a normal branch and tag.
- On free plans, tag pushes were not in the audit log.
- Deleted accounts may hide what they did.

## Signs to look for

- In one change: watch for `forced: true` on a branch or tag. A branch `create` followed by `delete` within seconds.
- Across changes over time: look for a tag forced to a new commit, then forced back to its old commit hours later. A force push that removes a commit which just ran a workflow.

## Defanged example

```
10:52:22  create  refs/heads/<random>   (workflow file added)
10:52:23  delete  refs/heads/<random>
18:42:09  push    refs/tags/v1  forced  <clean> -> <fork-commit>
20:31:49  push    refs/tags/v1  forced  <fork-commit> -> <clean>
```

## How Pushguard catches it

- **History/forensics:** Pushguard records events as they arrive, so a later clean-up does not erase the alert. `tag-moved` fires on each tag move (but GitHub sends nothing when more than 3 tags are pushed at once). Force-push forensics compares the orphaned tip with the new tip and reports what was removed from history.
- **Diff rules:** `branch-deleted`, `force-push`, and the `branch_created` / `branch_deleted` conditions.
- **Out-of-band:** if the attacker closes, deletes or unlabels Pushguard's alert issue, a meta-alert goes to Slack/Discord, where the actor cannot close it.
- **Not built:** a check that a workflow run's commit is still reachable. Workflows on non-default branches run through `workflow_run` are not seen.

## References

- [Unit 42](https://unit42.paloaltonetworks.com/github-actions-supply-chain-attack/)
- [GitHub Docs, webhook events](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
