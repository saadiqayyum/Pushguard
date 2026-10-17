# Webmin build server backdoor (CVE-2019-15107)

**Type:** Multi-stage backdoor (build tampering) · **When:** Apr 2018 to 2019 · **Status:** confirmed

## What happened

Attackers broke into Webmin's build server in April 2018 and changed code again in July 2018. The changed code went only into the SourceForge downloads, not into git. It allowed attackers to run commands without logging in. Only version 1.890 was exploitable by default.

## How it got in

1. April 2018: the build server is compromised and a file is changed.
2. The file's timestamp is set back, so it does not stand out.
3. July 2018: a second change.
4. Downloads from SourceForge carry the backdoor. Git does not.
5. The server was rebuilt, but the build folder was restored from backup, so the backdoor survived.

## Why it was hard to spot

- Git history was clean.
- The faked timestamp hid the change.
- The cleanup restored the build folder from a backup that still held the backdoor.

## Signs to look for

- In one change: nothing in git.
- Across changes over time: release downloads that differ from the tagged source; files whose timestamps are older than their content.

## Defanged example

```
git tag 1.890:        password_change.cgi  (clean)
download 1.890.tar:   password_change.cgi  (+ <one line that runs a request field as a command>)
```

## How Pushguard catches it

- Nothing catches this today. The repository was clean.
- Not built: comparing release downloads to the git tag.

## References

- [Rapid7](https://www.rapid7.com/db/vulnerabilities/exploit/unix/webapp/webmin_backdoor/)
- [Packt summary of Cameron's DEF CON post](https://hub.packtpub.com/a-year-old-webmin-backdoor-revealed-at-def-con-2019-allowed-unauthenticated-attackers-to-execute-commands-with-root-privileges-on-servers)
