# Whitespace padding (code pushed off-screen)

**Type:** Hidden code · **When:** 2022 (W4SP), 2024 (pytoileur) · **Status:** confirmed

## What happened

This is a low-tech trick. The attacker puts hundreds of spaces before malicious code on the same line, so the line looks short on screen while the code sits far to the right, out of view.

- W4SP stealer (PyPI, 2022, Phylum): `__import__` calls hidden in normal files. Later versions pushed code off-screen, with 318 spaces in one case. The packages had more than 5,700 downloads.
- pytoileur (PyPI, 2024, Sonatype): a Base64 payload in `setup.py` after a long run of spaces. It downloaded and ran a Windows program and stayed on the machine. 264 downloads.

## How it got in

1. Write a normal-looking file.
2. At the end of a line, add many spaces.
3. After the spaces, add the hidden code.
4. Anyone reading in an editor or diff view without wrapping does not see it.

## Why it was hard to spot

- Editors and diff viewers often do not wrap long lines.
- Some viewers cut long lines off.

## Signs to look for

- In one change: 100 or more spaces or tabs followed by code; lines longer than about 500 characters.
- Across changes over time: padding added in a "format" commit to a file that later changes behaviour.

## Defanged example

```
setup.py
+ version = "1.0.0"                                      <300 spaces>  run(decode("<encoded-blob>"))
```

## How Pushguard catches it

- Diff rules: `hidden-by-padding` flags long runs of whitespace before code. `py-obfuscated-payload` may match the encoded payload.

## References

- [Gigazine summary of Phylum (W4SP)](https://gigazine.net/gsc_news/en/20221104-pypi-packages-w4sp-stealer)
- [CyberInsider (pytoileur)](https://cyberinsider.com/malicious-pypi-package-promoted-on-stackoverflow-spreads-malware)
- [Sonatype](https://blog.sonatype.com/top-8-malicious-attacks-recently-found-on-pypi)
