# os-info-checker-es6 (Unicode steganography on npm)

**Type:** Hidden code · **When:** Mar to May 2025 · **Status:** confirmed

## What happened

An npm package called os-info-checker-es6 started out harmless (from about 19 March 2025). A version published on 7 May hid a payload inside invisible Unicode characters. Four other packages depended on it. Veracode reported it.

## How it got in

1. The early versions are clean and give the package an ordinary history.
2. The 7 May version adds a string that looks like a single `|`.
3. After the `|` comes a long run of invisible variation selectors (U+E0100-U+E01EF).
4. These decode to Base64, then to code that contacts a server.
5. The server address for the next stage is hosted in Google Calendar links.

## Why it was hard to spot

- The string looks like one character.
- Clean versions came first.
- Google Calendar is a trusted domain.

## Signs to look for

- In one change: a string that is mostly invisible characters; a decode-and-run next to it.
- Across changes over time: benign versions first, payload later; the invisible string and the decoder may arrive separately.

## Defanged example

```
v1.0.x  index.js   (normal OS info code)
v1.0.y  index.js
+ const x = "|<long run of invisible selectors>";
+ run(decode(x));   // fetches <calendar-link> for the next URL
```

## How Pushguard catches it

- Diff rules: if this code lands in a monitored repo, the `unicode_risk` check flags the variation selectors (tested). js-x-ray may flag the decode-and-run.
- Dependency checks: when a push adds this package, Pushguard checks OSV for known malicious packages and flags npm versions published in the last 72 hours.
- Facts + symbol graph across commits (planned): link the string to a later eval.

## References

- [BleepingComputer](https://www.bleepingcomputer.com/news/security/malicious-npm-package-uses-unicode-steganography-to-evade-detection/)
- [Veracode](https://www.veracode.com/resources/sophisticated-npm-attack-leveraging-unicode-steganography-and-google-calendar-c2)

See also: [GlassWorm](invisible-unicode-glassworm.md).
