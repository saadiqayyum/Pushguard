import type { FactKind } from "./types"

// Line classifiers. Capture `group` becomes the detail; nothing else from the
// line is stored. `files` limits a pattern to the languages where it means that.
export type LinePattern = { kind: FactKind; label: string; pattern: RegExp; group?: number; files?: RegExp; scope?: RegExp }

const PY = /\.py$/i
const RB = /\.rb$/i
const PHP = /\.php$/i
const JS_LIKE = /\.(?:[mc]?[jt]sx?|php)$/i
const SHELLISH = /\.(?:sh|bash|zsh|m4|ya?ml|mk|ac|am|in)$|(?:^|\/)(?:Makefile|Dockerfile|configure)[^/]*$/i
const DATA_FILE = /\.(?:txt|dat|csv|tsv|log|dic|dict|wordlist)$/i
const FUZZ_CONFIG = /(?:^|\/)(?:\.clusterfuzzlite|oss-fuzz|fuzz[\w-]*|\.github\/codeql|sanitizers?)(?:\/|$)/i
const AUTH_SCOPE = /auth|permission|authoriz|admin|verify|acl|polic|role/i
const ENV = String.raw`(?:process\.env|os\.environ(?:\.get)?|os\.getenv|os\.Getenv|System\.getenv|getenv|ENV\[|std::env::var)`

