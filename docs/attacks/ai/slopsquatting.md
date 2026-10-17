# Slopsquatting (hallucinated package names)

**Type:** AI-era attack · **When:** 2024 to 2026 · **Status:** reported (proof of concept; no confirmed malware campaign as of late 2025)

## What happened
AI coding tools sometimes suggest packages that do not exist. An attacker can register the made-up name and wait for people to install it.
Spracklen et al. (USENIX Security 2025) tested 16 models. 19.7% of the suggested packages did not exist, and the study found 205,474 unique fake names. Open-source models made up names about 21.7% of the time and commercial models about 5.2% (GPT-4 Turbo lowest, about 3.59%). Sources disagree on the sample size: 576,000 vs 2.23M code samples. A 43% figure, for hallucinated names that repeat on all 10 reruns, is reported but has not been checked against the paper.
Bar Lanyado registered the hallucinated name `huggingface-cli` on PyPI as an empty package. It got 30,000+ downloads in three months and ended up in the README of an Alibaba project.
Seth Larson (PSF) coined the term in April 2025. A 2026 preprint (not peer-reviewed) measured 4.6 to 6.1% on newer models. Whether any 2026 campaign has been confirmed is unverified.

## How it got in
1. An AI tool suggests `import <made-up-package>`.
2. The attacker registers that name on npm or PyPI.
3. A developer or agent installs it without checking.

## Why it was hard to spot
- The name sounds right, and the AI suggested it with confidence.
- The package is brand new, so no scanner has flagged it yet.
- It overlaps with [typosquatting](../packages/typosquatting.md) and dependency confusion.

## Signs to look for
- In one change: a new dependency that is young, has few downloads, has no repo link, or has a name close to a popular one.
- Across changes over time: the same odd name turns up in several repos after AI-assisted edits.

## Defanged example
```
package.json
+  "<plausible-but-new-package>": "^1.0.0"
```

## How Pushguard catches it
- Dependency checks: `dependency-just-published` (npm, under 72 hours), `dependency-install-script` and `dependency-known-malicious` (OSV).
- Not built: name-similarity, hallucinated-name or download-count checks. An empty placeholder package with no install script passes today.

## References
- [Endor Labs summary](https://www.endorlabs.com/learn/hallucinated-packages-how-ai-invents-dependencies-attackers-exploit) (search-summary)
- [arXiv 2406.10279](https://arxiv.org/abs/2406.10279) (training)
- [agentpatterns.ai](https://agentpatterns.ai/security/slopsquatting-hallucinated-package-names/) (search-summary)
- [arXiv 2605.17062](https://arxiv.org/pdf/2605.17062) (search-summary, not peer-reviewed)
- [CSA note](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/) (secondary)
- [Xygeni](https://xygeni.io/blog/slopsquatting-attack-prevention/) (secondary)
- [nesbitt.io](https://nesbitt.io/2025/12/10/slopsquatting-meets-dependency-confusion)
