# Code-index poisoning

**Type:** AI-era attack · **When:** possible future · **Status:** possible future

Possible future attack. It has not been seen yet.

## What could happen
Some AI reviewers search the codebase for context (retrieval, embeddings).
An attacker adds decoy "canonical" helpers or docs, such as a note saying "this function is the safe wrapper". The reviewer finds the decoy, trusts it and never looks at the real code.
No public incident is known. This is an extrapolation.

## How it got in
1. The attacker adds many low-value files that copy the names of real safe helpers.
2. The reviewer's search returns the decoys first.
3. The reviewer believes the dangerous call is safely wrapped.

## Why it was hard to spot
- Each new file looks harmless.
- The reviewer's answer is wrong and still sounds confident.

## Signs to look for
- In one change: new files whose names duplicate existing safe helpers.
- Across changes over time: search results dominated by recently added, low-trust files.

## Defanged example
```
+ src/utils/sanitize.ts      // "canonical safe wrapper" (does nothing)
  src/lib/sanitize.ts        // the real one
+ docs/SECURITY_NOTES.md     "all input goes through utils/sanitize"
```

## How Pushguard catches it
- Pushguard's code index holds paths and identifiers only, never source. It is built from the repo and kept current by push jobs.
- The AI investigator follows real references with `find_references`. It does not use similarity search.
- If the index is incomplete, Pushguard files `repo-index-incomplete` and does not guess.
- Not built: weighting the index by file age or trust, or alerting on duplicate helper names.

## References
- Scenario F6 in the AI-era notes; no external citation.
