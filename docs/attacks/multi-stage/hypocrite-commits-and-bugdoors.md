# Hypocrite commits and bugdoors (UMN, Juniper ScreenOS)

**Type:** Multi-stage backdoor · **When:** 2008 (Juniper change), disclosed Dec 2015; UMN 2020 to 2021 · **Status:** confirmed (Juniper); research demonstration (UMN)

## What happened

A "bugdoor" is a backdoor that looks like an honest bug. University of Minnesota researchers (Qiushi Wu and Kangjie Lu) showed that small "fix" patches to Linux could add a use-after-free bug (code that keeps using memory after freeing it). The paper was withdrawn in April 2021 and UMN was banned from kernel work. In Juniper ScreenOS, an attacker made several changes that only together allowed passive VPN decryption.

## How it got in

UMN ("hypocrite commits"):
1. Send a patch that claims to fix something.
2. Inside it, move a `free` or a lock release earlier in an error path, so memory is used after it is freed.
3. The patch looks helpful and on-topic.

Juniper ScreenOS:
1. The attacker replaced a cryptographic constant (the Dual EC "Q" value).
2. In the same 2008 release, other changes kept Juniper's own safety check from ever running.
3. A separate login-bypass backdoor was also present.

## Why it was hard to spot

- A bugdoor reads like a normal mistake.
- The danger only shows if you know how an object lives across several functions or files.
- In Juniper, each change was harmless on its own. The harm came from the combination.

## Signs to look for

- In one change: a crypto constant or parameter changed; a `free`, lock release or reference drop moved before the last use; a "cleanup" that deletes a length or bounds check.
- Across changes over time: a security constant changed, and the code that should check it becomes unreachable.

## Defanged example

```
  err:
-   use(obj);
-   free(obj);
+   free(obj);
+   use(obj);        /* "simplify error path" */
```

## How Pushguard catches it

- Diff rules: no rule targets this. Metadata signals do not help, because the author may be trusted and the change small.
- AI investigator: can read surrounding code with `read_file` and `find_references`, but research says models miss race, timing and complex logic bugs.
- Facts + symbol graph across commits (planned): could connect "constant changed" with "its check is now unreachable".
- Pushguard mostly misses this class today.

## References

- [PortSwigger](https://portswigger.net/daily-swig/Ill-advised-research-on-linux-kernel-lands-computer-scientists-in-hot-water)
- [LinuxSecurity on the TAB report](https://www.linuxsecurity.com/news/organizations-events/linux-s-technical-advisory-board-reports-on-the-umn-hypocrite-commits-patches)
- [LKML thread](https://lkml.iu.edu/hypermail/linux/kernel/2105.1/00408.html)
- [Kangjie Lu statement](https://www-users.cse.umn.edu/~kjlu/misc) (a party's claim)
- [UMN open letter](https://cse.umn.edu/node/101031)
- [The New Stack](https://thenewstack.io/university-of-minnesota-researchers-tried-to-poison-the-linux-kernel-for-a-research-project/)
- [Full disclosure PDF](https://www-users.cse.umn.edu/%7Ekjlu/papers/full-disclosure.pdf)
- [Checkoway et al., CCS 2016](https://eprint.iacr.org/2016/376)
- [CACM 2018](https://cacm.acm.org/magazines/2018/11/232227/fulltext)

Sources disagree on UMN: the Linux Technical Advisory Board (2021-05-05) found no malicious code in the re-reviewed UMN patches, and the researchers say the three bad patches were never merged, but other sources disagree on whether any vulnerable code reached the tree. The withdrawn paper text was not read.
