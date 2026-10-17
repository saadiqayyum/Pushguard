# Trojan Source and homoglyphs (CVE-2021-42574, CVE-2021-42694)

**Type:** Hidden code · **When:** Nov 2021 (published) · **Status:** confirmed (research technique)

## What happened

Cambridge researchers (Boucher and Anderson) showed that special Unicode characters can make code look different on screen than how the compiler reads it. "Compilers and interpreters adhere to the logical ordering of source code, not the visual order." A second trick uses homoglyphs: letters from other alphabets that look the same as normal letters.

## How it got in

1. The attacker puts bidi control characters (they flip text direction) inside a comment or string.
2. The editor shows the code in a different order than the compiler runs it.
3. Three shapes: a `return` that looks like it is inside a comment ("early return"); a comment that looks like live code ("commenting-out"); a string that looks like code ("stretched string").
4. Homoglyph variant: a function name using a look-alike letter, so two functions look identical but are different.

## Why it was hard to spot

- The reviewer sees safe code while the compiler runs something else.
- Homoglyph names look exactly like the real ones.

## Signs to look for

- In one change: bidi characters U+202A-202E or U+2066-2069, especially unbalanced in a line, comment or string; identifiers mixing scripts (for example Latin and Cyrillic) or matching Unicode TR39 confusables.
- Across changes over time: a look-alike function added in one place (or an upstream package) and called from code elsewhere.

## Defanged example

```
/* check user <RLO> } if (isAdmin) <LRI> */  return;
displayed as:  /* check user */ if (isAdmin) return;
compiled as:   a comment, then an early return
```

## How Pushguard catches it

- Diff rules: `trojan-source` flags bidi controls in added lines; `homoglyph-identifier` flags look-alike letters (the `unicode_risk` check). This is a strong single-diff catch.
- GitHub also shows a banner for bidi text (since 2021-10-31) and GCC has `-Wbidi-chars`.

## References

- [trojansource.codes](https://trojansource.codes/)
- [GitHub changelog 2021-10-31](https://github.blog/changelog/2021-10-31-warning-about-bidirectional-unicode-text/)
- [GitHub changelog 2025-05-01, hidden Unicode warning](https://github.blog/changelog/2025-05-01-github-now-provides-a-warning-about-hidden-unicode-text)
- [GCC patch discussion](https://patchwork.sourceware.org/project/gcc/patch/YZROxBnxZQCTYdzl@redhat.com/)
- [Atlassian KB](https://support.atlassian.com/atlassian-knowledge-base/kb/bidirectional-characters-warning-in-atlassian-products/)
- [VisualSVN](https://visualsvn.com/support/topic/00200)
- [Unicode TR39](https://www.unicode.org/reports/tr39/)
- [watchstack CVE entry](https://watchstack.io/intel/cve/CVE-2021-42574) (secondary)

Not verified in the notes: Rust, Go and other language-level responses.
