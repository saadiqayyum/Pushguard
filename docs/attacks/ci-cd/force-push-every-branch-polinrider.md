# Force push to every branch (PolinRider and GitHub #208082)

**Type:** CI/CD & GitHub platform · **When:** June to September 2026 · **Status:** reported (unverified)

## What happened

Two GitHub Community threads describe one family of attack, in which a stolen identity force-pushed bad commits to every branch of every repo it could write to.

- **#198490 (June to Sept 2026):** force pushes of `main` onto every branch in an org. It added `config.bat`, `temp_auto_push.bat` and `temp_interactive_push.bat`, plus BeaverTail-style code in `eslint.config.mjs`. A commenter named the campaign "PolinRider". The first victim was a non-developer org member. Replies blame compromised developer machines.
- **#208082 (2026-09-17):** bad commits force-pushed to every branch of personal, org and forked repos. Each was added on top of the last real commit and changed config files (`.gitignore`, vite, postcss, tailwind, eslint) with obfuscated JS.

## How it got in

1. A developer's machine or identity is compromised.
2. The attacker lists every repo the account can write to.
3. For each branch, they add a commit on top of the latest real one, then force-push.
4. In #208082 it survived a password change, PAT and SSH key revocation, and a laptop reformat. The security log showed repeated `oauth_access.create` and `oauth_access.regenerate` for the "Copilot Chat App" GitHub App after every revocation, without a knowingly approved device code. This claim is unverified; GitHub closed the thread without confirming. A third party reported getting similar commits.

## Why it was hard to spot

- Few people review config files, and the commit sits on top of real history, so the branch still looks normal.
- As reported, the token kept coming back after revocation.

## Signs to look for

- In one change: watch for `forced: true` on non-default branches. Build-config files (eslint, vite, tailwind, postcss, `.gitignore`) with long obfuscated lines. JS that loads `child_process`, `http` and `zlib` via `createRequire`. New `.bat` files.
- Across changes over time: look for one pusher producing force pushes on every branch of every repo in a short window.

## Defanged example

```
push refs/heads/main      forced=true  pusher=<victim>
push refs/heads/dev       forced=true  pusher=<victim>
push refs/heads/feature-x forced=true  pusher=<victim>
  M eslint.config.mjs   + <one very long obfuscated line>
  A config.bat
```

## How Pushguard catches it

- **History/forensics:** `force-push` fires on each forced push, and forensics compares the old and new tips to show what changed or was removed.
- **Diff rules:** `js-obfuscated-payload` for the obfuscated config code; the `forced` condition on custom rules.
- **Not built:** a dedicated "one pusher, every branch, every repo" burst detector. Each repo still gets its own alert. OAuth/App token re-minting is not visible to repo webhooks.

## References

- [GitHub Discussion #208082](https://github.com/orgs/community/discussions/208082) (unverified, no GitHub confirmation)
- [GitHub Discussion #198490](https://github.com/orgs/community/discussions/198490)
