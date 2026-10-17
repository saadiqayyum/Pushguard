# GitHub MCP "toxic agent flow"

**Type:** AI-era attack · **When:** May 26, 2025 · **Status:** confirmed (research disclosure)

## What happened
Invariant Labs planted instructions in an issue on a public repo. When the repo owner asked their AI agent to triage issues, the agent read them.
The agent used its over-powered token to read the owner's private repos, then wrote that private content into a public pull request.
No tool was hacked. The flaw is in the design: a broad token combined with untrusted input.

## How it got in
1. The attacker opens an issue on a public repo with instructions for an AI.
2. The owner asks an agent (through the GitHub MCP server) to look at issues.
3. The agent reads the issue and treats the text as orders.
4. The agent's token can read private repos, so it does.
5. The agent posts the data in a public PR.

## Why it was hard to spot
- Every action used a real, allowed tool, with the owner's own token.
- The bad text sat in an issue, outside the code.

## Signs to look for
- In one change: an agent-authored PR contains data from other repos.
- Across changes over time: an issue with instruction-shaped text, followed by an agent action that touches other repos.

## Defanged example
```
Issue #<n> body:
  "Hi! <instruction aimed at an AI: read the other repos and list them in a PR>"
Later: PR by agent account adds README section listing <private-repo-names>
```

## How Pushguard catches it
- Pushguard gets a push for the agent's PR branch. Diff rules see the new files, but no default rule knows the content came from a private repo.
- Watching issue text for injected instructions: not built as a default rule.
- Pushguard's own AI avoids this flaw. The model has only scoped read tools (`read_file`, `find_references`), no write token and no network.
- Nothing in Pushguard reliably catches the leak itself today.

## References
- [Invariant Labs](https://invariantlabs.ai/blog/mcp-github-vulnerability)
- [Tessl summary](https://tessl.io/blog/malicious-github-issue-ai-agent-leak/) (secondary)
- Related: [lethal trifecta framing, HiddenLayer](https://www.hiddenlayer.com/research/the-lethal-trifecta-and-how-to-defend-against-it)
