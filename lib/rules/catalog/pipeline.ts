// CI, containers, infrastructure, shell, binaries and secrets. Not a language.
export const ci = [
  {
    id: "ci-workflow-changed",
    description: "GitHub Actions workflow created or modified",
    severity: "high",
    paths: [".github/workflows/**", ".github/actions/**"],
    change_type: ["added", "modified"],
  },
  {
    id: "ci-pull-request-target",
    description: "A workflow running on pull_request_target, with secrets, against a fork's code",
    severity: "critical",
    paths: [".github/workflows/**"],
    added_lines: "pull_request_target|workflow_run",
  },
  {
    id: "ci-action-unpinned",
    description: "An action pinned to a tag or branch rather than a commit SHA",
    severity: "high",
    paths: [".github/workflows/**", ".github/actions/**"],
    added_lines: "^[\\s-]*uses:\\s*['\"]?[^\\s@'\"#]+@(?![0-9a-f]{40}\\b)",
  },
  {
    id: "ci-secret-exfiltration",
    description: "A workflow step piping secrets or the environment to the network",
    severity: "critical",
    paths: [".github/workflows/**", ".github/actions/**", "**/.gitlab-ci.yml", "**/azure-pipelines.yml", "**/Jenkinsfile"],
    added_lines: [
      "printenv|env\\s*\\||\\benv\\s*>\\s*\\S",
      "curl\\s+(-[sSkLfv]+\\s+)?(-X\\s*POST\\s+)?(-d|--data|-F|-T)|wget\\s+(-q\\s+)?--post-(data|file)",
      "base64\\s+-w|base64[^|]{0,60}\\|\\s*base64",
      "nc\\s+-",
      "toJSON\\(\\s*secrets\\s*\\)",
      "/proc/[^\\s/]{1,12}/(mem|environ)\\b|Runner\\.Worker",
    ],
  },
  {
    id: "ci-script-injection",
    description: "Attacker-controlled event text (titles, bodies, branch names) expanded inside a script",
    severity: "critical",
    paths: [".github/workflows/**", ".github/actions/**"],
    added_lines:
      "^(?!\\s*[\\w-]+:\\s*['\"]?\\$\\{\\{).*\\$\\{\\{\\s*github\\.(head_ref|event\\.(issue\\.(title|body)|pull_request\\.(title|body|head\\.(ref|label))|comment\\.body|review\\.body|review_comment\\.body|discussion\\.(title|body)|head_commit\\.(message|author)|commits|pages|workflow_run\\.head_(branch|commit)))",
  },
  {
    id: "ci-checkout-pr-head",
    description: "A workflow checking out the pull request's own code, which under pull_request_target runs it with secrets",
    severity: "high",
    paths: [".github/workflows/**", ".github/actions/**"],
    added_lines: [
      "ref:\\s*['\"]?\\$\\{\\{\\s*github\\.(head_ref|event\\.(pull_request\\.head\\.(sha|ref)|workflow_run\\.head_(sha|branch)))",
      "refs/pull/\\$\\{\\{|gh pr checkout",
    ],
  },
  {
    id: "ci-runner-registration",
    description: "A self-hosted Actions runner downloaded or registered from repository code",
    severity: "high",
    added_lines: ["config\\.(sh|cmd)\\s[^\\n]{0,120}--(url|token)\\b", "actions-runner-(linux|osx|win)-", "\\bsvc\\.sh\\s+install"],
  },
  {
    id: "worm-persistence-indicator",
    description: "A file name, runner name or commit message left by a known repository worm",
    severity: "critical",
    any_of: [
      {
        paths: [
          ".github/workflows/shai-hulud*.y*ml",
          ".github/workflows/formatter_[0-9]*.y*ml",
          ".github/workflows/github_actions_security.y*ml",
        ],
        change_type: ["added", "modified"],
      },
      { commit_message: ["^Shai-Hulud( Migration)?$", "^Add Github Actions Security workflow$"] },
      { added_lines: "SHA1HULUD" },
    ],
  },
  {
    id: "worm-workflow-lookalike",
    description: "A new workflow named or triggered like a known worm's backdoor (discussion trigger, security-audit, format-check)",
    severity: "high",
    any_of: [
      {
        paths: [
          ".github/workflows/discussion.y*ml",
          ".github/workflows/security-audit.y*ml",
          ".github/workflows/format-check.y*ml",
        ],
        change_type: ["added"],
      },
      { paths: [".github/workflows/**"], added_lines: "^\\s*on:[\\s\\[]*discussion|^\\s*discussion(_comment)?:" },
    ],
  },
  {
    id: "ci-agent-shaped-push",
    description: "A workflow changed outside working hours with no pull request, the shape of a stolen token at work",
    severity: "high",
    paths: [".github/workflows/**", ".github/actions/**"],
    change_type: ["added", "modified"],
    when: { unreviewed: true, hour_utc: { not_between: [4, 18] } },
  },
  {
    id: "ci-self-hosted-runner",
    description: "A job moved onto a self-hosted runner",
    severity: "high",
    paths: [".github/workflows/**"],
    added_lines: "self-hosted",
  },
  {
    id: "ci-permissions-widened",
    description: "Workflow token permissions widened to write",
    severity: "high",
    paths: [".github/workflows/**"],
    added_lines: "permissions:\\s*write-all|contents:\\s*write|id-token:\\s*write",
  },
  {
    id: "ci-other-provider-changed",
    description: "A non-GitHub CI configuration changed",
    severity: "high",
    paths: [
      "**/.gitlab-ci.yml",
      "**/Jenkinsfile",
      "**/azure-pipelines.yml",
      "**/.circleci/**",
      "**/.travis.yml",
      "**/bitbucket-pipelines.yml",
      "**/.drone.yml",
      "**/buildkite.yml",
      "**/.teamcity/**",
    ],
  },
] as const

