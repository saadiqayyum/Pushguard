# Execution surfaces

Every place where a change to a repository can make code run, change who or
what is trusted, or change where something is fetched from. A rule, a data
source or a graph entry point exists for each row, or the row says it is a gap.

Columns: **When it runs** (clone, open, install, build, test, CI, deploy,
runtime, end user) · **Privilege** (what the code can reach at that moment) ·
**Watch for** (single-change signal) · **Known-bad data** (where to match it
locally, see "Data sources" at the end).

Status: **rule** = shipped catalog rule · **planned** · **gap** = nothing yet.

## 1. Runs on a developer's machine without an explicit "run"

| Surface | When it runs | Privilege | Watch for | Status |
|---|---|---|---|---|
| `.gitmodules`, submodule paths and URLs | clone (`--recursive`), checkout | dev user | new or changed URL, control chars, `.git` path parts | rule |
| Symlinks (mode 120000) into `.git/` or hooks | checkout | dev user | symlink target outside tree | planned (needs file mode) |
| `.gitattributes` filter, diff, merge drivers | checkout, diff | dev user, if driver configured | driver names, `linguist-generated` hiding | rule |
| `.vscode/tasks.json` (`runOn: folderOpen`), `settings.json` (auto-approve, trust off), `extensions.json` recommendations, `launch.json` | open folder | dev user + editor tokens | auto-run, trust changes, new recommended extension | rule |
| `.idea/` run configs, `.run/*.run.xml` | open, run | dev user | new run configuration | rule |
| `.devcontainer/*`, `.devcontainer.json` (`postCreateCommand`, `initializeCommand` runs on the host) | container create | dev user, host for `initializeCommand` | commands, new features/images | rule (host-side `initializeCommand` → raise) |
| `.envrc` (direnv), `.mise.toml` / `.tool-versions` (tasks, hooks, plugin URLs), `shell.nix` / `flake.nix` `shellHook` | cd into dir, shell entry | dev user | new hook or task, plugin source change | rule (direnv); planned (mise, nix) |
| Vim modelines, Emacs `.dir-locals.el` (`eval`) | open file | dev user | `eval`, modeline with options | gap |
| Language server execution: Rust `build.rs` and proc macros (rust-analyzer), Gradle sync, Maven import, CMake configure | open project in IDE | dev user | build logic change | rule (build files); planned (proc macros) |
| `tsconfig.json` language-service plugins, Prettier/ESLint plugins loaded by the editor | open, save | dev user | new plugin entry | gap |
| AI agent files: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules/**`, `.github/copilot-instructions.md`, prompt files | agent session | dev user + agent tools + tokens | any change; hidden Unicode → critical | rule |
| Agent hooks and tools: `.claude/settings.json` hooks, `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, Codex/Aider/Continue configs, `apiKeyHelper` | agent session | dev user, shell | new hook, new MCP server, auto-approve | rule |
| Git hooks managers: `.husky/**`, `lefthook.yml`, `.pre-commit-config.yaml` (fetches and runs remote repos), `lint-staged` | commit, push | dev user | new hook, remote repo `rev` not pinned to SHA | rule (husky, pre-commit removal); planned (remote rev pin) |

## 2. Runs on dependency install

| Surface | Watch for | Status |
|---|---|---|
| npm lifecycle: `preinstall`, `install`, `postinstall`, `prepare`, `prepack` | added or replaced scripts object | rule |
| `.npmrc` (`registry`, `script-shell`, `ignore-scripts=false`), `.yarnrc.yml` (`yarnPath` runs a checked-in JS file, `npmRegistryServer`, plugins), `.pnpmfile.cjs` (hooks run on every install), `bunfig.toml` (`preload`) | any change; `yarnPath` or pnpmfile → high | rule (.npmrc); planned (yarnPath, pnpmfile, bunfig) |
| Python: `setup.py`, `pyproject.toml` in-tree build backend (`backend-path`), `*.pth`, `sitecustomize.py`, `pip.conf` / `uv.toml` / `[tool.poetry.source]` index changes | install hook, index change | rule (setup.py, .pth, sitecustomize); planned (backend-path, index) |
| Ruby: `Gemfile` / `*.gemspec` (Ruby code, runs on `bundle`), `extconf.rb` | `system`, backticks, network | rule (native ext); planned (Gemfile code) |
| PHP Composer: `scripts`, `plugins` (`allow-plugins`) | new script or plugin | rule (scripts); planned (plugins) |
| Rust: `build.rs`, `[patch]`, `.cargo/config.toml` (`[source]` replacement, `[target] runner`, `rustc-wrapper`) | build script, source replacement, wrapper | rule (build.rs); planned (cargo config) |
| Go: `go:generate`, cgo, `replace` directives, `GOFLAGS` / `GOPROXY` in `go.env` or CI | replace to fork, proxy change | rule |
| JVM: `build.gradle(.kts)`, `settings.gradle`, `gradle-wrapper.properties` (`distributionUrl`), `gradle-wrapper.jar`, `.mvn/extensions.xml`, `.mvn/wrapper/*`, `settings.xml` mirrors | wrapper URL or jar change, new extension, mirror | rule (wrapper jar, repos); planned (extensions.xml, distributionUrl host) |
| .NET: `Directory.Build.props` / `.targets` (auto-imported everywhere), `NuGet.config` sources, `<Exec>` tasks | new auto-import, new source | rule (Exec, sources); planned (Directory.Build.*) |
| Swift `Package.swift`, CocoaPods `Podfile`, Dart/Flutter build hooks, Elixir `mix.exs`, Haskell `Setup.hs` | process execution, download | planned |
| Lockfiles, `overrides` / `resolutions`, vendored dependencies, `patch-package` patches | off-registry resolve, integrity change at same version, patch to a dependency | rule (resolve, patch); planned (integrity drift, vendored edits) |

## 3. Runs on build or test

| Surface | Watch for | Status |
|---|---|---|
| Tool configs that are code: `eslint.config.js`, `.eslintrc.js`, `babel.config.js`, `postcss.config.js`, `tailwind.config.js`, `webpack/vite/rollup/next.config.*`, `jest.config.*` + setup files, `vitest` setup, `playwright.config.*` | process, network, env reads in a config file | planned |
| Python test entry: `conftest.py` (runs on every pytest), `tox.ini`, `noxfile.py` | new conftest, network or env in it | planned |
| C/C++: `configure`, `*.m4`, `Makefile.am/.in`, `CMakeLists.txt`, linker flags, `__attribute__((constructor))` | the xz shape: build logic reading test files | rule |
| Bazel `MODULE.bazel` / `WORKSPACE` (`http_archive` without `sha256`, repository rules), Buck, Pants | missing checksum, repository rule exec | planned |
| Monorepo task graphs: `nx.json`, `turbo.json`, `lerna.json`, `project.json` targets | new task command | planned |
| Code generation: generated files, `go:generate`, protobuf plugins | generated file edited by hand, generator source change | planned |
| Test fixtures and data: binaries, archives, high-entropy blobs, files no test references | opaque blob, unreferenced fixture | rule (blob); planned (unreferenced) |
| Notebooks (`.ipynb` with stored outputs containing scripts), ML model files (`.pt`, `.pkl`, `.joblib`, `.h5`: pickle runs code on load), SVG with scripts | pickle model added, notebook output script | planned |

## 4. Runs in CI/CD

| Surface | Watch for | Status |
|---|---|---|
| GitHub workflows, local/composite actions, reusable workflows, `action.yml` | trigger changes (`pull_request_target`, `workflow_run`), PR-head checkout, `${{ github.event.* }}` in `run`, secrets dumping, runner registration, unpinned or imposter pins | rule |
| `.github/dependabot.yml` (`insecure-external-code-execution`, private registries), `renovate.json` (`postUpgradeTasks`), `CODEOWNERS` | code-execution option, registry change, owner removal | rule (CODEOWNERS); planned (dependabot, renovate) |
| Other CI: `.gitlab-ci.yml`, `.circleci/`, `Jenkinsfile`, `azure-pipelines.yml`, `.buildkite/`, `.travis.yml`, `.drone.yml`, Tekton/Argo | any change | rule (other-provider) |
| Release tooling: semantic-release plugins, `.goreleaser.yml` hooks, changesets, `publish` jobs without a protected `environment` | hook commands, publish without approval | planned |
| Caches and artifacts shared between untrusted and release workflows | same cache key prefix in both | planned (cross-workflow) |
| Hosting build configs: `vercel.json` (build commands, crons, rewrites), `netlify.toml`, `wrangler.toml`, `firebase.json`, `app.yaml` | build command change, rewrite to external host | planned |

## 5. Runs on deploy or in production infrastructure

| Surface | Watch for | Status |
|---|---|---|
| Terraform: `local-exec` / `remote-exec` provisioners, `external` data source (runs a program during **plan**), provider source changes, module sources from URLs | exec provisioner, external data source, unpinned module | rule (provider/state); planned (exec, external) |
| Pulumi / CDK (code), CloudFormation custom resources, SAM | new custom resource, IAM wildcard | planned |
| Kubernetes and Helm: `privileged`, `hostPath`, `hostNetwork`, `initContainers`, image swaps, Helm hooks, Kustomize remote bases | privilege, new image, remote base | rule (privileged); planned (rest) |
| Containers: `Dockerfile` (`FROM` unpinned, `:latest`, unknown registry, `ADD <url>`, `curl \| sh`, `USER root`), `docker-compose.yml` (privileged, docker.sock mount), `.dockerignore` hiding files, `docker-bake.hcl` | per item | rule (fetch-and-run, privileged, base image); planned (digest pin, EOL base, docker.sock) |
| Database migrations and seed scripts (run with production credentials) | network, shell, credential reads in a migration | planned |
| Schedules: GitHub `schedule`, `vercel.json` crons, Kubernetes `CronJob`, systemd timers | new schedule calling new code | planned |
| Ansible playbooks, Salt, Chef, Puppet | shell modules, new remote sources | planned |
| Web server and edge config: nginx, Caddy, `.htaccess`, `_redirects`, `middleware.ts` | proxy or redirect to external host | planned |

## 6. Runs in the shipped product (runtime entry points)

| Surface | Watch for | Status |
|---|---|---|
| New HTTP routes and handlers (Express, Next.js `route.ts`, FastAPI, Flask, Django, Rails, Spring, Go `net/http`) | route added without the auth middleware its siblings use; debug/admin/eval endpoints | planned (symbol graph + framework queries) |
| Auth and session code: middleware order, JWT verification, OAuth redirect URIs, CORS, CSP, cookie flags | check removed or weakened; `verify*` deleted while callers remain | planned (removed-symbol signal) |
| Import-time side effects: Python `__init__.py`, JS top-level code, Go `init()`, Rust `#[ctor]`, C constructors, Java static blocks | network, process, env reads at import | planned (facts) |
| Dynamic code: `eval`, `Function`, `exec`, `pickle.loads`, `yaml.load`, dynamic `import()` from URL, WebAssembly blobs | new sink, especially fed by a decoder | rule (per language); planned (paths) |
| Outbound channels: telemetry/analytics snippets, error reporting DSN (Sentry) swapped, logging sinks, webhook URLs, email recipients | destination host changed to a new domain | planned (provenance drift) |
| Remote config and kill switches fetched at runtime | new remote fetch that controls behavior | planned |
| Browser code: service workers (persist in users' browsers), extension `manifest.json` permissions, Electron `nodeIntegration`, preload scripts | new service worker, permission widening | planned |
| Mobile: `AndroidManifest.xml` permissions, iOS entitlements, deep links | permission or entitlement added | planned |
| CLI entry points: `package.json` `bin`, Python `console_scripts`, `main` changes | new binary entry | rule (bin); planned (console_scripts) |

## 7. Reaches end users directly

| Surface | Watch for | Status |
|---|---|---|
| `install.sh` / `get.sh` served raw from the repo, README install commands, docs-site install snippets | download URL or checksum changed | planned |
| Release assets, `SHA256SUMS`, signatures, `KEYS`, cosign public keys | checksum file and binary changed together; signing key replaced | planned (release-vs-tag diff) |
| Homebrew formula/tap, Scoop/WinGet manifests, Helm repos, npm `dist-tags` | URL or SHA change | planned |
| `SECURITY.md` contact, `FUNDING.yml`, `package.json` `repository`/`homepage` | contact or payout redirected | rule (security process); planned (funding, metadata) |

## 8. Changes who or what is trusted (repository governance)

| Surface | Signal | Status |
|---|---|---|
| Collaborators, teams, org members, roles | added then acting fast | rule (chain) |
| Branch protection, rulesets, tag protection | deleted, edited, missing for action publishers | rule |
| Deploy keys, repository webhooks, GitHub App installs | added | rule (deploy keys); gap (webhook added: no App event) |
| Visibility, transfer, archive | private → public | rule |
| Tags and releases | moved tags, imposter commits, bulk moves | rule (snapshots) |
| Commit identity | author ≠ pusher, unsigned where signing is usual, bot lookalikes | rule (partial); planned (signing baseline) |
| Actions secrets, environments, OIDC trust in cloud accounts, runner registration | audit-log only | gap (no webhook) |

## 9. Hides intent from reviewers

| Technique | Status |
|---|---|
| Bidi controls, homoglyphs, invisible code points (zero-width, Tags, variation selectors, Private Use Area), padding, very long lines | rule |
| Payload split across commits, files, authors, releases | planned (facts + graph) |
| Text aimed at AI reviewers, fake "reviewed/tests passed" claims | rule |
| Large generated, minified or vendored files; lockfile-only changes | rule (partial) |
| Commit message mismatch ("bump version" touching code) | rule |

## Data sources (matched locally, updated by events or deltas, never per push)

| Data | Covers | Update |
|---|---|---|
| OSV bulk exports + `modified_id.csv` | vulnerable and malicious packages: npm, PyPI, Go, crates.io, Maven, NuGet, RubyGems, Packagist, Pub, Hex, GitHub Actions, Alpine, Debian, Ubuntu | delta on use; GitHub `security_advisory` webhook |
| OpenSSF malicious-packages (`MAL-*`, via OSV) | malicious packages, all ecosystems | as above |
| CISA KEV, EPSS | exploited-in-the-wild flag, exploit likelihood | bulk JSON/CSV, delta on use |
| endoflife.date | end-of-life runtimes and base images | bulk JSON, on use |
| Trivy / Grype databases | container OS packages, language packages in images | downloaded by the tenant runner per run |
| MalwareBazaar, CIRCL hashlookup (NSRL) | known-bad and known-good binary hashes | lookup once per new hash, cached |
| ThreatFox, URLhaus, Spamhaus DROP, Tor exit list | C2 domains, URLs, hostile IP ranges | bulk export, delta on use |
| Curated exfiltration endpoints (request bins, tunnels, chat-app webhook and bot APIs) | where stolen data is commonly sent | checked-in data file |
| gitleaks / trufflehog detector definitions | secret formats | checked-in data, updated with the dependency |
| picklescan / ModelScan | unsafe ML model files | tenant runner |
| zizmor, actionlint, hadolint, Checkov / Trivy config, kube-linter, Semgrep | workflow, Dockerfile, IaC, Kubernetes misconfiguration | tenant runner |
| Socket (optional, per-org key) | package behavior analysis | per org |

## Cross-cutting signals (any surface)

- **A new execution surface appears.** The first time a repository gains a file
  of a surface kind (first `conftest.py`, first `.pnpmfile.cjs`, first
  `Directory.Build.props`) is rarer and more interesting than an edit to one.
- **Provenance drift.** Anything that changes *where* something comes from:
  registry, index, mirror, proxy, module source, download URL, checksum,
  signing key, image registry, remote config host.
- **Surface plus sink.** A surface (sections 1 to 6) that reaches a sink (network,
  process, eval, credential read) through the symbol graph, assembled across
  commits or authors.
- **Privilege jump.** Code moving from a low-privilege surface (test) to a
  high one (release workflow, deploy, install hook).
