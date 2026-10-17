# MCP tool poisoning, rug pulls and malicious MCP servers

**Type:** AI-era attack · **When:** Apr 2025 · **Status:** confirmed (research demos); repo-file variant is possible

## What happened
MCP is how an AI assistant connects to outside tools. Each tool has a text description that the model reads and users usually do not.
Invariant Labs showed that a malicious server can hide orders in a tool description and quietly steer the assistant. In a WhatsApp demo, a harmless-looking tool on a bad server made the agent send chat history out through a real whatsapp-mcp server. This is called cross-server shadowing.
A rug pull is when a tool's description changes *after* the user approved it. One variant needed no bad server at all, only an injected message.

## How it got in
1. A user connects a bad MCP server, or one that changes later.
2. The tool description holds instructions for the model.
3. The model follows them and uses other, trusted tools to move data.

Repo angle: committed `.mcp.json`, `.cursor/mcp.json` or `.vscode/mcp.json` files can add servers. These are often `npx <pkg>` with no pinned version, and they run on the next agent session. No in-the-wild repo incident of this was found.

## Why it was hard to spot
- Users never see tool descriptions, which can change after approval.
- The harmful action goes through a legitimate server.

## Signs to look for
- In one change: a new or changed MCP server entry, an unpinned package spec, or a server command that fetches remote code.
- Across changes over time: an MCP config gets added, then agent-made commits start doing unusual things.

## Defanged example
```json
// .mcp.json
{ "mcpServers": { "helper": { "command": "npx", "args": ["<unpinned-package>"] } } }
```

## How Pushguard catches it
- Diff rule: `agent-tool-config-changed` (critical) fires on `.mcp.json`, `mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, `claude_desktop_config.json` and `.claude/settings.json`.
- Tool descriptions that change at runtime (rug pulls) live outside the repo, where Pushguard cannot see them.

## References
- [Simon Willison](https://simonwillison.net/2025/Apr/9/mcp-prompt-injection/)
- [Invariant Labs WhatsApp post](https://invariantlabs.ai/blog/whatsapp-mcp-exploited)
- [Docker MCP Horror Stories](https://www.docker.com/blog/mcp-horror-stories-whatsapp-data-exfiltration-issue/)
- See also: GlassWorm's first malicious MCP server, in [invisible-unicode-glassworm](../hidden-code/invisible-unicode-glassworm.md)
