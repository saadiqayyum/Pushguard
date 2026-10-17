# Reviewer budget exhaustion

**Type:** AI-era attack · **When:** possible future · **Status:** possible future

Possible future attack. It has not been seen yet.

## What could happen
An AI reviewer can only read so many tokens or bytes. An attacker puts the payload past that limit, in a huge file, a long diff, or one file among hundreds. The reviewer stops reading early and reports that the change looks fine.

Precursor evidence: Cloudflare research (May 2026, secondary coverage only) found that steering LLMs to a "benign" verdict depended on file size and on how much deceptive text there was compared to code.

## How it got in
1. The attacker opens a PR with a big mechanical change (renames, formatting, vendored code).
2. A small risky hunk sits in the middle or at the end.
3. The reviewer runs out of budget before reaching it.

## Why it was hard to spot
- Large PRs are common and dull to review.
- A reviewer that hit its limit may not say so.

## Signs to look for
- In one change: diff size near or above the reviewer's cap.
- Across changes over time: a small risky hunk hidden among large mechanical changes.

## Defanged example
```
PR "Apply formatter": 412 files changed, +38,000 -37,950
  ...
  src/net/client.ts  +3  <request sent to <attacker-domain>>
```

## How Pushguard catches it
- Built: truncation is a finding, never a clean result. Pushguard files `diff-not-fully-read` and `file-not-fully-read` when it could not read everything.
- Built: deterministic diff rules run on the change before any model, and the model can only add or escalate.
- Not built: feeding the riskiest hunks into the model budget first.

## References
- [IT Brief on Cloudflare research](https://itbrief.com.au/story/cloudflare-warns-of-ai-code-review-prompt-injection) (secondary, primary unverified)
