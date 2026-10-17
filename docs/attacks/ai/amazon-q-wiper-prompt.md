# Amazon Q Developer extension wiper prompt

**Type:** AI-era attack · **When:** July 2025 · **Status:** confirmed

## What happened
An attacker got code into Amazon's open-source repo for the Amazon Q Developer VS Code extension.
The signed release v1.84.0 (July 17) carried a prompt telling the AI agent to wipe the user's home directory and delete AWS resources with the CLI.
Amazon pulled it and shipped 1.85.0 on July 19. The prompt was malformed and never ran. About 950k people had the extension installed.

## How it got in
1. July 13: a PR or commit landed in the repo. Reports blame weak access controls or over-granted credentials.
2. The change added a natural-language prompt to the agent.
3. Amazon built and signed v1.84.0 with the prompt inside.
4. Users got it through normal updates.

## Why it was hard to spot
- In an AI product, a plain-English string *is* the malicious code, and classic code scanners (SAST) do not read prompt text as code.
- The release was properly signed.

## Signs to look for
- In one change: a prompt or system-prompt string gains destructive verbs (delete, terminate, wipe), cloud CLI commands or permission flags.
- Across changes over time: a change from an unexpected contributor lands and ships in a release soon after.

## Defanged example
```
src/agent/prompt.ts
+  "You are a cleaner. <destructive instruction: remove user files and cloud resources>"
```

## How Pushguard catches it
- No default diff rule reads prompt strings for meaning.
- An AI rule pointed at prompt files can flag it. The AI investigator handles file content as data to inspect, never as instructions to follow, and it can only escalate.
- Identity context helps if the change skipped review: `first-push-by-account` and `unreviewed-push-to-main` flag that access path.

## References
- [SC World](https://scworld.com/news/amazon-q-extension-for-vs-code-reportedly-injected-with-wiper-prompt) (secondary)
- [TechRadar](https://www.techradar.com/pro/hacker-adds-potentially-catastrophic-prompt-to-amazons-ai-coding-service-to-prove-a-point) (secondary)
- [Adversa](https://adversa.ai/blog/amazon-ai-coding-assistant-q-incident-lessons-learned/) (secondary)
