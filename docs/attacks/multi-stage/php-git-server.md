# PHP git server compromise

**Type:** Multi-stage backdoor · **When:** 28 Mar 2021 · **Status:** confirmed

## What happened

Someone broke into PHP's own git server (git.php.net). They pushed two commits to php-src that pretended to be written by Rasmus Lerdorf and Nikita Popov. The code would run PHP sent in a special HTTP header. When Popov reverted it, the attacker reverted the revert. No PHP release contained it.

## How it got in

1. The attacker got push access on the server itself, without needing any one developer's account.
2. They wrote commits with famous maintainers' names as the author.
3. The commit messages called them typo fixes.
4. The code ran (`zend_eval_string`) text from a `User-Agentt` header that started with "zerodium".
5. After the revert, they pushed a revert of the revert.

Afterwards PHP moved to GitHub, and write access needed org membership with 2FA.

## Why it was hard to spot

- Git author names are free text, so the commits looked like trusted people wrote them.
- "Fix typo" sounds harmless.
- It skipped the normal review path.

## Signs to look for

- In one change: author name does not match the account that pushed; no signature where that person usually signs; a message ("fix typo") that does not match the diff (a new eval fed by a request header).
- Across changes over time: a revert of a revert by a different actor; pushes that skip review.

## Defanged example

```
commit <sha>   Author: <famous maintainer>   "Fix typo"
+ if (header("User-Agentt") starts with "<marker>") eval(<rest of header>)
commit <sha>   "Revert 'Fix typo'"            (real maintainer)
commit <sha>   "Revert 'Revert ...'"          (attacker)
```

## How Pushguard catches it

- Identity & review context: `impersonated-commit` (author claims another account and no review) and `author_mismatch`; `unreviewed-push-to-main`.
- Diff rules: `php-dynamic-execution` matches a new eval.
- AI investigator: can note that "typo fix" does not match the change.
- Planned: revert-of-revert across commits as a pattern in the facts store.

## References

- [Nikita Popov, php.internals](https://news-web.php.net/php.internals/113838)
- [php.watch](https://php.watch/articles/git-php-net-hack)
- [The Hacker News](https://thehackernews.com/2021/03/phps-git-server-hacked-to-insert-secret.html?m=1)

See also: [Split across commits](split-across-commits.md).
