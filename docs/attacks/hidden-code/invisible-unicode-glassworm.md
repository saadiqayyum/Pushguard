# GlassWorm (invisible Unicode malware)

**Type:** Hidden code · **When:** Oct 2025 to Mar 2026 · **Status:** confirmed (Mar 2026 details partly from secondary sources)

## What happened

GlassWorm hid malware inside invisible characters. It started in VS Code extensions on Open VSX, then spread into GitHub repos, npm and MCP servers. It steals crypto wallets and GitHub, npm and Open VSX tokens.

Waves:
- Oct 2025 (Koi Security): malicious Open VSX extensions, reported 35,000+ downloads (possibly inflated).
- 31 Oct 2025 (Aikido): already in GitHub, hidden in AI-generated-looking commits.
- 6 Nov 2025: 3 more extensions (about 10,000 downloads), bypassing Open VSX's new defenses.
- Mar 2026: at least 151 GitHub repos (Mar 3-9) and 433 components across GitHub, npm, VS Code Marketplace and Open VSX. Koi reported the first malicious MCP server using invisible Unicode. The same Solana address links the waves.

## How it got in

1. Payload bytes are hidden as variation selectors (U+FE00-FE0F and U+E0100-E01EF), one invisible character per byte. One string was 6,492 characters long and invisible.
2. A small decoder turns it into Base64, then JavaScript, then runs it with `eval()`.
3. Next stages are found through a Solana wallet memo (checked about every 10 seconds), with a Google Calendar event title as backup.
4. Later stages add more C2 channels, a proxy and remote desktop. It runs only about every two days.
5. In GitHub, a stolen token pushes a commit that looks like a version bump or cleanup.

## Why it was hard to spot

- Editors render the payload as empty space.
- Its native decoder files sat on VirusTotal with zero detections from 2025-03-23 to 2025-10-22.
- C2 uses reputable services (Solana, Google Calendar), so domain checks see nothing bad.
- The commit messages sound routine.

## Signs to look for

- In one change: long runs of invisible characters plus `eval`, `Function`, or `child_process` in JS/TS; a "bump" message on a change to executable code.
- Across changes over time: the same push shape across many repos in a short time; the same decoder or wallet address in many repos; the payload string and decoder added in different commits.

## Defanged example

```
commit "chore: bump version"
+ const s = "|<6,000+ invisible variation selectors>";
+ eval(atob(<map code points minus 0xFE00>(s)));
```

## How Pushguard catches it

- Diff rules: the `unicode_risk` check flags variation selectors (tested). It does NOT flag Private Use Area characters. The March 2026 wave was reported (secondary sources) as mainly Private Use Area, so that wave could be missed by the Unicode check.
- js-x-ray AST analysis can flag `eval` of decoded data in changed JS (up to 15 files, 1 MB each). `js-obfuscated-payload` may also match.
- Identity & review context: `off-hours-push`, `unreviewed-push-to-main`.
- Facts + symbol graph across commits (planned): link an invisible-string file to a later eval sink, and spot the same shape across repos.

## References

- [Endor Labs](https://www.endorlabs.com/learn/invisible-threats-glassworm-unicode-vscode)
- [BleepingComputer, first wave](https://www.bleepingcomputer.com/news/security/self-spreading-glassworm-malware-hits-openvsx-vs-code-registries/)
- [BleepingComputer, Nov 2025 return](https://bleepingcomputer.com/news/security/glassworm-malware-returns-on-openvsx-with-3-new-vscode-extensions)
- [Security Affairs](https://securityaffairs.com/184427/malware/glassworm-malware-has-resurfaced-on-the-open-vsx-registry.html)
- [BleepingComputer, Mar 2026](https://www.bleepingcomputer.com/news/security/glassworm-malware-hits-400-plus-code-repos-on-github-npm-vscode-openvsx/)
- [Scientific American](https://www.scientificamerican.com/article/glassworm-malware-hides-in-invisible-open-source-code)
- [Tom's/3dtested summary](https://www.3dtested.com/tech-industry/cyber-security/malicious-packages-using-invisible-unicode-found-in-151-github-repos-and-vs-code) (secondary)

Not verified: the Aikido primary post for March 2026 was not read, so the Private Use Area claim is secondary. The Koi MCP post now redirects. GlassWorm's status after March 2026 is unknown.
