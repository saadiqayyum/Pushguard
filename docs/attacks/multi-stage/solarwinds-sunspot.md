# SolarWinds Orion (SUNSPOT and SUNBURST)

**Type:** Multi-stage backdoor · **When:** Oct 2019 to 2020 · **Status:** confirmed

## What happened

Attackers broke into the computer that built SolarWinds Orion. A small program (SUNSPOT) swapped one source file only while the build ran, then put the original back. The signed product shipped with a hidden, sleeping backdoor (SUNBURST). The source repository was never changed.

## How it got in

1. October 2019: the attackers test the idea by inserting empty classes into the build. They check that the change survives to the signed release.
2. SUNSPOT runs on the build host. Every second it looks for the build tool (MsBuild.exe) building Orion.
3. When it sees the build, it swaps `InventoryManager.cs` for a modified copy. It checks file hashes first, so it never breaks a build.
4. When the build ends, it puts the original file back.
5. The output is signed as normal, so the backdoored DLL has a valid signature.
6. SUNBURST waits 12 to 14 days, checks it is in the real Orion process, and exits if it sees security tools or test domains.

## Why it was hard to spot

- Git never changed, so code review and diff tools had nothing to look at.
- The swap lasted only during the build.
- The code was wrapped to silence compiler warnings, and its class name (`OrionImprovementBusinessLayer`) blended in.
- Strings were encoded or stored as hashes.
- It stayed asleep in vendor test labs.

## Signs to look for

- In one change: if such code ever lands in a repo: comparisons against hashed process or domain names; date math against a file's timestamp; "is this our own domain or a test domain" checks; `#pragma warning disable` around new code; a new thread started from an existing refresh method.
- Across changes over time: a class or method in the compiled output that is not in the source at that commit; empty or dead classes added, later wired into a hot path.

## Defanged example

```
build host only (never committed):
  RefreshInternal() {
+   try { start background thread -> <BackdoorClass>.Init() } catch {}
    ...
  }
  #pragma warning disable ... <injected class> ... #pragma warning restore
```

## How Pushguard catches it

- Nothing catches this today. Pushguard watches repositories, and the repository was clean.
- Not built: build-host monitoring and comparing compiled output to source.
- If similar gating code were committed directly, the AI investigator could flag it, and the planned facts + symbol graph could spot dead code wired in later.

## References

- [CrowdStrike, SUNSPOT analysis](https://www.crowdstrike.com/en-us/blog/sunspot-malware-technical-analysis/)
- [Microsoft, Solorigate analysis](https://www.microsoft.com/en-us/security/blog/2020/12/18/analyzing-solorigate-the-compromised-dll-file-that-started-a-sophisticated-cyberattack-and-how-microsoft-defender-helps-protect/)

See also: [Environment-gated payloads](environment-gated-payloads.md).
