import assert from "node:assert/strict"
import { test } from "node:test"
import { isLockfile, parseLockfile } from "@/lib/lockfiles"

const pairs = (path: string, text: string) =>
  parseLockfile(path, text).entries.map((e) => `${e.ecosystem}:${e.name}@${e.version}`).sort()

test("package-lock v3 reads nested node_modules and skips the root and links", () => {
  const text = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "app", version: "1.0.0" },
      "node_modules/@scope/a": { version: "1.2.3" },
      "node_modules/@scope/a/node_modules/b": { version: "2.0.0" },
      "node_modules/local": { version: "0.0.1", link: true },
    },
  })
  assert.deepEqual(pairs("web/package-lock.json", text), ["npm:@scope/a@1.2.3", "npm:b@2.0.0"])
})

test("package-lock v1 walks nested dependencies", () => {
  const text = JSON.stringify({ dependencies: { a: { version: "1.0.0", dependencies: { b: { version: "2.0.0" } } } } })
  assert.deepEqual(pairs("package-lock.json", text), ["npm:a@1.0.0", "npm:b@2.0.0"])
})

test("yarn classic and berry headers", () => {
  const classic = `# yarn lockfile v1\n\n"@scope/a@^1.0.0", "@scope/a@^1.1.0":\n  version "1.2.0"\n  resolved "x"\n\nb@~2:\n  version "2.0.1"\n`
  assert.deepEqual(pairs("yarn.lock", classic), ["npm:@scope/a@1.2.0", "npm:b@2.0.1"])
  const berry = `__metadata:\n  version: 6\n\n"c@npm:^3.0.0":\n  version: 3.1.0\n\n"app@workspace:.":\n  version: 0.0.0-use.local\n`
  assert.deepEqual(pairs("yarn.lock", berry), ["npm:c@3.1.0"])
})

test("pnpm v5, v6 and v9 keys", () => {
  const text = `lockfileVersion: '9.0'\npackages:\n  /a/1.0.0_b@2.0.0:\n    resolution: {}\n  /@s/c@3.0.0(d@1.0.0):\n    resolution: {}\n  e@4.0.0:\n    resolution: {}\n  /@s/f/5.0.0:\n    resolution: {}\n`
  assert.deepEqual(pairs("pnpm-lock.yaml", text), ["npm:@s/c@3.0.0", "npm:@s/f@5.0.0", "npm:a@1.0.0", "npm:e@4.0.0"])
})

test("requirements pins, unpinned and options", () => {
  const text = "# deps\nRequests[security]==2.31.0\nflask>=2\n-r other.txt\nZope.Interface == 6.0  # pinned\ngit+https://x/y.git\n"
  assert.deepEqual(pairs("requirements-dev.txt", text), ["PyPI:flask@", "PyPI:requests@2.31.0", "PyPI:zope-interface@6.0"])
})

test("poetry and Cargo [[package]] tables", () => {
  const text = `[[package]]\nname = "serde"\nversion = "1.0.200"\n\n[[package]]\nname = "rand"\nversion = "0.8.5"\n`
  assert.deepEqual(pairs("Cargo.lock", text), ["crates.io:rand@0.8.5", "crates.io:serde@1.0.200"])
  assert.deepEqual(pairs("poetry.lock", text), ["PyPI:rand@0.8.5", "PyPI:serde@1.0.200"])
})

test("go.sum collapses the go.mod line", () => {
  const text = "github.com/a/b v1.2.3 h1:x=\ngithub.com/a/b v1.2.3/go.mod h1:y=\n"
  assert.deepEqual(pairs("go.sum", text), ["Go:github.com/a/b@v1.2.3"])
})

test("Gemfile.lock specs and composer and Pipfile locks", () => {
  const gem = "GEM\n  remote: https://rubygems.org/\n  specs:\n    rails (7.1.0)\n      actionpack (= 7.1.0)\n    rake (13.0.6)\n"
  assert.deepEqual(pairs("Gemfile.lock", gem), ["RubyGems:rails@7.1.0", "RubyGems:rake@13.0.6"])
  const composer = JSON.stringify({ packages: [{ name: "Monolog/Monolog", version: "v3.5.0" }], "packages-dev": [{ name: "phpunit/phpunit", version: "10.0.0" }] })
  assert.deepEqual(pairs("composer.lock", composer), ["Packagist:monolog/monolog@3.5.0", "Packagist:phpunit/phpunit@10.0.0"])
  const pipfile = JSON.stringify({ default: { Django: { version: "==4.2.0" } }, develop: {} })
  assert.deepEqual(pairs("Pipfile.lock", pipfile), ["PyPI:django@4.2.0"])
})

test("only lockfiles are recognized, and a broken one throws", () => {
  assert.equal(isLockfile("a/package.json"), false)
  assert.equal(isLockfile("a/b/Cargo.lock"), true)
  assert.throws(() => parseLockfile("package-lock.json", "{not json"))
})
