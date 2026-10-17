# PyTorch torchtriton

**Type:** Package & maintainer takeover · **When:** 25 to 30 Dec 2022 · **Status:** confirmed

## What happened
PyTorch's nightly builds used a package called `torchtriton` from PyTorch's own index. Someone uploaded a bad package with the same name to public PyPI. "Since the PyPI index takes precedence", pip installed the bad one for pytorch-nightly Linux users between 25 and 30 Dec 2022. This is [dependency confusion](dependency-confusion.md) in the wild.

## How it got in
1. The attacker found a name that existed only on PyTorch's private nightly index.
2. They uploaded `torchtriton` to PyPI.
3. pip preferred PyPI and installed it.
4. A binary at `triton/runtime/triton` ran when code did `import triton`.
5. It collected system info, `/etc/passwd`, `$HOME/.ssh/*`, `.gitconfig` and the first 1,000 files in `$HOME`.
6. It sent the data out through encrypted DNS queries.

## Why it was hard to spot
- The PyTorch repo did not change.
- It ran on import, not on install, so install-time checks did not see it.

## Signs to look for
- In one change: setup that uses more than one package index; a native binary inside a Python package.
- Across changes over time: an internal name that appears on a public registry.

## Defanged example
```
pip config:  index = <private-nightly-index>, plus public PyPI
public PyPI: torchtriton  -> triton/runtime/triton  (binary, runs on import)
```

## How Pushguard catches it
- **Dependency checks:** `dependency-known-malicious` (OSV) once listed, if a push adds or bumps it.
- **Diff rules:** `py-requirements-from-url` flags index changes; `binary-executable-committed` flags binaries committed to your own repo.
- **Detonation:** runs import with no network, which could show the binary starting, but the DNS exfil would fail quietly.
- The public upload itself is not visible to Pushguard. Nothing catches it yet.
- PyTorch's fix: rename to `pytorch-triton` (pytorch/pytorch#91539) and register a placeholder on PyPI.

## References
- [PyTorch blog (fetched)](https://pytorch.org/blog/compromised-nightly-dependency/)