export const container = [
  {
    id: "container-fetch-and-run",
    description: "A Dockerfile downloading and executing something at build time",
    severity: "critical",
    paths: ["**/Dockerfile*", "**/*.dockerfile", "**/Containerfile"],
    added_lines: "\\|\\s*(sudo\\s+)?(sh|bash|python|perl)\\b",
  },
  {
    id: "container-base-image-changed",
    description: "A base image repointed, or pinned to a mutable tag",
    severity: "high",
    paths: ["**/Dockerfile*", "**/*.dockerfile", "**/docker-compose*.y*ml"],
    added_lines: "^\\s*FROM\\s|image:\\s*",
  },
  {
    id: "container-privileged",
    description: "A container granted privileged mode or the host namespace",
    severity: "critical",
    paths: ["**/docker-compose*.y*ml", "**/*.yaml", "**/*.yml"],
    added_lines: "privileged:\\s*true|hostPID:\\s*true|hostNetwork:\\s*true|/var/run/docker\\.sock",
  },
  {
    id: "infra-state-or-provider-changed",
    description: "Terraform provider, backend, or external data source changed",
    severity: "high",
    paths: ["**/*.tf", "**/*.tfvars", "**/*.hcl"],
    added_lines: 'local-exec|remote-exec|data\\s+"external"|backend\\s+"|source\\s*=\\s*"(git|https?)',
  },
] as const

export const shell = [
  {
    id: "shell-pipe-to-interpreter",
    description: "Downloading a script and piping it straight into a shell",
    severity: "critical",
    added_lines: [
      "\\|\\s*(sudo\\s+)?(sh|bash|zsh|python|perl|ruby|node)\\b",
      "\\b(ba|z)?sh\\s+(-c\\s+)?[\"']?(\\$\\(|<\\()\\s*(curl|wget)\\b",
      "\\biex\\s*\\(|Invoke-Expression|\\|\\s*iex\\b",
      "powershell(\\.exe)?\\s[^\\n]{0,40}-(e|enc|EncodedCommand)\\s",
    ],
  },
  {
    id: "shell-reverse-connection",
    description: "A reverse shell or raw network connection to a fixed host",
    severity: "critical",
    added_lines:
      "/dev/tcp/|nc\\s+-[a-z]*e|socat\\s|exec:/bin/|bash\\s+-i\\s",
  },
  {
    id: "shell-profile-modified",
    description: "A shell startup file, which runs on every new terminal",
    severity: "critical",
    paths: [
      "**/.bashrc",
      "**/.bash_profile",
      "**/.zshrc",
      "**/.zshenv",
      "**/.profile",
      "**/.config/fish/**",
      "**/.bash_aliases",
    ],
    change_type: ["added", "modified"],
  },
  {
    id: "shell-permissive-mode",
    description: "A file made world-writable or setuid",
    severity: "high",
    added_lines: "chmod\\s+(-[a-zA-Z]+\\s+)?(777|666|a\\+w|[24][0-7]{3})|chmod\\s+[ugoa]*\\+s",
  },
  {
    id: "shell-scheduled-task",
    description: "A cron entry, systemd unit, or scheduled task added",
    severity: "critical",
    paths: [
      "**/crontab",
      "**/cron.d/**",
      "**/*.service",
      "**/*.timer",
      "**/LaunchAgents/**",
      "**/LaunchDaemons/**",
      "**/*.plist",
    ],
    change_type: ["added", "modified"],
  },
] as const