export const SECRET_PATTERNS: LinePattern[] = [
  { kind: "secret_read", label: "credential-env", pattern: new RegExp(`(?=.*${ENV})(?=.*(?:TOKEN|SECRET|PASSW|API_?KEY|PRIVATE_KEY|CREDENTIAL))`, "i") },
  { kind: "secret_read", label: "whole-env", pattern: /\b(?:Object\.(?:entries|keys|values|assign)|JSON\.stringify)\s*\(\s*process\.env\b|\.\.\.process\.env\b|\bdict\s*\(\s*os\.environ\s*\)|\bos\.environ\.copy\s*\(|toJSON\s*\(\s*secrets\s*\)/ },
  { kind: "secret_read", label: "ci-secret", pattern: /\$\{\{\s*secrets\.(\w+)/, group: 1 },
  { kind: "secret_read", label: "password-field", pattern: /\.password\b|\[type=["']?password/i },
  { kind: "secret_read", label: "credential-file", pattern: /~\/\.ssh|\bid_rsa\b|\.aws\/credentials|\.git-credentials|\.docker\/config\.json|\bwallet\.dat\b|Login Data/i },
]

export const LINE_PATTERNS: LinePattern[] = [
  { kind: "network", label: "fetch", pattern: /\bfetch\s*\(/ },
  { kind: "network", label: "http-client", pattern: /\b(?:axios|got|superagent|undici|needle)\s*[.(]|\bhttps?\.(?:request|get)\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\s*\(/ },
  { kind: "network", label: "python-http", pattern: /\b(?:requests|httpx)\.(?:get|post|put|request)\s*\(|\burlopen\s*\(|\burllib\.request\b/ },
  { kind: "network", label: "go-http", pattern: /\bhttp\.(?:Get|Post|NewRequest)\s*\(/ },
  { kind: "network", label: "socket", pattern: /\b(?:net|tls)\.connect\s*\(|\bsocket\.(?:connect|create_connection)\s*\(|\bnet\.Dial\s*\(/ },
  { kind: "network", label: "download", pattern: /\b(?:curl|wget|Invoke-WebRequest)\b/ },
  { kind: "network", label: "jvm-http", pattern: /\bHttpClient\b|\bnew\s+URL\s*\(/ },
  { kind: "network", label: "ruby-http", pattern: /\bNet::HTTP\b/ },
  { kind: "network", label: "php-http", pattern: /\bcurl_exec\s*\(|file_get_contents\s*\(\s*['"]https?:/ },
  { kind: "eval", label: "python-exec", pattern: /\bexec\s*\(|__import__\s*\(|\bpickle\.loads?\s*\(|\byaml\.load\s*\(/, files: PY },
  { kind: "process", label: "child-process", pattern: /\bchild_process\b|\bexec(?:Sync|File|FileSync)?\s*\(|\bspawn(?:Sync)?\s*\(/, files: /\.(?:[mc]?[jt]sx?)$/i },
  { kind: "process", label: "python-process", pattern: /\bos\.(?:system|popen|exec\w*)\s*\(|\bsubprocess\.\w+\s*\(|\bpty\.spawn\s*\(/ },
  { kind: "process", label: "go-process", pattern: /\bexec\.Command(?:Context)?\s*\(/ },
  { kind: "process", label: "jvm-process", pattern: /\bRuntime\.getRuntime\(\)\.exec\b|\bProcessBuilder\b/ },
  { kind: "process", label: "rust-process", pattern: /\bCommand::new\s*\(/ },
  { kind: "process", label: "php-process", pattern: /\b(?:shell_exec|passthru|proc_open|popen|system)\s*\(/, files: PHP },
  { kind: "process", label: "ruby-process", pattern: /\b(?:system|spawn|exec)\s*\(|%x\{/, files: RB },
  { kind: "process", label: "runs-file", pattern: /\b(?:sh|bash|node|python3?|ruby|perl|deno|bun)\s+(\.?\/?[\w@.-]+(?:\/[\w@.-]+)*\.\w{1,8})\b/, group: 1 },
  { kind: "process", label: "shell-interpreter", pattern: /\|\s*(?:ba|z|da)?sh\b|\b(?:ba)?sh\s+-c\b/ },
  { kind: "eval", label: "eval", pattern: /\beval\s*\(/ },
  { kind: "eval", label: "function-constructor", pattern: /\bnew\s+Function\s*\(|\bFunction\s*\(\s*['"`]/ },
  { kind: "eval", label: "vm", pattern: /\bvm\.(?:runIn\w+|Script)\b/ },
  { kind: "eval", label: "dynamic-import", pattern: /\bimport\s*\(\s*[^'"`\s)]/, files: /\.(?:[mc]?[jt]sx?)$/i },
  { kind: "env_read", label: "env", pattern: new RegExp(`${ENV}|\\$\\{\\{\\s*env\\.`) },
  { kind: "file_write", label: "fs-write", pattern: /\b(?:writeFile|appendFile|createWriteStream)(?:Sync)?\s*\(/ },
  { kind: "file_write", label: "python-write", pattern: /\bopen\s*\([^)]*,\s*['"][wa]b?\+?['"]/, files: PY },
  { kind: "file_write", label: "go-write", pattern: /\b(?:os|ioutil)\.WriteFile\s*\(/ },
  { kind: "file_write", label: "php-write", pattern: /\bfile_put_contents\s*\(/ },
  { kind: "file_write", label: "shell-redirect", pattern: /(?:^|[^0-9&>=-])>>?\s*([\w~][\w.~/-]*)/, files: SHELLISH, group: 1 },
  { kind: "decode", label: "base64-decode", pattern: /\batob\s*\(|Buffer\.from\s*\([^)]*['"](?:base64|hex)['"]|\bb64decode\s*\(|\bbase64\s+(?:-d|--decode)\b|\bbase64_decode\s*\(|DecodeString\s*\(|Base64\.(?:getDecoder|decode64|strict_decode64)/ },
  { kind: "decode", label: "char-codes", pattern: /\bfromCharCode\s*\(|\bcodePointAt\s*\(|\bcharCodeAt\s*\(/ },
  { kind: "decode", label: "decompress", pattern: /\b(?:inflate|gunzip|brotliDecompress)(?:Sync)?\s*\(|\bzlib\.decompress\s*\(|\b(?:xz|gzip|bzip2)\s+-d\b|\bunxz\b|\bgzinflate\s*\(/ },
  { kind: "decode", label: "tr-translate", pattern: /\btr\s+(["']).+?\1\s+(["']).+?\2/, files: SHELLISH },
  { kind: "opaque_blob", label: "script-in-data-file", pattern: /^\s*(?:echo|curl|wget|sh|bash|eval|exec|node|python3?|base64|chmod|export)\b/, files: DATA_FILE },
  { kind: "obfuscation", label: "base64-encode", pattern: /\.toString\s*\(\s*['"]base64['"]\s*\)|\bbtoa\s*\(|\bb64encode\s*\(|\bbase64_encode\s*\(/ },
  { kind: "obfuscation", label: "escaped-string", pattern: /(?:\\x[0-9a-fA-F]{2}){8}|(?:\\u[0-9a-fA-F]{4}){8}/ },
  { kind: "activation_gate", label: "time-gate", pattern: /\bDate\.now\s*\(\)\s*[<>-]|\bnew\s+Date\s*\(\)\s*[<>]|\bDate\.parse\s*\(|\btime\.time\s*\(\)\s*[<>]|\btime\.Now\(\)\.(?:After|Before)\s*\(|\bmtime(?:Ms)?\b/ },
  { kind: "activation_gate", label: "ci-gate", pattern: new RegExp(`${ENV}\\W{1,4}(CI|GITHUB_ACTIONS|GITLAB_CI|TRAVIS|JENKINS_URL|BUILDKITE|CIRCLECI)\\b`), group: 1 },
  { kind: "activation_gate", label: "hash-compare", pattern: /[!=]==?\s*0x[0-9a-fA-F]{6,}|0x[0-9a-fA-F]{6,}\s*[!=]==?/ },
  { kind: "activation_gate", label: "host-gate", pattern: /\b(?:os\.hostname|gethostname|os\.userInfo|navigator\.language|Intl\.DateTimeFormat)\b/ },
  { kind: "install_hook", label: "npm-lifecycle", pattern: /"(preinstall|install|postinstall|prepare|prepack)"\s*:/, files: /(?:^|\/)package\.json$/, group: 1 },
  { kind: "entry_point", label: "go-init", pattern: /^\s*func\s+init\s*\(\s*\)/, files: /\.go$/ },
  { kind: "entry_point", label: "python-main", pattern: /^\s*if\s+__name__\s*==\s*['"]__main__['"]/, files: PY },
  { kind: "entry_point", label: "rust-ctor", pattern: /#\[(?:ctor|dtor)\]/, files: /\.rs$/ },
  { kind: "entry_point", label: "java-static-init", pattern: /^\s*static\s*\{/, files: /\.java$/ },
  { kind: "defense_weakened", label: "tls-verification-off", pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFYPEER\s*,\s*(?:0|false)|\bcurl\s+(?:-k|--insecure)\b/ },
  { kind: "defense_weakened", label: "fuzz-or-sanitizer-disabled", pattern: /--disable-|-fno-sanitize|--no-sanitize|\bexclude\b|\bskip\b/i, files: FUZZ_CONFIG },
  { kind: "defense_weakened", label: "sandbox-probe-edited", pattern: /(?=.*(?:check_c_source_compiles|check_include_file|AC_(?:COMPILE|LINK)_IFELSE))(?=.*(?:landlock|seccomp|pledge|capsicum|sandbox))/i },
  { kind: "defense_weakened", label: "loose-auth-compare", pattern: /[^=!<>]==[^=]/, files: JS_LIKE, scope: AUTH_SCOPE },
  { kind: "defense_weakened", label: "auth-early-allow", pattern: /\breturn\s+true\b/, files: JS_LIKE, scope: AUTH_SCOPE },
]

// Files whose presence is the capability, from docs/EXECUTION_SURFACES.md.
export const SURFACES: { kind: FactKind; label: string; globs: string[] }[] = [
  {
    kind: "install_hook",
    label: "install-surface",
    globs: ["**/setup.py", "**/*.gemspec", "**/extconf.rb", "**/binding.gyp", "**/.pnpmfile.cjs", "**/.yarnrc.yml", "**/sitecustomize.py", "**/*.pth", "**/Gemfile", "**/bunfig.toml"],
  },
  {
    kind: "build_hook",
    label: "build-surface",
    globs: [
      "**/*.m4", "**/configure", "**/configure.ac", "**/Makefile*", "**/CMakeLists.txt", "**/*.cmake", "**/build.rs",
      "**/build.gradle*", "**/settings.gradle*", "**/pom.xml", "**/Directory.Build.*", "**/conftest.py", "**/noxfile.py",
      "**/tox.ini", "**/Dockerfile", "**/nx.json", "**/turbo.json", "**/.eslintrc.js",
      "**/{eslint,babel,postcss,tailwind,webpack,vite,rollup,next,jest,vitest,playwright}.config.*",
    ],
  },
  {
    kind: "ci_trigger",
    label: "ci-surface",
    globs: [".github/workflows/*.{yml,yaml}", "**/action.{yml,yaml}", ".gitlab-ci.yml", ".circleci/**", "**/Jenkinsfile", "azure-pipelines.yml", ".buildkite/**", ".travis.yml", ".drone.yml"],
  },
  {
    kind: "entry_point",
    label: "open-or-session-surface",
    globs: [
      ".vscode/tasks.json", ".vscode/settings.json", ".vscode/launch.json", ".vscode/mcp.json", ".devcontainer/**", ".devcontainer.json",
      ".envrc", ".claude/settings*.json", ".mcp.json", ".cursor/mcp.json", ".husky/**", "lefthook.yml", ".pre-commit-config.yaml",
      ".idea/**", ".run/*.run.xml",
    ],
  },
  { kind: "entry_point", label: "import-time-surface", globs: ["**/__init__.py"] },
  { kind: "entry_point", label: "route-surface", globs: ["**/app/**/route.{ts,js}", "**/pages/api/**", "**/middleware.{ts,js}"] },
]

// Catalog rule hits that are capabilities, so the rule set stays the one place
// a pattern is written.
export const RULE_FACTS: Record<string, FactKind> = {
  "agent-hook-or-auto-approve": "entry_point",
  "editor-task-runs-on-open": "entry_point",
  "git-hooks-added": "entry_point",
  "gitattributes-filter": "entry_point",
  "js-bin-entry-added": "entry_point",
  "cpp-constructor-attribute": "entry_point",
  "js-install-hook-added": "install_hook",
  "php-composer-script": "install_hook",
  "py-install-hook-added": "install_hook",
  "ruby-native-extension": "install_hook",
  "py-sitecustomize": "install_hook",
  "jvm-build-runs-command": "build_hook",
  "dotnet-build-runs-command": "build_hook",
  "cpp-build-runs-command": "build_hook",
  "go-generate-directive": "build_hook",
  "rust-build-script": "build_hook",
  "ci-workflow-changed": "ci_trigger",
  "ci-other-provider-changed": "ci_trigger",
  "environment-serialized": "secret_read",
  "ci-secret-exfiltration": "secret_read",
  "hardcoded-ip-address": "network",
  "c2-decentralized-resolver": "network",
  "cpp-build-downloads": "network",
  "shell-reverse-connection": "network",
  "container-fetch-and-run": "network",
  "jvm-process-execution": "process",
  "dotnet-process-execution": "process",
  "cpp-process-execution": "process",
  "go-process-execution": "process",
  "rust-process-execution": "process",
  "shell-pipe-to-interpreter": "process",
  "ci-runner-registration": "process",
  "js-obfuscated-payload": "eval",
  "ruby-dynamic-execution": "eval",
  "php-dynamic-execution": "eval",
  "py-dynamic-execution": "eval",
  "php-obfuscated-payload": "obfuscation",
  "py-obfuscated-payload": "obfuscation",
  "binary-executable-committed": "opaque_blob",
  "binary-bytecode-committed": "opaque_blob",
  "binary-archive-committed": "opaque_blob",
  "test-fixture-opaque-blob": "opaque_blob",
  "invisible-codepoint-run": "opaque_blob",
  "invisible-private-use": "opaque_blob",
}

// js-x-ray warnings, for the shapes a line cannot see.
export const XRAY_FACTS: Record<string, FactKind> = {
  "obfuscated-code": "obfuscation",
  "encoded-literal": "obfuscation",
  "unsafe-stmt": "eval",
  "unsafe-import": "eval",
  "serialize-environment": "secret_read",
  "shady-link": "network",
  "suspicious-literal": "opaque_blob",
}

// A path written in a config, script or string literal: `npm/postinstall.js`,
// `tests/files/x.bin`. URLs are excluded by the lookbehind.
export const PATH_REFERENCE = /(?<![\w/:.@-])(?:\.\/)?((?:[\w@-][\w@.-]*\/)+[\w@-][\w@.-]*\.[A-Za-z0-9]{1,8})(?![\w/])/g

export const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#(?![!\[]|include|define|if|pragma)|--|;)/

export const URL_HOST = /\bhttps?:\/\/([\w.-]+)/
