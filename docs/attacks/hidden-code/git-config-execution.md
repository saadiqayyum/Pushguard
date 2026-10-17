# Git config that runs commands (CVE-2022-24765, hooks, filter drivers)

**Type:** Hidden code / developer environment · **When:** Apr 2022 (CVE); by-design surfaces ongoing · **Status:** confirmed (CVE); possible (social-engineering pattern)

## What happened

Some Git settings run commands. They normally live in the developer's local config and are not part of the repo, which is why cloning is considered safe. There are two ways around that:

- CVE-2022-24765: Git read a `.git` folder planted by another user in a folder above the working folder (for example `C:\.git\config`). Settings like `core.fsmonitor` run commands. A Git-aware shell prompt or an IDE running `git status` was enough to trigger it. Fixed by adding `safe.directory` (Git for Windows 2.35.2, Git 2.35.3/2.36.0).
- By design: hooks in `.git/hooks` are not cloned, and `core.hooksPath` is a local setting. In `.gitattributes`, a `filter=<name>` line only runs a command if `filter.<name>.smudge/clean` is set in the developer's own config, so the attacker has to get the developer to set it.

## How it got in

1. The repo adds a `.gitattributes` line naming a filter, or a hooks folder like `.githooks/`.
2. The README or CONTRIBUTING file says "run this setup script" or "run `git config ...`".
3. The developer follows the steps.
4. Now the filter or hooks run on every checkout or commit.

## Why it was hard to spot

- Each file alone is inert.
- Setup instructions are normal in real projects.
- For the CVE, nothing in the repo was needed; the `.git` folder sat outside it.

## Signs to look for

- In one change: `.gitattributes` adding `filter=`, `diff=` or `merge=`; `.lfsconfig`; a hooks folder added.
- Across changes over time: a README or CONTRIBUTING change telling readers to run a setup script or set `git config` right after a filter driver or hooks folder is added.

## Defanged example

```
.gitattributes   + *.dat filter=<name>
CONTRIBUTING.md  + Run: git config filter.<name>.smudge "<setup-script>"
```

## How Pushguard catches it

- Diff rules: `gitattributes-filter` flags new filter drivers; `git-hooks-added` flags `.githooks/`, `.husky/` and hook paths.
- Facts + symbol graph across commits (planned): link the driver to the README instruction that enables it.
- The CVE-2022-24765 case is on the developer's machine, outside any repo. Pushguard does not see it.

## References

- [GitHub blog, CVE-2022-24765](https://github.blog/2022-04-12-git-security-vulnerability-announced?cve=title)
- [githooks docs](https://git-scm.com/docs/githooks)
- [gitattributes docs](https://git-scm.com/docs/gitattributes)

The README-plus-driver pattern is an inference in the notes, not a documented incident. Git LFS tricks were not researched.