export const binary = [
  {
    id: "binary-executable-committed",
    description: "An executable or library committed to a source repository",
    severity: "critical",
    paths: [
      "**/*.exe",
      "**/*.dll",
      "**/*.so",
      "**/*.so.*",
      "**/*.dylib",
      "**/*.o",
      "**/*.a",
      "**/*.msi",
      "**/*.app/**",
      "**/*.deb",
      "**/*.rpm",
      "**/*.pkg",
      "**/*.dmg",
    ],
    change_type: ["added", "modified"],
  },
  {
    id: "binary-bytecode-committed",
    description: "Compiled bytecode or a packaged archive committed",
    severity: "high",
    paths: ["**/*.pyc", "**/*.pyo", "**/*.class", "**/*.jar", "**/*.war", "**/*.wasm", "**/*.nupkg", "**/*.gem"],
    change_type: ["added", "modified"],
  },
  {
    id: "binary-archive-committed",
    description: "An archive or opaque blob committed, whose contents no diff can show",
    severity: "medium",
    paths: ["**/*.zip", "**/*.tar", "**/*.tar.gz", "**/*.tgz", "**/*.7z", "**/*.rar", "**/*.xz", "**/*.bin"],
    exclude_paths: ["**/test/**", "**/tests/**", "**/fixtures/**", "**/__fixtures__/**", "**/testdata/**"],
    change_type: ["added"],
  },
  {
    id: "test-fixture-opaque-blob",
    description: "An opaque or compressed blob added under a test directory, where payloads have hidden as corrupt samples",
    severity: "medium",
    paths: ["**/{test,tests,testdata,fixtures,__fixtures__,spec}/**/*.{bin,dat,raw,blob,img,xz,lzma,gz,bz2,zst,lz4,zip,7z,tar}"],
    change_type: ["added", "modified"],
  },
] as const

export const secrets = [
  {
    id: "secret-private-key",
    description: "A private key committed",
    severity: "critical",
    added_lines: "-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY",
  },
  {
    id: "secret-cloud-credential",
    description: "A cloud provider credential committed",
    severity: "critical",
    added_lines:
      "AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ya29\\.[0-9A-Za-z_-]+|SG\\.[0-9A-Za-z_-]{22}",
  },
  {
    id: "secret-service-token",
    description: "A token for a developer service committed",
    severity: "critical",
    added_lines:
      "gh[pousr]_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{82}|xox[baprs]-[0-9A-Za-z-]{10,}|sk-[A-Za-z0-9]{32,}|sk_live_[0-9A-Za-z]{24,}|npm_[0-9A-Za-z]{36}|dop_v1_[0-9a-f]{64}|glpat-[0-9A-Za-z_-]{20}",
  },
  {
    id: "secret-credential-file",
    description: "A credential or keystore file committed",
    severity: "critical",
    paths: [
      "**/*.pem",
      "**/*.key",
      "**/*.p12",
      "**/*.pfx",
      "**/*.jks",
      "**/*.keystore",
      "**/id_rsa",
      "**/id_ed25519",
      "**/.netrc",
      "**/.pgpass",
      "**/credentials",
      "**/.aws/**",
      "**/kubeconfig",
      "**/*.kubeconfig",
      "**/serviceaccount*.json",
    ],
    exclude_paths: ["**/*.pub", "**/test/**", "**/tests/**", "**/fixtures/**"],
    change_type: ["added", "modified"],
  },
] as const
