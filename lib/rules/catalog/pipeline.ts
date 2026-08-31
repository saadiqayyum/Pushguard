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
    added_lines: "@(?![0-9a-f]{40})[A-Za-z0-9._-]{1,50}",
  },
  {
    id: "ci-secret-exfiltration",
    description: "A workflow step piping secrets or the environment to the network",
    severity: "critical",
    paths: [".github/workflows/**", "**/.gitlab-ci.yml", "**/azure-pipelines.yml", "**/Jenkinsfile"],
    added_lines: "printenv|env\\s*\\||curl\\s+(-d|--data|-F|-T)|base64\\s+-w|nc\\s+-",
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
    added_lines: "\\|\\s*(sudo\\s+)?(sh|bash|zsh|python|perl|ruby|node)\\b",
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
      "**/*.bin",
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
    description: "An archive committed, whose contents no diff can show",
    severity: "medium",
    paths: ["**/*.zip", "**/*.tar", "**/*.tar.gz", "**/*.tgz", "**/*.7z", "**/*.rar", "**/*.xz"],
    exclude_paths: ["**/test/**", "**/tests/**", "**/fixtures/**", "**/__fixtures__/**", "**/testdata/**"],
    change_type: ["added"],
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
