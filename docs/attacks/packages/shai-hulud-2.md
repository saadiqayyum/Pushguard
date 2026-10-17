# Sha1-Hulud 2.0 ("The Second Coming")

**Type:** Package & maintainer takeover · **When:** Nov 2025 · **Status:** confirmed

## What happened
This wave was a more aggressive return of [Shai-Hulud](shai-hulud-1.md). It hit about 600 to 800+ packages and 25,000+ GitHub repos (counts vary by source). It turned infected machines into GitHub Actions runners the attacker could use, and it wiped the home directory if stealing failed.

## How it got in
1. A `preinstall` ran `setup_bun.js`, so it ran even if the install failed.
2. That installed the Bun runtime and started a ~10 MB obfuscated `bun_environment.js` in the background. Bun was chosen to avoid Node-focused tools.
3. TruffleHog searched for SSH, GitHub, npm and cloud credentials.
4. It registered the machine as a self-hosted runner named `SHA1HULUD`, attached to a new repo. On Linux it hid in a hidden directory under nohup.
5. It committed `.github/workflows/discussion.yaml`: anyone opening a Discussion could run code on that runner.
6. A second "Code Formatter" workflow saved secrets as JSON artifacts.
7. New repos had the description "Sha1-Hulud: The Second Coming".

## Why it was hard to spot
- Bun avoided Node-tuned tools.
- The payload file was huge and obfuscated.
- Create-repo audit logs leave out descriptions, so hunters looked for random-looking repo names.
- Runner registration has no webhook event.

## Signs to look for
- In one change: preinstall that installs a runtime; a very large obfuscated file; a workflow with `runs-on: self-hosted` or a `discussion` trigger feeding a shell step; secrets serialized to an artifact.
- Across changes over time: new repos with random names; an unknown runner name in job logs.

## Defanged example
```
package.json: "preinstall": "node setup_bun.js"
bun_environment.js: <10 MB obfuscated blob>
.github/workflows/discussion.yaml:
  on: discussion
  runs-on: self-hosted
  run: <discussion body passed to shell>
```

## How Pushguard catches it
- **Diff rules:** `js-install-hook-added`, `js-obfuscated-payload`, `ci-self-hosted-runner`, `ci-workflow-changed`, `ci-secret-exfiltration`.
- **Detonation:** install with no network; downloading Bun fails, which is visible.
- Runner registration and new repos are not watched. The wipe is not prevented.
- See [pwn requests and script injection](../ci-cd/pwn-request-and-script-injection.md).

## References
- [Check Point (search-summary)](https://blog.checkpoint.com/research/shai-hulud-2-0-inside-the-second-coming-the-most-aggressive-npm-supply-chain-attack-of-2025/)
- [Cycode](https://cycode.com/blog/shai-hulud-2-0-deep-dive-and-actionable-steps-you-should-take/)
- [Securelist](https://securelist.com/shai-hulud-2-0/118214/)
- [Sysdig](https://www.sysdig.com/blog/return-of-the-shai-hulud-worm-affects-over-25-000-github-repositories); [Sumo Logic](https://www.sumologic.com/?p=62047)
- [Semgrep](https://app.semgrep.dev/blog/2025/digging-for-secrets-sha1-hulud-the-second-coming-of-the-npm-worm)
