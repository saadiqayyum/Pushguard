# xz-utils backdoor (CVE-2024-3094)

**Type:** Multi-stage backdoor · **When:** Oct 2021 to Mar 2024 · **Status:** confirmed

## What happened

A person called "Jia Tan" spent about 2.5 years becoming a trusted maintainer of xz, a compression library used by many Linux systems. Then they hid a backdoor that could reach `sshd` (the SSH login server). No single git change showed the backdoor. Andres Freund found it by chance because SSH logins got slower (about 0.299s to 0.807s) and a memory checker (valgrind) printed errors.

## How it got in

1. 2021-10-29: Jia Tan sends a first harmless patch. More small, useful patches follow.
2. 2022: other accounts ("Jigar Kumar", "Dennis Ens") pressure the maintainer, Lasse Collin, to hand over control. SentinelOne says these people may not have existed.
3. 2022-2023: Jia Tan joins the GitHub org, starts merging and tagging releases, and routes bug reports and fuzzing reports to himself.
4. 2023-06-22: a second persona, "Hans Jansen", adds a feature (GNU ifunc) that lets code change function tables at load time. It was pitched as a speed-up and looked reasonable.
5. 2023-07-07: Jia Tan turns that feature off in the fuzzing setup (oss-fuzz), "for sanitizer compatibility". From then on the fuzzer never exercised that code.
6. 2024-02-23: the hidden payload is committed as two binary "test files" in `tests/files/`. No test used them.
7. A changed build macro (`build-to-host.m4`) shipped only in the release tarball, never in git. It read the test files, decoded them, and built a hidden object into the library.
8. A one-character change broke a sandbox check (Landlock), so the sandbox silently turned off.
9. 2024-03: personas ask Debian and Ubuntu to ship the new release quickly.

## Why it was hard to spot

- The payload was opaque binary data with a "corrupt test file" excuse.
- The trigger lived only in the release tarball. Nobody compared the tarball to git.
- Each groundwork change had a good-sounding reason.
- The sandbox break was one stray `.` inside a check that is designed to fail quietly.
- The backdoor only ran under narrow conditions (x86-64 Linux, Debian/RPM build, run as `/usr/sbin/sshd`, and more).

## Signs to look for

- In one change: a binary file added under `tests/` that no test reads; an m4 serial number jumping (3 to 30); a one-character edit inside a build feature check; fuzzing or sanitizer config turning a feature off; security contact addresses moved to a new person.
- Across changes over time: a blob added in one commit and later read by a build script that pipes it to a shell; release files that differ from git; a new runtime hook, then fuzzing of it removed, then a security check broken, all by the same small circle; a new identity that slowly gains release rights.

## Defanged example

```
2023-06  Add ifunc-based CRC selection          (persona B)
2023-07  oss-fuzz: disable ifunc for ASan       (persona A)
2024-02  Tests: add bad-3-<name>.xz, good-large-<name>.lzma   (binary, unused)
2024-02  Build: fix Landlock feature test       (one stray "." in a probe)
tarball only: build-to-host.m4  -> reads tests/files/* | tr <map> | xz -d | $SHELL
```

## How Pushguard catches it

- Diff rules: `binary-archive-committed` matches `*.xz` files; `cpp-build-runs-command` and `cpp-build-downloads` watch build files. Each is weak alone.
- Identity & review context: `first-push-by-account` and `unreviewed-push-to-main` add context, but a trusted maintainer looks normal.
- Facts + symbol graph across commits (planned): link "opaque blob added" to "a later build script reads it and sends it to a shell".
- Not built: comparing release tarballs to the git tag. The tarball-only trigger is invisible to Pushguard today.
- Not built: spotting sockpuppet pressure or a maintainer's rising privileges.

## References

- [Russ Cox, xz timeline](https://research.swtch.com/xz-timeline)
- [Andres Freund, oss-security disclosure](https://www.openwall.com/lists/oss-security/2024/03/29/4)
- [thesamesam FAQ gist](https://gist.github.com/thesamesam/223949d5a074ebc3dce9ee78baad9e27)
- [SentinelOne](https://www.sentinelone.com/blog/xz-utils-backdoor-threat-actor-planned-to-inject-further-vulnerabilities/)
- [Kaspersky Securelist](https://securelist.com/xz-backdoor-story-part-1/112354/) (search-summary)
- [LWN](https://lwn.net/SubscriberLink/967192/4dc234130d1cd9ee/) (search snippet)
- [oss-security 2024/03/30/8, Landlock](https://openwall.com/lists/oss-security/2024/03/30/8) (search-summary)
- [Julien Malka, how NixOS could have detected xz](https://luj.fr/blog/how-nixos-could-have-detected-xz.html)

Sources disagree on the Landlock commit: the date (Feb 26 vs Feb 28), whether it hit CMake, configure, or both, and whether the commit credited to Collin was forged.
