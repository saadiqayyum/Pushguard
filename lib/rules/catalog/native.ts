// C, C++, Rust and Go: compiled languages, where the build system is the soft.
const C_SOURCE = ["**/*.c", "**/*.cc", "**/*.cpp", "**/*.cxx", "**/*.h", "**/*.hpp", "**/*.hxx", "**/*.inl"]
const C_BUILD = [
  "**/Makefile",
  "**/makefile",
  "**/*.mk",
  "**/CMakeLists.txt",
  "**/*.cmake",
  "**/meson.build",
  "**/SConstruct",
  "**/configure",
  "**/configure.ac",
  "**/*.gyp",
  "**/*.gypi",
]

export const cpp = [
  {
    id: "cpp-build-runs-command",
    description: "A build file that shells out during configure or build",
    severity: "critical",
    paths: C_BUILD,
    added_lines:
      "execute_process|add_custom_command|add_custom_target|\\$\\(shell |POST_BUILD|run_command\\(",
  },
  {
    id: "cpp-build-downloads",
    description: "A build file fetching something from the network",
    severity: "critical",
    paths: C_BUILD,
    added_lines: "curl |wget |FetchContent_Declare|ExternalProject_Add|file\\(DOWNLOAD",
  },
  {
    id: "cpp-process-execution",
    description: "Process or shell execution added to native source",
    severity: "high",
    paths: C_SOURCE,
    added_lines: "\\bsystem\\(|\\bpopen\\(|\\bexecve?\\(|execlp?\\(|CreateProcess|ShellExecute",
  },
  {
    id: "cpp-constructor-attribute",
    description: "Code marked to run before main()",
    severity: "critical",
    paths: C_SOURCE,
    added_lines: "__attribute__\\s*\\(\\s*\\(\\s*constructor|DllMain|_pragma\\s*\\(\\s*\"init",
  },
  {
    id: "cpp-linker-flag-changed",
    description: "Linker or preload configuration changed",
    severity: "high",
    paths: [...C_BUILD, "**/*.ld", "**/*.lds"],
    added_lines: "LD_PRELOAD|-rpath|-Wl,|\\.so\\.[0-9]|LD_LIBRARY_PATH",
  },
] as const

export const go = [
  {
    id: "go-generate-directive",
    description: "A go:generate directive, which runs a command on `go generate`",
    severity: "high",
    paths: ["**/*.go"],
    added_lines: "//go:generate",
  },
  {
    id: "go-cgo-added",
    description: "cgo block, which compiles and links C during a Go build",
    severity: "high",
    paths: ["**/*.go"],
    added_lines: "import \"C\"|#cgo ",
  },
  {
    id: "go-process-execution",
    description: "Process execution or dynamic plugin loading added",
    severity: "high",
    paths: ["**/*.go"],
    added_lines: "exec\\.Command|syscall\\.Exec|plugin\\.Open",
  },
  {
    id: "go-module-replace",
    description: "A replace or exclude directive repointing a dependency",
    severity: "critical",
    paths: ["**/go.mod"],
    added_lines: "^\\s*replace |^\\s*exclude ",
  },
] as const

export const rust = [
  {
    id: "rust-build-script",
    description: "A Cargo build script, which compiles and runs before the crate",
    severity: "critical",
    paths: ["**/build.rs"],
    change_type: ["added", "modified"],
  },
  {
    id: "rust-process-execution",
    description: "Process execution or a foreign function interface added",
    severity: "high",
    paths: ["**/*.rs"],
    added_lines: "std::process::Command|Command::new|extern \"C\"|libloading",
  },
  {
    id: "rust-dependency-from-source",
    description: "A dependency pointing at a git ref, path, or alternate registry",
    severity: "high",
    paths: ["**/Cargo.toml"],
    added_lines: "\\bgit\\s*=|\\bpath\\s*=|\\bregistry\\s*=",
  },
  {
    id: "rust-unsafe-block-added",
    description: "An unsafe block added",
    severity: "low",
    paths: ["**/*.rs"],
    added_lines: "\\bunsafe\\s*\\{",
    enabled: false,
  },
] as const
